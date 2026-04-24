const { Router } = require('express');
const RHDashboardController = require('../controllers/rh.dashboard.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');

const router = Router();

router.get(
  '/dashboard',
  authenticateJWT,
  verificarPermiso('rh', 'Empleados', 'consulta'),
  RHDashboardController.obtenerDashboard
);

module.exports = router;
