const { Router } = require("express");
const ControladorUbicacion = require("../controllers/ubicacion.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();
router.use(authenticateJWT);

router.get("/", verificarPermiso("rh", "Ubicaciones", "consulta"), ControladorUbicacion.listar);
router.get("/:id/siguiente-folio", verificarPermiso("rh", "Empleados", "consulta"), ControladorUbicacion.previsualizarFolio);
router.post("/", verificarPermiso("rh", "Ubicaciones", "edicion"), ControladorUbicacion.crear);
router.put("/:id", verificarPermiso("rh", "Ubicaciones", "edicion"), ControladorUbicacion.actualizar);
router.delete("/:id", verificarPermiso("rh", "Ubicaciones", "edicion"), ControladorUbicacion.eliminar);

module.exports = router;
