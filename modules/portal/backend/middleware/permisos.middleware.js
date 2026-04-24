// modules/portal/backend/middleware/permisos.middleware.js
const { grupo } = require('../config/database');

/**
 * Verifica que el usuario tenga permiso para una opción específica de un módulo.
 * @param {string} modulo - nombre del módulo (ej: 'tickets')
 * @param {string} opcion - nombre de la opción (ej: 'Tickets')
 * @param {'consulta'|'edicion'} tipo - tipo de permiso requerido
 */
function verificarPermiso(modulo, opcion, tipo) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ exito: false, mensaje: 'Usuario no autenticado' });
    }

    // super_admin tiene acceso total
    if (req.user.rol_nombre === 'super_admin') {
      return next();
    }

    if (!req.user.rol_id) {
      return res.status(403).json({ exito: false, mensaje: 'Usuario sin rol asignado' });
    }

    try {
      // Si se pide 'consulta', aceptar tanto 'consulta' como 'edicion'
      const tiposAceptados = tipo === 'consulta' ? ['consulta', 'edicion'] : ['edicion'];

      const resultado = await grupo.query(
        `SELECT 1 AS existe
         FROM rol_opcion_permisos rop
         JOIN modulo_opciones mo ON mo.id = rop.opcion_id
         JOIN modulos m ON m.id = mo.modulo_id
         WHERE rop.rol_id = $1
           AND m.nombre = $2
           AND mo.nombre = $3
           AND rop.tipo = ANY($4::text[])
         LIMIT 1`,
        [req.user.rol_id, modulo, opcion, tiposAceptados]
      );

      if (resultado.rows.length === 0) {
        return res.status(403).json({
          exito: false,
          mensaje: 'No tienes permiso para realizar esta acción',
          detalle: { modulo, opcion, tipo },
        });
      }

      next();
    } catch (error) {
      console.error('[Permisos] Error al verificar permiso:', error.message);
      res.status(500).json({ exito: false, mensaje: 'Error al verificar permisos' });
    }
  };
}

module.exports = { verificarPermiso };
