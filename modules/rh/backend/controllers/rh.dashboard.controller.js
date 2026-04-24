const { grupo } = require('../config/database');

const RHDashboardController = {
  async obtenerDashboard(req, res) {
    try {
      const [
        totalEmpleados,
        activos,
        bajasMes,
        permisosPendientes,
        movimientosPorMes,
        porDepartamento,
        permisosPendientesList,
      ] = await Promise.all([
        grupo.query(`SELECT COUNT(*) AS total FROM empleados`),
        grupo.query(`SELECT COUNT(*) AS total FROM empleados WHERE estatus = 'activo'`),
        grupo.query(`SELECT COUNT(*) AS total FROM empleados WHERE DATE_TRUNC('month', fecha_baja) = DATE_TRUNC('month', CURRENT_DATE)`),
        grupo.query(`SELECT COUNT(*) AS total FROM permisos_ausencia WHERE estatus = 'pendiente'`),
        grupo.query(`
          SELECT
            TO_CHAR(DATE_TRUNC('month', fecha_creacion), 'Mon YY') AS nombre,
            COUNT(*) AS ingresos,
            COUNT(CASE WHEN estatus = 'inactivo' AND DATE_TRUNC('month', fecha_baja) = DATE_TRUNC('month', fecha_creacion) THEN 1 END) AS bajas
          FROM empleados
          WHERE fecha_creacion >= CURRENT_DATE - INTERVAL '5 months'
          GROUP BY DATE_TRUNC('month', fecha_creacion)
          ORDER BY DATE_TRUNC('month', fecha_creacion)
        `),
        grupo.query(`
          SELECT COALESCE(departamento, 'Sin departamento') AS nombre, COUNT(*) AS valor
          FROM empleados
          WHERE estatus = 'activo'
          GROUP BY departamento
          ORDER BY valor DESC
          LIMIT 8
        `),
        grupo.query(`
          SELECT
            e.nombre || ' ' || e.apellido AS empleado,
            pa.tipo,
            pa.fecha_inicio,
            pa.fecha_fin,
            pa.motivo
          FROM permisos_ausencia pa
          JOIN empleados e ON e.id = pa.empleado_id
          WHERE pa.estatus = 'pendiente'
          ORDER BY pa.fecha_solicitud
          LIMIT 10
        `),
      ]);

      res.json({
        exito: true,
        datos: {
          kpis: {
            total_empleados: parseInt(totalEmpleados.rows[0].total),
            activos: parseInt(activos.rows[0].total),
            bajas_mes: parseInt(bajasMes.rows[0].total),
            permisos_pendientes: parseInt(permisosPendientes.rows[0].total),
          },
          movimientos_por_mes: movimientosPorMes.rows.map(r => ({
            nombre: r.nombre,
            ingresos: parseInt(r.ingresos),
            bajas: parseInt(r.bajas),
          })),
          por_departamento: porDepartamento.rows.map(r => ({ nombre: r.nombre, valor: parseInt(r.valor) })),
          permisos_pendientes_lista: permisosPendientesList.rows,
        },
      });
    } catch (error) {
      console.error('Error al obtener dashboard de RH:', error);
      res.status(500).json({ exito: false, mensaje: 'Error al obtener el dashboard', error: error.message });
    }
  },
};

module.exports = RHDashboardController;
