const { Router } = require('express');
const TicketsDashboardController = require('../controllers/tickets.dashboard.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');

const router = Router();

router.get(
  '/dashboard',
  authenticateJWT,
  verificarPermiso('tickets', 'Tickets', 'consulta'),
  TicketsDashboardController.obtenerDashboard
);

module.exports = router;
