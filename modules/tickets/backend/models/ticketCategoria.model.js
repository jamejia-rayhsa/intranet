const { grupo } = require("../config/database");

const TicketCategoria = {
  async crear(datos) {
    const { nombre, descripcion, icono } = datos;
    const consulta = `
      INSERT INTO ticket_categorias (nombre, descripcion, icono)
      VALUES ($1, $2, $3) RETURNING *
    `;
    const resultado = await grupo.query(consulta, [
      nombre,
      descripcion || null,
      icono || "cog",
    ]);
    return resultado.rows[0];
  },

  async obtenerTodos() {
    return (
      await grupo.query("SELECT * FROM ticket_categorias ORDER BY nombre")
    ).rows;
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
    if (datos.icono !== undefined) {
      campos.push(`icono = $${c}`);
      valores.push(datos.icono);
      c++;
    }
    if (datos.activo !== undefined) {
      campos.push(`activo = $${c}`);
      valores.push(datos.activo);
      c++;
    }
    valores.push(id);
    const consulta = `UPDATE ticket_categorias SET ${campos.join(", ")} WHERE id = $${c} RETURNING *`;
    return (await grupo.query(consulta, valores)).rows[0];
  },

  async eliminar(id) {
    return (
      await grupo.query(
        "DELETE FROM ticket_categorias WHERE id = $1 RETURNING *",
        [id],
      )
    ).rows[0];
  },
};

module.exports = TicketCategoria;
