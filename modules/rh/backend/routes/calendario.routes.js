const { Router } = require("express");
const ControladorCalendarioLaboral = require("../controllers/calendarioLaboral.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();
router.use(authenticateJWT);

// Lectura: todos los roles con Vacaciones (empleados) tienen rh/Calendario:consulta.
// Escritura: rh/Calendario:edicion (rh_admin, super_admin, portal_admin). rol_opcion_permisos solo
// tiene los tipos 'consulta' y 'edicion', y 'edicion' cubre alta, cambio y baja.
router.get("/", verificarPermiso("rh", "Calendario", "consulta"), ControladorCalendarioLaboral.listar);
router.post("/", verificarPermiso("rh", "Calendario", "edicion"), ControladorCalendarioLaboral.crear);
router.put("/:id", verificarPermiso("rh", "Calendario", "edicion"), ControladorCalendarioLaboral.actualizar);
router.delete("/:id", verificarPermiso("rh", "Calendario", "edicion"), ControladorCalendarioLaboral.eliminar);

module.exports = router;
