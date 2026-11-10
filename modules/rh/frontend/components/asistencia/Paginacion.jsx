/** Paginación anterior/siguiente con el rango visible anunciado (aria-live). `total` puede ser null. */
export default function Paginacion({ pagina, paginasTotales, texto, onCambiar, deshabilitado = false }) {
  const hayMas = paginasTotales === null ? true : pagina < paginasTotales;
  return (
    <nav className="asi__pag" aria-label="Paginación">
      <button type="button" className="asi__btn" onClick={() => onCambiar(pagina - 1)} disabled={deshabilitado || pagina <= 1}>
        Anterior
      </button>
      <span className="asi__pag-texto" role="status" aria-live="polite">
        {texto}{paginasTotales ? ` · página ${pagina} de ${paginasTotales}` : ` · página ${pagina}`}
      </span>
      <button type="button" className="asi__btn" onClick={() => onCambiar(pagina + 1)} disabled={deshabilitado || !hayMas}>
        Siguiente
      </button>
    </nav>
  );
}
