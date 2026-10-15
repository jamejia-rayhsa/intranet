// modules/portal/frontend/utils/tiposNoticia.js
// Fuente única de los tipos de publicación en el frontend.
// PARIDAD: debe coincidir con modules/portal/backend/utils/tiposNoticia.js (valores y límites de imágenes).
// Para añadir un tipo (p. ej. "evento"): agregarlo a TIPOS_NOTICIA (y a la lista del backend).

export const TIPOS_NOTICIA = [
  { valor: 'noticia', etiqueta: 'Noticia', plural: 'Noticias' },
  { valor: 'comunicado', etiqueta: 'Comunicado', plural: 'Comunicados' },
  { valor: 'oferta_empleo', etiqueta: 'Oferta de Empleo', plural: 'Ofertas de Empleo' },
  { valor: 'boletin', etiqueta: 'Boletín', plural: 'Boletines' },
  { valor: 'evento', etiqueta: 'Evento', plural: 'Eventos' },
];

const MAX_IMAGENES = 5;
// Excepciones al máximo general
const LIMITE_IMAGENES_POR_TIPO = { boletin: 1, evento: 10 };

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

export function esEvento(noticia) {
  return noticia?.tipo === 'evento';
}

// Un evento está finalizado cuando ya terminó SU DÍA: ahora > 23:59:59.999 del día local del evento
// (zona del navegador). Un evento de hoy cuya hora de inicio ya pasó NO está finalizado.
// Función pura: fecha nula o inválida -> false.
export function eventoFinalizado(fechaEvento, ahora = new Date()) {
  if (!fechaEvento) return false;
  const inicio = new Date(fechaEvento);
  if (Number.isNaN(inicio.getTime())) return false;
  const finDelDia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 23, 59, 59, 999);
  return ahora > finDelDia;
}

// "15 oct 2026, 18:00 · Sala de juntas" (zona horaria del navegador)
export function textoFechaLugar(noticia) {
  const partes = [];
  const inicio = noticia?.fecha_evento ? new Date(noticia.fecha_evento) : null;
  if (inicio && !Number.isNaN(inicio.getTime())) {
    const fecha = inicio.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
    const hora = inicio.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    partes.push(`${fecha}, ${hora}`);
  }
  if (noticia?.lugar) partes.push(noticia.lugar);
  return partes.join(' · ');
}

// <input type="datetime-local"> <-> ISO con offset (el navegador interpreta el valor en su zona)
export function isoAInputLocal(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function inputLocalAIso(valor) {
  const d = valor ? new Date(valor) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : '';
}
