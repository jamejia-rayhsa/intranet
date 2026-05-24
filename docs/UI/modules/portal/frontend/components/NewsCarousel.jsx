// modules/portal/frontend/components/NewsCarousel.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import Icons from './Icons';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace('/api', '');

/**
 * NewsCarousel — rail horizontal con scroll-snap + chips de filtro.
 *
 * Reemplaza al antiguo CarruselNoticias.jsx con un layout editorial-friendly.
 *
 * @param {Array} noticias — entidades crudas del backend (cada una con titulo, tipo, fecha_publicacion, imagenes, etc.)
 * @param {(noticia) => void} onOpen — callback al hacer clic en una tarjeta
 * @param {string[]} [categorias] — chips de filtro. Default = ['Todas', ...los `tipo` únicos de noticias]
 */
export default function NewsCarousel({ noticias = [], onOpen, categorias }) {
  const [active, setActive] = useState('Todas');
  const railRef = useRef(null);
  const [s, setS] = useState({ atStart: true, atEnd: false });

  const cats = useMemo(() => {
    if (categorias) return categorias;
    const tipos = Array.from(new Set(noticias.map(n => n.tipo).filter(Boolean)));
    return ['Todas', ...tipos];
  }, [noticias, categorias]);

  const filtered = useMemo(
    () => active === 'Todas' ? noticias : noticias.filter(n => n.tipo === active),
    [active, noticias]
  );

  const update = () => {
    const el = railRef.current; if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setS({ atStart: el.scrollLeft <= 4, atEnd: el.scrollLeft >= max - 4 });
  };
  useEffect(() => {
    update();
    const el = railRef.current; if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    return () => el.removeEventListener('scroll', update);
  }, [filtered.length]);

  const scrollBy = (dir) => {
    const el = railRef.current; if (!el) return;
    el.scrollBy({ left: dir * (340 + 16), behavior: 'smooth' });
  };

  return (
    <section className="seccion">
      <div className="seccion-head">
        <h2 className="seccion-titulo">{Icons.news} Noticias</h2>
        <div className="news-controls">
          <span className="seccion-meta">{filtered.length} publicaciones</span>
          <div className="news-nav">
            <button onClick={() => scrollBy(-1)} disabled={s.atStart} aria-label="Anterior">{Icons.arrL}</button>
            <button onClick={() => scrollBy(1)} disabled={s.atEnd} aria-label="Siguiente">{Icons.arrR}</button>
          </div>
        </div>
      </div>

      {cats.length > 1 && (
        <div className="chips">
          {cats.map(c => (
            <button
              key={c}
              className={`chip ${active === c ? 'is-active' : ''}`}
              onClick={() => setActive(c)}
            >{c}</button>
          ))}
        </div>
      )}

      <div className="news-rail-wrap">
        <div className="news-rail" ref={railRef}>
          {filtered.map(n => {
            const primera = n.imagenes?.[0];
            const fecha = n.fecha_publicacion ? new Date(n.fecha_publicacion).toLocaleDateString('es-MX') : null;
            return (
              <article
                className="news-card"
                key={n.id}
                onClick={() => onOpen?.(n)}
              >
                <div
                  className="news-card__media"
                  style={primera ? {
                    backgroundImage: `url(${API_BASE}${primera.ruta_archivo})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  } : undefined}
                >
                  <span className="news-card__badge">
                    <span className={`badge badge-${n.tipo === 'comunicado' ? 'comunicado' : n.tipo === 'oferta_empleo' ? 'oferta' : 'noticia'}`}>
                      {n.tipo === 'comunicado' ? 'Comunicado'
                        : n.tipo === 'oferta_empleo' ? 'Oferta'
                        : (n.tipo || 'Noticia')}
                    </span>
                  </span>
                  {!primera && <span className="ph">Sin imagen</span>}
                </div>
                <div className="news-card__body">
                  <div className="news-card__meta">
                    {fecha && <><span>{fecha}</span><span className="sep" /></>}
                    {n.tiempo_lectura && <span>{n.tiempo_lectura} min de lectura</span>}
                  </div>
                  <h3 className="news-card__titulo">{n.titulo}</h3>
                  <span className="news-card__cta">
                    Leer artículo <span className="arrow">{Icons.arrUR}</span>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
