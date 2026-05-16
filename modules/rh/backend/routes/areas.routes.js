const { Router } = require("express");
const ControladorArea = require("../controllers/area.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();
router.use(authenticateJWT);

router.get("/",          verificarPermiso("rh", "Empleados", "consulta"), ControladorArea.listar);
router.post("/importar", verificarPermiso("rh", "Empleados", "edicion"),  ControladorArea.importar);
router.post("/",         verificarPermiso("rh", "Empleados", "edicion"),  ControladorArea.crear);
router.put("/:id",       verificarPermiso("rh", "Empleados", "edicion"),  ControladorArea.actualizar);
router.delete("/:id",    verificarPermiso("rh", "Empleados", "edicion"),  ControladorArea.eliminar);

module.exports = router;
