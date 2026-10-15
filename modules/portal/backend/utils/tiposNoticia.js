// modules/portal/backend/utils/tiposNoticia.js
// Fuente única de los tipos de publicación y de sus límites de imágenes.
// PARIDAD: debe coincidir con modules/portal/frontend/utils/tiposNoticia.js (valores y límites de imágenes).
// Para añadir un tipo: agregarlo a TIPOS_NOTICIA y,
// si su límite de imágenes difiere de MAX_IMAGENES, a LIMITE_IMAGENES_POR_TIPO.

const TIPOS_NOTICIA = ["noticia", "comunicado", "oferta_empleo", "boletin", "evento"];

// Máximo general de imágenes por publicación
const MAX_IMAGENES = 5;

// Excepciones al máximo general: el boletín es solo una imagen; el evento admite un carrusel de 10
const LIMITE_IMAGENES_POR_TIPO = { boletin: 1, evento: 10 };

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

// Tipo 'evento': fecha_evento (fecha y hora de inicio) y lugar obligatorios.
// Cada validador devuelve { valor } normalizado o { error }.
function validarFechaEvento(fecha) {
  const error = { error: "El evento requiere una fecha y hora de inicio válida (fecha_evento)" };
  // Solo cadenas no vacías, números finitos o Date reales (se descartan booleanos, arreglos y objetos)
  const tipoAceptable =
    (typeof fecha === "string" && fecha.trim() !== "") ||
    (typeof fecha === "number" && Number.isFinite(fecha)) ||
    fecha instanceof Date;
  if (!tipoAceptable) return error;
  const instante = new Date(fecha);
  if (Number.isNaN(instante.getTime())) return error;
  const anio = instante.getUTCFullYear();
  if (anio < 2000 || anio > 2100) return error; // rango razonable para un evento de la intranet
  return { valor: instante.toISOString() };
}

function validarLugarEvento(lugar) {
  const limpio = typeof lugar === "string" ? lugar.trim() : "";
  if (!limpio) return { error: "El evento requiere un lugar" };
  if (limpio.length > 255) return { error: "El lugar no puede superar 255 caracteres" };
  return { valor: limpio };
}

function validarCamposEvento({ fecha_evento, lugar }) {
  const f = validarFechaEvento(fecha_evento);
  if (f.error) return { error: f.error };
  const l = validarLugarEvento(lugar);
  if (l.error) return { error: l.error };
  return { fecha_evento: f.valor, lugar: l.valor };
}

module.exports = {
  validarCamposEvento,
  validarFechaEvento,
  validarLugarEvento,
  paraPublico, TIPOS_NOTICIA, MAX_IMAGENES, LIMITE_IMAGENES_POR_TIPO, esTipoValido, limiteImagenes, mensajeTipoInvalido };
