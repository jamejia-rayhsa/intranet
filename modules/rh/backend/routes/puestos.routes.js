const { Router } = require("express");
const ControladorPuesto = require("../controllers/puesto.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();
router.use(authenticateJWT);

router.get("/", verificarPermiso("rh", "Puestos", "consulta"), ControladorPuesto.listar);
router.post("/", verificarPermiso("rh", "Puestos", "edicion"), ControladorPuesto.crear);
router.put("/:id", verificarPermiso("rh", "Puestos", "edicion"), ControladorPuesto.actualizar);
router.delete("/:id", verificarPermiso("rh", "Puestos", "edicion"), ControladorPuesto.eliminar);

module.exports = router;
