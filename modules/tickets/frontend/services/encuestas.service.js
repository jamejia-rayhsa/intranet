import { solicitar } from "../../../portal/frontend/utils/api";

export async function enviarEncuesta(ticketId, calificacion, comentarios = "") {
  return solicitar(`/tickets/${ticketId}/encuesta`, {
    method: "POST",
    body: JSON.stringify({ calificacion, comentarios }),
  });
}

export async function obtenerEncuesta(ticketId) {
  return solicitar(`/tickets/${ticketId}/encuesta`);
}

export async function obtenerEstadisticasEncuestas() {
  return solicitar("/tickets/encuestas/estadisticas");
}
