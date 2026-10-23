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
 *
 * `control` (objeto vacío que pasa quien llama) recibe { cliente, pid, liberado }: con él un vigilante puede
 * ABORTAR la corrida (abortarCorrida) si se cuelga. `statementTimeoutMs` pone un statement_timeout de sesión en la
 * conexión dedicada (se restablece antes de devolverla al pool) y lo deja en cliente.timeoutMs para los SET LOCAL
 * de las transacciones de la corrida.
 */
async function conCandadoDelMotor(fn, { esperaMs = 0, pool = grupo, control = null, statementTimeoutMs = null } = {}) {
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
    if (control) {
      control.cliente = cliente;
      try {
        const pid = await cliente.query("SELECT pg_backend_pid() AS pid");
        control.pid = pid.rows[0] && pid.rows[0].pid;
      } catch { /* sin pid: se destruye solo la conexión */ }
    }
    const tope = Number.isInteger(statementTimeoutMs) && statementTimeoutMs > 0 ? statementTimeoutMs : null;
    if (tope) {
      await cliente.query(`SET statement_timeout = ${tope}`);
      cliente.timeoutMs = tope;
    }
    try {
      return { ocupado: false, valor: await fn(cliente) };
    } finally {
      try {
        if (tope) await cliente.query("RESET statement_timeout");
        await cliente.query("SELECT pg_advisory_unlock($1::int, $2::int)", [ESPACIO_MOTOR, CLAVE_MOTOR]);
      } catch (error) {
        errorLiberar = error;
      }
      delete cliente.timeoutMs;
    }
  } finally {
    if (!control) cliente.release(errorLiberar);
    else if (!control.liberado) {
      control.liberado = true;
      cliente.release(errorLiberar);
    }
  }
}

/**
 * Tope duro: mata la sesión de la corrida (pg_terminate_backend desde otra conexión) y destruye la conexión del pool.
 * El candado es de SESIÓN: muere con ella. Idempotente.
 */
async function abortarCorrida(control, { pool = grupo } = {}) {
  if (!control || control.liberado) return;
  control.abortado = true;
  if (control.pid) {
    try {
      await pool.query("SELECT pg_terminate_backend($1::int)", [control.pid]);
    } catch { /* la conexión se destruye de todos modos */ }
  }
  if (control.cliente && !control.liberado) {
    control.liberado = true;
    try {
      control.cliente.release(true);
    } catch { /* ya estaba liberada */ }
  }
}

module.exports = { ESPACIO_MOTOR, CLAVE_MOTOR, conCandadoDelMotor, abortarCorrida };
