const { Router } = require("express");
const ControladorDepartamento = require("../controllers/departamento.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();
router.use(authenticateJWT);

router.get("/", verificarPermiso("rh", "Departamentos", "consulta"), ControladorDepartamento.listar);
router.post("/importar", verificarPermiso("rh", "Departamentos", "edicion"), ControladorDepartamento.importar);
router.post("/", verificarPermiso("rh", "Departamentos", "edicion"), ControladorDepartamento.crear);
router.put("/:id", verificarPermiso("rh", "Departamentos", "edicion"), ControladorDepartamento.actualizar);
router.delete("/:id", verificarPermiso("rh", "Departamentos", "edicion"), ControladorDepartamento.eliminar);

module.exports = router;
