// modules/portal/frontend/components/ChartCard.jsx
/**
 * ChartCard — contenedor con título, subtítulo, leyenda y children.
 */
export default function ChartCard({ title, sub, legend, children }) {
  return (
    <div className="chart-card">
      <div className="chart-card__head">
        <div>
          <h3 className="chart-card__title">{title}</h3>
          {sub && <p className="chart-card__sub">{sub}</p>}
        </div>
        {legend && (
          <div className="chart-legend">
            {legend.map((l, i) => (
              <span className="chart-legend__item" key={i}>
                <span className="chart-legend__dot" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
