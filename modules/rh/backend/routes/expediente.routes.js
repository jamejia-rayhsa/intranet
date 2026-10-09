const { Router } = require("express");
const ControladorExpediente = require("../controllers/expediente.controller");
const { subirDocumentoExpediente } = require("../middleware/upload.middleware");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();

router.use(authenticateJWT);

router.get(
  "/:empleadoId",
  verificarPermiso("rh", "Expedientes", "consulta"),
  ControladorExpediente.listar,
);
router.get(
  "/:id/url",
  verificarPermiso("rh", "Expedientes", "consulta"),
  ControladorExpediente.obtenerUrl,
);
router.post(
  "/:empleadoId",
  verificarPermiso("rh", "Expedientes", "edicion"),
  subirDocumentoExpediente.single("archivo"),
  ControladorExpediente.subir,
);
router.delete(
  "/:id",
  verificarPermiso("rh", "Expedientes", "edicion"),
  ControladorExpediente.eliminar,
);

module.exports = router;
