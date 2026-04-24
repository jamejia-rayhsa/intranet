// modules/auditoria/backend/routes/auditoria.dashboard.routes.js
const { Router } = require('express');
const AuditoriaDashboardController = require('../controllers/auditoria.dashboard.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');

const router = Router();

router.get(
  '/dashboard',
  authenticateJWT,
  verificarPermiso('auditoria', 'Logs', 'consulta'),
  AuditoriaDashboardController.obtenerDashboard
);

module.exports = router;
