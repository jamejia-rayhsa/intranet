// modules/portal/frontend/components/NewsCarousel.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Icons from './Icons';
import ImagenVertical from './ImagenVertical';
import { urlImagenNoticia } from '../utils/storage';
import { etiquetaTipo, esBoletin, esEvento, eventoFinalizado, textoFechaLugar } from '../utils/tiposNoticia';

// Nombre accesible del tipo: "Evento", "Comunicado"...
const etiquetaDe = (n) => (n.tipo === 'oferta_empleo' ? 'Oferta' : etiquetaTipo(n.tipo));

function textoPlano(valor) {
  return String(valor || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function resumenDe(n) {
  if (n.subtitulo) return textoPlano(n.subtitulo);
  const texto = textoPlano(n.contenido);
  return texto.length > 180 ? texto.slice(0, 180).trimEnd() + '…' : texto;
}

/**
 * NewsCarousel — carrusel de publicaciones (noticias y comunicados) a pantalla completa.
 *
 * Cada publicación ocupa todo el alto del área de contenido: la imagen va en un marco vertical 2:3
 * centrado (ImagenVertical, completa y sobre fondo desenfocado) y, al pie del marco, sobre un
 * degradado, la etiqueta, la fecha, el título, el resumen y "Leer artículo".
 * La pista usa scroll-snap horizontal: en móvil se desliza con el dedo; en escritorio hay
 * flechas, barras de progreso clicables y las teclas ← →. Sin imagen se usa el placeholder institucional.
 *
 * @param {Array} noticias — entidades crudas del backend (titulo, subtitulo, contenido, tipo, fecha_publicacion, imagenes)
 * @param {(noticia) => void} onOpen — se llama al hacer clic en una publicación
 * @param {string} [verTodasTo] — ruta del archivo completo (default /noticias)
 */
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

  // Si el foco está dentro de un slide (o en el botón del boletín) y el slide visible cambia
  // (teclas ← →, flechas, barras o deslizar), el foco sigue al nuevo slide activo. Si estaba en una flecha
  // lateral o en una barra de progreso no se toca. preventScroll: el scroll-snap ya lleva el slide a su sitio.
  useEffect(() => {
    const pista = pistaRef.current;
    const foco = document.activeElement;
    if (!pista || !foco || !pista.contains(foco)) return;
    const slide = pista.children[activo];
    if (!slide || slide.contains(foco)) return;
    const destino = slide.matches('[role="button"]') ? slide : slide.querySelector('button');
    if (destino) destino.focus({ preventScroll: true });
  }, [activo]);

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
          const boletin = esBoletin(n);
          const evento = esEvento(n);
          const tipo = n.tipo === 'comunicado' ? 'comunicado' : n.tipo === 'oferta_empleo' ? 'oferta' : 'noticia';
          return (
            <div
              className={`news-hero__slide ${boletin ? 'news-hero__slide--boletin' : ''}`.trim()}
              key={n.id}
              aria-roledescription="diapositiva"
              {...(boletin
                ? { 'aria-label': `Boletín, ${i + 1} de ${total}` }
                : {
                    // Un único control por slide: el propio div actúa como botón (no hay controles anidados).
                    // El clic y Enter/Espacio llaman a la misma función; el navegador no sintetiza un clic
                    // desde teclado en un div, así que el detalle nunca se abre dos veces.
                    role: 'button',
                    // Solo el slide visible entra en el orden de Tab (los demás se alcanzan con ← →, flechas o barras)
                    tabIndex: i === activo ? 0 : -1,
                    // El nombre incluye lo que se ve: en un evento, su fecha y lugar
                    'aria-label': `${etiquetaDe(n)}: ${n.titulo}${evento ? `, ${textoFechaLugar(n)}` : ''}, ${i + 1} de ${total}`,
                    onClick: () => onOpen?.(n),
                    onKeyDown: (e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(n); }
                    },
                  })}
            >
              {boletin ? (
                // Boletín: solo la imagen, dentro de un botón real (operable con teclado) que la amplía
                <button
                  type="button"
                  className="news-hero__boletin-boton imagen-vertical--carrusel"
                  tabIndex={i === activo ? 0 : -1}
                  onClick={() => onOpen?.(n)}
                  aria-label="Ampliar boletín"
                >
                  <ImagenVertical
                    src={urlImagenNoticia(imagen)}
                    alt="Boletín"
                    prioritaria={i === 0}
                    className="imagen-vertical--carrusel"
                  />
                </button>
              ) : (
                <ImagenVertical
                  src={imagen ? urlImagenNoticia(imagen) : ''}
                  alt=""
                  prioritaria={i === 0}
                  iconoVacio={evento ? '📅' : undefined}
                  className="imagen-vertical--carrusel"
                >
                  <div className="news-hero__velo" aria-hidden="true" />
                  <div className="news-hero__info">
                    <div className="news-hero__meta">
                      <span className={`badge badge-${tipo}`}>{n.tipo === 'oferta_empleo' ? 'Oferta' : etiquetaTipo(n.tipo)}</span>
                      {evento && eventoFinalizado(n.fecha_evento) && <span className="badge badge-finalizado">Finalizado</span>}
                      {evento ? <span>{textoFechaLugar(n)}</span> : fecha && <span>{fecha}</span>}
                      {n.tiempo_lectura && <span>{n.tiempo_lectura} min de lectura</span>}
                    </div>
                    <h3 className="news-hero__titulo">{n.titulo}</h3>
                    {resumen && <p className="news-hero__resumen">{resumen}</p>}
                    <span className="news-hero__cta">Leer artículo {Icons.arrUR}</span>
                  </div>
                </ImagenVertical>
              )}
            </div>
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
