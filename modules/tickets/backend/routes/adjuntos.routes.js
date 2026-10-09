const { Router } = require("express");
const ControladorAdjunto = require("../controllers/adjunto.controller");
const { subirArchivo } = require("../middleware/upload.middleware");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const {
  accesoTicket,
  validarNumerico,
  ticketDeParametro,
  ticketDelAdjunto,
} = require("../middleware/acceso-ticket.middleware");

const router = Router();

router.use(authenticateJWT);

router.get(
  "/:ticketId",
  verificarPermiso("tickets", "Adjuntos", "consulta"),
  validarNumerico("ticketId"),
  accesoTicket(ticketDeParametro("ticketId")),
  ControladorAdjunto.listar,
);
router.post(
  "/:ticketId",
  verificarPermiso("tickets", "Adjuntos", "edicion"),
  validarNumerico("ticketId"),
  accesoTicket(ticketDeParametro("ticketId")),
  subirArchivo.single("archivo"),
  ControladorAdjunto.subir,
);
router.get(
  "/:id/url",
  verificarPermiso("tickets", "Adjuntos", "consulta"),
  validarNumerico("id"),
  accesoTicket(ticketDelAdjunto),
  ControladorAdjunto.obtenerUrl,
);
router.delete(
  "/:id",
  verificarPermiso("tickets", "Adjuntos", "edicion"),
  validarNumerico("id"),
  accesoTicket(ticketDelAdjunto),
  ControladorAdjunto.eliminar,
);

module.exports = router;
