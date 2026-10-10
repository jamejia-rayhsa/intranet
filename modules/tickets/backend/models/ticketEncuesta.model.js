const { grupo } = require("../config/database");

// Filtro comun de las estadisticas: rango de fechas y, para un tecnico, solo sus tickets.
function filtrar({ desde, hasta, tecnicoId } = {}) {
  const condiciones = [];
  const valores = [];
  if (desde) {
    valores.push(desde);
    condiciones.push(`e.fecha_respuesta >= $${valores.length}::date`);
  }
  if (hasta) {
    valores.push(hasta);
    condiciones.push(`e.fecha_respuesta < ($${valores.length}::date + 1)`);
  }
  if (tecnicoId) {
    valores.push(tecnicoId);
    condiciones.push(`t.tecnico_id = $${valores.length}`);
  }
  return {
    donde: condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "",
    valores,
  };
}

const DESDE = `FROM ticket_encuestas e JOIN tickets t ON t.id = e.ticket_id`;

const TicketEncuesta = {
  // La unicidad la garantiza el indice unico: devuelve null si el ticket ya tenia encuesta.
  async crear(datos) {
    const { ticket_id, calificacion, comentarios } = datos;
    const resultado = await grupo.query(
      `INSERT INTO ticket_encuestas (ticket_id, calificacion, comentarios)
       VALUES ($1, $2, $3)
       ON CONFLICT (ticket_id) DO NOTHING
       RETURNING *`,
      [ticket_id, calificacion, comentarios || null],
    );
    return resultado.rows[0] || null;
  },

  async obtenerPorTicket(ticketId) {
    const consulta = "SELECT * FROM ticket_encuestas WHERE ticket_id = $1";
    const resultado = await grupo.query(consulta, [ticketId]);
    return resultado.rows[0];
  },

  async obtenerEstadisticas(filtros = {}) {
    const { donde, valores } = filtrar(filtros);
    const resultado = await grupo.query(
      `SELECT
        COUNT(*)::int AS total_encuestas,
        ROUND(AVG(e.calificacion), 2) AS promedio,
        COUNT(*) FILTER (WHERE e.calificacion = 5)::int AS excelentes,
        COUNT(*) FILTER (WHERE e.calificacion = 4)::int AS buenas,
        COUNT(*) FILTER (WHERE e.calificacion = 3)::int AS regulares,
        COUNT(*) FILTER (WHERE e.calificacion <= 2)::int AS malas,
        COUNT(*) FILTER (WHERE e.calificacion = 1)::int AS estrellas_1,
        COUNT(*) FILTER (WHERE e.calificacion = 2)::int AS estrellas_2,
        COUNT(*) FILTER (WHERE e.calificacion >= 4)::int AS satisfechos
       ${DESDE} ${donde}`,
      valores,
    );
    return resultado.rows[0];
  },

  async porTecnico(filtros = {}) {
    const { donde, valores } = filtrar(filtros);
    const resultado = await grupo.query(
      `SELECT t.tecnico_id,
        COALESCE(NULLIF(TRIM(CONCAT(u.nombre, ' ', u.apellido)), ''), 'Sin asignar') AS tecnico,
        COUNT(*)::int AS total,
        ROUND(AVG(e.calificacion), 2) AS promedio
       ${DESDE} LEFT JOIN usuarios u ON u.id = t.tecnico_id ${donde}
       GROUP BY t.tecnico_id, u.nombre, u.apellido
       ORDER BY AVG(e.calificacion) DESC, COUNT(*) DESC`,
      valores,
    );
    return resultado.rows;
  },

  async porCategoria(filtros = {}) {
    const { donde, valores } = filtrar(filtros);
    const resultado = await grupo.query(
      `SELECT COALESCE(t.categoria, 'Sin categoría') AS categoria,
        COUNT(*)::int AS total,
        ROUND(AVG(e.calificacion), 2) AS promedio
       ${DESDE} ${donde}
       GROUP BY COALESCE(t.categoria, 'Sin categoría')
       ORDER BY AVG(e.calificacion) DESC, COUNT(*) DESC`,
      valores,
    );
    return resultado.rows;
  },

  // Respuestas con comentario, las de baja calificacion primero.
  async comentariosRecientes(filtros = {}, limite = 20) {
    const { donde, valores } = filtrar(filtros);
    const condicion = `${donde ? `${donde} AND` : "WHERE"} NULLIF(TRIM(e.comentarios), '') IS NOT NULL`;
    valores.push(limite);
    const resultado = await grupo.query(
      `SELECT e.id, e.ticket_id, t.titulo, e.calificacion, e.comentarios, e.fecha_respuesta,
        t.categoria,
        NULLIF(TRIM(CONCAT(u.nombre, ' ', u.apellido)), '') AS tecnico
       ${DESDE} LEFT JOIN usuarios u ON u.id = t.tecnico_id ${condicion}
       ORDER BY (e.calificacion <= 2) DESC, e.fecha_respuesta DESC
       LIMIT $${valores.length}`,
      valores,
    );
    return resultado.rows;
  },

  // Tickets del usuario ya resueltos/cerrados que aun no calificó.
  async pendientesDelSolicitante(usuarioId) {
    const resultado = await grupo.query(
      `SELECT t.id, t.titulo, t.estado, t.fecha_cierre
       FROM tickets t
       WHERE t.solicitante_id = $1 AND t.estado IN ('resuelto', 'cerrado')
         AND NOT EXISTS (SELECT 1 FROM ticket_encuestas e WHERE e.ticket_id = t.id)
       ORDER BY t.fecha_cierre DESC NULLS LAST, t.id DESC`,
      [usuarioId],
    );
    return resultado.rows;
  },
};

module.exports = TicketEncuesta;
