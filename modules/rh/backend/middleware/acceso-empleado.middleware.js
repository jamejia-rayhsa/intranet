// Acceso por propietario a recursos de un empleado (recibos, expedientes).
// Regla: RH (super_admin o permiso de edicion sobre la opcion) ve todo; el resto,
// solo recursos de SU empleado (empleados.usuario_id = req.user.usuario_id).
const { tienePermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const Empleado = require("../models/empleado.model");

const MENSAJE_DENEGADO = "No tienes acceso a este recurso";

function denegar(req, res, recurso) {
  // Solo ids: nunca contenido del recurso
  console.warn(
    `[Acceso] denegado usuario_id=${req.user && req.user.usuario_id} recurso=${recurso}`,
  );
  return res.status(403).json({ exito: false, mensaje: MENSAJE_DENEGADO });
}

/** Valida que req.params[nombre] cumpla el patron; si no, 400. */
function validarParametro(nombre, patron, mensaje) {
  return (req, res, next) => {
    if (!patron.test(String(req.params[nombre]))) {
      return res.status(400).json({ exito: false, mensaje });
    }
    next();
  };
}

const validarId = (nombre = "id") =>
  validarParametro(nombre, /^\d+$/, `Parametro ${nombre} no valido`);
const validarPeriodo = (nombre = "periodo") =>
  validarParametro(nombre, /^\d{4}-\d{2}$/, "Periodo no valido (formato YYYY-MM)");

/**
 * @param {object} opciones
 * @param {string} opciones.opcion - opcion del modulo rh del recurso ('Recibos', 'Empleados', ...)
 * @param {string} [opciones.opcionRH=opcion] - opcion cuyo permiso define "RH"
 * @param {'consulta'|'edicion'} [opciones.tipoRH='edicion'] - tipo de permiso que define "RH"
 * @param {(req) => Promise<number|string|null|undefined>} [opciones.obtenerEmpleadoId]
 *   empleado dueno del recurso (undefined/null si no existe). Puede dejar el recurso en req.recurso.
 * @param {boolean} [opciones.soloRH] - solo RH (listados de varios empleados)
 * @param {boolean} [opciones.permitirDueno=true] - false: ni el dueno pasa (p. ej. aprobar lo propio)
 * @param {(req, propio) => Promise<boolean>|boolean} [opciones.permitirSi]
 *   regla extra para no-RH (p. ej. jefe inmediato); `propio` = empleado del usuario
 */
function accesoEmpleado({
  opcion,
  opcionRH,
  tipoRH = "edicion",
  obtenerEmpleadoId,
  soloRH = false,
  permitirDueno = true,
  permitirSi,
}) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ exito: false, mensaje: "Usuario no autenticado" });
    }
    const idRecurso = req.params && (req.params.id || req.params.empleadoId || req.params.periodo);
    const recurso = `rh.${opcion}${idRecurso ? `:${idRecurso}` : ""}`;

    try {
      // RH: pasa; si el recurso no existe, el controlador responde 404
      if (await tienePermiso(req.user, "rh", opcionRH || opcion, tipoRH)) {
        return next();
      }
      if (soloRH) return denegar(req, res, recurso);

      const duenoId = await obtenerEmpleadoId(req);
      if (duenoId === undefined || duenoId === null) {
        return denegar(req, res, recurso); // inexistente: 403 uniforme
      }

      const propio = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);
      if (!propio) return denegar(req, res, recurso);

      const esDueno = String(propio.id) === String(duenoId);
      if (permitirDueno && esDueno) return next();
      if (permitirSi && (await permitirSi(req, propio))) return next();
      return denegar(req, res, recurso);
    } catch (error) {
      console.error("[Acceso] Error al verificar acceso:", error.message);
      res.status(500).json({ exito: false, mensaje: "Error al verificar acceso" });
    }
  };
}

/**
 * Un no-RH solo actua sobre su propio empleado en `origen[campo]` (body o query).
 * Campo ausente: lo resuelve el controlador a su empleado (o se fuerza si `forzar`).
 * Campo presente y ajeno: 403. RH pasa sin cambios.
 */
function empleadoPropioEnPeticion({ origen = "body", campo = "empleado_id", opcion, opcionRH, tipoRH = "edicion", forzar = false }) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ exito: false, mensaje: "Usuario no autenticado" });
    }
    if (origen === "query") {
      // Express 5: req.query es un getter; se fija una copia mutable para poder forzar el campo
      Object.defineProperty(req, "query", {
        value: { ...req.query },
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    const contenedor = (req[origen] = req[origen] || {});
    const valor = contenedor[campo];
    const recurso = `rh.${opcion}`;
    try {
      if (valor !== undefined && valor !== null && valor !== "" && !/^\d+$/.test(String(valor))) {
        return res.status(400).json({ exito: false, mensaje: `Parametro ${campo} no valido` });
      }
      if (await tienePermiso(req.user, "rh", opcionRH || opcion, tipoRH)) return next();

      const propio = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);
      if (!propio) return denegar(req, res, recurso);
      const presente = valor !== undefined && valor !== null && valor !== "";
      if (presente && String(valor) !== String(propio.id)) return denegar(req, res, recurso);
      if (forzar) contenedor[campo] = propio.id;
      next();
    } catch (error) {
      console.error("[Acceso] Error al verificar acceso:", error.message);
      res.status(500).json({ exito: false, mensaje: "Error al verificar acceso" });
    }
  };
}

module.exports = {
  accesoEmpleado,
  empleadoPropioEnPeticion,
  validarId,
  validarPeriodo,
  MENSAJE_DENEGADO,
};
