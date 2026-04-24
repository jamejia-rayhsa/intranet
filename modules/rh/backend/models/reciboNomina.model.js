const { grupo } = require("../config/database");

const ReciboNomina = {
  async crear(datos) {
    const {
      empleado_id,
      periodo,
      fecha_pago,
      importe_total,
      ruta_archivo,
      descripcion,
      creado_por_id,
    } = datos;
    const consulta = `
      INSERT INTO recibos_nomina (empleado_id, periodo, fecha_pago, importe_total, ruta_archivo, descripcion, creado_por_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const valores = [
      empleado_id,
      periodo,
      fecha_pago || null,
      importe_total || null,
      ruta_archivo || null,
      descripcion || null,
      creado_por_id || null,
    ];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerPorEmpleado(empleadoId) {
    const consulta = `
      SELECT r.*, u.nombre as creador_nombre, u.apellido as creador_apellido
      FROM recibos_nomina r
      LEFT JOIN usuarios u ON r.creado_por_id = u.id
      WHERE r.empleado_id = $1
      ORDER BY r.periodo DESC
    `;
    const resultado = await grupo.query(consulta, [empleadoId]);
    return resultado.rows;
  },

  async obtenerPorId(id) {
    const consulta = "SELECT * FROM recibos_nomina WHERE id = $1";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async listarPorPeriodo(periodo) {
    const consulta = `
      SELECT r.*, e.nombre as empleado_nombre, e.apellido as empleado_apellido
      FROM recibos_nomina r
      INNER JOIN empleados e ON r.empleado_id = e.id
      WHERE r.periodo = $1
      ORDER BY e.nombre, e.apellido
    `;
    const resultado = await grupo.query(consulta, [periodo]);
    return resultado.rows;
  },

  async eliminar(id) {
    const consulta = "DELETE FROM recibos_nomina WHERE id = $1 RETURNING *";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },
};

module.exports = ReciboNomina;
