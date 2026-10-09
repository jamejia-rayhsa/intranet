const { Router } = require("express");
const ControladorTicket = require("../controllers/ticket.controller");
const ControladorEncuesta = require("../controllers/encuesta.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const {
  accesoTicket,
  soloAdminTickets,
  validarNumerico,
  ticketDeParametro,
} = require("../middleware/acceso-ticket.middleware");
const { puedeCambiarEstado, esSolicitante } = require("../utils/acceso-ticket");

const router = Router();

router.use(authenticateJWT);

router.get("/", verificarPermiso("tickets", "Tickets", "consulta"), ControladorTicket.listar);
router.get("/tecnicos", verificarPermiso("tickets", "Tickets", "consulta"), ControladorTicket.listarTecnicos);
router.get(
  "/encuestas/estadisticas",
  verificarPermiso("tickets", "Encuestas", "consulta"),
  ControladorEncuesta.obtenerEstadisticas,
);
router.get("/:id", verificarPermiso("tickets", "Tickets", "consulta"), validarNumerico("id"), ControladorTicket.obtener);
router.post("/", verificarPermiso("tickets", "Tickets", "edicion"), ControladorTicket.crear);
router.put(
  "/:id/estado",
  verificarPermiso("tickets", "Tickets", "edicion"),
  validarNumerico("id"),
  accesoTicket(ticketDeParametro("id"), { regla: puedeCambiarEstado }),
  ControladorTicket.actualizarEstado,
);
router.put(
  "/:id/asignar",
  verificarPermiso("tickets", "Tickets", "edicion"),
  validarNumerico("id"),
  soloAdminTickets,
  ControladorTicket.asignarTecnico,
);
router.delete(
  "/:id",
  verificarPermiso("tickets", "Tickets", "edicion"),
  validarNumerico("id"),
  soloAdminTickets,
  ControladorTicket.eliminar,
);

router.post(
  "/:ticketId/encuesta",
  verificarPermiso("tickets", "Encuestas", "edicion"),
  validarNumerico("ticketId"),
  accesoTicket(ticketDeParametro("ticketId"), { regla: esSolicitante, adminPasa: false }),
  ControladorEncuesta.crear,
);
router.get(
  "/:ticketId/encuesta",
  verificarPermiso("tickets", "Encuestas", "consulta"),
  validarNumerico("ticketId"),
  accesoTicket(ticketDeParametro("ticketId")),
  ControladorEncuesta.obtener,
);

module.exports = router;
