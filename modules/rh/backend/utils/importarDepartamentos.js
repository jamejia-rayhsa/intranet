// Validación de filas de importación de departamentos. Misma regla que la de empleados: un valor inválido de un
// campo OPCIONAL no rechaza la fila (el campo se ignora y se informa una advertencia); nombre faltante o una fecha
// de vigencia inválida sí rechazan la fila. Nunca se devuelve texto de PostgreSQL.
const { esFechaValida, textoSeguro, valorParaMostrar } = require("./importarEmpleados");

const CUPO_MINIMO = 1;
const CUPO_MAXIMO_IMPORTACION = 999;
const MAX_DESCRIPCION = 1000;

function prepararFilaDepartamento(cruda) {
  if (cruda === null || typeof cruda !== "object" || Array.isArray(cruda)) return { error: "La fila no tiene el formato esperado" };
  const advertencias = [];
  const advertir = (campo, valor, motivo) => advertencias.push({
    campo, valor_recibido: valor === null ? null : valorParaMostrar(valor), motivo,
  });

  const nombre = textoSeguro(cruda.nombre);
  if (nombre === null) return { error: "El campo nombre tiene un valor no válido" };
  if (!nombre) return { error: "El campo nombre es requerido" };
  if (nombre.includes("\u0000")) return { error: "El nombre contiene caracteres no permitidos" };
  if (nombre.length > 100) return { error: `El nombre excede 100 caracteres (tiene ${nombre.length})` };

  const fila = { nombre, descripcion: "", area: "", cupo: null, turno: "", turno_desde: "" };

  const texto = (clave, etiquetaMax) => {
    const t = textoSeguro(cruda[clave]);
    if (t === null) { advertir(clave, null, "valor no válido"); return ""; }
    if (t.includes("\u0000")) { advertir(clave, t, "contiene caracteres no permitidos"); return ""; }
    if (t.length > etiquetaMax) { advertir(clave, t, `excede ${etiquetaMax} caracteres (tiene ${t.length})`); return ""; }
    return t;
  };
  fila.descripcion = texto("descripcion", MAX_DESCRIPCION);
  fila.area = texto("area", 100);
  fila.turno = texto("turno", 100);

  const crudoCupo = textoSeguro(cruda.cupo_vacaciones);
  if (crudoCupo === null) advertir("cupo_vacaciones", null, "valor no válido");
  else if (crudoCupo !== "") {
    const n = /^\d{1,4}$/.test(crudoCupo) ? Number(crudoCupo) : NaN;
    if (Number.isInteger(n) && n >= CUPO_MINIMO && n <= CUPO_MAXIMO_IMPORTACION) fila.cupo = n;
    else advertir("cupo_vacaciones", crudoCupo, `cupo inválido: debe ser un entero entre ${CUPO_MINIMO} y ${CUPO_MAXIMO_IMPORTACION}`);
  }

  const desde = textoSeguro(cruda.turno_vigente_desde);
  if (desde === null) return { error: "Turno vigente desde tiene un valor no válido" };
  if (desde && !esFechaValida(desde)) return { error: "Turno vigente desde inválida (usa AAAA-MM-DD, año entre 1900 y 2100)" };
  fila.turno_desde = desde;
  if (desde && !fila.turno) advertir("turno_vigente_desde", desde, "se ignora porque la fila no indica un turno");

  return { fila, advertencias };
}

module.exports = { prepararFilaDepartamento, CUPO_MINIMO, CUPO_MAXIMO_IMPORTACION };
