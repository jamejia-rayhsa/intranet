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

export async function obtenerEstadisticasEncuestas({ desde, hasta } = {}) {
  const parametros = new URLSearchParams();
  if (desde) parametros.set("desde", desde);
  if (hasta) parametros.set("hasta", hasta);
  const consulta = parametros.toString();
  return solicitar(`/tickets/encuestas/estadisticas${consulta ? `?${consulta}` : ""}`);
}

export async function obtenerEncuestasPendientes() {
  return solicitar("/tickets/encuestas/pendientes");
}
