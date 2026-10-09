const { Router } = require("express");
const ControladorEmpleado = require("../controllers/empleado.controller");
const ControladorHijo = require("../controllers/empleadoHijo.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const { accesoEmpleado, validarId } = require("../middleware/acceso-empleado.middleware");

const router = Router();

router.use(authenticateJWT);

router.get("/", verificarPermiso("rh", "Empleados", "consulta"), ControladorEmpleado.listar);
router.post("/importar", verificarPermiso("rh", "Empleados", "edicion"), ControladorEmpleado.importar);
router.get("/mi-perfil", ControladorEmpleado.obtenerPorUsuario);
router.get(
  "/jefe/:jefeId/subordinados",
  verificarPermiso("rh", "Empleados", "consulta"),
  validarId("jefeId"),
  ControladorEmpleado.listarSubordinados,
);
// Dueno de la ficha o Empleados:consulta (la ficha incluye CURP, NSS, CLABE)
router.get(
  "/:id",
  validarId("id"),
  accesoEmpleado({
    opcion: "Empleados",
    tipoRH: "consulta",
    obtenerEmpleadoId: (req) => req.params.id,
  }),
  ControladorEmpleado.obtener,
);
router.post("/", verificarPermiso("rh", "Empleados", "edicion"), ControladorEmpleado.crear);
router.put("/:id", verificarPermiso("rh", "Empleados", "edicion"), ControladorEmpleado.actualizar);
router.put(
  "/:id/baja",
  verificarPermiso("rh", "Empleados", "edicion"),
  ControladorEmpleado.marcarBaja,
);

// Rutas de hijos
router.get(
  "/:empleadoId/hijos",
  verificarPermiso("rh", "Empleados", "consulta"),
  validarId("empleadoId"),
  ControladorHijo.listar,
);
router.post(
  "/:empleadoId/hijos",
  verificarPermiso("rh", "Empleados", "edicion"),
  ControladorHijo.crear,
);
router.put(
  "/hijos/:id",
  verificarPermiso("rh", "Empleados", "edicion"),
  ControladorHijo.actualizar,
);
router.delete(
  "/hijos/:id",
  verificarPermiso("rh", "Empleados", "edicion"),
  ControladorHijo.eliminar,
);

module.exports = router;
