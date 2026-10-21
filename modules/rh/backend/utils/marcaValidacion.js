// Validación de las marcas de la ingesta (contrato v1: docs/asistencia/contrato-ingesta-marcas.md).
// Funciones puras, sin BD. Cada marca se valida por separado: una inválida no frena a las demás.
// Los motivos son textos fijos (no repiten el valor recibido).
const MAX_MARCAS = 500;
const MAX_ID_EXTERNO = 64;
const MAX_CODIGO = 50;
const MAX_TERMINAL_SN = 50;
const MAX_TERMINAL_ALIAS = 100;
const MAX_AREA = 100;
const MAX_CRUDO_BYTES = 2048;
const MAX_FUTURO_MS = 24 * 60 * 60 * 1000;
const ANIO_MINIMO = 1970;
const MAX_PROFUNDIDAD_CRUDO = 20;
// Orígenes cuyo id_externo es un entero (el cursor sube como BIGINT). BioTime: id de iclock_transaction.
const ORIGENES_NUMERICOS = new Set(["biotime"]);

const ISO_CON_ZONA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)$/;
const ISO_SIN_ZONA = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const ENTERO_TEXTO = /^-?\d{1,10}$/;

const esObjetoPlano = (valor) => valor !== null && typeof valor === "object" && !Array.isArray(valor);
const esTexto = (valor) => typeof valor === "string";
const faltante = (valor) => valor === undefined || valor === null;

// NUL (Postgres no lo admite en text/jsonb: daría 500) y sustitutos sueltos (jsonb los rechaza)
const textoSeguro = (texto) => !texto.includes("\u0000") && texto.isWellFormed();

/** Recorre el objeto `crudo`: ¿algún texto o clave tiene NUL o un sustituto suelto? Profundidad acotada. */
function crudoSeguro(valor, profundidad = 0) {
  if (profundidad > MAX_PROFUNDIDAD_CRUDO) return false;
  if (typeof valor === "string") return textoSeguro(valor);
  if (Array.isArray(valor)) return valor.every((v) => crudoSeguro(v, profundidad + 1));
  if (esObjetoPlano(valor)) {
    return Object.entries(valor).every(([k, v]) => textoSeguro(k) && crudoSeguro(v, profundidad + 1));
  }
  return true;
}

/**
 * ISO 8601 con zona obligatoria -> {fecha: Date} o {motivo}. Rechaza fechas que no existen (2026-02-30).
 * `nombre` solo da contexto al motivo ("marca_ts", "subida_ts").
 */
function interpretarInstante(valor, nombre) {
  if (!esTexto(valor) || valor.length > 40) return { motivo: `${nombre} no es una fecha ISO 8601 válida` };
  const m = ISO_CON_ZONA.exec(valor);
  if (!m) {
    return { motivo: ISO_SIN_ZONA.test(valor) ? `${nombre} sin zona horaria` : `${nombre} no es una fecha ISO 8601 válida` };
  }
  const [, a, me, d, h, mi, s = "0", frac = "", zona] = m;
  const anio = Number(a);
  const mes = Number(me);
  const dia = Number(d);
  const hora = Number(h);
  const min = Number(mi);
  const seg = Number(s);
  if (anio < ANIO_MINIMO || mes < 1 || mes > 12 || dia < 1 || hora > 23 || min > 59 || seg > 59) {
    return { motivo: `${nombre} no es una fecha ISO 8601 válida` };
  }
  let desplazamientoMin = 0;
  if (zona !== "Z") {
    const digitos = zona.slice(1).replace(":", "");
    const hz = Number(digitos.slice(0, 2));
    const mz = digitos.length > 2 ? Number(digitos.slice(2)) : 0;
    if (hz > 23 || mz > 59) return { motivo: `${nombre} no es una fecha ISO 8601 válida` };
    desplazamientoMin = (zona[0] === "-" ? -1 : 1) * (hz * 60 + mz);
  }
  const ms = Number(`${frac}000`.slice(0, 3));
  const utc = Date.UTC(anio, mes - 1, dia, hora, min, seg, ms);
  const comprobacion = new Date(utc);
  if (comprobacion.getUTCDate() !== dia || comprobacion.getUTCMonth() !== mes - 1) {
    return { motivo: `${nombre} no es una fecha ISO 8601 válida` }; // día inexistente (31 de abril, 30 de febrero)
  }
  const fecha = new Date(utc - desplazamientoMin * 60000);
  return Number.isNaN(fecha.getTime()) ? { motivo: `${nombre} no es una fecha ISO 8601 válida` } : { fecha };
}

/** id_externo -> texto canónico. En orígenes numéricos: entero 0..18 dígitos, sin ceros a la izquierda. */
function interpretarIdExterno(valor, origen) {
  if (faltante(valor) || valor === "") return { motivo: "id_externo es obligatorio" };
  let texto;
  if (typeof valor === "number") {
    if (!Number.isSafeInteger(valor) || valor < 0) return { motivo: "id_externo no es un entero válido" };
    texto = String(valor);
  } else if (esTexto(valor)) {
    if (valor.length > MAX_ID_EXTERNO) return { motivo: `id_externo excede ${MAX_ID_EXTERNO} caracteres` };
    texto = valor;
  } else {
    return { motivo: "id_externo debe ser número o texto" };
  }
  if (!textoSeguro(texto)) return { motivo: "id_externo contiene caracteres no permitidos" };
  if (ORIGENES_NUMERICOS.has(origen)) {
    if (!/^\d{1,18}$/.test(texto)) return { motivo: "id_externo debe ser un entero de hasta 18 dígitos" };
    return { id: BigInt(texto).toString() }; // "00123" y 123 son la misma transacción
  }
  return { id: texto };
}

/** Entero pequeño aceptado como número o como texto numérico; null si falta. */
function interpretarEntero(valor, minimo, maximo) {
  if (faltante(valor)) return { valor: null };
  let n;
  if (typeof valor === "number") n = valor;
  else if (esTexto(valor) && ENTERO_TEXTO.test(valor)) n = Number(valor);
  else return { error: true };
  if (!Number.isInteger(n) || n < minimo || n > maximo) return { error: true };
  return { valor: String(n) };
}

/** Texto opcional: null/ausente -> null; la cadena vacía ES válida; tal cual, sin recortar. */
function interpretarTextoOpcional(valor, maximo) {
  if (faltante(valor)) return { valor: null };
  if (!esTexto(valor) || valor.length > maximo || !textoSeguro(valor)) return { error: true };
  return { valor };
}

/**
 * Valida una marca. Devuelve {ok:true, marca} (campos listos para la BD) o
 * {ok:false, id_externo (si se pudo leer), motivo}.
 * `ahora` (ms) se inyecta para probar el límite de 24 h hacia el futuro.
 */
function validarMarca(entrada, { origen = "biotime", ahora = Date.now() } = {}) {
  if (!esObjetoPlano(entrada)) return { ok: false, id_externo: null, motivo: "la marca no es un objeto" };
  const rechazar = (id, motivo) => ({ ok: false, id_externo: id, motivo });
  const idCrudo = typeof entrada.id_externo === "number" || esTexto(entrada.id_externo) ? String(entrada.id_externo) : null;
  const idEcho = idCrudo === null ? null : idCrudo.slice(0, MAX_ID_EXTERNO);

  const id = interpretarIdExterno(entrada.id_externo, origen);
  if (id.motivo) return rechazar(idEcho, id.motivo);

  if (faltante(entrada.codigo_empleado)) return rechazar(idEcho, "codigo_empleado es obligatorio");
  if (!esTexto(entrada.codigo_empleado)) return rechazar(idEcho, "codigo_empleado debe ser texto");
  const codigo = entrada.codigo_empleado.trim();
  if (codigo === "") return rechazar(idEcho, "codigo_empleado es obligatorio");
  if (codigo.length > MAX_CODIGO) return rechazar(idEcho, `codigo_empleado excede ${MAX_CODIGO} caracteres`);
  if (!textoSeguro(codigo)) return rechazar(idEcho, "codigo_empleado contiene caracteres no permitidos");

  if (faltante(entrada.marca_ts)) return rechazar(idEcho, "marca_ts es obligatorio");
  const marca = interpretarInstante(entrada.marca_ts, "marca_ts");
  if (marca.motivo) return rechazar(idEcho, marca.motivo);
  if (marca.fecha.getTime() > ahora + MAX_FUTURO_MS) return rechazar(idEcho, "marca_ts está más de 24 h en el futuro");

  let subida = null;
  if (!faltante(entrada.subida_ts)) {
    const r = interpretarInstante(entrada.subida_ts, "subida_ts");
    if (r.motivo) return rechazar(idEcho, r.motivo);
    subida = r.fecha;
  }

  const estado = interpretarEntero(entrada.estado_marca, -32768, 32767);
  if (estado.error) return rechazar(idEcho, "estado_marca debe ser un entero pequeño (número o texto numérico)");
  const verificacion = interpretarEntero(entrada.tipo_verificacion, -2147483648, 2147483647);
  if (verificacion.error) return rechazar(idEcho, "tipo_verificacion debe ser un entero");

  const sn = interpretarTextoOpcional(entrada.terminal_sn, MAX_TERMINAL_SN);
  if (sn.error) return rechazar(idEcho, "terminal_sn no es válido");
  const alias = interpretarTextoOpcional(entrada.terminal_alias, MAX_TERMINAL_ALIAS);
  if (alias.error) return rechazar(idEcho, "terminal_alias no es válido");
  const area = interpretarTextoOpcional(entrada.area_externa, MAX_AREA);
  if (area.error) return rechazar(idEcho, "area_externa no es válido");

  let crudo = null;
  if (!faltante(entrada.crudo)) {
    if (!esObjetoPlano(entrada.crudo)) return rechazar(idEcho, "crudo debe ser un objeto");
    if (!crudoSeguro(entrada.crudo)) return rechazar(idEcho, "crudo contiene caracteres o niveles no permitidos");
    crudo = JSON.stringify(entrada.crudo);
    if (Buffer.byteLength(crudo, "utf8") > MAX_CRUDO_BYTES) return rechazar(idEcho, "crudo excede 2 KB");
  }

  return {
    ok: true,
    marca: {
      id_externo: id.id,
      codigo_empleado: codigo,
      marca_ts: marca.fecha.toISOString(),
      subida_ts: subida ? subida.toISOString() : null,
      estado_marca: estado.valor,
      tipo_verificacion: verificacion.valor,
      terminal_sn: sn.valor,
      terminal_alias: alias.valor,
      area_externa: area.valor,
      crudo,
    },
  };
}

/** Orden estable de inserción (siempre ascendente por id): evita interbloqueos entre envíos que se traslapan. */
function compararIds(a, b) {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const x = BigInt(a);
    const y = BigInt(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

module.exports = {
  MAX_MARCAS,
  MAX_CRUDO_BYTES,
  MAX_FUTURO_MS,
  ORIGENES_NUMERICOS,
  validarMarca,
  interpretarInstante,
  compararIds,
};
