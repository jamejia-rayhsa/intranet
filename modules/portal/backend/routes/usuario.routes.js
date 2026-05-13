// modules/portal/backend/routes/usuario.routes.js
const { Router } = require('express');
const ControladorUsuario = require('../controllers/usuario.controller');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { verificarPermiso } = require('../middleware/permisos.middleware');

const router = Router();
router.use(authenticateJWT);

router.get('/', verificarPermiso('portal', 'Usuarios', 'consulta'), ControladorUsuario.listar);
router.get('/:id', verificarPermiso('portal', 'Usuarios', 'consulta'), ControladorUsuario.obtener);
router.put('/:id', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.actualizar);
router.delete('/:id', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.eliminar);
router.post('/:id/reset-password', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.resetearPassword);
router.post('/:id/rol', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.asignarRol);

module.exports = router;
