const { Router } = require("express");
const ControladorPermisos = require("../controllers/permisos.controller");
const PermisoAusencia = require("../models/permisoAusencia.model");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const {
  accesoEmpleado,
  empleadoPropioEnPeticion,
  validarId,
} = require("../middleware/acceso-empleado.middleware");

const router = Router();

router.use(authenticateJWT);

// "RH" para permisos de ausencia = Empleados:edicion (rh_empleado tiene Permisos:edicion
// para poder solicitar, asi que esa opcion no distingue a RH)
const RH = { opcion: "Permisos", opcionRH: "Empleados", tipoRH: "edicion" };

// Listado: RH ve todo; el resto solo lo propio (el controlador filtra por req.alcanceEmpleadoId)
router.get(
  "/",
  verificarPermiso("rh", "Permisos", "consulta"),
  empleadoPropioEnPeticion({ ...RH, origen: "query", campo: "empleado_id", forzar: true }),
  ControladorPermisos.listar,
);
router.get(
  "/:id",
  verificarPermiso("rh", "Permisos", "consulta"),
  validarId("id"),
  accesoEmpleado({
    ...RH,
    obtenerEmpleadoId: async (req) => {
      const permiso = await PermisoAusencia.obtenerPorId(req.params.id);
      return permiso && permiso.empleado_id;
    },
  }),
  ControladorPermisos.obtener,
);
router.post(
  "/",
  verificarPermiso("rh", "Permisos", "edicion"),
  empleadoPropioEnPeticion({ ...RH, origen: "body", campo: "empleado_id", forzar: true }),
  ControladorPermisos.crear,
);
router.put(
  "/:id/responder",
  verificarPermiso("rh", "Permisos", "edicion"),
  validarId("id"),
  accesoEmpleado({ ...RH, soloRH: true }),
  ControladorPermisos.responder,
);

module.exports = router;
