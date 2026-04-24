const { grupo } = require("../config/database");

const Permiso = {
  async crear(nombre) {
    const consulta = "INSERT INTO permisos (nombre) VALUES ($1) RETURNING *";
    const resultado = await grupo.query(consulta, [nombre]);
    return resultado.rows[0];
  },

  async obtenerTodos() {
    const consulta = "SELECT * FROM permisos ORDER BY nombre";
    const resultado = await grupo.query(consulta);
    return resultado.rows;
  },

  async obtenerPorId(id) {
    const consulta = "SELECT * FROM permisos WHERE id = $1";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async actualizar(id, nombre) {
    const consulta =
      "UPDATE permisos SET nombre = $1 WHERE id = $2 RETURNING *";
    const resultado = await grupo.query(consulta, [nombre, id]);
    return resultado.rows[0];
  },

  async eliminar(id) {
    const consulta = "DELETE FROM permisos WHERE id = $1 RETURNING *";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },
};

module.exports = Permiso;
