// modules/portal/frontend/components/ComunicadosGrid.jsx
import Icons from './Icons';

/**
 * ComunicadosGrid — grid responsive de comunicados oficiales.
 *
 * Cada comunicado se renderiza como tarjeta con folio, categoría/urgencia,
 * resumen y CTA "Leer". Al hacer clic dispara `onOpen(noticia)`.
 *
 * Soporta entidades de `noticias` con `tipo === 'comunicado'` o cualquier
 * forma con { id, titulo, subtitulo|contenido, fecha_publicacion, folio|codigo, urgente }.
 */
export default function ComunicadosGrid({ comunicados = [], onOpen, verArchivoTo }) {
  return (
    <section className="seccion">
      <div className="seccion-head">
        <h2 className="seccion-titulo">{Icons.megaphone} Comunicados y boletines</h2>
        {verArchivoTo && (
          <a href={verArchivoTo} className="seccion-link">
            Archivo completo {Icons.arrUR}
          </a>
        )}
      </div>

      <div className="com-grid">
        {comunicados.map(c => {
          const urgent = c.urgente || c.es_urgente;
          const folio = c.folio || c.codigo || (c.id ? `N-${String(c.id).padStart(3, '0')}` : '');
          const cat = c.categoria || c.tipo_etiqueta || 'Comunicado';
          const fecha = c.fecha_publicacion ? new Date(c.fecha_publicacion).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '';
          const excerpt = c.subtitulo || (c.contenido && c.contenido.length > 140 ? c.contenido.slice(0, 140) + '…' : c.contenido);

          return (
            <article
              key={c.id}
              className={`com-card ${urgent ? 'is-urgent' : ''}`}
              onClick={() => onOpen?.(c)}
            >
              <div className="com-card__head">
                <span className={`badge ${urgent ? 'badge-urgente' : 'badge-comunicado'}`}>
                  {urgent ? 'Urgente' : cat}
                </span>
                {folio && <span className="com-card__code">#{folio}</span>}
              </div>
              <div className="com-card__body">
                <h3 className="com-card__titulo">{c.titulo}</h3>
                {excerpt && <p className="com-card__excerpt">{excerpt}</p>}
              </div>
              <div className="com-card__foot">
                <span>{fecha}</span>
                <span className="com-card__leer">Leer {Icons.arrUR}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
