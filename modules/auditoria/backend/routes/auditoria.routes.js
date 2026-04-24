const { Router } = require('express');
const AuditoriaController = require('../controllers/auditoria.controller');
const AuditoriaDashboardController = require('../controllers/auditoria.dashboard.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');

const router = Router();

router.use(authenticateJWT);

router.get('/dashboard', verificarPermiso('auditoria', 'Logs', 'consulta'), AuditoriaDashboardController.obtenerDashboard);
router.get('/', verificarPermiso('auditoria', 'Logs', 'consulta'), AuditoriaController.obtenerRegistros);
router.get('/modulo/:modulo', verificarPermiso('auditoria', 'Logs', 'consulta'), AuditoriaController.obtenerPorModulo);

module.exports = router;
