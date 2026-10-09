// URL (mismo origen) de las imágenes de noticias, servidas por Supabase Storage.
const BASE_PUBLICA = "/storage/v1/object/public/noticias/";

export function urlImagenNoticia(imagen) {
  if (!imagen) return "";
  if (imagen.url) return imagen.url;
  const ruta = imagen.ruta_archivo || "";
  if (ruta.startsWith("/uploads/noticias/")) {
    return BASE_PUBLICA + ruta.slice("/uploads/noticias/".length);
  }
  return BASE_PUBLICA + ruta.replace(/^\/+/, "");
}
