// modules/auditoria/backend/controllers/auditoria.dashboard.controller.js
const { grupo } = require('../config/database');

const AuditoriaDashboardController = {
  async obtenerDashboard(req, res) {
    try {
      const [
        eventosHoy,
        eventosMes,
        usuariosActivos,
        modulosMonitoreados,
        eventosPorDia,
        distribucionAcciones,
      ] = await Promise.all([
        grupo.query(`SELECT COUNT(*) AS total FROM auditoria WHERE DATE(fecha) = CURRENT_DATE`),
        grupo.query(`SELECT COUNT(*) AS total FROM auditoria WHERE DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE)`),
        grupo.query(`SELECT COUNT(DISTINCT usuario_id) AS total FROM auditoria WHERE DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE)`),
        grupo.query(`SELECT COUNT(DISTINCT modulo) AS total FROM auditoria WHERE DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE)`),
        grupo.query(`
          SELECT TO_CHAR(DATE(fecha), 'DD/MM') AS nombre, COUNT(*) AS valor
          FROM auditoria
          WHERE fecha >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY DATE(fecha)
          ORDER BY DATE(fecha)
        `),
        grupo.query(`
          SELECT accion AS nombre, COUNT(*) AS valor
          FROM auditoria
          GROUP BY accion
          ORDER BY valor DESC
        `),
      ]);

      res.json({
        exito: true,
        datos: {
          kpis: {
            eventos_hoy: parseInt(eventosHoy.rows[0].total),
            eventos_mes: parseInt(eventosMes.rows[0].total),
            usuarios_activos: parseInt(usuariosActivos.rows[0].total),
            modulos_monitoreados: parseInt(modulosMonitoreados.rows[0].total),
          },
          eventos_por_dia: eventosPorDia.rows.map(r => ({ nombre: r.nombre, valor: parseInt(r.valor) })),
          distribucion_acciones: distribucionAcciones.rows.map(r => ({ nombre: r.nombre, valor: parseInt(r.valor) })),
        },
      });
    } catch (error) {
      console.error('Error al obtener dashboard de auditoría:', error);
      res.status(500).json({ exito: false, mensaje: 'Error al obtener el dashboard', error: error.message });
    }
  },
};

module.exports = AuditoriaDashboardController;
