// modules/portal/backend/routes/rol.routes.js
const { Router } = require('express');
const ControladorRol = require('../controllers/rol.controller');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { verificarPermiso } = require('../middleware/permisos.middleware');

const router = Router();
router.use(authenticateJWT);

router.get('/', verificarPermiso('portal', 'Roles', 'consulta'), ControladorRol.listar);
router.post('/', verificarPermiso('portal', 'Roles', 'edicion'), ControladorRol.crear);
router.put('/:id', verificarPermiso('portal', 'Roles', 'edicion'), ControladorRol.actualizar);
router.delete('/:id', verificarPermiso('portal', 'Roles', 'edicion'), ControladorRol.eliminar);

module.exports = router;
