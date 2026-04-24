import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerComentarios(ticketId) {
  return solicitar(`/comentarios/${ticketId}`);
}

export async function crearComentario(ticketId, comentario) {
  return solicitar(`/comentarios/${ticketId}`, {
    metodo: "POST",
    cuerpo: JSON.stringify({ comentario }),
  });
}

export async function eliminarComentario(id) {
  return solicitar(`/comentarios/${id}`, { metodo: "DELETE" });
}
