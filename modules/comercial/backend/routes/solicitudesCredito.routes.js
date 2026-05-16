const { Router } = require('express');
const Controlador = require('../controllers/solicitudCredito.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');

const router = Router();
router.use(authenticateJWT);

const MODULO = 'comercial';
const OPCION = 'Solicitudes de Crédito';

router.get('/estadisticas', verificarPermiso(MODULO, OPCION, 'consulta'), Controlador.estadisticas);
router.get('/', verificarPermiso(MODULO, OPCION, 'consulta'), Controlador.listar);
router.post('/', verificarPermiso(MODULO, OPCION, 'edicion'), Controlador.crear);
router.get('/:id', verificarPermiso(MODULO, OPCION, 'consulta'), Controlador.obtener);
router.put('/:id', verificarPermiso(MODULO, OPCION, 'edicion'), Controlador.actualizar);
router.patch('/:id/estado', verificarPermiso(MODULO, OPCION, 'edicion'), Controlador.cambiarEstado);
router.get('/:id/pdf-datos', verificarPermiso(MODULO, OPCION, 'consulta'), Controlador.obtenerHtmlPdf);
router.post('/:id/sincronizar-mba3', verificarPermiso(MODULO, OPCION, 'edicion'), Controlador.sincronizarMba3);

module.exports = router;
