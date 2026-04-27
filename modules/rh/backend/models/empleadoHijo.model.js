const { grupo } = require("../config/database");

const EmpleadoHijo = {
  async listarPorEmpleado(empleadoId) {
    const consulta = `
      SELECT * FROM empleado_hijos
      WHERE empleado_id = $1
      ORDER BY orden, id
    `;
    const resultado = await grupo.query(consulta, [empleadoId]);
    return resultado.rows;
  },

  async crear(empleadoId, datos) {
    const { nombre, fecha_nacimiento, escolaridad, orden } = datos;
    const consulta = `
      INSERT INTO empleado_hijos (empleado_id, nombre, fecha_nacimiento, escolaridad, orden)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const resultado = await grupo.query(consulta, [
      empleadoId,
      nombre || null,
      fecha_nacimiento || null,
      escolaridad || null,
      orden || 0,
    ]);
    return resultado.rows[0];
  },

  async actualizar(id, datos) {
    const { nombre, fecha_nacimiento, escolaridad, orden } = datos;
    const consulta = `
      UPDATE empleado_hijos
      SET nombre = $1, fecha_nacimiento = $2, escolaridad = $3, orden = $4
      WHERE id = $5
      RETURNING *
    `;
    const resultado = await grupo.query(consulta, [
      nombre || null,
      fecha_nacimiento || null,
      escolaridad || null,
      orden ?? 0,
      id,
    ]);
    return resultado.rows[0];
  },

  async eliminar(id) {
    const consulta = "DELETE FROM empleado_hijos WHERE id = $1 RETURNING id";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },
};

module.exports = EmpleadoHijo;
