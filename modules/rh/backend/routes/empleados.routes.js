const { Router } = require("express");
const ControladorEmpleado = require("../controllers/empleado.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();

router.use(authenticateJWT);

router.get("/", verificarPermiso("rh", "Empleados", "consulta"), ControladorEmpleado.listar);
router.get("/mi-perfil", ControladorEmpleado.obtenerPorUsuario);
router.get(
  "/jefe/:jefeId/subordinados",
  verificarPermiso("rh", "Empleados", "consulta"),
  ControladorEmpleado.listarSubordinados,
);
router.get("/:id", ControladorEmpleado.obtener);
router.post("/", verificarPermiso("rh", "Empleados", "edicion"), ControladorEmpleado.crear);
router.put("/:id", verificarPermiso("rh", "Empleados", "edicion"), ControladorEmpleado.actualizar);
router.put(
  "/:id/baja",
  verificarPermiso("rh", "Empleados", "edicion"),
  ControladorEmpleado.marcarBaja,
);

module.exports = router;
