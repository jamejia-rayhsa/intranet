// Planificador en proceso de la sincronización diaria de consumo de Convenios desde MBA3.
// Decisión del humano (2026-11-10): una vez al día. Reglas (mismo estilo que el planificador del
// motor de asistencia, sin dependencias nuevas):
//  - Solo arranca con CONVENIOS_MBA3_SYNC_ACTIVO=true (por omisión apagado) y solo desde app.js iniciar().
//  - Revisa cada 30 min si toca correr: ya pasó la hora configurada (CONVENIOS_MBA3_SYNC_HORA, hora de
//    México, 3 por omisión) y todavía no hubo una vuelta exitosa HOY. Como el estado vive en la BD,
//    reiniciar el backend no repite ni se salta la vuelta del día.
//  - Tras un fallo reintenta, pero como mínimo 60 min después del último intento (el login de MBA3
//    bloquea la cuenta de servicio 15 min tras 5 fallos consecutivos).
//  - Una vuelta a la vez; el candado de PostgreSQL evita que corra en dos réplicas.
//  - Un error NUNCA tumba el proceso y solo se registra el mensaje (nunca el objeto de axios).
const REVISION_MS = 30 * 60 * 1000;
const REINTENTO_MIN_MS = 60 * 60 * 1000;
const RETRASO_INICIAL_MS = 60 * 1000;
const HORA_POR_OMISION = 3;

function leerConfig(env = process.env, log = console) {
  const activo = String(env.CONVENIOS_MBA3_SYNC_ACTIVO || '').trim().toLowerCase() === 'true';
  let hora = HORA_POR_OMISION;
  const texto = env.CONVENIOS_MBA3_SYNC_HORA;
  if (texto !== undefined && texto !== '') {
    if (/^\d{1,2}$/.test(String(texto).trim()) && Number(texto) <= 23) hora = Number(texto);
    else log.warn(`[Convenios] CONVENIOS_MBA3_SYNC_HORA="${String(texto).slice(0, 10)}" no es válida (0-23): se usa ${HORA_POR_OMISION}`);
  }
  return { activo, hora };
}

// `estado` = SincronizacionMba3.obtenerEstado(); `ahoraMs` inyectable para pruebas.
function debeEjecutar(estado, config, ahoraMs = Date.now()) {
  if (!estado) return false;
  if (Number(estado.hora_mx) < config.hora) return false;
  if (estado.fecha_ok_mx && estado.fecha_ok_mx === estado.hoy_mx) return false; // ya corrió bien hoy
  if (estado.ultima_ejecucion) {
    const transcurrido = ahoraMs - new Date(estado.ultima_ejecucion).getTime();
    if (transcurrido < REINTENTO_MIN_MS) return false; // intento reciente (puede haber fallado)
  }
  return true;
}

function crearPlanificador({ config, obtenerEstado, ejecutar, log = console, setIntervalFn = setInterval, setTimeoutFn = setTimeout, clearIntervalFn = clearInterval, clearTimeoutFn = clearTimeout }) {
  let intervalo = null;
  let inicial = null;
  let enCurso = false;

  async function revisar() {
    if (enCurso) return;
    enCurso = true;
    try {
      const estado = await obtenerEstado();
      if (!debeEjecutar(estado, config)) return;
      log.info('[Convenios] iniciando sincronización diaria de consumo desde MBA3');
      const r = await ejecutar();
      if (r?.omitida) log.info('[Convenios] sincronización omitida: otro proceso tiene el candado');
      else if (r?.error) log.error(`[Convenios] sincronización de consumo incompleta: ${r.error}`);
      else {
        log.info(
          `[Convenios] sincronización de consumo lista: consumos +${r?.consumos?.insertados || 0} ~${r?.consumos?.actualizados || 0}, ` +
            `devoluciones +${r?.devoluciones?.insertados || 0} ~${r?.devoluciones?.actualizados || 0}`,
        );
      }
    } catch (error) {
      log.error(`[Convenios] la sincronización de consumo falló: ${(error && error.message) || 'error'}`);
    } finally {
      enCurso = false;
    }
  }

  return {
    iniciar() {
      if (intervalo) return;
      inicial = setTimeoutFn(revisar, RETRASO_INICIAL_MS);
      intervalo = setIntervalFn(revisar, REVISION_MS);
      for (const t of [inicial, intervalo]) if (t && typeof t.unref === 'function') t.unref();
    },
    async detener() {
      if (inicial) clearTimeoutFn(inicial);
      if (intervalo) clearIntervalFn(intervalo);
      inicial = null;
      intervalo = null;
    },
    revisar,
  };
}

// Arranca según el entorno; devuelve siempre un objeto con detener() (inerte si está apagado).
function iniciarPlanificadorConsumoMba3({ env = process.env, log = console, obtenerEstado, ejecutar } = {}) {
  const config = leerConfig(env, log);
  if (!config.activo) return { activo: false, detener: async () => {} };
  const planificador = crearPlanificador({
    config,
    obtenerEstado: obtenerEstado || (() => require('../models/sincronizacionMba3.model').obtenerEstado()),
    ejecutar: ejecutar || (() => require('./convenioConsumoMba3.service').sincronizarConCandado()),
    log,
  });
  planificador.iniciar();
  log.info(`[Convenios] sincronización diaria de consumo desde MBA3 activa (después de las ${config.hora}:00 hora de México)`);
  return { activo: true, detener: () => planificador.detener(), planificador };
}

module.exports = { REVISION_MS, REINTENTO_MIN_MS, leerConfig, debeEjecutar, crearPlanificador, iniciarPlanificadorConsumoMba3 };
