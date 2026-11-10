/**
 * BarraProgreso — barra de progreso/semáforo reutilizable (porcentaje + color).
 * @param {number} porcentaje - 0 a 100 (se recorta fuera de ese rango)
 * @param {string} color - color de relleno (var CSS o hex)
 * @param {string} etiqueta - texto opcional arriba de la barra (ej. "68% consumido")
 */
export default function BarraProgreso({ porcentaje, color = 'var(--color-primario)', etiqueta }) {
  const pct = Math.max(0, Math.min(100, Number(porcentaje) || 0));
  return (
    <div className="barra-progreso">
      {etiqueta && <div className="barra-progreso__etiqueta">{etiqueta}</div>}
      <div className="barra-progreso__pista">
        <div className="barra-progreso__relleno" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
