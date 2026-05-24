// modules/portal/frontend/components/KPICard.jsx
import Icons from './Icons';

const KPI_ICONS = {
  primary:  Icons.chart,
  success:  Icons.shield,
  warning:  Icons.clock,
  danger:   Icons.bell,
  info:     Icons.news,
  neutral:  Icons.building,
};

/**
 * KPICard — tarjeta de métrica con accent stripe.
 * @param {string} label - Texto de la métrica (ej. "Total tickets")
 * @param {string|number} valor - Valor principal (ej. 348)
 * @param {'primary'|'success'|'warning'|'danger'|'info'|'neutral'} accent
 * @param {React.ReactNode} icon - Icono opcional (sobrescribe el por defecto del accent)
 * @param {string} delta - Texto pequeño con tendencia (ej. "+12 esta semana")
 */
export default function KPICard({ label, valor, accent = 'primary', icon, delta }) {
  const resolvedIcon = icon ?? KPI_ICONS[accent] ?? Icons.chart;
  const deltaCls = delta && delta.startsWith('+') ? 'is-up'
                  : delta && delta.startsWith('-') ? 'is-down' : '';

  return (
    <div className={`kpi-card kpi-${accent}`}>
      <div className="kpi-card__head">
        <span className="kpi-card__icon">{resolvedIcon}</span>
        {delta && <span className={`kpi-card__delta ${deltaCls}`}>{delta}</span>}
      </div>
      <span className="kpi-card__valor">{valor ?? '—'}</span>
      <span className="kpi-card__label">{label}</span>
    </div>
  );
}
