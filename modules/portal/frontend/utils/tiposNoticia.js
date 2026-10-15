// modules/portal/frontend/utils/tiposNoticia.js
// Fuente única de los tipos de publicación en el frontend.
// PARIDAD: debe coincidir con modules/portal/backend/utils/tiposNoticia.js (valores y límites de imágenes).
// Para añadir un tipo (p. ej. "evento"): agregarlo a TIPOS_NOTICIA (y a la lista del backend).

export const TIPOS_NOTICIA = [
  { valor: 'noticia', etiqueta: 'Noticia', plural: 'Noticias' },
  { valor: 'comunicado', etiqueta: 'Comunicado', plural: 'Comunicados' },
  { valor: 'oferta_empleo', etiqueta: 'Oferta de Empleo', plural: 'Ofertas de Empleo' },
  { valor: 'boletin', etiqueta: 'Boletín', plural: 'Boletines' },
];

const MAX_IMAGENES = 5;
// Excepciones al máximo general
const LIMITE_IMAGENES_POR_TIPO = { boletin: 1 };

export function etiquetaTipo(tipo) {
  return TIPOS_NOTICIA.find((t) => t.valor === tipo)?.etiqueta || tipo || 'Noticia';
}

export function limiteImagenes(tipo) {
  return LIMITE_IMAGENES_POR_TIPO[tipo] || MAX_IMAGENES;
}

export function esBoletin(noticia) {
  return noticia?.tipo === 'boletin';
}

export function tieneImagen(noticia) {
  return Boolean(noticia?.imagenes?.length);
}

// Un boletín sin imagen no se muestra al público (no tendría nada que enseñar)
export function esMostrable(noticia) {
  return !esBoletin(noticia) || tieneImagen(noticia);
}
