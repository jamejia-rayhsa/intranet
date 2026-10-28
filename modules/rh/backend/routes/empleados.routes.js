const { Router } = require("express");
const ControladorEmpleado = require("../controllers/empleado.controller");
const ControladorCuenta = require("../controllers/empleadoCuenta.controller");
const ControladorHijo = require("../controllers/empleadoHijo.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const { accesoEmpleado, validarId } = require("../middleware/acceso-empleado.middleware");

const router = Router();

router.use(authenticateJWT);

router.get("/", verificarPermiso("rh", "Empleados", "consulta"), ControladorEmpleado.listar);
router.get("/exportar-importacion", verificarPermiso("rh", "Empleados", "consulta"), ControladorEmpleado.exportarParaImportacion);
router.post("/importar", verificarPermiso("rh", "Empleados", "edicion"), ControladorEmpleado.importar);
router.post("/importar/jefes", verificarPermiso("rh", "Empleados", "edicion"), ControladorEmpleado.importarJefes);
// Relación cuenta de usuario <-> empleado (solo escribe empleados.usuario_id); solo RH (Empleados:edicion)
router.get("/cuentas/vista-previa", verificarPermiso("rh", "Empleados", "edicion"), ControladorCuenta.vistaPrevia);
router.get("/cuentas/disponibles", verificarPermiso("rh", "Empleados", "edicion"), ControladorCuenta.disponibles);
router.post("/cuentas/vincular", verificarPermiso("rh", "Empleados", "edicion"), ControladorCuenta.vincular);
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
router.post("/:id/cuenta", verificarPermiso("rh", "Empleados", "edicion"), validarId("id"), ControladorCuenta.cambiarCuenta);
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
