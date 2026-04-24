const { grupo } = require("../config/database");

const Departamento = {
  async crear(datos) {
    const consulta = `INSERT INTO departamentos (nombre, descripcion) VALUES ($1, $2) RETURNING *`;
    return (
      await grupo.query(consulta, [datos.nombre, datos.descripcion || null])
    ).rows[0];
  },

  async obtenerTodos() {
    return (await grupo.query("SELECT * FROM departamentos ORDER BY nombre"))
      .rows;
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
    if (datos.activo !== undefined) {
      campos.push(`activo = $${c}`);
      valores.push(datos.activo);
      c++;
    }
    valores.push(id);
    const consulta = `UPDATE departamentos SET ${campos.join(", ")} WHERE id = $${c} RETURNING *`;
    return (await grupo.query(consulta, valores)).rows[0];
  },

  async eliminar(id) {
    return (
      await grupo.query("DELETE FROM departamentos WHERE id = $1 RETURNING *", [
        id,
      ])
    ).rows[0];
  },
};

module.exports = Departamento;
