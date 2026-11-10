// Tiempo del motor de asistencia (módulo PURO). Los instantes (UTC) se convierten a America/Mexico_City con Intl:
// no hay horario de verano desde 2022 pero se deja a la base de zonas (Intl) para no suponerlo. Las fechas son
// siempre texto 'YYYY-MM-DD' y las horas 'HH:MM'; nunca new Date(texto) con getters locales.
const { aNumeroDia, deNumeroDia, diaSemana } = require("../../utils/diasHabiles");

const ZONA = "America/Mexico_City";
const TOPE_CACHE = 200000;

let formateador = null;
function obtenerFormateador() {
  if (!formateador) {
    formateador = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return formateador;
}

const cache = new Map();

/** Instante (Date | ms | ISO con zona) -> milisegundos UTC. Lanza si no es un instante válido. */
function aMs(instante) {
  let ms;
  if (instante instanceof Date) ms = instante.getTime();
  else if (typeof instante === "number") ms = instante;
  else if (typeof instante === "string") ms = Date.parse(instante);
  else ms = NaN;
  if (!Number.isFinite(ms)) throw new TypeError("Instante no válido");
  return ms;
}

/**
 * Fecha y hora local (America/Mexico_City) de un instante.
 * @returns {{fecha:string, dia:number, segundos:number}} dia = número de día (días desde 1970-01-01 de la fecha local),
 *   segundos = segundos desde la medianoche local.
 */
function aLocal(instante) {
  const ms = aMs(instante);
  const segundoEntero = Math.floor(ms / 1000);
  const previo = cache.get(segundoEntero);
  if (previo) return previo;
  const partes = {};
  for (const p of obtenerFormateador().formatToParts(new Date(segundoEntero * 1000))) partes[p.type] = p.value;
  const hora = Number(partes.hour) % 24; // algunos motores devuelven '24' a medianoche
  const fecha = `${partes.year}-${partes.month}-${partes.day}`;
  const resultado = {
    fecha,
    dia: aNumeroDia(fecha),
    segundos: hora * 3600 + Number(partes.minute) * 60 + Number(partes.second),
  };
  if (cache.size >= TOPE_CACHE) cache.clear();
  cache.set(segundoEntero, resultado);
  return resultado;
}

/** 'HH:MM' o 'HH:MM:SS' -> minutos desde medianoche (null si no es válido) */
function horaAMinutos(texto) {
  if (typeof texto !== "string") return null;
  const m = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(texto);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Día ISO de una fecha: 1 = lunes ... 7 = domingo */
function diaIso(fecha) {
  const d = diaSemana(fecha);
  return d === 0 ? 7 : d;
}

/** Minuto (entero, segundos truncados) de un instante respecto de la medianoche local de `fecha`; puede ser negativo o > 1440. */
function minutoRelativo(instante, fecha) {
  const local = aLocal(instante);
  return (local.dia - aNumeroDia(fecha)) * 1440 + Math.floor(local.segundos / 60);
}

const sumarDias = (fecha, n) => deNumeroDia(aNumeroDia(fecha) + n);

/** Fecha de hoy (America/Mexico_City) para un instante */
const hoyMexico = (instante) => aLocal(instante).fecha;

module.exports = { ZONA, aMs, aLocal, horaAMinutos, diaIso, minutoRelativo, sumarDias, hoyMexico };
