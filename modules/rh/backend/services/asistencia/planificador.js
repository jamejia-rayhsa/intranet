// Planificador en proceso del motor de asistencia (sin dependencias nuevas). Cada ASISTENCIA_MOTOR_INTERVALO_MIN
// minutos ejecuta una vuelta del motor (re-vinculación de marcas + recálculo incremental + cierres). Reglas:
//  - Solo arranca si ASISTENCIA_MOTOR_ACTIVO=true (por omisión apagado) y SOLO cuando el proceso corre como servidor
//    (app.js lo arranca en iniciar(); importar el módulo no programa nada).
//  - Una sola vuelta a la vez por proceso (si la anterior sigue, se salta) y una sola en toda la flota por el candado
//    consultivo del motor (otra réplica recibe "omitida").
//  - No retiene conexiones del pool entre vueltas: cada vuelta pide la suya y la devuelve.
//  - Tiempo máximo "blando" por vuelta (ASISTENCIA_MOTOR_TIEMPO_MAX_MIN: el motor se detiene entre bloques y lo
//    pendiente se reintenta en la siguiente) y TOPE DURO (ASISTENCIA_MOTOR_TIMEOUT_MIN, 10 por omisión): statement_timeout
//    en la conexión de la vuelta y un vigilante que, al vencer, mata la sesión (pg_terminate_backend) y destruye la
//    conexión: el candado de sesión muere con ella, `enCurso` se libera y la vuelta queda en la bitácora como
//    error 'tiempo_excedido'. La siguiente vuelta corre normalmente.
//  - Un error NUNCA tumba el proceso: se registra sin datos personales (código/tipo, nunca el texto del error) y la
//    siguiente vuelta lo reintenta.
const INTERVALO_POR_OMISION_MIN = 15;
const TIEMPO_MAXIMO_POR_OMISION_MIN = 10;
const TIMEOUT_POR_OMISION_MIN = 10;
const RETRASO_INICIAL_POR_OMISION_S = 30;

function enteroEnRango(texto, minimo, maximo, defecto, nombre, log) {
  if (texto === undefined || texto === "") return defecto;
  if (/^\d{1,6}$/.test(String(texto).trim())) {
    const n = Number(texto);
    if (n >= minimo && n <= maximo) return n;
  }
  log.warn(`[Asistencia] ${nombre}="${String(texto).slice(0, 20)}" no es válido (${minimo}-${maximo}): se usa ${defecto}`);
  return defecto;
}

/** Lee la configuración del entorno. activo solo con ASISTENCIA_MOTOR_ACTIVO=true (sin distinguir mayúsculas). */
function leerConfigPlanificador(env = process.env, log = console) {
  const activo = String(env.ASISTENCIA_MOTOR_ACTIVO || "").trim().toLowerCase() === "true";
  return {
    activo,
    intervaloMs: enteroEnRango(env.ASISTENCIA_MOTOR_INTERVALO_MIN, 1, 1440, INTERVALO_POR_OMISION_MIN, "ASISTENCIA_MOTOR_INTERVALO_MIN", log) * 60000,
    tiempoMaxMs: enteroEnRango(env.ASISTENCIA_MOTOR_TIEMPO_MAX_MIN, 1, 120, TIEMPO_MAXIMO_POR_OMISION_MIN, "ASISTENCIA_MOTOR_TIEMPO_MAX_MIN", log) * 60000,
    timeoutMs: enteroEnRango(env.ASISTENCIA_MOTOR_TIMEOUT_MIN, 1, 240, TIMEOUT_POR_OMISION_MIN, "ASISTENCIA_MOTOR_TIMEOUT_MIN", log) * 60000,
    retrasoInicialMs: enteroEnRango(env.ASISTENCIA_MOTOR_RETRASO_INICIAL_S, 0, 3600, RETRASO_INICIAL_POR_OMISION_S, "ASISTENCIA_MOTOR_RETRASO_INICIAL_S", log) * 1000,
  };
}

const motivo = (error) => (error && error.code ? `codigo ${String(error.code).slice(0, 10)}` : (error && error.name) || "Error");

/**
 * @param {object} p
 * @param {(opciones:{tiempoMaxMs:number}) => Promise<object>} p.ejecutar una vuelta del motor
 * @param {number} p.intervaloMs
 * @param {number} p.tiempoMaxMs tiempo máximo blando (entre bloques)
 * @param {number} [p.timeoutMs] tope duro de una vuelta (por omisión tiempoMaxMs + 60 s)
 * @param {(control:object) => Promise<void>} [p.abortar] destruye la vuelta colgada (recibe el `control` que el motor llenó)
 * @param {number} [p.retrasoInicialMs]
 * @param {object} [p.log] {info, warn, error}
 * @param {Function} [p.setTimeoutFn] / [p.clearTimeoutFn] inyectables en pruebas
 */
function crearPlanificador({ ejecutar, intervaloMs, tiempoMaxMs, timeoutMs, abortar, retrasoInicialMs = 0, log = console, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }) {
  const topeDuroMs = timeoutMs || tiempoMaxMs + 60000;
  const tiempoBlandoMs = Math.min(tiempoMaxMs, Math.floor(topeDuroMs * 0.8));
  let temporizador = null;
  let detenido = true;
  let enCurso = null;
  let controlEnCurso = null;
  const estado = { vueltas: 0, errores: 0, omitidas: 0, ultimaVuelta: null, ultimoError: null };

  const programar = (ms) => {
    if (detenido) return;
    temporizador = setTimeoutFn(vuelta, ms);
    if (temporizador && typeof temporizador.unref === "function") temporizador.unref(); // no impide cerrar el proceso
  };

  async function vuelta() {
    temporizador = null;
    if (detenido) return;
    if (enCurso) {
      log.warn("[Asistencia] la vuelta anterior del motor sigue en curso: se omite esta");
      return programar(intervaloMs);
    }
    let reloj;
    const control = {};
    controlEnCurso = control;
    const limite = new Promise((resolver) => {
      reloj = setTimeoutFn(() => resolver("tiempo"), topeDuroMs);
      if (reloj && typeof reloj.unref === "function") reloj.unref();
    });
    const ejecucion = (async () => {
      try {
        const r = await ejecutar({ tiempoMaxMs: tiempoBlandoMs, timeoutMs: topeDuroMs, control });
        estado.vueltas++;
        estado.ultimaVuelta = new Date();
        if (r && r.omitida) {
          estado.omitidas++;
          log.info("[Asistencia] vuelta omitida: otro proceso tiene el candado del motor");
        } else if (r) {
          log.info(
            `[Asistencia] vuelta ${r.tipo || ""} ${r.estado || ""}: ${r.dias_evaluados || 0} días evaluados, ${r.dias_modificados || 0} modificados, ` +
              `${r.marcas_vinculadas || 0} marcas vinculadas, ${r.periodos_cerrados || 0} periodos cerrados, ${r.ajustes_nuevos || 0} ajustes nuevos`,
          );
        }
      } catch (error) {
        if (control.abortado) return; // ya se contó y registró al vencer el tope duro
        estado.errores++;
        estado.ultimoError = new Date();
        log.error(`[Asistencia] la vuelta del motor falló (${motivo(error)}); se reintenta en la siguiente`);
      }
    })();
    enCurso = ejecucion;
    const resultado = await Promise.race([ejecucion.then(() => "ok"), limite]);
    clearTimeoutFn(reloj);
    if (resultado === "tiempo") {
      estado.errores++;
      log.error("[Asistencia] la vuelta del motor excedió el tope duro de tiempo: se destruye su conexión y se libera el candado");
      try {
        if (abortar) await abortar(control);
      } catch (error) {
        log.error(`[Asistencia] no se pudo abortar la vuelta (${motivo(error)})`);
      }
      enCurso = null;
    } else {
      enCurso = null;
    }
    ejecucion.finally(() => {
      if (enCurso === ejecucion) enCurso = null;
      if (controlEnCurso === control) controlEnCurso = null;
    });
    if (!enCurso && controlEnCurso === control) controlEnCurso = null;
    programar(intervaloMs);
  }

  return {
    iniciar() {
      if (!detenido) return;
      detenido = false;
      programar(retrasoInicialMs);
    },
    /** Detiene el temporizador y espera (hasta esperaMs) a que termine la vuelta en curso */
    async detener(esperaMs = 5000) {
      detenido = true;
      if (temporizador) clearTimeoutFn(temporizador);
      temporizador = null;
      if (enCurso) {
        let reloj;
        const venció = await Promise.race([
          enCurso.then(() => false, () => false),
          new Promise((resolver) => {
            reloj = setTimeoutFn(() => resolver(true), esperaMs);
            if (reloj && typeof reloj.unref === "function") reloj.unref();
          }),
        ]);
        clearTimeoutFn(reloj);
        // La vuelta no terminó en el plazo del apagado (colgada): se destruye su conexión para liberar el candado 4501
        // en vez de dejarlo tomado hasta que venza statement_timeout (F-M4-2)
        if (venció && enCurso && abortar && controlEnCurso) {
          log.error("[Asistencia] apagado con una vuelta sin terminar: se destruye su conexión para liberar el candado");
          try {
            await abortar(controlEnCurso);
          } catch (error) {
            log.error(`[Asistencia] no se pudo abortar la vuelta al apagar (${motivo(error)})`);
          }
          enCurso = null;
        }
      }
    },
    activo: () => !detenido,
    estado: () => ({ ...estado, enCurso: enCurso !== null }),
    /** Ejecuta una vuelta ya (pruebas y diagnóstico) */
    vuelta,
  };
}

/**
 * Crea y arranca el planificador según el entorno. Devuelve siempre un objeto con detener() (inerte si está apagado).
 * Solo debe llamarse desde el arranque del servidor (app.js iniciar()), nunca al importar.
 */
function iniciarPlanificadorAsistencia({ env = process.env, log = console, ejecutar, abortar, crear = crearPlanificador } = {}) {
  const config = leerConfigPlanificador(env, log);
  if (!config.activo) {
    return { activo: false, detener: async () => {} };
  }
  const ejecutarVuelta = ejecutar || ((opciones) => require("./motorAsistencia").ejecutarCiclo(opciones));
  const planificador = crear({ ejecutar: ejecutarVuelta, abortar: abortar || ((control) => require("./motorAsistencia").abortarVuelta(control)), intervaloMs: config.intervaloMs, tiempoMaxMs: config.tiempoMaxMs, timeoutMs: config.timeoutMs, retrasoInicialMs: config.retrasoInicialMs, log });
  planificador.iniciar();
  log.info(`[Asistencia] motor de análisis activo: vuelta cada ${config.intervaloMs / 60000} min (primera en ${config.retrasoInicialMs / 1000} s)`);
  return { activo: true, detener: (...a) => planificador.detener(...a), planificador };
}

module.exports = { leerConfigPlanificador, crearPlanificador, iniciarPlanificadorAsistencia };
