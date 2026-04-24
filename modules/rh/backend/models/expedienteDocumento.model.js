const { grupo } = require("../config/database");

const ExpedienteDocumento = {
  async crear(datos) {
    const {
      empleado_id,
      tipo_documento,
      nombre_archivo,
      ruta_archivo,
      descripcion,
    } = datos;
    const consulta = `
      INSERT INTO expediente_documentos (empleado_id, tipo_documento, nombre_archivo, ruta_archivo, descripcion)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const valores = [
      empleado_id,
      tipo_documento,
      nombre_archivo,
      ruta_archivo,
      descripcion || null,
    ];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerPorEmpleado(empleadoId) {
    const consulta =
      "SELECT * FROM expediente_documentos WHERE empleado_id = $1 ORDER BY fecha_subida DESC";
    const resultado = await grupo.query(consulta, [empleadoId]);
    return resultado.rows;
  },

  async obtenerPorId(id) {
    const consulta = "SELECT * FROM expediente_documentos WHERE id = $1";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async eliminar(id) {
    const consulta =
      "DELETE FROM expediente_documentos WHERE id = $1 RETURNING *";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async contarPorEmpleado(empleadoId) {
    const consulta =
      "SELECT COUNT(*) FROM expediente_documentos WHERE empleado_id = $1";
    const resultado = await grupo.query(consulta, [empleadoId]);
    return parseInt(resultado.rows[0].count);
  },
};

module.exports = ExpedienteDocumento;
