const { grupo } = require("../config/database");

const TicketAdjunto = {
  async crear(datos) {
    const { ticket_id, nombre_archivo, tipo_mime, ruta_archivo } = datos;
    const consulta = `
      INSERT INTO ticket_adjuntos (ticket_id, nombre_archivo, tipo_archivo, ruta_archivo)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const valores = [ticket_id, nombre_archivo, tipo_mime, ruta_archivo];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerPorTicket(ticketId) {
    const consulta =
      "SELECT * FROM ticket_adjuntos WHERE ticket_id = $1 ORDER BY fecha_subida DESC";
    const resultado = await grupo.query(consulta, [ticketId]);
    return resultado.rows;
  },

  async obtenerPorId(id) {
    const consulta = "SELECT * FROM ticket_adjuntos WHERE id = $1";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async eliminar(id) {
    const consulta = "DELETE FROM ticket_adjuntos WHERE id = $1 RETURNING *";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },
};

module.exports = TicketAdjunto;
