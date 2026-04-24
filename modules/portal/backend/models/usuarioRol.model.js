const { grupo } = require("../config/database");

const UsuarioRol = {
  async asignarRol(usuarioId, rolId) {
    const consulta = `
      INSERT INTO usuario_rol (usuario_id, rol_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING *
    `;
    const resultado = await grupo.query(consulta, [usuarioId, rolId]);
    return resultado.rows[0];
  },

  async removerRol(usuarioId, rolId) {
    const consulta =
      "DELETE FROM usuario_rol WHERE usuario_id = $1 AND rol_id = $2 RETURNING *";
    const resultado = await grupo.query(consulta, [usuarioId, rolId]);
    return resultado.rows[0];
  },

  async obtenerRolesDeUsuario(usuarioId) {
    const consulta = `
      SELECT r.id, r.nombre
      FROM roles r
      INNER JOIN usuario_rol ur ON r.id = ur.rol_id
      WHERE ur.usuario_id = $1
    `;
    const resultado = await grupo.query(consulta, [usuarioId]);
    return resultado.rows;
  },

  async obtenerUsuariosDeRol(rolId) {
    const consulta = `
      SELECT u.id, u.correo, u.nombre, u.apellido, u.activo
      FROM usuarios u
      INNER JOIN usuario_rol ur ON u.id = ur.usuario_id
      WHERE ur.rol_id = $1
    `;
    const resultado = await grupo.query(consulta, [rolId]);
    return resultado.rows;
  },
};

module.exports = UsuarioRol;
