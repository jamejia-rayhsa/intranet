/** Estados de una carga: cargando (role=status), error (role=alert, con reintento) o vacío. */
export default function EstadoCarga({ cargando, error, vacio, textoVacio, onReintentar }) {
  if (cargando) return <p className="asi__estado" role="status">Cargando…</p>;
  if (error) {
    return (
      <div className="asi__aviso asi__aviso--error" role="alert">
        <span>{error}</span>
        {onReintentar && (
          <button type="button" className="asi__btn asi__btn--chico" onClick={onReintentar}>Reintentar</button>
        )}
      </div>
    );
  }
  if (vacio) return <p className="asi__estado">{textoVacio}</p>;
  return null;
}
