import { solicitar } from "../utils/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export async function obtenerNoticiasPublicadas(pagina = 1, limite = 10) {
  return solicitar(`/noticias/publicadas?pagina=${pagina}&limite=${limite}`);
}

export async function obtenerNoticiasTodas(pagina = 1, limite = 20) {
  return solicitar(`/noticias?pagina=${pagina}&limite=${limite}`);
}

export async function obtenerNoticia(id) {
  return solicitar(`/noticias/${id}`);
}

export async function crearNoticia(datos) {
  return solicitar("/noticias", {
    metodo: "POST",
    cuerpo: JSON.stringify(datos),
  });
}

export async function actualizarNoticia(id, datos) {
  return solicitar(`/noticias/${id}`, {
    metodo: "PUT",
    cuerpo: JSON.stringify(datos),
  });
}

export async function eliminarNoticia(id) {
  return solicitar(`/noticias/${id}`, {
    metodo: "DELETE",
  });
}

export async function subirImagenNoticia(noticiaId, archivo) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("imagen", archivo);

  const respuesta = await fetch(`${API_URL}/noticias/${noticiaId}/imagenes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const datos = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(datos.mensaje || "Error al subir imagen");
  }
  return datos;
}

export async function eliminarImagenNoticia(noticiaId, imagenId) {
  return solicitar(`/noticias/${noticiaId}/imagenes/${imagenId}`, {
    metodo: "DELETE",
  });
}
