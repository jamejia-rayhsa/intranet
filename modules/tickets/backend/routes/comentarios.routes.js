const { Router } = require("express");
const ControladorComentario = require("../controllers/comentario.controller");
const {
  authenticateJWT,
} = require("../../../portal/backend/middleware/auth.middleware");

const router = Router();

router.use(authenticateJWT);

router.get("/:ticketId", ControladorComentario.listar);
router.post("/:ticketId", ControladorComentario.crear);

module.exports = router;
