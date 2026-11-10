// modules/portal/backend/routes/usuario.routes.js
const { Router } = require('express');
const ControladorUsuario = require('../controllers/usuario.controller');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { verificarPermiso } = require('../middleware/permisos.middleware');
const ControladorUsuarioImportacion = require('../controllers/usuarioImportacion.controller');
const { esSuperAdmin } = require('../services/delegacionPermisos');

const router = Router();
router.use(authenticateJWT);

// Importar usuarios (alta masiva de cuentas Microsoft + vínculo con el empleado): SOLO super_admin. Va antes de '/:id'.
function soloSuperAdmin(req, res, next) {
  if (!esSuperAdmin(req.user)) {
    return res.status(403).json({ exito: false, mensaje: 'Solo un super_admin puede importar usuarios' });
  }
  next();
}
router.post('/importar/vista-previa', soloSuperAdmin, ControladorUsuarioImportacion.vistaPrevia);
router.post('/importar', soloSuperAdmin, ControladorUsuarioImportacion.importar);

router.get('/', verificarPermiso('portal', 'Usuarios', 'consulta'), ControladorUsuario.listar);
router.get('/:id', verificarPermiso('portal', 'Usuarios', 'consulta'), ControladorUsuario.obtener);
// Las cuentas las crea un administrador (no hay registro público): GoTrue + fila local
router.post('/', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.crear);
router.put('/:id', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.actualizar);
router.delete('/:id', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.eliminar);
router.post('/:id/reset-password', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.resetearPassword);
router.post('/:id/rol', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.asignarRol);

module.exports = router;
