// Sincronización de marcas: formatos de las tarjetas y del historial de lotes. Lógica pura (sin imports).
export const INTERVALO_REFRESCO_MS = 60000;
export const LOTES_POR_PAGINA = 20;

/** Entero con separador de miles de México ('250,000'); '—' si no es un número. */
export function formatoEntero(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('es-MX', { maximumFractionDigits: 0 }) : '—';
}

/** Porcentaje 'parte de total' con hasta 2 decimales ('0.03 %'); '—' sin total. */
export function porcentaje(parte, total) {
  const p = Number(parte);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return '—';
  return `${((p / t) * 100).toLocaleString('es-MX', { maximumFractionDigits: 2 })} %`;
}

const ESTATUS = {
  ok: { texto: 'Correcto', clase: 'asi__badge--ok' },
  error: { texto: 'Con error', clase: 'asi__badge--error' },
  en_curso: { texto: 'En curso', clase: 'asi__badge--aviso' },
};
export const infoEstatusLote = (estatus) => ESTATUS[estatus] || { texto: String(estatus || '—'), clase: 'asi__badge--neutro' };

/** Texto del total de marcas: '≈ 250,000' cuando es una estimación. */
export const textoTotalMarcas = (total, estimado) => `${estimado ? '≈ ' : ''}${formatoEntero(total)}`;
