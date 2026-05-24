// modules/portal/frontend/components/BarChart.jsx
/**
 * BarChart — gráfica de barras SVG (simple o stacked).
 * @param {Array} data - [{ label, [seriesKey]: number }]
 * @param {Array} series - [{ key, color, label }]
 * @param {number} height
 * @param {boolean} stacked
 */
export default function BarChart({ data = [], series = [], height = 220, stacked = false }) {
  const padding = { top: 20, right: 12, bottom: 28, left: 36 };
  const W = 600;
  const innerW = W - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const totals = data.map(d => series.reduce((s, sr) => s + (d[sr.key] || 0), 0));
  const max = Math.max(...(stacked ? totals : data.flatMap(d => series.map(sr => d[sr.key] || 0))), 1);
  const niceMax = Math.ceil(max / 5) * 5;
  const barGroupW = data.length > 0 ? innerW / data.length : 0;
  const barGap = 6;
  const barW = stacked
    ? barGroupW * 0.55
    : (barGroupW - barGap * (series.length + 1)) / Math.max(series.length, 1);

  const gridY = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y: padding.top + innerH * (1 - t),
    value: Math.round(niceMax * t),
  }));

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="chart-svg" preserveAspectRatio="xMidYMid meet">
      {gridY.map((g, i) => (
        <g key={i}>
          <line x1={padding.left} x2={W - padding.right} y1={g.y} y2={g.y} stroke="#e2e5ea" strokeDasharray={i === 0 ? '0' : '2 3'} />
          <text x={padding.left - 6} y={g.y + 3} textAnchor="end" fontSize="10" fill="#a0aec0">{g.value}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const groupX = padding.left + i * barGroupW;
        if (stacked) {
          let acc = 0;
          return (
            <g key={i}>
              {series.map((sr, si) => {
                const val = d[sr.key] || 0;
                const h = (val / niceMax) * innerH;
                const y = padding.top + innerH - acc - h;
                acc += h;
                return <rect key={si} x={groupX + (barGroupW - barW) / 2} y={y} width={barW} height={h} fill={sr.color} />;
              })}
              <text x={groupX + barGroupW / 2} y={height - 10} textAnchor="middle" fontSize="10" fill="#718096">{d.label}</text>
            </g>
          );
        }
        return (
          <g key={i}>
            {series.map((sr, si) => {
              const val = d[sr.key] || 0;
              const h = (val / niceMax) * innerH;
              const y = padding.top + innerH - h;
              const x = groupX + barGap + si * (barW + barGap);
              return <rect key={si} x={x} y={y} width={barW} height={h} fill={sr.color} rx={2} />;
            })}
            <text x={groupX + barGroupW / 2} y={height - 10} textAnchor="middle" fontSize="10" fill="#718096">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
