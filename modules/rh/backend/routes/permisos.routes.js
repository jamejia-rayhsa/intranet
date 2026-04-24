const { Router } = require("express");
const ControladorPermisos = require("../controllers/permisos.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();

router.use(authenticateJWT);

router.get("/", verificarPermiso("rh", "Permisos", "consulta"), ControladorPermisos.listar);
router.get("/:id", verificarPermiso("rh", "Permisos", "consulta"), ControladorPermisos.obtener);
router.post("/", verificarPermiso("rh", "Permisos", "edicion"), ControladorPermisos.crear);
router.put(
  "/:id/responder",
  verificarPermiso("rh", "Permisos", "edicion"),
  ControladorPermisos.responder,
);

module.exports = router;
