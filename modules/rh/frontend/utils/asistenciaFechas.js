// Fechas y horas de las pantallas de Asistencia. Lógica pura (sin imports: las pruebas de jest evalúan el fuente).
// Reglas: las fechas son SIEMPRE texto 'AAAA-MM-DD' (nunca new Date(texto) para derivar un día) y los instantes
// (marcas, lotes, llaves) se convierten a la hora local de México con Intl y la zona EXPLÍCITA.
export const ZONA_MEXICO = 'America/Mexico_City';
export const MAX_RANGO_DIAS = 93;
export const UMBRAL_RETRASO_MIN = 45;
export const VENTANA_SYNC_INICIO_MIN = 7 * 60; // 07:00 hora de México
export const VENTANA_SYNC_FIN_MIN = 20 * 60; // 20:00 hora de México

const formateador = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_MEXICO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const MS_MIN = 60000;
const MS_DIA = 86400000;

function aDate(valor) {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor !== 'string' || valor === '') return null;
  // Solo instantes con zona (Z o ±hh:mm): una fecha sin zona se interpretaría en la zona del navegador
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(valor)) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Partes locales de México de un instante ISO con zona: { fecha: 'AAAA-MM-DD', hora: 'HH:MM:SS', minutos } o null. */
export function partesLocales(instante) {
  const d = aDate(instante);
  if (!d) return null;
  const p = {};
  for (const parte of formateador.formatToParts(d)) p[parte.type] = parte.value;
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    hora: `${p.hour}:${p.minute}:${p.second}`,
    minutos: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** 'AAAA-MM-DD HH:MM:SS' en hora de México; '—' si no hay instante o no es válido. */
export function formatoLocal(instante) {
  const p = partesLocales(instante);
  return p ? `${p.fecha} ${p.hora}` : '—';
}

/** Instante en UTC como 'AAAA-MM-DDTHH:MM:SSZ' (para el título al pasar el cursor). */
export function instanteUtc(instante) {
  const d = aDate(instante);
  return d ? `${d.toISOString().slice(0, 19)}Z` : '';
}

/** Fecha 'AAAA-MM-DD' de hoy en México. */
export function fechaMexicoHoy(ahora = new Date()) {
  const p = partesLocales(ahora instanceof Date ? ahora.toISOString() : ahora);
  return p ? p.fecha : '';
}

export function esFechaReal(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number);
  if (a < 1900 || a > 2200) return false;
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Suma días a 'AAAA-MM-DD' con aritmética UTC (sin desfase de zona ni de horario de verano). */
export function sumarDias(fecha, dias) {
  if (!esFechaReal(fecha)) return '';
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Días naturales entre dos fechas, contando ambos extremos (mismo día = 1); NaN si alguna no es real. */
export function diasDelRango(desde, hasta) {
  if (!esFechaReal(desde) || !esFechaReal(hasta)) return NaN;
  const t = (f) => {
    const [a, m, d] = f.split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((t(hasta) - t(desde)) / MS_DIA) + 1;
}

/** Mensaje de error del rango de fechas de una consulta, o '' si es válido. */
export function validarRango(desde, hasta) {
  if (!esFechaReal(desde) || !esFechaReal(hasta)) return 'Indica la fecha inicial y la final.';
  if (hasta < desde) return 'La fecha final no puede ser anterior a la inicial.';
  if (diasDelRango(desde, hasta) > MAX_RANGO_DIAS) return `El rango no puede superar ${MAX_RANGO_DIAS} días por consulta.`;
  return '';
}

/**
 * Último instante (23:59:59) de una fecha local de México, como ISO en UTC. Sirve para el vencimiento de una
 * llave. El desfase se calcula con Intl (no se supone un -06:00 fijo) y se verifica con una segunda pasada.
 */
export function finDeDiaMexicoISO(fecha) {
  if (!esFechaReal(fecha)) return '';
  const [a, m, d] = fecha.split('-').map(Number);
  const objetivoComoUtc = Date.UTC(a, m - 1, d, 23, 59, 59);
  let instante = objetivoComoUtc;
  for (let i = 0; i < 3; i += 1) {
    const p = partesLocales(new Date(instante).toISOString());
    const [pa, pm, pd] = p.fecha.split('-').map(Number);
    const [hh, mm, ss] = p.hora.split(':').map(Number);
    const comoUtc = Date.UTC(pa, pm - 1, pd, hh, mm, ss);
    const desfase = comoUtc - instante;
    const siguiente = objetivoComoUtc - desfase;
    if (siguiente === instante) break;
    instante = siguiente;
  }
  return new Date(instante).toISOString();
}

/** 'hace 5 min', 'hace 2 h 5 min', 'hace 3 días'. Negativo (reloj adelantado) se trata como 0. */
export function textoAntiguedad(minutos) {
  if (!Number.isFinite(minutos)) return '—';
  const m = Math.max(0, Math.floor(minutos));
  if (m < 1) return 'hace menos de 1 min';
  if (m < 60) return `hace ${m} min`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `hace ${h} h ${r} min` : `hace ${h} h`;
  }
  const dias = Math.floor(m / 1440);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

/**
 * Antigüedad del último envío de la interfaz. La interfaz sincroniza cada 15 min dentro del horario 07:00-20:00
 * (México): se avisa "posible retraso" si pasan más de 45 min SOLO dentro de ese horario. Fuera del horario
 * no se avisa, y al abrir la ventana la antigüedad cuenta desde las 07:00 (no desde la tarde anterior).
 * `ahora` debe venir del servidor para no depender del reloj del navegador.
 * @returns {{estado:'sin_datos'|'ok'|'retraso'|'fuera_de_horario', antiguedadMin:number|null, texto:string}}
 */
export function evaluarRetraso({ ahora, ultimoEnvio, umbralMin = UMBRAL_RETRASO_MIN }) {
  const dAhora = aDate(ahora);
  const dUltimo = aDate(ultimoEnvio);
  if (!dAhora) return { estado: 'sin_datos', antiguedadMin: null, texto: 'Sin información de la hora del servidor' };
  if (!dUltimo) return { estado: 'sin_datos', antiguedadMin: null, texto: 'Aún no se ha recibido ningún envío' };
  const antiguedadMin = Math.floor((dAhora.getTime() - dUltimo.getTime()) / MS_MIN);
  const local = partesLocales(dAhora.toISOString());
  const dentro = local.minutos >= VENTANA_SYNC_INICIO_MIN && local.minutos < VENTANA_SYNC_FIN_MIN;
  if (!dentro) {
    return { estado: 'fuera_de_horario', antiguedadMin, texto: `Último envío ${textoAntiguedad(antiguedadMin)} (fuera del horario de sincronización 07:00-20:00)` };
  }
  // Minutos desde las 07:00 de hoy: la espera no empieza antes de que abra la ventana
  const desdeApertura = local.minutos - VENTANA_SYNC_INICIO_MIN;
  const efectiva = Math.min(antiguedadMin, desdeApertura);
  if (efectiva > umbralMin) {
    return { estado: 'retraso', antiguedadMin, texto: `Posible retraso: el último envío fue ${textoAntiguedad(antiguedadMin)} (se espera uno cada 15 min)` };
  }
  return { estado: 'ok', antiguedadMin, texto: `Último envío ${textoAntiguedad(antiguedadMin)}` };
}
