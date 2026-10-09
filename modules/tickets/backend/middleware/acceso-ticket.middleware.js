// Middleware: solo solicitante, tecnico asignado o administrador acceden al ticket.
const { grupo } = require("../config/database");
const { esAdminTickets, puedeAccederTicket } = require("../utils/acceso-ticket");
const TicketAdjunto = require("../models/ticketAdjunto.model");

const MENSAJE_DENEGADO = "No tienes acceso a este recurso";

function validarNumerico(parametro) {
  return (req, res, next) => {
    if (!/^\d+$/.test(String(req.params[parametro]))) {
      return res
        .status(400)
        .json({ exito: false, mensaje: `Parametro ${parametro} no valido` });
    }
    next();
  };
}

function denegar(req, res, recurso) {
  console.warn(`[Acceso] denegado usuario_id=${req.user.usuario_id} recurso=${recurso}`);
  return res.status(403).json({ exito: false, mensaje: MENSAJE_DENEGADO });
}

/** Solo administrador de tickets. */
function soloAdminTickets(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ exito: false, mensaje: "Usuario no autenticado" });
  }
  if (!esAdminTickets(req.user)) {
    return denegar(req, res, `tickets:${req.params.id || req.params.ticketId || "?"}`);
  }
  next();
}

/**
 * @param {(req) => Promise<number|string|null|undefined>} obtenerTicketId
 *   id del ticket al que pertenece el recurso solicitado
 * @param {object} [opciones]
 * @param {(user, ticket) => boolean} [opciones.regla] por defecto puedeAccederTicket
 * @param {boolean} [opciones.adminPasa=true] false: ni el admin salta la regla
 */
function accesoTicket(obtenerTicketId, { regla = puedeAccederTicket, adminPasa = true } = {}) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ exito: false, mensaje: "Usuario no autenticado" });
    }
    if (adminPasa && esAdminTickets(req.user)) return next(); // el controlador responde 404 si no existe

    try {
      const ticketId = await obtenerTicketId(req);
      let ticket = null;
      if (ticketId != null) {
        const r = await grupo.query(
          "SELECT solicitante_id, tecnico_id FROM tickets WHERE id = $1",
          [ticketId],
        );
        ticket = r.rows[0] || null;
      }
      if (!regla(req.user, ticket)) {
        return denegar(req, res, `tickets:${ticketId ?? "?"}`);
      }
      next();
    } catch (error) {
      console.error("[Acceso] Error al verificar acceso:", error.message);
      res.status(500).json({ exito: false, mensaje: "Error al verificar acceso" });
    }
  };
}

const ticketDeParametro = (nombre) => (req) => req.params[nombre];
const ticketDelAdjunto = async (req) => {
  const adjunto = await TicketAdjunto.obtenerPorId(req.params.id);
  return adjunto && adjunto.ticket_id;
};

module.exports = {
  accesoTicket,
  soloAdminTickets,
  validarNumerico,
  ticketDeParametro,
  ticketDelAdjunto,
  MENSAJE_DENEGADO,
};
