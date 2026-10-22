// Validación de filas de importación (empleados y catálogos) del lado del servidor.
// Nunca devuelve texto de PostgreSQL: los mensajes son propios y en español.

// Máximo de filas por petición. El parser global de Express admite 100 kb y una fila típica de empleado pesa
// ~0.3-0.7 kb: el front envía lotes de 100 filas (TAMANO_LOTE) y este tope de 200 deja margen sin que el
// cuerpo supere los 100 kb (un cuerpo mayor lo corta el parser global con 413 JSON).
const MAX_FILAS_IMPORTAR = 200;
const MAX_DUPLICADOS_DETALLE = 200;

const ANIO_MINIMO = 1900;
const ANIO_MAXIMO = 2100;

// Longitudes por columna de empleados (según el esquema de BD) y su etiqueta para el mensaje.
const LIMITES_EMPLEADO = [
  ["nombre", 100, "Nombre"],
  ["apellido_paterno", 100, "Apellido paterno"],
  ["apellido_materno", 100, "Apellido materno"],
  ["curp", 18, "CURP"],
  ["rfc", 13, "RFC"],
  ["nss", 11, "NSS"],
  ["numero_nomina", 50, "Número de nómina"],
  ["genero", 20, "Género"],
  ["estado_civil", 30, "Estado civil"],
  ["escolaridad", 50, "Escolaridad"],
  ["tipo_contrato", 50, "Tipo de contrato"],
  ["correo_personal", 255, "Correo personal"],
  ["celular_personal", 20, "Celular personal"],
];

const CAMPOS_TEXTO_EXTRA = ["puesto", "departamento", "fecha_nacimiento", "fecha_ingreso"];

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

// Normaliza y valida una fila de empleado. Devuelve { fila } con todos los campos como texto, o { error }.
function prepararFilaEmpleado(cruda) {
  if (!esFilaObjeto(cruda)) return { error: "La fila no tiene el formato esperado" };

  const fila = {};
  for (const [clave, , etiqueta] of LIMITES_EMPLEADO) {
    const t = textoSeguro(cruda[clave]);
    if (t === null) return { error: `${etiqueta} tiene un valor no válido` };
    fila[clave] = t;
  }
  for (const clave of CAMPOS_TEXTO_EXTRA) {
    const t = textoSeguro(cruda[clave]);
    if (t === null) return { error: `${clave} tiene un valor no válido` };
    fila[clave] = t;
  }

  if (!fila.nombre || !fila.apellido_paterno) {
    return { error: "Nombre y apellido paterno son requeridos" };
  }

  for (const [clave, max, etiqueta] of LIMITES_EMPLEADO) {
    if (fila[clave].includes("\u0000")) return { error: `${etiqueta} contiene caracteres no permitidos` };
    if (fila[clave].length > max) {
      return { error: `${etiqueta} excede ${max} caracteres (tiene ${fila[clave].length})` };
    }
  }

  const fechas = [["fecha_nacimiento", "Fecha de nacimiento"], ["fecha_ingreso", "Fecha de ingreso"]];
  for (const [clave, etiqueta] of fechas) {
    if (fila[clave] && !esFechaValida(fila[clave])) {
      return { error: `${etiqueta} inválida (usa AAAA-MM-DD, año entre ${ANIO_MINIMO} y ${ANIO_MAXIMO})` };
    }
  }

  return { fila };
}

// Valida el arreglo `filas` del cuerpo; devuelve el mensaje de error 400 o null.
function validarCuerpoImportacion(filas) {
  if (!Array.isArray(filas) || filas.length === 0) return "No se recibieron filas para importar";
  if (filas.length > MAX_FILAS_IMPORTAR) {
    return `Máximo ${MAX_FILAS_IMPORTAR} filas por petición (se recibieron ${filas.length}); envía el archivo en lotes`;
  }
  return null;
}

// Valores (en minúsculas) de una propiedad de cada fila, sin repetir y tolerando filas/valores no válidos.
function nombresUnicos(filas, clave) {
  const set = new Set();
  for (const f of filas) {
    const t = esFilaObjeto(f) ? textoSeguro(f[clave]) : "";
    if (t) set.add(t.toLowerCase());
  }
  return [...set];
}

module.exports = {
  MAX_FILAS_IMPORTAR,
  MAX_DUPLICADOS_DETALLE,
  LIMITES_EMPLEADO,
  esFechaValida,
  textoSeguro,
  numeroFila,
  nombreCompleto,
  prepararFilaEmpleado,
  validarCuerpoImportacion,
  nombresUnicos,
};
