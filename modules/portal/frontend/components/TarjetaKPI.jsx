export default function TarjetaKPI({ titulo, valor, color = 'var(--color-primario)', icono }) {
  return (
    <div
      className="tarjeta-kpi"
      style={{ borderTopColor: color }}
    >
      <div className="kpi-titulo">
        {icono && <span className="kpi-icono">{icono}</span>}
        {titulo}
      </div>
      <div className="kpi-valor">{valor ?? '—'}</div>
    </div>
  );
}
