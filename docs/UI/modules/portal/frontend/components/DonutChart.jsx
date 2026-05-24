// modules/portal/frontend/components/DonutChart.jsx
/**
 * DonutChart — donut SVG con leyenda lateral y total al centro.
 * @param {Array} data - [{ label, value, color }]
 */
export default function DonutChart({ data = [] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 60;
  const cx = 80, cy = 80;
  let acc = 0;
  const slices = data.map((d, i) => {
    const start = (acc / total) * 2 * Math.PI;
    const end = ((acc + d.value) / total) * 2 * Math.PI;
    acc += d.value;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.sin(start);
    const y1 = cy - r * Math.cos(start);
    const x2 = cx + r * Math.sin(end);
    const y2 = cy - r * Math.cos(end);
    return { d, i, path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z` };
  });

  return (
    <div className="donut-wrap">
      <svg className="donut-svg" viewBox="0 0 160 160">
        {slices.map(({ d, i, path }) => <path key={i} d={path} fill={d.color} />)}
        <circle cx={cx} cy={cy} r={r * 0.62} fill="#fff" />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="22" fontWeight="700" fill="#1a1f36" fontFamily="Asap, sans-serif">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill="#718096" fontFamily="Asap, sans-serif" letterSpacing="0.6">TOTAL</text>
      </svg>
      <div className="donut-legend">
        {data.map((d, i) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          return (
            <div key={i} className="donut-legend__item">
              <span className="donut-legend__dot" style={{ background: d.color }} />
              <span className="donut-legend__label">{d.label}</span>
              <span className="donut-legend__valor">{d.value} · {pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
