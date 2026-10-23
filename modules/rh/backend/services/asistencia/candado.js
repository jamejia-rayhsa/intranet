// Candado consultivo del motor de asistencia: pg_try_advisory_lock(int, int) de SESIÓN, tomado en una conexión
// dedicada que ejecuta toda la corrida (varias transacciones cortas). Garantiza UNA sola ejecución del motor aunque
// haya varias réplicas o se dispare un recálculo manual a la vez que el planificador.
//
// Espacios de claves en uso en el repo (primer entero): 4217 vacaciones, 4301/4302 asignación de turnos, 4410
// importación masiva. El motor usa el espacio 4501 (clave 1); no colisiona con ninguno. Si se añaden otros
// candados, registrarlos también en utils/candadosImportacion.js.
const { grupo } = require("../../../../portal/backend/config/database");

const ESPACIO_MOTOR = 4501;
const CLAVE_MOTOR = 1;
const INTERVALO_REINTENTO_MS = 250;

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Ejecuta fn(cliente) con el candado del motor. Si otro proceso lo tiene devuelve { ocupado: true } sin ejecutar
 * (con esperaMs > 0 reintenta ese tiempo antes de rendirse). El candado se libera siempre; si no se pudo liberar,
 * la conexión se destruye (así PostgreSQL lo suelta).
 */
async function conCandadoDelMotor(fn, { esperaMs = 0, pool = grupo } = {}) {
  const cliente = await pool.connect();
  let errorLiberar;
  try {
    const limite = Date.now() + esperaMs;
    let obtenido = false;
    for (;;) {
      const r = await cliente.query("SELECT pg_try_advisory_lock($1::int, $2::int) AS obtenido", [ESPACIO_MOTOR, CLAVE_MOTOR]);
      obtenido = Boolean(r.rows[0] && r.rows[0].obtenido);
      if (obtenido || Date.now() >= limite) break;
      await dormir(INTERVALO_REINTENTO_MS);
    }
    if (!obtenido) return { ocupado: true };
    try {
      return { ocupado: false, valor: await fn(cliente) };
    } finally {
      try {
        await cliente.query("SELECT pg_advisory_unlock($1::int, $2::int)", [ESPACIO_MOTOR, CLAVE_MOTOR]);
      } catch (error) {
        errorLiberar = error;
      }
    }
  } finally {
    cliente.release(errorLiberar);
  }
}

module.exports = { ESPACIO_MOTOR, CLAVE_MOTOR, conCandadoDelMotor };
