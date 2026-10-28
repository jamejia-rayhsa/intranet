// Lógica PURA de "Importar usuarios" (sin BD ni GoTrue): validación de filas, repetidos en el archivo y resolución del empleado.
// Todos los mensajes son propios y en español (nunca texto de PostgreSQL ni de GoTrue).
const { problemaNominaTexto } = require("../../../rh/backend/utils/importarEmpleados");
const { normalizarNombre } = require("../../../rh/backend/utils/vincularCuentas");

// Tope por petición. El parser global de Express admite 100 kb y una fila pesa ~0.25 kb (el front además limita el archivo a 200 filas / 1 MB).
const MAX_FILAS_IMPORTAR_USUARIOS = 200;
const DOMINIO_PERMITIDO = "rayhsa.com.mx";
// Decisión del humano: el rol de toda cuenta importada es SIEMPRE rh_empleado (no hay columna ni selector de rol).
const ROL_IMPORTADO = "rh_empleado";
const MAX_CORREO = 255;
const MAX_NOMBRE = 100;
const MAX_NOMINA = 50;

const CURP_RE = /^[A-ZÑ0-9]{18}$/;
// Parte local conservadora (sin comillas, espacios ni controles): un correo corporativo real nunca las necesita
const LOCAL_RE = /^[a-z0-9][a-z0-9._+'-]{0,63}$/;
const PRECISION = "celda numérica de 16 o más dígitos: Excel perdió la precisión; guarda la columna como Texto";

const esObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

// Celda -> texto recortado; null si no es texto ni número (objeto, arreglo, booleano...).
function textoSeguro(valor) {
  if (valor === undefined || valor === null) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

// Minúsculas sin ceros a la izquierda ("0123" y "123" son la misma nómina para Excel); null si queda vacía.
const sinCeros = (n) => {
  const s = String(n).trim().toLowerCase().replace(/^0+/, "");
  return s === "" ? null : s;
};
const nominaClave = (n) => String(n).trim().toLowerCase();

/**
 * Valida el correo corporativo. Devuelve { correo } (minúsculas) o { error }.
 * Exactamente `usuario@rayhsa.com.mx`: otro dominio (o un subdominio, o un dominio que solo termina igual) se rechaza.
 */
function validarCorreoCorporativo(texto) {
  const t = textoSeguro(texto);
  if (t === null) return { error: "Correo corporativo tiene un valor no válido" };
  if (!t) return { error: "Falta el correo corporativo" };
  if (t.includes("\u0000")) return { error: "Correo corporativo contiene caracteres no permitidos" };
  const correo = t.toLowerCase();
  if (correo.length > MAX_CORREO) return { error: `Correo corporativo excede ${MAX_CORREO} caracteres` };
  const partes = correo.split("@");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { error: "Correo corporativo con formato no válido" };
  if (partes[1] !== DOMINIO_PERMITIDO) return { error: `Solo se permiten correos @${DOMINIO_PERMITIDO} (dominio no permitido)` };
  if (!LOCAL_RE.test(partes[0])) return { error: "Correo corporativo con formato no válido" };
  return { correo };
}

/**
 * Normaliza y valida UNA fila cruda. Devuelve { fila: { fila, correo, nombre, apellido, numero_nomina, curp } } o { error }.
 * El identificador del empleado (nómina o CURP, al menos uno) es obligatorio: sin él no habría a quién vincular.
 * Un identificador inválido NO se degrada a "vacío": rechaza la fila (se vincularía a otro empleado o a ninguno).
 */
function prepararFilaUsuario(cruda) {
  if (!esObjeto(cruda)) return { error: "La fila no tiene el formato esperado" };
  const numero = Number.isInteger(cruda._fila) && cruda._fila > 0 ? cruda._fila : null;

  const c = validarCorreoCorporativo(cruda.correo);
  if (c.error) return { error: c.error };

  const nombre = textoSeguro(cruda.nombre);
  const apellido = textoSeguro(cruda.apellido);
  if (nombre === null || apellido === null) return { error: "Nombre o apellido con un valor no válido" };
  if (!nombre) return { error: "Falta el nombre" };
  if (!apellido) return { error: "Falta el apellido" };
  if (nombre.includes("\u0000") || apellido.includes("\u0000")) return { error: "Nombre o apellido contienen caracteres no permitidos" };
  if (nombre.length > MAX_NOMBRE) return { error: `Nombre excede ${MAX_NOMBRE} caracteres (tiene ${nombre.length})` };
  if (apellido.length > MAX_NOMBRE) return { error: `Apellido excede ${MAX_NOMBRE} caracteres (tiene ${apellido.length})` };

  const perdioPrecision = new Set(Array.isArray(cruda._precision) ? cruda._precision.filter((k) => typeof k === "string") : []);
  const crudaCurp = textoSeguro(cruda.curp);
  if (crudaCurp === null || crudaCurp.includes("\u0000")) return { error: "CURP inválida: no se puede identificar al empleado" };
  let curp = "";
  if (crudaCurp) {
    curp = crudaCurp.replace(/\s/g, "").toUpperCase();
    if (perdioPrecision.has("curp") || !CURP_RE.test(curp)) return { error: "CURP inválida: no se puede identificar al empleado" };
  }
  const crudaNomina = textoSeguro(cruda.numero_nomina);
  if (crudaNomina === null) return { error: "Número de nómina tiene un valor no válido" };
  if (crudaNomina.includes("\u0000")) return { error: "Número de nómina contiene caracteres no permitidos" };
  if (perdioPrecision.has("numero_nomina")) return { error: `Número de nómina: ${PRECISION}` };
  // Excel entrega 101 como 101.0 en algunos orígenes: la nómina es texto sin decimales
  const nomina = /^\d+\.0+$/.test(crudaNomina) ? crudaNomina.replace(/\.0+$/, "") : crudaNomina;
  if (nomina.length > MAX_NOMINA) return { error: `Número de nómina excede ${MAX_NOMINA} caracteres (tiene ${nomina.length})` };
  const problema = problemaNominaTexto(nomina);
  if (problema) return { error: `Número de nómina inválido: ${problema}` };

  if (!curp && !nomina) return { error: "Falta el identificador del empleado: número de nómina o CURP" };
  return { fila: { fila: numero, correo: c.correo, nombre, apellido, numero_nomina: nomina, curp } };
}

/**
 * Prepara todas las filas de la petición. Devuelve { error } (400 de la petición: no es un arreglo, vacío, sobre el tope) o
 * { filas: [{ indice, fila?, error? }] } en el mismo orden. Marca como error las filas repetidas en el archivo (correo,
 * CURP, nómina): la primera se conserva y las siguientes citan la fila de la primera.
 */
function prepararFilasUsuarios(filasCrudas) {
  if (!Array.isArray(filasCrudas) || filasCrudas.length === 0) return { error: "No se recibieron filas para importar" };
  if (filasCrudas.length > MAX_FILAS_IMPORTAR_USUARIOS) {
    return { error: `Máximo ${MAX_FILAS_IMPORTAR_USUARIOS} filas por importación (se recibieron ${filasCrudas.length})` };
  }
  const salida = filasCrudas.map((cruda, indice) => {
    const r = prepararFilaUsuario(cruda);
    const numero = esObjeto(cruda) && Number.isInteger(cruda._fila) && cruda._fila > 0 ? cruda._fila : indice + 2;
    // `visible`: lo que el usuario escribió (recortado, solo texto) para mostrarle de vuelta la fila con error; nunca se persiste
    const visible = {
      correo: esObjeto(cruda) && typeof cruda.correo === "string" ? cruda.correo.trim().slice(0, MAX_CORREO).split("\u0000").join("") : "",
      nombre: esObjeto(cruda) ? [cruda.nombre, cruda.apellido].filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).join(" ").slice(0, 2 * MAX_NOMBRE).split("\u0000").join("") : "",
    };
    if (r.error) return { indice, numero, error: r.error, visible };
    r.fila.fila = numero;
    return { indice, numero, fila: r.fila, visible };
  });
  const vistos = { correo: new Map(), curp: new Map(), nomina: new Map() };
  for (const s of salida) {
    if (!s.fila) continue;
    const claves = [["correo", s.fila.correo, "el correo"], ["curp", s.fila.curp, "la CURP"], ["nomina", s.fila.numero_nomina && (sinCeros(s.fila.numero_nomina) || nominaClave(s.fila.numero_nomina)), "el número de nómina"]];
    for (const [tipo, valor, etiqueta] of claves) {
      if (!valor) continue;
      if (vistos[tipo].has(valor)) {
        const previa = vistos[tipo].get(valor);
        delete s.fila;
        s.error = `Repetida en el archivo: ${etiqueta} ya aparece en la fila ${previa}`;
        break;
      }
    }
    if (!s.fila) continue;
    for (const [tipo, valor] of claves) if (valor) vistos[tipo].set(valor, s.numero);
  }
  return { filas: salida };
}

function nombreDeEmpleado(e) {
  return [e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" ");
}

// true si el nombre del archivo es compatible con el del empleado (mismo nombre; el apellido de la cuenta empieza por el paterno).
function nombreCompatible(fila, empleado) {
  const nombre = normalizarNombre(empleado.nombre);
  const paterno = normalizarNombre(empleado.apellido_paterno);
  const ap = normalizarNombre(fila.apellido);
  if (!nombre || !paterno) return false;
  return normalizarNombre(fila.nombre) === nombre && (ap === paterno || ap.startsWith(`${paterno} `));
}

/**
 * Resuelve el empleado de una fila. `porCurp`: empleados cuya CURP coincide; `porNomina`: empleados cuya nómina coincide
 * (exacta, sin mayúsculas ni ceros a la izquierda). Cada empleado: { id, nombre, apellido_paterno, apellido_materno,
 * estatus, usuario_id }. Devuelve { empleado, avisos } o { error }. Nunca elige entre varios candidatos.
 * Orden de los rechazos: ambigüedad/inexistencia -> contradicción CURP vs nómina -> no activo -> ya tiene cuenta.
 */
function resolverEmpleado(fila, porCurp, porNomina) {
  let empleado = null;
  if (fila.curp) {
    if (!porCurp || porCurp.length === 0) return { error: "No hay un empleado con esa CURP" };
    if (porCurp.length > 1) return { error: "La CURP la tienen varios empleados: no se puede identificar al empleado" };
    empleado = porCurp[0];
  }
  if (fila.numero_nomina) {
    const candidatos = porNomina || [];
    if (empleado) {
      if (!candidatos.some((e) => e.id === empleado.id)) return { error: "La CURP y el número de nómina apuntan a empleados distintos (o la nómina no coincide)" };
    } else {
      if (candidatos.length === 0) return { error: "No hay un empleado con ese número de nómina" };
      if (candidatos.length > 1) return { error: `Número de nómina ambiguo: lo tienen ${candidatos.length} empleados; usa la CURP para identificarlo` };
      empleado = candidatos[0];
    }
  }
  if (String(empleado.estatus || "activo") !== "activo") return { error: `El empleado no está activo (estatus: ${empleado.estatus}); solo se crean cuentas para empleados activos` };
  if (empleado.usuario_id !== null && empleado.usuario_id !== undefined) return { error: "El empleado ya tiene una cuenta vinculada; no se pisa" };
  const avisos = nombreCompatible(fila, empleado) ? [] : [`El nombre del archivo no coincide con el del empleado (${nombreDeEmpleado(empleado)}): verifica que el correo sea de esa persona`];
  return { empleado, avisos };
}

module.exports = {
  MAX_FILAS_IMPORTAR_USUARIOS, DOMINIO_PERMITIDO, ROL_IMPORTADO, CURP_RE,
  validarCorreoCorporativo, prepararFilaUsuario, prepararFilasUsuarios, resolverEmpleado, nombreCompatible, nombreDeEmpleado,
  sinCeros, nominaClave,
};
