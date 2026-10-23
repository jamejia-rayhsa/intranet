const { Router } = require('express');
const ControladorConvenio = require('../controllers/convenio.controller');
const ControladorAutorizador = require('../controllers/autorizador.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');

const router = Router();
router.use(authenticateJWT);

const MODULO = 'comercial';
const OPCION = 'Convenios';

// Administrar la lista de autorizadores es sensible (decide quién puede aprobar compras):
// solo super_admin, nunca por el permiso granular de la opción "Convenios".
function soloSuperAdmin(req, res, next) {
  if (req.user?.rol_nombre === 'super_admin') return next();
  return res.status(403).json({ exito: false, mensaje: 'Solo super_admin puede administrar autorizadores' });
}

router.get('/convenios', verificarPermiso(MODULO, OPCION, 'consulta'), ControladorConvenio.listar);
router.get('/convenios/:id', verificarPermiso(MODULO, OPCION, 'consulta'), ControladorConvenio.obtener);
router.post('/convenios', verificarPermiso(MODULO, OPCION, 'edicion'), ControladorConvenio.crear);
router.put('/convenios/:id', verificarPermiso(MODULO, OPCION, 'edicion'), ControladorConvenio.actualizar);
router.put('/convenios/:id/autorizar', verificarPermiso(MODULO, OPCION, 'edicion'), ControladorConvenio.autorizar);
router.put('/convenios/:id/rechazar', verificarPermiso(MODULO, OPCION, 'edicion'), ControladorConvenio.rechazar);
router.put('/convenios/:id/cancelar', verificarPermiso(MODULO, OPCION, 'edicion'), ControladorConvenio.cancelar);

router.get('/autorizadores', soloSuperAdmin, ControladorAutorizador.listar);
router.post('/autorizadores', soloSuperAdmin, ControladorAutorizador.agregar);
router.delete('/autorizadores/:usuario_id', soloSuperAdmin, ControladorAutorizador.quitar);

module.exports = router;
