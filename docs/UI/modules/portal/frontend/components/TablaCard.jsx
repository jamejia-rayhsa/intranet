// modules/portal/frontend/components/TablaCard.jsx
import { Link } from 'react-router-dom';

/**
 * TablaCard — header con título + CTA opcional, children = <table className="tabla-mod">…</table>
 * @param {string} title
 * @param {string|null} ctaLabel - texto del link "Ver todos →"
 * @param {string|null} ctaTo - ruta de react-router (Link)
 */
export default function TablaCard({ title, ctaLabel, ctaTo, children }) {
  return (
    <div className="tabla-card">
      <div className="tabla-card__head">
        <h3 className="tabla-card__title">{title}</h3>
        {ctaLabel && (
          ctaTo
            ? <Link to={ctaTo} className="tabla-card__cta">{ctaLabel}</Link>
            : <a href="#" className="tabla-card__cta" onClick={e => e.preventDefault()}>{ctaLabel}</a>
        )}
      </div>
      {children}
    </div>
  );
}
