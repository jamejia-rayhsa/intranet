const { grupo } = require("../config/database");

const TicketEncuesta = {
  async crear(datos) {
    const { ticket_id, calificacion, comentarios } = datos;
    const consulta = `
      INSERT INTO ticket_encuestas (ticket_id, calificacion, comentarios)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const valores = [ticket_id, calificacion, comentarios || null];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerPorTicket(ticketId) {
    const consulta = "SELECT * FROM ticket_encuestas WHERE ticket_id = $1";
    const resultado = await grupo.query(consulta, [ticketId]);
    return resultado.rows[0];
  },

  async obtenerEstadisticas() {
    const consulta = `
      SELECT
        COUNT(*) as total_encuestas,
        ROUND(AVG(calificacion), 2) as promedio,
        COUNT(CASE WHEN calificacion = 5 THEN 1 END) as excelentes,
        COUNT(CASE WHEN calificacion = 4 THEN 1 END) as buenas,
        COUNT(CASE WHEN calificacion = 3 THEN 1 END) as regulares,
        COUNT(CASE WHEN calificacion <= 2 THEN 1 END) as malas
      FROM ticket_encuestas
    `;
    const resultado = await grupo.query(consulta);
    return resultado.rows[0];
  },
};

module.exports = TicketEncuesta;
