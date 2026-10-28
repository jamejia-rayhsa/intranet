// Candados de aplicación de la importación masiva: pg_advisory_xact_lock(int, int), que se libera solo al terminar la
// transacción. Serializan las importaciones del MISMO tipo: dos lotes simultáneos con las mismas filas (en cualquier
// orden) ya no se interbloquean, no duplican ni cierran ciclos de jefes. Se toma al inicio de cada transacción de lote,
// ANTES de leer el estado.
//
// Espacios de claves en uso en el repo (primer entero): 4217 vacaciones (por empleado), 4301/4302 asignación de turnos
// (por departamento / empleado). La importación usa el espacio 4410 con claves fijas 1 (empleados y su segunda pasada
// de jefes) y 2 (departamentos). La ingesta de marcas no usa candados de aplicación. El motor de asistencia usa el espacio 4501 (clave 1, pg_try_advisory_lock de sesión; services/asistencia/candado.js) y no se anida con los anteriores. El orden de adquisición es siempre
// 4410 primero y luego 4301 (la importación de departamentos asigna turnos): ningún flujo toma 4301 y después 4410.
// La vinculación cuenta<->empleado usa su propio espacio 4601 (clave 1; models/empleadoCuenta.model.js). Orden de adquisición: la
// importación con la columna 'Correo de la cuenta' toma 4410 y luego 4601; la vinculación solo toma 4601 (sin inversión posible).
const ESPACIO_IMPORTACION = 4410;
const CLAVES = { empleados: 1, departamentos: 2 };

// Una importación NO puede congelar la intranet: (a) la espera por el candado (y por cualquier otro bloqueo de la transacción)
// tiene límite (`lock_timeout` 3 s, local a la transacción); al vencer, PostgreSQL da 55P03 y el controlador responde 409
// ("el lote no se aplicó": la transacción se deshizo entera); (b) como máximo MAX_IMPORTACIONES_SIMULTANEAS lotes corren a la vez
// por proceso: el resto recibe 409 inmediato SIN pedir conexión al pool (el pool es de 10 y lo comparte toda la intranet).
const LOCK_TIMEOUT = "3s";
const MAX_IMPORTACIONES_SIMULTANEAS = 2;
const MENSAJE_IMPORTACION_EN_CURSO = "Hay otra importación en curso; el lote no se aplicó. Espera unos segundos y reintenta";

class ErrorImportacionEnCurso extends Error {
  constructor() {
    super(MENSAJE_IMPORTACION_EN_CURSO);
    this.name = "ErrorImportacionEnCurso";
    this.estado = 409;
  }
}

let enEjecucion = 0;

// Reserva un cupo ANTES de pedir la conexión; devuelve la función que lo libera (idempotente). Lanza ErrorImportacionEnCurso si no hay.
function tomarCupoImportacion() {
  if (enEjecucion >= MAX_IMPORTACIONES_SIMULTANEAS) throw new ErrorImportacionEnCurso();
  enEjecucion++;
  let liberado = false;
  return () => {
    if (!liberado) { liberado = true; enEjecucion--; }
  };
}

async function tomarCandadoImportacion(cliente, tipo) {
  // SET LOCAL: vale solo hasta el COMMIT/ROLLBACK de esta transacción (no contamina la conexión del pool)
  await cliente.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
  await cliente.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [ESPACIO_IMPORTACION, CLAVES[tipo]]);
}

// true si el error es "otra importación en curso" (sin cupo en el proceso o lock_timeout vencido): el controlador responde 409
function esImportacionEnCurso(error) {
  return !!error && (error instanceof ErrorImportacionEnCurso || error.code === "55P03");
}

function responderImportacionEnCurso(res) {
  return res.status(409).json({ exito: false, mensaje: MENSAJE_IMPORTACION_EN_CURSO });
}

module.exports = {
  ESPACIO_IMPORTACION, CLAVES, LOCK_TIMEOUT, MAX_IMPORTACIONES_SIMULTANEAS, MENSAJE_IMPORTACION_EN_CURSO,
  ErrorImportacionEnCurso, tomarCupoImportacion, tomarCandadoImportacion, esImportacionEnCurso, responderImportacionEnCurso,
};
