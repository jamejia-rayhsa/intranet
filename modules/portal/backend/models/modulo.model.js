const { grupo } = require("../config/database");

const Modulo = {
  async crear(datos) {
    const { nombre, path_reactivo, descripcion, activo = true } = datos;
    const consulta = `
      INSERT INTO modulos (nombre, path_reactivo, descripcion, activo)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const valores = [nombre, path_reactivo, descripcion, activo];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerTodos() {
    const consulta = "SELECT * FROM modulos ORDER BY nombre";
    const resultado = await grupo.query(consulta);
    return resultado.rows;
  },

  async obtenerActivos() {
    const consulta =
      "SELECT * FROM modulos WHERE activo = true ORDER BY nombre";
    const resultado = await grupo.query(consulta);
    return resultado.rows;
  },

  async obtenerPorId(id) {
    const consulta = "SELECT * FROM modulos WHERE id = $1";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async actualizar(id, datos) {
    const campos = [];
    const valores = [];
    let contador = 1;

    if (datos.nombre !== undefined) {
      campos.push(`nombre = $${contador}`);
      valores.push(datos.nombre);
      contador++;
    }
    if (datos.path_reactivo !== undefined) {
      campos.push(`path_reactivo = $${contador}`);
      valores.push(datos.path_reactivo);
      contador++;
    }
    if (datos.descripcion !== undefined) {
      campos.push(`descripcion = $${contador}`);
      valores.push(datos.descripcion);
      contador++;
    }
    if (datos.activo !== undefined) {
      campos.push(`activo = $${contador}`);
      valores.push(datos.activo);
      contador++;
    }

    if (campos.length === 0) {
      return this.obtenerPorId(id);
    }

    valores.push(id);
    const consulta = `UPDATE modulos SET ${campos.join(", ")} WHERE id = $${contador} RETURNING *`;
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async eliminar(id) {
    const consulta = "DELETE FROM modulos WHERE id = $1 RETURNING *";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },
};

module.exports = Modulo;
