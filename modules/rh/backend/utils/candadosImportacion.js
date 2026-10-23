// Candados de aplicación de la importación masiva: pg_advisory_xact_lock(int, int), que se libera solo al terminar la
// transacción. Serializan las importaciones del MISMO tipo: dos lotes simultáneos con las mismas filas (en cualquier
// orden) ya no se interbloquean, no duplican ni cierran ciclos de jefes. Se toma al inicio de cada transacción de lote,
// ANTES de leer el estado.
//
// Espacios de claves en uso en el repo (primer entero): 4217 vacaciones (por empleado), 4301/4302 asignación de turnos
// (por departamento / empleado). La importación usa el espacio 4410 con claves fijas 1 (empleados y su segunda pasada
// de jefes) y 2 (departamentos). La ingesta de marcas no usa candados de aplicación. El orden de adquisición es siempre
// 4410 primero y luego 4301 (la importación de departamentos asigna turnos): ningún flujo toma 4301 y después 4410.
const ESPACIO_IMPORTACION = 4410;
const CLAVES = { empleados: 1, departamentos: 2 };

async function tomarCandadoImportacion(cliente, tipo) {
  await cliente.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [ESPACIO_IMPORTACION, CLAVES[tipo]]);
}

module.exports = { ESPACIO_IMPORTACION, CLAVES, tomarCandadoImportacion };
