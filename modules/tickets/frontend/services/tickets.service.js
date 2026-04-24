import { solicitar } from "../../../portal/frontend/utils/api";

export async function crearTicket(datos) {
  return solicitar("/tickets", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export async function obtenerTickets(filtros = {}) {
  const parametros = new URLSearchParams();

  if (filtros.pagina) parametros.append("pagina", filtros.pagina);
  if (filtros.limite) parametros.append("limite", filtros.limite);
  if (filtros.estado) parametros.append("estado", filtros.estado);
  if (filtros.nivel_atencion)
    parametros.append("nivel_atencion", filtros.nivel_atencion);
  if (filtros.categoria) parametros.append("categoria", filtros.categoria);

  return solicitar(`/tickets?${parametros.toString()}`);
}

export async function obtenerTicket(id) {
  return solicitar(`/tickets/${id}`);
}

export async function actualizarEstadoTicket(id, estado, tecnicoId = null) {
  const cuerpo = { estado };
  if (tecnicoId) cuerpo.tecnico_id = tecnicoId;

  return solicitar(`/tickets/${id}/estado`, {
    method: "PUT",
    body: JSON.stringify(cuerpo),
  });
}

export async function asignarTecnico(ticketId, tecnicoId) {
  return solicitar(`/tickets/${ticketId}/asignar`, {
    method: "PUT",
    body: JSON.stringify({ tecnico_id: tecnicoId }),
  });
}

export async function eliminarTicket(id) {
  return solicitar(`/tickets/${id}`, {
    method: "DELETE",
  });
}

export async function obtenerTecnicos() {
  return solicitar("/tickets/tecnicos");
}
