const { Router } = require("express");
const ControladorTurno = require("../controllers/turno.controller");
const ControladorAsignacion = require("../controllers/turnoAsignacion.controller");
const ControladorLlave = require("../controllers/llaveIngesta.controller");
const ControladorMotor = require("../controllers/asistenciaMotor.controller");
const TurnoAsignacion = require("../models/turnoAsignacion.model");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso, tienePermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const { accesoEmpleado, validarId } = require("../middleware/acceso-empleado.middleware");

const router = Router();
router.use(authenticateJWT);

// Lectura de turnos: Asistencia:consulta (todos los roles con Vacaciones/Empleados).
// Escritura y asignaciones: Turnos:edicion (rh_admin y super_admin; NO portal_admin).
// rol_opcion_permisos solo tiene 'consulta' y 'edicion': 'edicion' cubre alta, cambio y baja.
const LEER = verificarPermiso("rh", "Asistencia", "consulta");
const ESCRIBIR = verificarPermiso("rh", "Turnos", "edicion");
const VER_ASIGNACIONES = verificarPermiso("rh", "Turnos", "consulta");

// --- Catálogo de turnos ---
router.get("/turnos", LEER, ControladorTurno.listar);
router.get("/turnos/:id", LEER, ControladorTurno.obtener);
router.post("/turnos", ESCRIBIR, ControladorTurno.crear);
router.put("/turnos/:id", ESCRIBIR, ControladorTurno.actualizar);
router.delete("/turnos/:id", ESCRIBIR, ControladorTurno.eliminar);

// --- Asignaciones con vigencia (historial: se terminan, no se borran) ---
for (const [ruta, controlador] of [
  ["departamentos", ControladorAsignacion.departamento],
  ["empleados", ControladorAsignacion.empleado],
]) {
  router.get(`/asignaciones/${ruta}`, VER_ASIGNACIONES, controlador.listar);
  router.post(`/asignaciones/${ruta}`, ESCRIBIR, controlador.asignar);
  router.put(`/asignaciones/${ruta}/:id/terminar`, ESCRIBIR, validarId("id"), controlador.terminar);
}

// --- Por empleado ---
// "RH" = Empleados:edicion (como vacaciones). Empleado: solo el suyo; jefe inmediato VIGENTE: el de
// sus subordinados directos (nunca el de su jefe ni de un par); un empleado inexistente da 403 uniforme.
const RH = { opcion: "Asistencia", opcionRH: "Empleados", tipoRH: "edicion" };
const empleadoDeLaRuta = async (req) => {
  req.recurso = await TurnoAsignacion.obtenerEmpleadoBasico(Number(req.params.empleadoId));
  return req.recurso && req.recurso.id;
};
const esJefeVigente = (req, propio) =>
  Boolean(req.recurso) &&
  req.recurso.jefe_inmediato_id != null &&
  String(req.recurso.jefe_inmediato_id) === String(propio.id) &&
  String(req.recurso.id) !== String(propio.id);

router.get(
  "/empleados/:empleadoId/turno",
  LEER,
  validarId("empleadoId"),
  accesoEmpleado({ ...RH, obtenerEmpleadoId: empleadoDeLaRuta, permitirSi: esJefeVigente }),
  ControladorAsignacion.turnoEfectivo,
);
// El historial de asignaciones es de gestión: solo quien administra Turnos
router.get("/empleados/:empleadoId/turnos", VER_ASIGNACIONES, validarId("empleadoId"), ControladorAsignacion.historial);

// --- Ingesta de marcas: administración (la ingesta misma va por llave en ingesta.routes.js) ---
// Opción Ingesta: solo rh_admin y super_admin (portal_admin excluido). La llave en claro solo se muestra al
// crear o rotar. Revocar y editar IP tienen efecto inmediato (el middleware de llave consulta la BD cada vez).
const VER_INGESTA = verificarPermiso("rh", "Ingesta", "consulta");
const ADMIN_INGESTA = verificarPermiso("rh", "Ingesta", "edicion");
router.get("/llaves", VER_INGESTA, ControladorLlave.listar);
router.post("/llaves", ADMIN_INGESTA, ControladorLlave.crear);
router.post("/llaves/:id/rotar", ADMIN_INGESTA, ControladorLlave.rotar);
router.post("/llaves/:id/revocar", ADMIN_INGESTA, ControladorLlave.revocar);
router.put("/llaves/:id/ips", ADMIN_INGESTA, ControladorLlave.editarIps);
router.get("/lotes", VER_INGESTA, ControladorLlave.lotes);
router.post("/marcas/revincular", ADMIN_INGESTA, ControladorLlave.revincular);

// --- Motor de análisis (Fase 4) ---
// Lectura de resultados y resumen: Asistencia:consulta + alcance por usuario dentro del controlador (RH todo;
// los demás, solo su empleado y sus subordinados directos). Lecturas de gestión (parámetros, sin identificador,
// ajustes pendientes): RH = Empleados:edicion o Asistencia:edicion. Escrituras: Asistencia:edicion (rh_admin y
// super_admin; rh_empleado y portal_admin no).
const ESCRIBIR_ASISTENCIA = verificarPermiso("rh", "Asistencia", "edicion");
const RH_LECTURA = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ exito: false, mensaje: "Usuario no autenticado" });
  try {
    if ((await tienePermiso(req.user, "rh", "Empleados", "edicion")) || (await tienePermiso(req.user, "rh", "Asistencia", "edicion"))) {
      return next();
    }
    return res.status(403).json({ exito: false, mensaje: "No tienes permisos suficientes" });
  } catch (error) {
    console.error(`[AsistenciaMotor] Error al verificar permisos: ${(error && (error.code || error.name)) || "Error"}`);
    return res.status(500).json({ exito: false, mensaje: "Error al verificar permisos" });
  }
};
router.get("/resultados", LEER, ControladorMotor.resultados);
router.get("/resumen", LEER, ControladorMotor.resumen);
router.get("/periodos", LEER, ControladorMotor.periodos);
router.post("/periodos/:id/cerrar", ESCRIBIR_ASISTENCIA, validarId("id"), ControladorMotor.cerrarPeriodo);
router.post("/periodos/:id/reabrir", ESCRIBIR_ASISTENCIA, validarId("id"), ControladorMotor.reabrirPeriodo);
router.post("/recalcular", ESCRIBIR_ASISTENCIA, ControladorMotor.recalcular);
router.get("/sin-identificador", LEER, RH_LECTURA, ControladorMotor.sinIdentificador);
router.get("/ajustes-pendientes", LEER, RH_LECTURA, ControladorMotor.ajustes);
router.post("/ajustes-pendientes/:id/resolver", ESCRIBIR_ASISTENCIA, validarId("id"), ControladorMotor.resolverAjuste);
router.post("/incidencias", ESCRIBIR_ASISTENCIA, ControladorMotor.justificar);
router.post("/incidencias/:id/anular", ESCRIBIR_ASISTENCIA, validarId("id"), ControladorMotor.anularIncidencia);
router.get("/parametros", LEER, RH_LECTURA, ControladorMotor.obtenerParametros);
router.put("/parametros", ESCRIBIR_ASISTENCIA, ControladorMotor.actualizarParametros);

module.exports = router;
