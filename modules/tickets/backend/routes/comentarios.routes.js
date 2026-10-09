const { Router } = require("express");
const ControladorComentario = require("../controllers/comentario.controller");
const {
  authenticateJWT,
} = require("../../../portal/backend/middleware/auth.middleware");

const {
  accesoTicket,
  validarNumerico,
  ticketDeParametro,
} = require("../middleware/acceso-ticket.middleware");

const router = Router();

router.use(authenticateJWT);

const acceso = [validarNumerico("ticketId"), accesoTicket(ticketDeParametro("ticketId"))];

router.get("/:ticketId", ...acceso, ControladorComentario.listar);
router.post("/:ticketId", ...acceso, ControladorComentario.crear);

module.exports = router;
