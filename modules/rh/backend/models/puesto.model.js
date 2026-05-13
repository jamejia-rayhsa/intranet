const { grupo } = require("../config/database");

const Puesto = {
  async crear(datos) {
    const { nombre, descripcion, departamento_id } = datos;
    const consulta = `
      INSERT INTO puestos (nombre, descripcion, departamento_id)
      VALUES ($1, $2, $3) RETURNING *
    `;
    return (
      await grupo.query(consulta, [
        nombre,
        descripcion || null,
        departamento_id || null,
      ])
    ).rows[0];
  },

  async obtenerTodos() {
    const consulta = `
      SELECT p.*, d.nombre as departamento_nombre
      FROM puestos p
      LEFT JOIN departamentos d ON p.departamento_id = d.id
      ORDER BY p.nombre
    `;
    return (await grupo.query(consulta)).rows;
  },

  async actualizar(id, datos) {
    const campos = [];
    const valores = [];
    let c = 1;
    if (datos.nombre !== undefined) {
      campos.push(`nombre = $${c}`);
      valores.push(datos.nombre);
      c++;
    }
    if (datos.descripcion !== undefined) {
      campos.push(`descripcion = $${c}`);
      valores.push(datos.descripcion);
      c++;
    }
    if (datos.departamento_id !== undefined) {
      campos.push(`departamento_id = $${c}`);
      valores.push(datos.departamento_id);
      c++;
    }
    if (datos.activo !== undefined) {
      campos.push(`activo = $${c}`);
      valores.push(datos.activo);
      c++;
    }
    valores.push(id);
    const consulta = `UPDATE puestos SET ${campos.join(", ")} WHERE id = $${c} RETURNING *`;
    return (await grupo.query(consulta, valores)).rows[0];
  },

  async eliminar(id) {
    return (
      await grupo.query("DELETE FROM puestos WHERE id = $1 RETURNING *", [id])
    ).rows[0];
  },
};

module.exports = Puesto;
