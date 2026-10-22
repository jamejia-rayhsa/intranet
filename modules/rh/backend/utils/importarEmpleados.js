// Validación de filas de importación (empleados y catálogos) del lado del servidor.
// Nunca devuelve texto de PostgreSQL: los mensajes son propios y en español.

// Máximo de filas por petición. El parser global de Express admite 100 kb y una fila típica de empleado pesa
// ~0.3-0.7 kb: el front envía lotes de 100 filas (TAMANO_LOTE) y este tope de 200 deja margen sin que el
// cuerpo supere los 100 kb (un cuerpo mayor lo corta el parser global con 413 JSON).
const MAX_FILAS_IMPORTAR = 200;
const MAX_DUPLICADOS_DETALLE = 200;
const MAX_SIN_CATALOGO = 100;

const ANIO_MINIMO = 1900;
const ANIO_MAXIMO = 2100;

const { canonico, normalizarClave } = require("./catalogosEmpleado");

const MAX_ADVERTENCIAS_LOTE = 1000;
const MAX_VALOR_ADVERTENCIA = 40;

// Columnas del expediente que se guardan tal cual en `empleados`, en el orden del expediente.
// [clave, etiqueta, tipo, máximo]. Tipos: texto, fecha, curp, rfc, nss, clabe, tel, cp, correo y catálogos
// (estados, bancos, generos, estadosCiviles, escolaridad, contratos, estatus). Las longitudes coinciden con el
// VARCHAR del esquema; curp/rfc/nss/clabe/teléfonos/CP son además reglas de negocio más estrictas (formato del formulario).
const CAMPOS_EMPLEADO = [
  // personales
  ["nombre", "Nombre", "texto", 100],
  ["apellido_paterno", "Apellido paterno", "texto", 100],
  ["apellido_materno", "Apellido materno", "texto", 100],
  ["fecha_nacimiento", "Fecha de nacimiento", "fecha", 10],
  ["curp", "CURP", "curp", 18],
  ["rfc", "RFC", "rfc", 13],
  ["nss", "NSS", "nss", 11],
  ["genero", "Género", "generos", 20],
  ["estado_civil", "Estado civil", "estadosCiviles", 30],
  ["escolaridad", "Escolaridad", "escolaridad", 50],
  ["estado_nacimiento", "Estado de nacimiento", "estados", 100],
  // contacto
  ["celular_personal", "Celular personal", "tel", 20],
  ["correo_personal", "Correo personal", "correo", 255],
  ["telefono_emergencia", "Teléfono de emergencia", "tel", 20],
  ["parentesco_emergencia", "Parentesco de emergencia", "texto", 50],
  ["contacto_emergencia", "Contacto de emergencia", "texto", 100],
  // domicilio
  ["calle", "Calle", "texto", 255],
  ["colonia", "Colonia", "texto", 100],
  ["codigo_postal", "Código postal", "cp", 10],
  ["municipio", "Municipio", "texto", 100],
  ["estado_residencia", "Estado de residencia", "estados", 100],
  // laborales
  ["numero_nomina", "Número de nómina", "texto", 50],
  ["fecha_imss", "Fecha de alta IMSS", "fecha", 10],
  ["fecha_ingreso", "Fecha de ingreso", "fecha", 10],
  ["fecha_renovacion", "Fecha de renovación", "fecha", 10],
  ["tipo_contrato", "Tipo de contrato", "contratos", 50],
  ["celular_corporativo", "Celular corporativo", "tel", 20],
  ["infonavit", "Infonavit", "texto", 20],
  ["fonacot", "Fonacot", "texto", 20],
  // financieros
  ["banco", "Banco", "bancos", 100],
  ["clabe", "CLABE", "clabe", 18],
  ["cp_fiscal", "CP fiscal", "cp", 10],
  // control
  ["estatus", "Estatus", "estatus", 20],
  ["fecha_baja", "Fecha de baja", "fecha", 10],
  ["motivo_baja", "Motivo de baja", "texto", 500],
];

// Columnas que se resuelven por nombre contra un catálogo o apuntan a otro empleado (no se guardan tal cual).
const CAMPOS_REFERENCIA = [
  ["puesto", "Puesto", 100],
  ["departamento", "Departamento", 100],
  ["ubicacion", "Ubicación", 100],
  ["jefe_nomina", "Jefe (número de nómina)", 50],
];

const CAMPOS_DIRECTOS = CAMPOS_EMPLEADO.map((c) => c[0]);
const CAMPOS_FECHA = CAMPOS_EMPLEADO.filter((c) => c[2] === "fecha").map((c) => c[0]);
const CAMPOS_REQUERIDOS = ["nombre", "apellido_paterno"];
// Su valor nunca se devuelve en una advertencia.
const CAMPOS_SENSIBLES = ["curp", "nss", "rfc", "clabe", "jefe_curp"];

// Compatibilidad: [clave, máximo, etiqueta] de las columnas de texto.
const LIMITES_EMPLEADO = CAMPOS_EMPLEADO.map(([clave, etiqueta, , max]) => [clave, max, etiqueta]);

function esFilaObjeto(fila) {
  return fila !== null && typeof fila === "object" && !Array.isArray(fila);
}

// Convierte cualquier valor a texto recortado ('' si no hay). Devuelve null si no es convertible (objeto/arreglo).
function textoSeguro(valor) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return null;
}

function diasEnMes(anio, mes) {
  if (mes === 2) return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

// 'AAAA-MM-DD' real (año 1900-2100). Devuelve true/false.
function esFechaValida(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (anio < ANIO_MINIMO || anio > ANIO_MAXIMO) return false;
  if (mes < 1 || mes > 12) return false;
  return dia >= 1 && dia <= diasEnMes(anio, mes);
}

function numeroFila(fila) {
  const n = esFilaObjeto(fila) ? Number(fila._fila) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function nombreCompleto(fila) {
  if (!esFilaObjeto(fila)) return "";
  return ["nombre", "apellido_paterno", "apellido_materno"]
    .map((k) => textoSeguro(fila[k]))
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
}

const CURP_RE = /^[A-ZÑ0-9]{18}$/;
const RFC_RE = /^[A-ZÑ&0-9]{12,13}$/;
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function valorParaMostrar(valor) {
  return String(valor).split("\u0000").join("").slice(0, MAX_VALOR_ADVERTENCIA);
}

// Normaliza un teléfono a 10 dígitos (quita espacios, guiones, paréntesis, puntos y +52 / 52 / +521 inicial).
function normalizarTelefono(texto) {
  const limpio = texto.replace(/[\s\-().]/g, "");
  const m = /^(?:\+52|52)1?(\d{10})$/.exec(limpio) || /^\+?(\d{10})$/.exec(limpio);
  return m ? m[1] : null;
}

// Convierte el valor de UNA celda opcional. Devuelve { valor } (posiblemente '' si no hay) o { advertencia: {motivo, aviso?} }
// o { valor, aviso } cuando se acepta pero se corrigió algo.
function validarCampoOpcional(tipo, max, texto) {
  if (texto === "") return { valor: "" };
  switch (tipo) {
    case "texto":
      if (texto.length > max) return { malo: `excede ${max} caracteres (tiene ${texto.length})` };
      return { valor: texto };
    case "curp": {
      const v = texto.replace(/\s/g, "").toUpperCase();
      return CURP_RE.test(v) ? { valor: v } : { malo: "formato inválido", sensible: true };
    }
    case "rfc": {
      const v = texto.replace(/[\s-]/g, "").toUpperCase();
      return RFC_RE.test(v) ? { valor: v } : { malo: "formato inválido", sensible: true };
    }
    case "nss": {
      const v = texto.replace(/[\s-]/g, "");
      if (/^\d{11}$/.test(v)) return { valor: v };
      if (/^\d{10}$/.test(v)) return { valor: `0${v}`, aviso: "NSS de 10 dígitos: se completó con 0 a la izquierda (Excel suele quitarlo)", sensible: true };
      return { malo: "formato inválido", sensible: true };
    }
    case "clabe": {
      const v = texto.replace(/[\s-]/g, "");
      return /^\d{18}$/.test(v) ? { valor: v } : { malo: "formato inválido", sensible: true };
    }
    case "tel": {
      const v = normalizarTelefono(texto);
      return v ? { valor: v } : { malo: "teléfono inválido (deben ser 10 dígitos)" };
    }
    case "cp": {
      const v = texto.replace(/\s/g, "");
      if (/^\d{5}$/.test(v)) return { valor: v };
      if (/^\d{4}$/.test(v)) return { valor: `0${v}` };
      return { malo: "código postal inválido (deben ser 5 dígitos)" };
    }
    case "correo":
      if (texto.length > max) return { malo: `excede ${max} caracteres (tiene ${texto.length})` };
      return CORREO_RE.test(texto) ? { valor: texto } : { malo: "correo electrónico inválido" };
    default: {
      // Catálogos cerrados: se guarda el nombre canónico.
      const c = canonico(tipo, texto);
      return c ? { valor: c } : { malo: "valor no válido: no está entre las opciones permitidas" };
    }
  }
}

// Normaliza y valida una fila de empleado.
// Devuelve { fila, advertencias } (fila: todos los campos como texto, '' si vacío o inválido) o { error }.
// Un valor inválido de un campo OPCIONAL no rechaza la fila: ese campo queda vacío y se informa una advertencia
// { campo, valor_recibido, motivo } (valor_recibido es null para CURP/NSS/RFC/CLABE). Nombre, apellido paterno y fechas
// inválidas sí rechazan la fila.
function prepararFilaEmpleado(cruda) {
  if (!esFilaObjeto(cruda)) return { error: "La fila no tiene el formato esperado" };

  const fila = {};
  const advertencias = [];
  const advertir = (campo, valor, motivo, sensible) => {
    advertencias.push({
      campo,
      valor_recibido: sensible || CAMPOS_SENSIBLES.includes(campo) || valor === null ? null : valorParaMostrar(valor),
      motivo,
    });
  };

  // Requeridos
  for (const clave of CAMPOS_REQUERIDOS) {
    const etiqueta = CAMPOS_EMPLEADO.find((c) => c[0] === clave)[1];
    const t = textoSeguro(cruda[clave]);
    if (t === null) return { error: `${etiqueta} tiene un valor no válido` };
    fila[clave] = t;
  }
  if (!fila.nombre || !fila.apellido_paterno) return { error: "Nombre y apellido paterno son requeridos" };
  for (const clave of CAMPOS_REQUERIDOS) {
    const [, etiqueta, , max] = CAMPOS_EMPLEADO.find((c) => c[0] === clave);
    if (fila[clave].includes("\u0000")) return { error: `${etiqueta} contiene caracteres no permitidos` };
    if (fila[clave].length > max) return { error: `${etiqueta} excede ${max} caracteres (tiene ${fila[clave].length})` };
  }

  // Fechas: una fecha inválida rechaza la fila
  for (const clave of CAMPOS_FECHA) {
    const etiqueta = CAMPOS_EMPLEADO.find((c) => c[0] === clave)[1];
    const t = textoSeguro(cruda[clave]);
    if (t === null) return { error: `${etiqueta} tiene un valor no válido` };
    if (t && !esFechaValida(t)) {
      return { error: `${etiqueta} inválida (usa AAAA-MM-DD, año entre ${ANIO_MINIMO} y ${ANIO_MAXIMO})` };
    }
    fila[clave] = t;
  }

  // Resto de campos: opcionales
  for (const [clave, , tipo, max] of CAMPOS_EMPLEADO) {
    if (CAMPOS_REQUERIDOS.includes(clave) || tipo === "fecha") continue;
    const t = textoSeguro(cruda[clave]);
    if (t === null) { fila[clave] = ""; advertir(clave, null, "valor no válido"); continue; }
    if (t.includes("\u0000")) { fila[clave] = ""; advertir(clave, t, "contiene caracteres no permitidos"); continue; }
    const r = validarCampoOpcional(tipo, max, t);
    if (r.malo) { fila[clave] = ""; advertir(clave, t, r.malo, r.sensible); continue; }
    fila[clave] = r.valor;
    if (r.aviso) advertir(clave, t, r.aviso, true);
  }

  // Referencias a catálogos y jefe
  for (const [clave, , max] of CAMPOS_REFERENCIA) {
    const t = textoSeguro(cruda[clave]);
    if (t === null) { fila[clave] = ""; advertir(clave, null, "valor no válido"); continue; }
    if (t.includes("\u0000")) { fila[clave] = ""; advertir(clave, t, "contiene caracteres no permitidos"); continue; }
    if (t.length > max) { fila[clave] = ""; advertir(clave, t, `excede ${max} caracteres (tiene ${t.length})`); continue; }
    fila[clave] = t;
  }
  {
    const t = textoSeguro(cruda.jefe_curp);
    if (t === null || t.includes("\u0000")) { fila.jefe_curp = ""; advertir("jefe_curp", null, t === null ? "valor no válido" : "formato inválido"); }
    else {
      const r = validarCampoOpcional("curp", 18, t);
      if (r.malo) { fila.jefe_curp = ""; advertir("jefe_curp", t, "formato inválido"); } else fila.jefe_curp = r.valor;
    }
  }

  return { fila, advertencias };
}

// Valida el arreglo `filas` del cuerpo; devuelve el mensaje de error 400 o null.
function validarCuerpoImportacion(filas) {
  if (!Array.isArray(filas) || filas.length === 0) return "No se recibieron filas para importar";
  if (filas.length > MAX_FILAS_IMPORTAR) {
    return `Máximo ${MAX_FILAS_IMPORTAR} filas por petición (se recibieron ${filas.length}); envía el archivo en lotes`;
  }
  return null;
}

// Pares { empleado_id, fila, jefe_nomina, jefe_curp } de la segunda pasada de jefes. 400 si no es un arreglo o excede
// el tope; los pares malformados se descartan (los textos con NUL o largos nunca llegan a una consulta).
const MAX_PARES_JEFES = 500;
function validarParesJefes(pares) {
  if (!Array.isArray(pares) || pares.length === 0) return { error: "No se recibieron pares de jefes" };
  if (pares.length > MAX_PARES_JEFES) {
    return { error: `Máximo ${MAX_PARES_JEFES} pares por petición (se recibieron ${pares.length})` };
  }
  const validos = [];
  for (const p of pares) {
    if (!esFilaObjeto(p) || !Number.isInteger(p.empleado_id) || p.empleado_id <= 0 || p.empleado_id > 2147483647) continue;
    const jn = textoSeguro(p.jefe_nomina);
    const jc = textoSeguro(p.jefe_curp);
    if (jn === null || jc === null || jn.includes("\u0000") || jc.includes("\u0000") || jn.length > 50 || jc.length > 18) continue;
    if (!jn && !jc) continue;
    validos.push({ empleado_id: p.empleado_id, fila: Number.isInteger(p.fila) && p.fila > 0 ? p.fila : null, jefe_nomina: jn, jefe_curp: jc });
  }
  return { validos };
}

// Valores (en minúsculas) de una propiedad de cada fila, sin repetir y tolerando filas/valores no válidos.
function nombresUnicos(filas, clave) {
  const set = new Set();
  for (const f of filas) {
    const t = esFilaObjeto(f) ? textoSeguro(f[clave]) : "";
    if (t && !t.includes("\u0000")) set.add(t.toLowerCase());
  }
  return [...set];
}

module.exports = {
  MAX_FILAS_IMPORTAR,
  MAX_DUPLICADOS_DETALLE,
  MAX_SIN_CATALOGO,
  MAX_ADVERTENCIAS_LOTE,
  LIMITES_EMPLEADO,
  CAMPOS_EMPLEADO,
  CAMPOS_REFERENCIA,
  CAMPOS_DIRECTOS,
  CAMPOS_FECHA,
  normalizarClave,
  normalizarTelefono,
  valorParaMostrar,
  esFechaValida,
  textoSeguro,
  numeroFila,
  nombreCompleto,
  prepararFilaEmpleado,
  validarCuerpoImportacion,
  validarParesJefes,
  MAX_PARES_JEFES,
  nombresUnicos,
};
