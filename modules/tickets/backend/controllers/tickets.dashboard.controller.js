const { grupo } = require('../config/database');

const TicketsDashboardController = {
  async obtenerDashboard(req, res) {
    try {
      const [
        totalTickets,
        pendientes,
        enProceso,
        cerradosHoy,
        ticketsPorMes,
        porEstado,
        topTecnicos,
      ] = await Promise.all([
        grupo.query(`SELECT COUNT(*) AS total FROM tickets`),
        grupo.query(`SELECT COUNT(*) AS total FROM tickets WHERE estado = 'abierto'`),
        grupo.query(`SELECT COUNT(*) AS total FROM tickets WHERE estado = 'en_proceso'`),
        grupo.query(`SELECT COUNT(*) AS total FROM tickets WHERE DATE(fecha_cierre) = CURRENT_DATE`),
        grupo.query(`
          SELECT
            TO_CHAR(DATE_TRUNC('month', fecha_creacion), 'Mon YY') AS nombre,
            COUNT(*) FILTER (WHERE estado = 'abierto') AS abierto,
            COUNT(*) FILTER (WHERE estado = 'en_proceso') AS en_proceso,
            COUNT(*) FILTER (WHERE estado = 'cerrado') AS cerrado
          FROM tickets
          WHERE fecha_creacion >= CURRENT_DATE - INTERVAL '5 months'
          GROUP BY DATE_TRUNC('month', fecha_creacion)
          ORDER BY DATE_TRUNC('month', fecha_creacion)
        `),
        grupo.query(`
          SELECT estado AS nombre, COUNT(*) AS valor
          FROM tickets
          GROUP BY estado
          ORDER BY valor DESC
        `),
        grupo.query(`
          SELECT
            u.nombre || ' ' || COALESCE(u.apellido, '') AS nombre,
            COUNT(t.id) AS tickets_resueltos,
            ROUND(AVG(e.calificacion)::numeric, 1) AS calificacion_promedio
          FROM tickets t
          JOIN usuarios u ON u.id = t.tecnico_id
          LEFT JOIN ticket_encuestas e ON e.ticket_id = t.id
          WHERE t.tecnico_id IS NOT NULL
          GROUP BY u.id, u.nombre, u.apellido
          ORDER BY calificacion_promedio DESC NULLS LAST, tickets_resueltos DESC
          LIMIT 5
        `),
      ]);

      res.json({
        exito: true,
        datos: {
          kpis: {
            total_tickets: parseInt(totalTickets.rows[0].total),
            pendientes: parseInt(pendientes.rows[0].total),
            en_proceso: parseInt(enProceso.rows[0].total),
            cerrados_hoy: parseInt(cerradosHoy.rows[0].total),
          },
          tickets_por_mes: ticketsPorMes.rows.map(r => ({
            nombre: r.nombre,
            abierto: parseInt(r.abierto),
            en_proceso: parseInt(r.en_proceso),
            cerrado: parseInt(r.cerrado),
          })),
          por_estado: porEstado.rows.map(r => ({ nombre: r.nombre, valor: parseInt(r.valor) })),
          top_tecnicos: topTecnicos.rows.map(r => ({
            nombre: r.nombre.trim(),
            tickets_resueltos: parseInt(r.tickets_resueltos),
            calificacion_promedio: parseFloat(r.calificacion_promedio) || 0,
          })),
        },
      });
    } catch (error) {
      console.error('Error al obtener dashboard de tickets:', error);
      res.status(500).json({ exito: false, mensaje: 'Error al obtener el dashboard', error: error.message });
    }
  },
};

module.exports = TicketsDashboardController;
