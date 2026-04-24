const { Router } = require("express");
const ControladorAdjunto = require("../controllers/adjunto.controller");
const { subirArchivo } = require("../middleware/upload.middleware");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();

router.use(authenticateJWT);

router.get("/:ticketId", verificarPermiso("tickets", "Adjuntos", "consulta"), ControladorAdjunto.listar);
router.post(
  "/:ticketId",
  verificarPermiso("tickets", "Adjuntos", "edicion"),
  subirArchivo.single("archivo"),
  ControladorAdjunto.subir,
);
router.delete(
  "/:id",
  verificarPermiso("tickets", "Adjuntos", "edicion"),
  ControladorAdjunto.eliminar,
);

module.exports = router;
