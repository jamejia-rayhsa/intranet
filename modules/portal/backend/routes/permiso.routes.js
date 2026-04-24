// modules/portal/backend/routes/permiso.routes.js
const { Router } = require('express');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { verificarPermiso } = require('../middleware/permisos.middleware');
const { grupo } = require('../config/database');

const router = Router();
router.use(authenticateJWT);

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

// PUT /api/permisos/rol/:rol_id/modulo/:modulo — guarda permisos de un módulo para un rol
router.put('/rol/:rol_id/modulo/:modulo', verificarPermiso('portal', 'Roles', 'edicion'), async (req, res) => {
  const { rol_id, modulo } = req.params;
  const { permisos } = req.body;

  const TIPOS_VALIDOS = new Set(['consulta', 'edicion']);

  if (!Array.isArray(permisos)) {
    return res.status(400).json({ exito: false, mensaje: 'permisos debe ser un array' });
  }
  for (const p of permisos) {
    for (const tipo of (p.tipos || [])) {
      if (!TIPOS_VALIDOS.has(tipo)) {
        return res.status(400).json({ exito: false, mensaje: `Tipo de permiso inválido: ${tipo}` });
      }
    }
  }

  try {
    await grupo.query(
      `DELETE FROM rol_opcion_permisos rop
       USING modulo_opciones mo JOIN modulos m ON m.id = mo.modulo_id
       WHERE rop.opcion_id = mo.id AND m.nombre = $1 AND rop.rol_id = $2`,
      [modulo, rol_id]
    );

    for (const p of permisos || []) {
      for (const tipo of p.tipos || []) {
        await grupo.query(
          `INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [rol_id, p.opcion_id, tipo]
        );
      }
    }

    res.json({ exito: true, mensaje: 'Permisos actualizados' });
  } catch (e) {
    res.status(500).json({ exito: false, mensaje: 'Error al guardar permisos' });
  }
});

module.exports = router;
