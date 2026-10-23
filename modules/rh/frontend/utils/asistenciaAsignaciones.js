// Asignaciones de turno con vigencia. Lógica pura (sin imports: jest evalúa el fuente).
// Fechas SIEMPRE como texto 'AAAA-MM-DD' (comparables como cadenas); nunca se pasan por new Date(texto).
export const AVISO_ASIGNACIONES =
  'El turno de un empleado es el individual vigente; si no tiene, el de su departamento. ' +
  'Un traslado de departamento a mitad de quincena abierta reclasifica los días anteriores de esa quincena: ' +
  'asigna un turno individual con vigencia al hacer el traslado';

const fechaReal = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  if (a < 1900 || a > 2200) return false;
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};

/** 'vigente' (cubre hoy), 'futura' (empieza después) o 'cerrada' (terminó antes de hoy). */
export function clasificarVigencia(asignacion, hoy) {
  if (asignacion.vigente_desde > hoy) return 'futura';
  if (asignacion.vigente_hasta !== null && asignacion.vigente_hasta !== undefined && asignacion.vigente_hasta < hoy) return 'cerrada';
  return 'vigente';
}

export const esAbierta = (a) => a.vigente_hasta === null || a.vigente_hasta === undefined;

/** Texto de la vigencia: '2026-09-01 a 2026-10-15' o '2026-09-01 en adelante (abierta)'. */
export function textoVigencia(a) {
  return esAbierta(a) ? `${a.vigente_desde} en adelante (abierta)` : `${a.vigente_desde} a ${a.vigente_hasta}`;
}

const ETIQUETAS_ESTADO = { vigente: 'Vigente', futura: 'Futura', cerrada: 'Cerrada' };
export const etiquetaEstadoVigencia = (estado) => ETIQUETAS_ESTADO[estado] || estado;

/** Se puede terminar si es abierta o su fecha final es hoy o posterior (solo se acorta). */
export function puedeTerminar(a, hoy) {
  return esAbierta(a) || a.vigente_hasta >= hoy;
}

/** Agrupa las filas por la columna del padre (departamento_id / empleado_id), orden por desde descendente. */
export function agruparPorPadre(filas, columna) {
  const mapa = new Map();
  for (const f of filas) {
    if (!mapa.has(f[columna])) mapa.set(f[columna], []);
    mapa.get(f[columna]).push(f);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : a.vigente_desde > b.vigente_desde ? -1 : b.id - a.id));
  return mapa;
}

/** La vigencia que cubre `hoy`, o null. */
export function vigenteHoy(lista, hoy) {
  return (lista || []).find((a) => clasificarVigencia(a, hoy) === 'vigente') || null;
}

/** Valida el alta: devuelve { errores } (vacío si es válida). El servidor revisa turno activo y traslapes. */
export function validarAlta({ turno_id, vigente_desde, vigente_hasta }) {
  const errores = {};
  if (!turno_id) errores.turno_id = 'Elige un turno';
  if (!fechaReal(vigente_desde)) errores.vigente_desde = 'Indica una fecha de inicio válida';
  if (vigente_hasta) {
    if (!fechaReal(vigente_hasta)) errores.vigente_hasta = 'La fecha final no es válida';
    else if (fechaReal(vigente_desde) && vigente_hasta < vigente_desde) errores.vigente_hasta = 'La fecha final no puede ser anterior a la de inicio';
  }
  return { errores };
}

const sumaDia = (fecha, n) => {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};

/**
 * Aviso al terminar una asignación con fecha ANTERIOR a hoy (no se bloquea): el turno efectivo cambia desde el día
 * siguiente a `hasta`. '' si no hace falta avisar (hasta es hoy o futura, o la fecha no es válida).
 */
export function avisoTerminarPasado(hasta, hoy) {
  if (!fechaReal(hasta) || !fechaReal(hoy) || hasta >= hoy) return '';
  const desde = sumaDia(hasta, 1);
  return (
    `El turno efectivo cambia desde el ${desde}: los días desde el ${desde} hasta hoy se recalcularán si su quincena sigue abierta; ` +
    'las quincenas cerradas no cambian.'
  );
}

/** Valida la nueva fecha final al terminar: >= inicio y, si ya tenía final, anterior a ella (solo acorta). */
export function validarTerminar(asignacion, hasta) {
  if (!fechaReal(hasta)) return 'Indica una fecha final válida';
  if (hasta < asignacion.vigente_desde) return `La fecha final no puede ser anterior al inicio de la vigencia (${asignacion.vigente_desde})`;
  if (!esAbierta(asignacion) && hasta >= asignacion.vigente_hasta) {
    return `La asignación ya termina el ${asignacion.vigente_hasta}: solo se puede acortar su vigencia`;
  }
  return '';
}

/** Etiqueta del origen del turno efectivo en el buscador de empleados. */
export function etiquetaOrigen(origen) {
  if (origen === 'empleado') return 'Individual';
  if (origen === 'departamento') return 'Del departamento';
  return 'Sin turno';
}
