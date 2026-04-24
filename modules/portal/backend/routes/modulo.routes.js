// modules/portal/backend/routes/modulo.routes.js
const { Router } = require('express');
const ControladorModulo = require('../controllers/modulo.controller');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { verificarPermiso } = require('../middleware/permisos.middleware');

const router = Router();

// Ruta pública: módulos activos (usada para construir el menú)
router.get('/activos', ControladorModulo.listarActivos);

router.use(authenticateJWT);

router.get('/', verificarPermiso('portal', 'Módulos', 'consulta'), ControladorModulo.listar);
router.post('/', verificarPermiso('portal', 'Módulos', 'edicion'), ControladorModulo.crear);
router.put('/:id', verificarPermiso('portal', 'Módulos', 'edicion'), ControladorModulo.actualizar);
router.delete('/:id', verificarPermiso('portal', 'Módulos', 'edicion'), ControladorModulo.eliminar);

module.exports = router;
