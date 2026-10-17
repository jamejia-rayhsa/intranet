// Días hábiles de vacaciones: lunes a viernes, sin días oficiales ni descansos otorgados.
// Módulo PURO: las fechas son siempre texto 'YYYY-MM-DD' y la aritmética usa Date.UTC / getUTCDay.
// Nunca new Date(texto) con getters locales: en zonas con offset negativo "2027-01-01" daría 2026.

const MAX_DIAS_RANGO = 366;
const MS_DIA = 24 * 60 * 60 * 1000;
const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

// Fecha de calendario real (rechaza 2026-02-30, 2027-02-29, 2026-13-01)
function esFechaValida(texto) {
  if (typeof texto !== "string") return false;
  const m = PATRON_FECHA.exec(texto);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

// Número entero de días desde 1970-01-01 (UTC) de una fecha ya validada
function aNumeroDia(texto) {
  const [anio, mes, dia] = texto.split("-").map(Number);
  return Math.round(Date.UTC(anio, mes - 1, dia) / MS_DIA);
}

function deNumeroDia(numero) {
  const fecha = new Date(numero * MS_DIA);
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getUTCDate()).padStart(2, "0");
  return `${String(fecha.getUTCFullYear()).padStart(4, "0")}-${mm}-${dd}`;
}

// 0 = domingo ... 6 = sábado
function diaSemana(texto) {
  return new Date(aNumeroDia(texto) * MS_DIA).getUTCDay();
}

function esFinDeSemana(texto) {
  const d = diaSemana(texto);
  return d === 0 || d === 6;
}

// Año leído del texto (sin zona horaria); null si no es fecha válida
function anioDeFecha(texto) {
  return esFechaValida(texto) ? Number(texto.slice(0, 4)) : null;
}

/**
 * Valida un rango de fechas. Devuelve { ok: true } o { ok: false, mensaje }.
 * Exige formato estricto, fin >= inicio y no más de MAX_DIAS_RANGO días naturales.
 */
function validarRango(inicio, fin, maximo = MAX_DIAS_RANGO) {
  if (!esFechaValida(inicio) || !esFechaValida(fin)) {
    return { ok: false, mensaje: "Las fechas deben ser válidas con formato AAAA-MM-DD" };
  }
  const total = aNumeroDia(fin) - aNumeroDia(inicio) + 1;
  if (total < 1) {
    return { ok: false, mensaje: "La fecha final no puede ser anterior a la fecha inicial" };
  }
  if (total > maximo) {
    return { ok: false, mensaje: `El rango no puede exceder ${maximo} días` };
  }
  return { ok: true, total };
}

const comoConjunto = (noHabiles) =>
  noHabiles instanceof Set ? noHabiles : new Set(noHabiles || []);

// Todos los días naturales del rango (inclusive)
function listarDias(inicio, fin) {
  const dias = [];
  for (let n = aNumeroDia(inicio); n <= aNumeroDia(fin); n++) dias.push(deNumeroDia(n));
  return dias;
}

// Días hábiles (lun-vie que no estén en noHabiles) del rango, en orden
function listarDiasHabiles(inicio, fin, noHabiles) {
  const excluidos = comoConjunto(noHabiles);
  return listarDias(inicio, fin).filter((f) => !esFinDeSemana(f) && !excluidos.has(f));
}

function contarDiasHabiles(inicio, fin, noHabiles) {
  return listarDiasHabiles(inicio, fin, noHabiles).length;
}

/**
 * Primer día (de `dias`, ya ordenados) cuya ocupación alcanza el cupo, o null.
 * @param {string[]} dias días hábiles a revisar
 * @param {Map<string, number>|Object} ocupacion aprobadas del departamento por fecha
 * @param {number|null} cupo null/undefined = sin cupo (no bloquea)
 */
function primeraFechaLlena(dias, ocupacion, cupo) {
  return fechasLlenas(dias, ocupacion, cupo)[0] || null;
}

function fechasLlenas(dias, ocupacion, cupo) {
  if (cupo === null || cupo === undefined) return [];
  const leer = (f) => (ocupacion instanceof Map ? ocupacion.get(f) : ocupacion && ocupacion[f]) || 0;
  return dias.filter((f) => leer(f) >= cupo);
}

module.exports = {
  MAX_DIAS_RANGO,
  esFechaValida,
  aNumeroDia,
  deNumeroDia,
  diaSemana,
  esFinDeSemana,
  anioDeFecha,
  validarRango,
  listarDias,
  listarDiasHabiles,
  contarDiasHabiles,
  primeraFechaLlena,
  fechasLlenas,
};
