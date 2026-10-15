// modules/portal/backend/utils/tiposNoticia.js
// Fuente única de los tipos de publicación y de sus límites de imágenes.
// PARIDAD: debe coincidir con modules/portal/frontend/utils/tiposNoticia.js (valores y límites de imágenes).
// Para añadir un tipo (p. ej. "evento" en la Fase 3): agregarlo a TIPOS_NOTICIA y,
// si su límite de imágenes difiere de MAX_IMAGENES, a LIMITE_IMAGENES_POR_TIPO.

const TIPOS_NOTICIA = ["noticia", "comunicado", "oferta_empleo", "boletin"];

// Máximo general de imágenes por publicación
const MAX_IMAGENES = 5;

// Excepciones al máximo general: el boletín es solo una imagen
const LIMITE_IMAGENES_POR_TIPO = { boletin: 1 };

function esTipoValido(tipo) {
  return TIPOS_NOTICIA.includes(tipo);
}

function limiteImagenes(tipo) {
  return LIMITE_IMAGENES_POR_TIPO[tipo] || MAX_IMAGENES;
}

function mensajeTipoInvalido() {
  return `Tipo de publicación inválido. Valores permitidos: ${TIPOS_NOTICIA.join(", ")}`;
}

// API pública: un boletín solo expone su imagen. El título es interno (panel) y no debe salir
// por los endpoints sin autenticación, ni siquiera dentro del JSON.
function paraPublico(noticia) {
  if (!noticia || noticia.tipo !== "boletin") return noticia;
  const { id, tipo, fecha_publicacion, publicada, imagenes } = noticia;
  return { id, tipo, fecha_publicacion, publicada, imagenes };
}

module.exports = {
  paraPublico, TIPOS_NOTICIA, MAX_IMAGENES, LIMITE_IMAGENES_POR_TIPO, esTipoValido, limiteImagenes, mensajeTipoInvalido };
