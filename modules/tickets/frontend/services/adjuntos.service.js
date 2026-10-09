import { obtenerToken } from "../../../portal/frontend/utils/token";
import { solicitar } from "../../../portal/frontend/utils/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export async function subirAdjunto(ticketId, archivo) {
  const token = await obtenerToken();
  const formulario = new FormData();
  formulario.append("archivo", archivo);

  const respuesta = await fetch(`${API_URL}/adjuntos/${ticketId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formulario,
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(datos.mensaje || "Error al subir archivo");
  }

  return datos;
}

export async function obtenerAdjuntos(ticketId) {
  return solicitar(`/adjuntos/${ticketId}`);
}

export async function eliminarAdjunto(id) {
  return solicitar(`/adjuntos/${id}`, {
    method: "DELETE",
  });
}
