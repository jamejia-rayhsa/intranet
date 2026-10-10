// modules/portal/frontend/components/NewsCarousel.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Icons from './Icons';
import { urlImagenNoticia } from '../utils/storage';

/**
 * NewsCarousel — carrusel de publicaciones (noticias y comunicados) a pantalla completa.
 *
 * Cada publicación ocupa todo el alto del área de contenido: la imagen de fondo y, al pie,
 * sobre un degradado, la etiqueta, la fecha, el título, el resumen y "Leer artículo".
 * La pista usa scroll-snap horizontal: en móvil se desliza con el dedo; en escritorio hay
 * flechas, barras de progreso clicables y las teclas ← →. Sin imagen se usa un fondo institucional.
 *
 * @param {Array} noticias — entidades crudas del backend (titulo, subtitulo, contenido, tipo, fecha_publicacion, imagenes)
 * @param {(noticia) => void} onOpen — se llama al hacer clic en una publicación
 * @param {string} [verTodasTo] — ruta del archivo completo (default /noticias)
 */
const ETIQUETAS = { comunicado: 'Comunicado', oferta_empleo: 'Oferta' };

function textoPlano(valor) {
  return String(valor || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function resumenDe(n) {
  if (n.subtitulo) return textoPlano(n.subtitulo);
  const texto = textoPlano(n.contenido);
  return texto.length > 180 ? texto.slice(0, 180).trimEnd() + '…' : texto;
}

export default function NewsCarousel({ noticias = [], onOpen, verTodasTo = '/noticias' }) {
  const pistaRef = useRef(null);
  const [activo, setActivo] = useState(0);
  const total = noticias.length;

  // El índice activo sale de la posición real del scroll (sirve para flechas, barras y deslizar)
  const actualizar = useCallback(() => {
    const el = pistaRef.current;
    if (!el || !el.clientWidth) return;
    setActivo(Math.min(total - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  }, [total]);

  useEffect(() => {
    const el = pistaRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', actualizar, { passive: true });
    window.addEventListener('resize', actualizar);
    actualizar();
    return () => {
      el.removeEventListener('scroll', actualizar);
      window.removeEventListener('resize', actualizar);
    };
  }, [actualizar]);

  const irA = (indice) => {
    const el = pistaRef.current;
    if (!el || total === 0) return;
    const destino = (indice + total) % total;
    el.scrollTo({ left: destino * el.clientWidth, behavior: 'smooth' });
  };

  const alPulsarTecla = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); irA(activo - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); irA(activo + 1); }
  };

  if (total === 0) return null;

  return (
    <section
      className="news-hero"
      role="region"
      aria-roledescription="carrusel"
      aria-label="Noticias y comunicados"
      tabIndex={0}
      onKeyDown={alPulsarTecla}
    >
      <div className="news-hero__pista" ref={pistaRef}>
        {noticias.map((n, i) => {
          const imagen = n.imagenes?.[0];
          const fecha = n.fecha_publicacion
            ? new Date(n.fecha_publicacion).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
            : null;
          const resumen = resumenDe(n);
          const tipo = n.tipo === 'comunicado' ? 'comunicado' : n.tipo === 'oferta_empleo' ? 'oferta' : 'noticia';
          return (
            <article
              className="news-hero__slide"
              key={n.id}
              onClick={() => onOpen?.(n)}
              aria-roledescription="diapositiva"
              aria-label={`${i + 1} de ${total}`}
            >
              {imagen ? (
                <img
                  className="news-hero__imagen"
                  src={urlImagenNoticia(imagen)}
                  alt=""
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                />
              ) : (
                <div className="news-hero__sin-imagen" aria-hidden="true" />
              )}
              <div className="news-hero__velo" aria-hidden="true" />
              <div className="news-hero__info">
                <div className="news-hero__meta">
                  <span className={`badge badge-${tipo}`}>{ETIQUETAS[n.tipo] || n.tipo || 'Noticia'}</span>
                  {fecha && <span>{fecha}</span>}
                  {n.tiempo_lectura && <span>{n.tiempo_lectura} min de lectura</span>}
                </div>
                <h3 className="news-hero__titulo">{n.titulo}</h3>
                {resumen && <p className="news-hero__resumen">{resumen}</p>}
                <span className="news-hero__cta">Leer artículo {Icons.arrUR}</span>
              </div>
            </article>
          );
        })}
      </div>

      {total > 1 && (
        <div className="news-hero__barras">
          {noticias.map((n, i) => (
            <button
              key={n.id}
              type="button"
              className={`news-hero__barra ${i === activo ? 'is-activa' : ''}`}
              onClick={() => irA(i)}
              aria-label={`Ir a la publicación ${i + 1}`}
              aria-current={i === activo}
            />
          ))}
        </div>
      )}
      <Link to={verTodasTo} className="news-hero__todas">Ver todas {Icons.arrUR}</Link>

      {total > 1 && (
        <>
          <button type="button" className="news-hero__flecha news-hero__flecha--izq" onClick={() => irA(activo - 1)} aria-label="Anterior">{Icons.arrL}</button>
          <button type="button" className="news-hero__flecha news-hero__flecha--der" onClick={() => irA(activo + 1)} aria-label="Siguiente">{Icons.arrR}</button>
        </>
      )}
    </section>
  );
}
