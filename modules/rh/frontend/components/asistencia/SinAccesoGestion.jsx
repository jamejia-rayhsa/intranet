/** Cuerpo de las pantallas de gestión mientras no hay acceso: cargando, fallo al leer permisos (con reintento) o sin permiso. */
export default function SinAccesoGestion({ acceso, tituloRef, titulo }) {
  return (
    <div className="asi asr">
      <h1 ref={tituloRef} tabIndex={-1}>{titulo}</h1>
      {acceso.cargando && <p className="asi__estado" role="status">Cargando…</p>}
      {acceso.error && (
        <div className="asi__aviso asi__aviso--error" role="alert">
          <span>No se pudieron cargar tus permisos. Revisa tu conexión e inténtalo de nuevo.</span>
          <button type="button" className="asi__btn asi__btn--chico" onClick={acceso.reintentar}>Reintentar</button>
        </div>
      )}
      {!acceso.cargando && !acceso.error && !acceso.puedeLeer && (
        <p className="asi__aviso asi__aviso--error" role="alert">No tienes permiso para consultar la gestión de asistencia.</p>
      )}
    </div>
  );
}
