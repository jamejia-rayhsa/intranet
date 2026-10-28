// API del motor de análisis de asistencia (/api/asistencia): resultados por día, resumen, periodos (cierre y
// reapertura), recálculo manual, empleados sin identificador, ajustes pendientes, justificaciones de RH y parámetros.
//
// Alcance de lectura: RH (Empleados:edicion o Asistencia:edicion; super_admin siempre) ve a todos; cualquier otro
// usuario ve SOLO su empleado y a sus subordinados DIRECTOS (jefe inmediato VIGENTE, leído en cada petición). Un
// empleado fuera del alcance (ajeno o inexistente) da el mismo 403. Las escrituras exigen Asistencia:edicion
// (rh_admin y super_admin) y toda escritura queda en la bitácora de auditoría. Los 500 son genéricos.
const Resultados = require("../models/asistenciaResultados.model");
const Empleado = require("../models/empleado.model");
const Auditoria = require("../../../auditoria/backend/models/auditoria.model");
const Motor = require("../services/asistencia/motorAsistencia");
const { DEFINICION, CLAVES, validarParametro, validarVentanaComida, interpretarParametros } = require("../services/asistencia/parametros");
const { tienePermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const { ipDeLaPeticion } = require("../middleware/llaveIngesta.middleware");
const { esIdValido, tieneControl } = require("../utils/turnoValidacion");
const { esFechaValida, validarRango } = require("../utils/diasHabiles");

const MAX_DIAS_CONSULTA = 92;
const LIMITE_POR_OMISION = 100;
const LIMITE_MAXIMO = 500;
const TOPE_EXPORTACION = 15000;
const MAX_IDS_EXPORTACION = 5000;
const MOTIVO_REAPERTURA_MIN = 10;
const CLAVES_CONFIRMACION_REFORZADA = ["analisis_desde", "cierre_automatico_desde", "dias_cierre"];
const FRASE_REFORZADA = "CAMBIAR";
const PAGINA_MAXIMA = 10000;
const MENSAJE_DENEGADO = "No tienes acceso a este recurso";
const MENSAJE_OCUPADO = "Hay un recálculo en curso; reintenta en unos segundos";
const MSG_ID = "El identificador debe ser un número entero positivo";

const responder400 = (res, mensaje) => res.status(400).json({ exito: false, mensaje });
const denegar = (res) => res.status(403).json({ exito: false, mensaje: MENSAJE_DENEGADO });

// Nunca error.message de PostgreSQL (puede traer datos de filas): solo código o tipo
function responderError(res, contexto, error) {
  console.error(`[AsistenciaMotor] ${contexto}: ${(error && (error.code || error.name)) || "Error"}`);
  return res.status(500).json({ exito: false, mensaje: `Error al ${contexto}` });
}

async function auditar(req, tabla, registroId, accion, previos, nuevos) {
  try {
    const ip = ipDeLaPeticion(req);
    await Auditoria.crear({
      usuario_id: req.user && (req.user.usuario_id || req.user.id),
      modulo: "rh",
      tabla,
      registro_id: String(registroId),
      accion,
      valores_previos: previos || null,
      valores_nuevos: nuevos || null,
      ip_origen: ip ? ip.slice(0, 45) : null,
      user_agent: req.headers["user-agent"] ? String(req.headers["user-agent"]).slice(0, 255) : null,
    });
  } catch (error) {
    console.error(`[AsistenciaMotor] Error al registrar auditoría: ${(error && (error.code || error.name)) || "Error"}`);
  }
}

// Paginación: ?pagina=1&limite=100 (máximo 500)
function leerPaginacion(query) {
  const pagina = query.pagina === undefined ? 1 : query.pagina;
  const limite = query.limite === undefined ? LIMITE_POR_OMISION : query.limite;
  if (!/^\d{1,5}$/.test(String(pagina)) || typeof pagina === "object" || Number(pagina) < 1 || Number(pagina) > PAGINA_MAXIMA) {
    return { error: `pagina debe ser un entero entre 1 y ${PAGINA_MAXIMA}` };
  }
  if (!/^\d{1,4}$/.test(String(limite)) || typeof limite === "object" || Number(limite) < 1 || Number(limite) > LIMITE_MAXIMO) {
    return { error: `limite debe ser un entero entre 1 y ${LIMITE_MAXIMO}` };
  }
  return { pagina: Number(pagina), limite: Number(limite), offset: (Number(pagina) - 1) * Number(limite) };
}

// Rango de fechas obligatorio, estricto y acotado
function leerRango(origen) {
  const { desde, hasta } = origen || {};
  if (typeof desde !== "string" || typeof hasta !== "string" || !esFechaValida(desde) || !esFechaValida(hasta)) {
    return { error: "desde y hasta son obligatorios con formato AAAA-MM-DD" };
  }
  const v = validarRango(desde, hasta, MAX_DIAS_CONSULTA);
  if (!v.ok) return { error: v.mensaje };
  return { desde, hasta };
}

const respuestaPaginada = (res, filas, total, pag) =>
  res.json({ exito: true, datos: filas, paginacion: { pagina: pag.pagina, limite: pag.limite, total } });

/**
 * { todos: true } (RH) | { ids } propio + subordinados directos | { vacio: true } sin ficha de empleado.
 * `soloEquipo` (pantalla «Mi equipo»): SOLO los subordinados directos vigentes, sin el propio empleado y sin importar el
 * rol: un RH que además es jefe ve ahí a su equipo, no a toda la empresa. Con `soloEquipo` nunca hay `todos`.
 */
async function alcanceDeLectura(req, desde, { soloEquipo = false } = {}) {
  if (soloEquipo) {
    const jefe = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);
    if (!jefe) return { vacio: true };
    const ids = (await Resultados.idsVisibles(jefe.id, desde)).filter((id) => id !== jefe.id);
    return { ids, propio: jefe };
  }
  if (
    (await tienePermiso(req.user, "rh", "Empleados", "edicion")) ||
    (await tienePermiso(req.user, "rh", "Asistencia", "edicion"))
  ) {
    return { todos: true };
  }
  const propio = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);
  if (!propio) return { vacio: true };
  return { ids: await Resultados.idsVisibles(propio.id, desde), propio };
}

const esRHDeLectura = async (req) =>
  (await tienePermiso(req.user, "rh", "Empleados", "edicion")) || (await tienePermiso(req.user, "rh", "Asistencia", "edicion"));

// ?equipo=1 pide solo a los subordinados directos (pantalla «Mi equipo»); cualquier otro valor se rechaza
function leerSoloEquipo(query) {
  if (query.equipo === undefined) return { soloEquipo: false };
  if (query.equipo !== "1") return { error: "equipo solo admite el valor 1" };
  return { soloEquipo: true };
}

const usuarioDe = (req) => req.user && (req.user.usuario_id || req.user.id);

const Controlador = {
  async resultados(req, res) {
    const rango = leerRango(req.query);
    if (rango.error) return responder400(res, rango.error);
    const pag = leerPaginacion(req.query);
    if (pag.error) return responder400(res, pag.error);
    const { empleado_id: empleadoParam } = req.query;
    if (empleadoParam !== undefined && !esIdValido(empleadoParam)) return responder400(res, "empleado_id debe ser un entero positivo");
    const eq = leerSoloEquipo(req.query);
    if (eq.error) return responder400(res, eq.error);
    try {
      const alcance = await alcanceDeLectura(req, rango.desde, eq);
      if (alcance.vacio) return denegar(res);
      let ids = null;
      if (empleadoParam !== undefined) {
        const id = Number(empleadoParam);
        if (!alcance.todos && !alcance.ids.includes(id)) return denegar(res); // ajeno o inexistente: mismo 403
        ids = [id];
      } else if (!alcance.todos) {
        ids = alcance.ids;
      }
      const r = await Resultados.listarResultados({
        ids, desde: rango.desde, hasta: rango.hasta, limite: pag.limite, offset: pag.offset, esRH: Boolean(alcance.todos),
      });
      return respuestaPaginada(res, r.filas, r.total, pag);
    } catch (error) {
      return responderError(res, "consultar los resultados de asistencia", error);
    }
  },

  async resumen(req, res) {
    const rango = leerRango(req.query);
    if (rango.error) return responder400(res, rango.error);
    const pag = leerPaginacion(req.query);
    if (pag.error) return responder400(res, pag.error);
    const { departamento_id: depto } = req.query;
    if (depto !== undefined && !esIdValido(depto)) return responder400(res, "departamento_id debe ser un entero positivo");
    const eq = leerSoloEquipo(req.query);
    if (eq.error) return responder400(res, eq.error);
    try {
      const alcance = await alcanceDeLectura(req, rango.desde, eq);
      if (alcance.vacio) return denegar(res);
      const r = await Resultados.resumen({
        ids: alcance.todos ? null : alcance.ids,
        departamentoId: depto === undefined ? null : Number(depto),
        desde: rango.desde,
        hasta: rango.hasta,
        limite: pag.limite,
        offset: pag.offset,
        esRH: Boolean(alcance.todos),
      });
      return respuestaPaginada(res, r.filas, r.total, pag);
    } catch (error) {
      return responderError(res, "consultar el resumen de asistencia", error);
    }
  },

  // Detalle de un día: snapshot del turno, marcas del día local, cruces y justificación. Mismo alcance que /resultados.
  async detalleDia(req, res) {
    const { empleado_id: empleadoParam, fecha } = req.query;
    if (!esIdValido(empleadoParam)) return responder400(res, "empleado_id debe ser un entero positivo");
    if (typeof fecha !== "string" || !esFechaValida(fecha)) return responder400(res, "fecha debe ser una fecha válida AAAA-MM-DD");
    const id = Number(empleadoParam);
    try {
      const alcance = await alcanceDeLectura(req, fecha);
      if (alcance.vacio) return denegar(res);
      if (!alcance.todos && !alcance.ids.includes(id)) return denegar(res);
      const r = await Resultados.detalleDia({ empleadoId: id, fecha, esRH: Boolean(alcance.todos) });
      if (!r) return res.status(404).json({ exito: false, mensaje: "Ese día no tiene un resultado calculado" });
      res.set("Cache-Control", "no-store");
      return res.json({ exito: true, datos: r });
    } catch (error) {
      return responderError(res, "consultar el detalle del día", error);
    }
  },

  // Días de los empleados ya filtrados en pantalla, para el CSV de detalle: paginación por clave (id) y total real.
  // POST solo por el tamaño de la lista de empleados; no escribe nada.
  async diasParaExportar(req, res) {
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const rango = leerRango(cuerpo);
    if (rango.error) return responder400(res, rango.error);
    const ids = cuerpo.empleado_ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS_EXPORTACION || !ids.every((v) => Number.isInteger(v) && v > 0 && v <= 2147483647)) {
      return responder400(res, `empleado_ids debe ser una lista de 1 a ${MAX_IDS_EXPORTACION} enteros positivos`);
    }
    const limite = cuerpo.limite === undefined ? LIMITE_MAXIMO : cuerpo.limite;
    if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO) return responder400(res, `limite debe ser un entero entre 1 y ${LIMITE_MAXIMO}`);
    const despues = cuerpo.despues_id === undefined || cuerpo.despues_id === null ? null : cuerpo.despues_id;
    if (despues !== null && (!Number.isInteger(despues) || despues < 1 || despues > 2147483647)) return responder400(res, "despues_id debe ser un entero positivo");
    try {
      const r = await Resultados.listarDiasPorClave({ ids: [...new Set(ids)], desde: rango.desde, hasta: rango.hasta, despuesId: despues, limite });
      res.set("Cache-Control", "no-store");
      return res.json({ exito: true, datos: r.filas, total: r.total, siguiente: r.siguiente });
    } catch (error) {
      return responderError(res, "consultar los días para exportar", error);
    }
  },

  // Bitácora de las últimas ejecuciones del motor (gestión: RH)
  async ejecuciones(req, res) {
    const limite = req.query.limite === undefined ? "20" : req.query.limite; // por omisión 20 (máximo 100)
    if (typeof limite !== "string" || !/^\d{1,3}$/.test(limite) || Number(limite) < 1 || Number(limite) > 100) {
      return responder400(res, "limite debe ser un entero entre 1 y 100");
    }
    try {
      const filas = await Resultados.listarEjecuciones({ limite: Number(limite) });
      res.set("Cache-Control", "no-store");
      return res.json({ exito: true, datos: filas });
    } catch (error) {
      return responderError(res, "consultar la bitácora del motor", error);
    }
  },

  // Rastro de la exportación a CSV del resumen o del detalle: solo el tipo y el número de filas (sin datos personales)
  async registrarExportacion(req, res) {
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    if (!Number.isInteger(cuerpo.filas) || cuerpo.filas < 0 || cuerpo.filas > TOPE_EXPORTACION) {
      return responder400(res, `filas debe ser un entero entre 0 y ${TOPE_EXPORTACION}`);
    }
    if (cuerpo.tipo !== "resumen" && cuerpo.tipo !== "detalle") return responder400(res, "tipo debe ser resumen o detalle");
    try {
      // Sin el atrapa-errores de auditar(): si la bitácora falla, la pantalla debe saberlo
      const ip = ipDeLaPeticion(req);
      await Auditoria.crear({
        usuario_id: usuarioDe(req),
        modulo: "rh",
        tabla: "asistencia_diaria",
        registro_id: "exportacion",
        accion: "EXPORTAR_ASISTENCIA",
        valores_previos: null,
        valores_nuevos: { tipo: cuerpo.tipo, filas: cuerpo.filas },
        ip_origen: ip ? ip.slice(0, 45) : null,
        user_agent: req.headers["user-agent"] ? String(req.headers["user-agent"]).slice(0, 255) : null,
      });
      return res.status(201).json({ exito: true, mensaje: "Exportación registrada" });
    } catch (error) {
      return responderError(res, "registrar la exportación", error);
    }
  },

  async periodos(req, res) {
    const pag = leerPaginacion(req.query);
    if (pag.error) return responder400(res, pag.error);
    const { estado } = req.query;
    if (estado !== undefined && estado !== "abierto" && estado !== "cerrado") return responder400(res, "estado debe ser abierto o cerrado");
    try {
      // quién reabrió y por qué solo lo ve RH (Empleados:edicion o Asistencia:edicion)
      const esRH = await esRHDeLectura(req);
      const r = await Resultados.listarPeriodos({ estado, limite: pag.limite, offset: pag.offset, esRH });
      return respuestaPaginada(res, r.filas, r.total, pag);
    } catch (error) {
      return responderError(res, "listar los periodos", error);
    }
  },

  // Contadores frescos para la confirmación de cierre (los mismos que el servidor compara al cerrar)
  async contadoresCierre(req, res) {
    const id = Number(req.params.id);
    try {
      const parametros = await Motor.leerParametros();
      const c = await Resultados.contadoresCierre(id, parametros.analisis_desde);
      if (!c) return res.status(404).json({ exito: false, mensaje: "Periodo no encontrado" });
      res.set("Cache-Control", "no-store");
      return res.json({ exito: true, datos: c });
    } catch (error) {
      return responderError(res, "consultar los contadores del periodo", error);
    }
  },

  async cerrarPeriodo(req, res) {
    const id = Number(req.params.id);
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const esp = cuerpo.esperados;
    const entero = (v) => Number.isInteger(v) && v >= 0 && v <= 1000000;
    if (!esp || typeof esp !== "object" || !entero(esp.ajustes_pendientes) || !entero(esp.sin_identificador)) {
      return responder400(res, "esperados debe indicar ajustes_pendientes y sin_identificador (enteros) tal como se mostraron al confirmar");
    }
    try {
      // Lo que RH vio al confirmar debe ser lo que hay ahora: si cambió, no se congela nada
      const parametros = await Motor.leerParametros();
      const actual = await Resultados.contadoresCierre(id, parametros.analisis_desde);
      if (!actual) return res.status(404).json({ exito: false, mensaje: "Periodo no encontrado" });
      if (actual.estado === "abierto" && (actual.ajustes_pendientes !== esp.ajustes_pendientes || actual.sin_identificador !== esp.sin_identificador)) {
        return res.status(409).json({
          exito: false,
          codigo: "datos_cambiaron",
          mensaje: "Los datos cambiaron desde que abriste la confirmación: revisa de nuevo",
          datos: { dias_pendientes: actual.dias_pendientes, ajustes_pendientes: actual.ajustes_pendientes, sin_identificador: actual.sin_identificador },
        });
      }
      const r = await Motor.cerrarPeriodo({ id, usuarioId: usuarioDe(req) });
      if (r.codigo === "ocupado") return res.status(409).json({ exito: false, mensaje: MENSAJE_OCUPADO });
      if (r.codigo === "no_existe") return res.status(404).json({ exito: false, mensaje: "Periodo no encontrado" });
      if (r.codigo === "ya_cerrado") return res.status(409).json({ exito: false, mensaje: "El periodo ya está cerrado" });
      if (r.codigo === "no_terminado") {
        return res.status(409).json({ exito: false, mensaje: "El periodo aún no termina: solo se cierra una quincena ya terminada" });
      }
      if (r.codigo === "con_pendientes") {
        return res.status(409).json({
          exito: false,
          codigo: "con_pendientes",
          mensaje: `La quincena tiene ${r.pendientes} ${r.pendientes === 1 ? "día pendiente" : "días pendientes"} de calificar: recalcula el rango y vuelve a intentarlo cuando no queden pendientes`,
        });
      }
      await auditar(req, "asistencia_periodos", id, "CERRAR_PERIODO", { estado: "abierto" }, {
        estado: "cerrado", tipo_cierre: "manual", ajustes_pendientes: esp.ajustes_pendientes, sin_identificador: esp.sin_identificador,
      });
      return res.json({ exito: true, datos: { periodo: r.periodo, dias_evaluados: r.dias_evaluados, ejecucion_id: r.ejecucion_id }, mensaje: "Periodo cerrado" });
    } catch (error) {
      return responderError(res, "cerrar el periodo", error);
    }
  },

  async reabrirPeriodo(req, res) {
    const id = Number(req.params.id);
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const motivo = typeof cuerpo.motivo === "string" ? cuerpo.motivo.trim() : "";
    if (motivo.length < MOTIVO_REAPERTURA_MIN || motivo.length > 500) return responder400(res, `El motivo es obligatorio (entre ${MOTIVO_REAPERTURA_MIN} y 500 caracteres)`);
    if (tieneControl(motivo, true)) return responder400(res, "El motivo contiene caracteres no válidos");
    try {
      const r = await Motor.reabrirPeriodo({ id, usuarioId: usuarioDe(req), motivo });
      if (r.codigo === "ocupado") return res.status(409).json({ exito: false, mensaje: MENSAJE_OCUPADO });
      if (r.codigo === "no_existe") return res.status(404).json({ exito: false, mensaje: "Periodo no encontrado" });
      if (r.codigo === "no_cerrado") return res.status(409).json({ exito: false, mensaje: "El periodo no está cerrado" });
      await auditar(req, "asistencia_periodos", id, "REABRIR_PERIODO", { estado: "cerrado" }, { estado: "abierto", motivo });
      return res.json({ exito: true, datos: { periodo: r.periodo, dias_evaluados: r.dias_evaluados, ejecucion_id: r.ejecucion_id }, mensaje: "Periodo reabierto" });
    } catch (error) {
      return responderError(res, "reabrir el periodo", error);
    }
  },

  async recalcular(req, res) {
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const rango = leerRango(cuerpo);
    if (rango.error) return responder400(res, rango.error);
    if (cuerpo.empleado_id !== undefined && cuerpo.empleado_id !== null && !esIdValido(cuerpo.empleado_id)) {
      return responder400(res, "empleado_id debe ser un entero positivo");
    }
    const empleadoId = cuerpo.empleado_id === undefined || cuerpo.empleado_id === null ? null : Number(cuerpo.empleado_id);
    try {
      const r = await Motor.recalcular({
        desde: rango.desde,
        hasta: rango.hasta,
        empleadoIds: empleadoId ? [empleadoId] : undefined,
        usuarioId: usuarioDe(req),
      });
      if (r.ocupado) return res.status(409).json({ exito: false, mensaje: MENSAJE_OCUPADO });
      if (r.dias_evaluados === 0 && r.dias_omitidos_cerrados > 0) {
        return res.status(409).json({
          exito: false,
          mensaje: "Todos los días del rango pertenecen a periodos cerrados: reabre el periodo para recalcularlo",
        });
      }
      await auditar(req, "asistencia_diaria", r.ejecucion_id, "RECALCULAR", null, {
        desde: rango.desde, hasta: rango.hasta, empleado_id: empleadoId, dias_evaluados: r.dias_evaluados, dias_modificados: r.dias_modificados,
      });
      return res.json({
        exito: true,
        datos: {
          ejecucion_id: r.ejecucion_id, desde: r.desde, hasta: r.hasta, empleados: r.empleados,
          dias_evaluados: r.dias_evaluados, dias_modificados: r.dias_modificados, dias_omitidos_cerrados: r.dias_omitidos_cerrados,
        },
        mensaje: "Recálculo terminado",
      });
    } catch (error) {
      return responderError(res, "recalcular la asistencia", error);
    }
  },

  async sinIdentificador(req, res) {
    const pag = leerPaginacion(req.query);
    if (pag.error) return responder400(res, pag.error);
    try {
      const parametros = await Motor.leerParametros();
      const r = await Resultados.sinIdentificador({ analisisDesde: parametros.analisis_desde, limite: pag.limite, offset: pag.offset });
      return respuestaPaginada(res, r.filas, r.total, pag);
    } catch (error) {
      return responderError(res, "listar los empleados sin identificador", error);
    }
  },

  async ajustes(req, res) {
    const pag = leerPaginacion(req.query);
    if (pag.error) return responder400(res, pag.error);
    const { resueltos } = req.query;
    if (resueltos !== undefined && resueltos !== "true" && resueltos !== "false") return responder400(res, "resueltos debe ser true o false");
    try {
      const r = await Resultados.listarAjustes({ resueltos: resueltos === "true", limite: pag.limite, offset: pag.offset });
      return respuestaPaginada(res, r.filas, r.total, pag);
    } catch (error) {
      return responderError(res, "listar los ajustes pendientes", error);
    }
  },

  async resolverAjuste(req, res) {
    const id = Number(req.params.id);
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    let nota = null;
    if (cuerpo.nota !== undefined && cuerpo.nota !== null) {
      if (typeof cuerpo.nota !== "string" || cuerpo.nota.trim().length > 500 || tieneControl(cuerpo.nota, true)) {
        return responder400(res, "La nota debe ser texto de hasta 500 caracteres");
      }
      nota = cuerpo.nota.trim() || null;
    }
    try {
      const previo = await Resultados.obtenerAjuste(id);
      if (!previo) return res.status(404).json({ exito: false, mensaje: "Ajuste no encontrado" });
      const fila = await Resultados.resolverAjuste(id, usuarioDe(req), nota);
      if (!fila) return res.status(409).json({ exito: false, mensaje: "El ajuste ya estaba resuelto" });
      await auditar(req, "asistencia_ajustes_pendientes", id, "RESOLVER_AJUSTE", { resuelto: false }, { resuelto: true, empleado_id: fila.empleado_id, fecha: fila.fecha });
      return res.json({ exito: true, datos: fila, mensaje: "Ajuste resuelto" });
    } catch (error) {
      return responderError(res, "resolver el ajuste", error);
    }
  },

  async justificar(req, res) {
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    if (!esIdValido(cuerpo.empleado_id)) return responder400(res, "empleado_id debe ser un entero positivo");
    if (!esFechaValida(cuerpo.fecha)) return responder400(res, "fecha debe ser una fecha válida AAAA-MM-DD");
    const motivo = typeof cuerpo.motivo === "string" ? cuerpo.motivo.trim() : "";
    if (motivo.length < 5 || motivo.length > 500) return responder400(res, "El motivo es obligatorio (entre 5 y 500 caracteres)");
    if (tieneControl(motivo, true)) return responder400(res, "El motivo contiene caracteres no válidos");
    const empleadoId = Number(cuerpo.empleado_id);
    try {
      const r = await Resultados.justificarDia({ empleadoId, fecha: cuerpo.fecha, motivo, usuarioId: usuarioDe(req) });
      if (r.codigo === "sin_resultado") return res.status(404).json({ exito: false, mensaje: "Ese día no tiene un resultado calculado" });
      if (r.codigo === "periodo_cerrado") {
        return res.status(409).json({ exito: false, mensaje: "El periodo está cerrado: reábrelo para justificar el día" });
      }
      if (r.codigo === "ya_justificada") return res.status(409).json({ exito: false, mensaje: "Ese día ya tiene una justificación activa: anúlala antes de registrar otra" });
      if (r.codigo === "no_justificable") {
        return res.status(409).json({ exito: false, mensaje: "Solo se justifica una falta, retardo, salida anticipada o marca incompleta" });
      }
      await auditar(req, "asistencia_incidencias", r.incidencia.id, "JUSTIFICAR_DIA", { estatus: r.estatus_previo }, { empleado_id: empleadoId, fecha: cuerpo.fecha, motivo });
      let recalculado = false;
      try {
        recalculado = await Motor.recalcularDia({ empleadoId, fecha: cuerpo.fecha, usuarioId: usuarioDe(req) });
      } catch (error) {
        console.error(`[AsistenciaMotor] recálculo tras justificar: ${(error && (error.code || error.name)) || "Error"}`);
      }
      const dia = recalculado ? await Resultados.obtenerDia(empleadoId, cuerpo.fecha) : null;
      return res.status(201).json({
        exito: true,
        datos: { incidencia: r.incidencia, recalculado, dia },
        mensaje: recalculado ? "Día justificado" : "Justificación registrada; el día se recalculará en la siguiente vuelta del motor",
      });
    } catch (error) {
      return responderError(res, "justificar el día", error);
    }
  },

  async anularIncidencia(req, res) {
    const id = Number(req.params.id);
    try {
      const r = await Resultados.anularIncidencia({ id });
      if (r.codigo === "no_existe") return res.status(404).json({ exito: false, mensaje: "Incidencia no encontrada" });
      if (r.codigo === "ya_anulada") return res.status(409).json({ exito: false, mensaje: "La incidencia ya estaba anulada" });
      if (r.codigo === "periodo_cerrado") {
        return res.status(409).json({ exito: false, mensaje: "El periodo está cerrado: reábrelo para anular la justificación" });
      }
      await auditar(req, "asistencia_incidencias", id, "ANULAR_INCIDENCIA", { activa: true }, { activa: false, empleado_id: r.incidencia.empleado_id, fecha: r.incidencia.fecha });
      let recalculado = false;
      try {
        recalculado = await Motor.recalcularDia({ empleadoId: r.incidencia.empleado_id, fecha: r.incidencia.fecha, usuarioId: usuarioDe(req) });
      } catch (error) {
        console.error(`[AsistenciaMotor] recálculo tras anular: ${(error && (error.code || error.name)) || "Error"}`);
      }
      return res.json({
        exito: true,
        datos: { id, recalculado },
        mensaje: recalculado ? "Justificación anulada" : "Justificación anulada; el día se recalculará en la siguiente vuelta del motor",
      });
    } catch (error) {
      return responderError(res, "anular la justificación", error);
    }
  },

  async obtenerParametros(req, res) {
    try {
      const filas = await Motor.listarParametros();
      const tipados = interpretarParametros(filas);
      return res.json({
        exito: true,
        datos: CLAVES.map((clave) => {
          const fila = filas.find((f) => f.clave === clave) || {};
          return { clave, valor: tipados[clave], tipo: DEFINICION[clave].tipo, editable: DEFINICION[clave].editable, minimo: DEFINICION[clave].minimo ?? null, maximo: DEFINICION[clave].maximo ?? null, descripcion: fila.descripcion || null, fecha_actualizacion: fila.fecha_actualizacion || null };
        }),
      });
    } catch (error) {
      return responderError(res, "consultar los parámetros", error);
    }
  },

  async actualizarParametros(req, res) {
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
    if (!cuerpo || Object.keys(cuerpo).length === 0) return responder400(res, "Indica al menos un parámetro");
    // Confirmación reforzada TAMBIÉN en el servidor: estas claves cambian qué se califica o cuándo se congelan periodos
    const { confirmacion, ...parametrosCuerpo } = cuerpo;
    if (Object.keys(parametrosCuerpo).length === 0) return responder400(res, "Indica al menos un parámetro");
    if (CLAVES_CONFIRMACION_REFORZADA.some((k) => k in parametrosCuerpo) && !(typeof confirmacion === "string" && confirmacion.trim().toUpperCase() === FRASE_REFORZADA)) {
      return responder400(res, `Cambiar ${CLAVES_CONFIRMACION_REFORZADA.filter((k) => k in parametrosCuerpo).join(", ")} exige la confirmación reforzada: envía confirmacion con el texto ${FRASE_REFORZADA}`);
    }
    const cambios = {};
    for (const [clave, bruto] of Object.entries(parametrosCuerpo)) {
      const v = validarParametro(clave, bruto);
      if (!v.ok) return responder400(res, v.mensaje);
      cambios[clave] = v.valor;
    }
    try {
      const errorComida = validarVentanaComida(cambios, await Motor.leerParametros());
      if (errorComida) return responder400(res, errorComida);
      const { previos, nuevos } = await Motor.guardarParametros(cambios, usuarioDe(req));
      await auditar(req, "asistencia_parametros", "parametros", "ACTUALIZAR_PARAM", previos, nuevos);
      return res.json({ exito: true, datos: nuevos, mensaje: "Parámetros actualizados" });
    } catch (error) {
      if (error && error.validacion) return responder400(res, error.validacion);
      return responderError(res, "actualizar los parámetros", error);
    }
  },
};

module.exports = Controlador;
module.exports.MSG_ID = MSG_ID;
