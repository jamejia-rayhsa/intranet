const { Router } = require("express");
const ControladorReciboNomina = require("../controllers/reciboNomina.controller");
const { subirArchivo } = require("../middleware/upload.middleware");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();

router.use(authenticateJWT);

router.get(
  "/empleado/:empleadoId",
  verificarPermiso("rh", "Recibos", "consulta"),
  ControladorReciboNomina.listar,
);
router.get(
  "/periodo/:periodo",
  verificarPermiso("rh", "Recibos", "consulta"),
  ControladorReciboNomina.listarPorPeriodo,
);
router.get(
  "/:id/url",
  verificarPermiso("rh", "Recibos", "consulta"),
  ControladorReciboNomina.obtenerUrl,
);
router.get("/:id", verificarPermiso("rh", "Recibos", "consulta"), ControladorReciboNomina.obtener);
router.post(
  "/",
  verificarPermiso("rh", "Recibos", "edicion"),
  subirArchivo.single("archivo"),
  ControladorReciboNomina.crear,
);
router.delete(
  "/:id",
  verificarPermiso("rh", "Recibos", "edicion"),
  ControladorReciboNomina.eliminar,
);

module.exports = router;
