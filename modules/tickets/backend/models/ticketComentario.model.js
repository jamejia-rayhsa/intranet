const { grupo } = require("../config/database");

const TicketComentario = {
  async crear(datos) {
    const { ticket_id, usuario_id, comentario } = datos;
    const consulta = `
      INSERT INTO ticket_comentarios (ticket_id, usuario_id, comentario)
      VALUES ($1, $2, $3) RETURNING *
    `;
    const resultado = await grupo.query(consulta, [
      ticket_id,
      usuario_id,
      comentario,
    ]);
    return resultado.rows[0];
  },

  async obtenerPorTicket(ticketId) {
    const consulta = `
      SELECT tc.*, u.nombre as usuario_nombre, u.apellido as usuario_apellido, u.correo as usuario_correo
      FROM ticket_comentarios tc
      LEFT JOIN usuarios u ON tc.usuario_id = u.id
      WHERE tc.ticket_id = $1
      ORDER BY tc.fecha_creacion ASC
    `;
    const resultado = await grupo.query(consulta, [ticketId]);
    return resultado.rows;
  },

  async eliminar(id) {
    const consulta = "DELETE FROM ticket_comentarios WHERE id = $1 RETURNING *";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },
};

module.exports = TicketComentario;
