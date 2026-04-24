const { grupo } = require("../config/database");

const Rol = {
  async crear(nombre) {
    const consulta = "INSERT INTO roles (nombre) VALUES ($1) RETURNING *";
    const resultado = await grupo.query(consulta, [nombre]);
    return resultado.rows[0];
  },

  async obtenerTodos() {
    const consulta = `
      SELECT r.id, r.nombre,
        json_agg(json_build_object('id', p.id, 'nombre', p.nombre)) FILTER (WHERE p.id IS NOT NULL) as permisos
      FROM roles r
      LEFT JOIN rol_permiso rp ON r.id = rp.rol_id
      LEFT JOIN permisos p ON rp.permiso_id = p.id
      GROUP BY r.id
      ORDER BY r.nombre
    `;
    const resultado = await grupo.query(consulta);
    return resultado.rows;
  },

  async obtenerPorId(id) {
    const consulta = "SELECT * FROM roles WHERE id = $1";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async actualizar(id, nombre) {
    const consulta = "UPDATE roles SET nombre = $1 WHERE id = $2 RETURNING *";
    const resultado = await grupo.query(consulta, [nombre, id]);
    return resultado.rows[0];
  },

  async eliminar(id) {
    const consulta = "DELETE FROM roles WHERE id = $1 RETURNING *";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async obtenerPermisos(rolId) {
    const consulta = `
      SELECT p.id, p.nombre
      FROM permisos p
      INNER JOIN rol_permiso rp ON p.id = rp.permiso_id
      WHERE rp.rol_id = $1
    `;
    const resultado = await grupo.query(consulta, [rolId]);
    return resultado.rows;
  },

  async asignarPermisos(rolId, permisosIds) {
    const client = await grupo.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM rol_permiso WHERE rol_id = $1", [rolId]);

      if (permisosIds.length > 0) {
        const valores = permisosIds
          .map((permisoId, indice) => `($1, $${indice + 2})`)
          .join(", ");
        const parametros = [rolId, ...permisosIds];
        await client.query(
          `INSERT INTO rol_permiso (rol_id, permiso_id) VALUES ${valores}`,
          parametros,
        );
      }

      await client.query("COMMIT");
      return this.obtenerPermisos(rolId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};

module.exports = Rol;
