// modules/portal/backend/routes/permiso.routes.js
const { Router } = require('express');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { verificarPermiso } = require('../middleware/permisos.middleware');
const { grupo } = require('../config/database');
const ControladorPermiso = require('../controllers/permiso.controller');

const router = Router();
router.use(authenticateJWT);

// GET /api/permisos/mis-permisos — permisos del usuario autenticado (sin middleware extra; ya pasa por authenticateJWT)
router.get('/mis-permisos', ControladorPermiso.misPermisos);

// GET /api/permisos/opciones — lista todas las opciones agrupadas por módulo
router.get('/opciones', verificarPermiso('portal', 'Roles', 'consulta'), async (req, res) => {
  try {
    const resultado = await grupo.query(`
      SELECT m.nombre AS modulo, mo.id, mo.nombre, mo.descripcion, mo.orden
      FROM modulo_opciones mo
      JOIN modulos m ON m.id = mo.modulo_id
      ORDER BY m.nombre, mo.orden
    `);
    res.json({ exito: true, datos: resultado.rows });
  } catch (e) {
    res.status(500).json({ exito: false, mensaje: 'Error al obtener opciones' });
  }
});

// GET /api/permisos/rol/:rol_id — permisos de un rol específico
router.get('/rol/:rol_id', verificarPermiso('portal', 'Roles', 'consulta'), async (req, res) => {
  try {
    const resultado = await grupo.query(
      `SELECT rop.opcion_id, rop.tipo FROM rol_opcion_permisos rop WHERE rop.rol_id = $1`,
      [req.params.rol_id]
    );
    res.json({ exito: true, datos: resultado.rows });
  } catch (e) {
    res.status(500).json({ exito: false, mensaje: 'Error al obtener permisos del rol' });
  }
});

// PUT /api/permisos/rol/:rol_id/modulo/:modulo — guarda permisos de un módulo para un rol.
// Quien no es super_admin solo puede otorgar/quitar permisos que él posee (services/delegacionPermisos.js);
// se valida todo antes de escribir y en una sola transacción.
router.put('/rol/:rol_id/modulo/:modulo', verificarPermiso('portal', 'Roles', 'edicion'), ControladorPermiso.guardarPermisosModulo);

module.exports = router;
