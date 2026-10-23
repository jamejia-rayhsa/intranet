// Periodos, recálculo y ajustes pendientes de Asistencia (pantalla de RH). Lógica pura (sin imports).
export const AVISO_CIERRE_AUTOMATICO =
  'El cierre automático rige desde la quincena 16-31 oct; las anteriores se cierran a mano.';
export const ADVERTENCIA_CIERRE =
  'Cerrar congela el resultado: los días de la quincena ya no se recalculan, aunque cambien los turnos, las vacaciones o los permisos. Para corregirla después hay que reabrirla con un motivo.';
export const MOTIVO_REAPERTURA_MIN = 10;
export const MOTIVO_REAPERTURA_MAX = 500;
export const MAX_DIAS_RECALCULO = 92;
export const NOTA_MAX = 500;
export const MENSAJE_OCUPADO = 'El motor está recalculando en este momento. Espera unos segundos y vuelve a intentarlo.';

const tiempo = (f) => {
  const [a, m, d] = f.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};
const esFecha = (valor) => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return a >= 1900 && a <= 2200 && f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};

/** El servidor responde 409 «Hay un recálculo en curso…» cuando el motor está ocupado. */
export function esConflictoOcupado(err) {
  return Boolean(err && err.status === 409 && /rec[aá]lculo en curso/i.test(String(err.message || '')));
}

/** Mensaje amable para el error de una acción de periodos (el 409 de «ocupado» no es un fallo). */
export function mensajeAccionPeriodo(err, porDefecto) {
  if (esConflictoOcupado(err)) return MENSAJE_OCUPADO;
  if (err && err.status === 403) return 'No tienes permiso para esta acción.';
  return (err && err.message) || porDefecto;
}

/** Texto del cierre: «Automático el …», «Manual el …» o «—» (abierta). `fecha(iso)` la inyecta quien llama. */
export function textoCierre(p, fecha) {
  if (!p || p.estado !== 'cerrado') return 'Abierta';
  const cuando = p.cerrado_en && fecha ? fecha(p.cerrado_en) : '';
  return `${p.tipo_cierre === 'auto' ? 'Cierre automático' : 'Cierre manual'}${cuando ? ` · ${cuando}` : ''}`;
}

/** ¿Se puede cerrar? La quincena debe estar abierta y haber terminado (fecha_fin anterior a hoy). */
export function estadoCerrar(p, hoy) {
  if (!p || p.estado !== 'abierto') return { puede: false, motivo: '' };
  if (!(p.fecha_fin < hoy)) return { puede: false, motivo: 'La quincena aún no termina: solo se cierra una quincena ya terminada.' };
  return { puede: true, motivo: '' };
}

/** Datos que se muestran en la confirmación de cierre. */
export function resumenCierre(p, sinIdentificador) {
  const pendientes = Number(p && p.dias_pendientes) || 0;
  const ajustes = Number(p && p.ajustes_pendientes) || 0;
  const sinId = Number.isFinite(sinIdentificador) ? sinIdentificador : null;
  const hayRiesgo = pendientes > 0 || ajustes > 0 || (sinId !== null && sinId > 0);
  return { pendientes, ajustes, sinIdentificador: sinId, hayRiesgo };
}

export function validarMotivoReapertura(motivo) {
  const t = String(motivo || '').trim();
  if (t.length < MOTIVO_REAPERTURA_MIN) return `El motivo es obligatorio (mínimo ${MOTIVO_REAPERTURA_MIN} caracteres).`;
  if (t.length > MOTIVO_REAPERTURA_MAX) return `El motivo no puede superar ${MOTIVO_REAPERTURA_MAX} caracteres.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t)) return 'El motivo contiene caracteres no válidos.';
  return '';
}

/** Error del formulario de recálculo, o ''. */
export function validarRecalculo({ desde, hasta }) {
  if (!esFecha(desde) || !esFecha(hasta)) return 'Indica la fecha inicial y la final.';
  if (hasta < desde) return 'La fecha final no puede ser anterior a la inicial.';
  if (Math.round((tiempo(hasta) - tiempo(desde)) / 86400000) + 1 > MAX_DIAS_RECALCULO) return `El rango no puede superar ${MAX_DIAS_RECALCULO} días.`;
  return '';
}

/**
 * Aviso previo al recálculo: qué quincenas del rango están cerradas (sus días se omiten) y cuáles abiertas.
 * @returns {{abiertos:number, cerrados:number, texto:string, sinAbiertas:boolean}}
 */
export function avisoRecalculo(desde, hasta, periodos) {
  const toca = (p) => p.fecha_inicio <= hasta && p.fecha_fin >= desde;
  const lista = (Array.isArray(periodos) ? periodos : []).filter(toca);
  const abiertos = lista.filter((p) => p.estado === 'abierto').length;
  const cerrados = lista.length - abiertos;
  let texto = '';
  if (lista.length > 0 && abiertos === 0) texto = 'Todas las quincenas del rango están cerradas: no se recalculará nada. Reabre la quincena en la tabla de arriba.';
  else if (cerrados > 0) texto = `${cerrados} ${cerrados === 1 ? 'quincena cerrada' : 'quincenas cerradas'} del rango no se ${cerrados === 1 ? 'recalcula' : 'recalculan'}; solo las abiertas.`;
  return { abiertos, cerrados, texto, sinAbiertas: lista.length > 0 && abiertos === 0 };
}

export function textoResultadoRecalculo(d) {
  const ev = Number(d.dias_evaluados) || 0;
  const mod = Number(d.dias_modificados) || 0;
  const om = Number(d.dias_omitidos_cerrados) || 0;
  return `Recálculo terminado: ${ev} ${ev === 1 ? 'día evaluado' : 'días evaluados'}, ${mod} ${mod === 1 ? 'modificado' : 'modificados'}${om ? `, ${om} omitidos por estar en quincenas cerradas` : ''}.`;
}

export function validarNotaAjuste(nota) {
  const t = String(nota || '').trim();
  if (t.length > NOTA_MAX) return `La nota no puede superar ${NOTA_MAX} caracteres.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t)) return 'La nota contiene caracteres no válidos.';
  return '';
}

export const MOTIVO_AJUSTE = {
  marca_posterior_cierre: 'Marca llegada después del cierre',
  marca_vinculada_posterior_cierre: 'Marca vinculada a un empleado después del cierre',
};

export const TIPO_EJECUCION = {
  incremental: 'Incremental', completa: 'Completa', manual: 'Recálculo manual', cierre: 'Cierre', reapertura: 'Reapertura',
};
export const ESTADO_EJECUCION = {
  en_curso: { texto: 'En curso', tono: 'info' },
  ok: { texto: 'Correcta', tono: 'ok' },
  parcial: { texto: 'Parcial', tono: 'aviso' },
  error: { texto: 'Con error', tono: 'error' },
};
export const ERRORES_EJECUCION = {
  tiempo_excedido: 'La vuelta superó el tiempo máximo y se canceló; se reintenta sola.',
  interrumpida: 'La vuelta se interrumpió (apagado del servidor); se reintenta sola.',
};
export function textoErrorEjecucion(error) {
  if (!error) return '';
  const e = String(error);
  return ERRORES_EJECUCION[e] || `Error del motor (${e.slice(0, 60)})`;
}
