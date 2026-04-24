const { grupo } = require("../config/database");

const RolPermiso = {
  async asignarPermiso(rolId, permisoId) {
    const consulta = `
      INSERT INTO rol_permiso (rol_id, permiso_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING *
    `;
    const resultado = await grupo.query(consulta, [rolId, permisoId]);
    return resultado.rows[0];
  },

  async removerPermiso(rolId, permisoId) {
    const consulta =
      "DELETE FROM rol_permiso WHERE rol_id = $1 AND permiso_id = $2 RETURNING *";
    const resultado = await grupo.query(consulta, [rolId, permisoId]);
    return resultado.rows[0];
  },

  async obtenerPermisosDeRol(rolId) {
    const consulta = `
      SELECT p.id, p.nombre
      FROM permisos p
      INNER JOIN rol_permiso rp ON p.id = rp.permiso_id
      WHERE rp.rol_id = $1
    `;
    const resultado = await grupo.query(consulta, [rolId]);
    return resultado.rows;
  },

  async obtenerRolesDePermiso(permisoId) {
    const consulta = `
      SELECT r.id, r.nombre
      FROM roles r
      INNER JOIN rol_permiso rp ON r.id = rp.rol_id
      WHERE rp.permiso_id = $1
    `;
    const resultado = await grupo.query(consulta, [permisoId]);
    return resultado.rows;
  },
};

module.exports = RolPermiso;
