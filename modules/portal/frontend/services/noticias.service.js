import { solicitar } from "../utils/api";
import { obtenerToken } from "../utils/token";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// tipo (opcional): el servidor filtra antes de paginar, así que total y páginas son los del filtro
export async function obtenerNoticiasPublicadas(pagina = 1, limite = 10, tipo = "") {
  const filtro = tipo ? `&tipo=${encodeURIComponent(tipo)}` : "";
  return solicitar(`/noticias/publicadas?pagina=${pagina}&limite=${limite}${filtro}`);
}

export async function obtenerNoticiasTodas(pagina = 1, limite = 20) {
  return solicitar(`/noticias?pagina=${pagina}&limite=${limite}`);
}

export async function obtenerNoticia(id) {
  return solicitar(`/noticias/${id}`);
}

// Detalle para el panel de administración (incluye borradores; requiere permiso Noticias:consulta)
export async function obtenerNoticiaAdmin(id) {
  return solicitar(`/noticias/admin/${id}`);
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
  const token = await obtenerToken();
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

// Guarda el orden de las imágenes (la primera es la portada): ids de TODAS las imágenes de la publicación
export async function reordenarImagenesNoticia(noticiaId, idsEnOrden) {
  return solicitar(`/noticias/${noticiaId}/imagenes/orden`, {
    metodo: "PUT",
    cuerpo: JSON.stringify({ orden: idsEnOrden }),
  });
}
