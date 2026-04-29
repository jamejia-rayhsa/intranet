const { Router } = require("express");
const ControladorVacaciones = require("../controllers/vacaciones.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();
router.use(authenticateJWT);

router.get("/saldo", verificarPermiso("rh", "Vacaciones", "consulta"), ControladorVacaciones.obtenerSaldo);
router.get("/", verificarPermiso("rh", "Vacaciones", "consulta"), ControladorVacaciones.listar);
router.get("/:id", verificarPermiso("rh", "Vacaciones", "consulta"), ControladorVacaciones.obtener);
router.post("/", verificarPermiso("rh", "Vacaciones", "edicion"), ControladorVacaciones.crear);
router.put("/:id/responder", verificarPermiso("rh", "Vacaciones", "edicion"), ControladorVacaciones.responder);

module.exports = router;
