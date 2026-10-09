const { Router } = require("express");
const ControladorVacaciones = require("../controllers/vacaciones.controller");
const SolicitudVacaciones = require("../models/solicitudVacaciones.model");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const {
  accesoEmpleado,
  empleadoPropioEnPeticion,
  validarId,
} = require("../middleware/acceso-empleado.middleware");

const router = Router();
router.use(authenticateJWT);

// "RH" para vacaciones = Empleados:edicion (rh_empleado tiene Vacaciones:edicion para solicitar)
const RH = { opcion: "Vacaciones", opcionRH: "Empleados", tipoRH: "edicion" };

// Carga la solicitud una vez y devuelve su empleado
const empleadoDeLaSolicitud = async (req) => {
  req.recurso = await SolicitudVacaciones.obtenerPorId(req.params.id);
  return req.recurso && req.recurso.empleado_id;
};
const esJefeDeLaSolicitud = (req, propio) =>
  Boolean(req.recurso) &&
  req.recurso.jefe_inmediato_id != null &&
  String(req.recurso.jefe_inmediato_id) === String(propio.id) &&
  String(req.recurso.empleado_id) !== String(propio.id);

router.get(
  "/saldo",
  verificarPermiso("rh", "Vacaciones", "consulta"),
  empleadoPropioEnPeticion({ ...RH, origen: "query", campo: "empleado_id" }),
  ControladorVacaciones.obtenerSaldo,
);
// El controlador limita el listado: RH todo, el resto sus solicitudes y las de sus subordinados
router.get("/", verificarPermiso("rh", "Vacaciones", "consulta"), ControladorVacaciones.listar);
router.get(
  "/:id",
  verificarPermiso("rh", "Vacaciones", "consulta"),
  validarId("id"),
  accesoEmpleado({ ...RH, obtenerEmpleadoId: empleadoDeLaSolicitud, permitirSi: esJefeDeLaSolicitud }),
  ControladorVacaciones.obtener,
);
router.post(
  "/",
  verificarPermiso("rh", "Vacaciones", "edicion"),
  empleadoPropioEnPeticion({ ...RH, origen: "body", campo: "empleado_id" }),
  ControladorVacaciones.crear,
);
// Aprobar/rechazar: RH o jefe inmediato de la solicitud; nunca el propio solicitante (salvo RH)
router.put(
  "/:id/responder",
  verificarPermiso("rh", "Vacaciones", "edicion"),
  validarId("id"),
  accesoEmpleado({
    ...RH,
    obtenerEmpleadoId: empleadoDeLaSolicitud,
    permitirDueno: false,
    permitirSi: esJefeDeLaSolicitud,
  }),
  ControladorVacaciones.responder,
);

module.exports = router;
