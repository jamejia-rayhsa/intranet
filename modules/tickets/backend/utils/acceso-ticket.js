// Reglas de acceso a un ticket y a sus recursos (adjuntos, comentarios).

/** Administrador de tickets (predicado original de ticket.controller.listar). */
function esAdminTickets(user) {
  return Boolean(
    user &&
      (user.roles?.includes("super_admin") ||
        user.roles?.includes("tickets_admin") ||
        user.permisos?.includes("tickets.admin") ||
        user.permisos?.includes("tickets.technician")),
  );
}

/** Admin, solicitante o tecnico asignado. `ticket` = { solicitante_id, tecnico_id }. */
function puedeAccederTicket(user, ticket) {
  if (esAdminTickets(user)) return true;
  if (!user || !ticket) return false;
  const uid = String(user.usuario_id);
  return (
    (ticket.solicitante_id != null && String(ticket.solicitante_id) === uid) ||
    (ticket.tecnico_id != null && String(ticket.tecnico_id) === uid)
  );
}

/** Tecnico asignado al ticket. */
function esTecnicoAsignado(user, ticket) {
  return Boolean(
    user && ticket && ticket.tecnico_id != null &&
      String(ticket.tecnico_id) === String(user.usuario_id),
  );
}

/** Solicitante del ticket. */
function esSolicitante(user, ticket) {
  return Boolean(
    user && ticket && ticket.solicitante_id != null &&
      String(ticket.solicitante_id) === String(user.usuario_id),
  );
}

/** Cambiar estado: administrador o tecnico asignado. */
function puedeCambiarEstado(user, ticket) {
  return esAdminTickets(user) || esTecnicoAsignado(user, ticket);
}

module.exports = {
  esAdminTickets,
  puedeAccederTicket,
  esTecnicoAsignado,
  esSolicitante,
  puedeCambiarEstado,
};
