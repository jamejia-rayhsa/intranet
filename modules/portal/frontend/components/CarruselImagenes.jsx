// modules/portal/frontend/components/CarruselImagenes.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import ImagenVertical from './ImagenVertical';
import Icons from './Icons';
import { urlImagenNoticia } from '../utils/storage';

/**
 * CarruselImagenes — carrusel de las imágenes de una publicación (detalle de un evento).
 *
 * Cada slide es un marco 2:3 (ImagenVertical) centrado. Scroll-snap horizontal (deslizar), flechas,
 * puntos y teclas ← →. Sin autoavance. Con una sola imagen no hay flechas ni puntos.
 * El tamaño del marco lo fija `claseMarco` (variable --iv-alto-max, ver rayhsa-system.css).
 *
 * @param {Array} imagenes — imágenes de la entidad (ruta_archivo / url), ya ordenadas
 * @param {string} [alt] — texto alternativo base de cada imagen
 * @param {string} [iconoVacio] — icono si una imagen no carga o no hay imágenes (📅 por defecto)
 * @param {string} [claseMarco] — clase del marco (por defecto el tamaño del modal)
 */
export default function CarruselImagenes({ imagenes = [], alt = '', claseMarco = 'imagen-vertical--modal', iconoVacio = '📅' }) {
  const pistaRef = useRef(null);
  const [activo, setActivo] = useState(0);
  const total = imagenes.length;

  // El índice activo sale de la posición real del scroll (flechas, puntos y deslizar)
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
    if (total < 2) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); irA(activo - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); irA(activo + 1); }
  };

  if (total === 0) return <ImagenVertical src="" iconoVacio={iconoVacio} className={claseMarco} />;

  const varias = total > 1;
  return (
    <div
      className="carrusel-imagenes"
      role="region"
      aria-roledescription="carrusel"
      aria-label="Imágenes del evento"
      tabIndex={varias ? 0 : undefined}
      onKeyDown={alPulsarTecla}
    >
      <div className="carrusel-imagenes__pista" ref={pistaRef}>
        {imagenes.map((img, i) => (
          <div
            className="carrusel-imagenes__slide"
            key={img.id ?? i}
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${total}`}
          >
            <ImagenVertical
              src={urlImagenNoticia(img)}
              alt={`${alt} (imagen ${i + 1} de ${total})`.trim()}
              prioritaria={i === 0}
              iconoVacio={iconoVacio}
              className={claseMarco}
            />
          </div>
        ))}
      </div>

      {varias && (
        <>
          <button type="button" className="carrusel-imagenes__flecha carrusel-imagenes__flecha--izq" onClick={() => irA(activo - 1)} aria-label="Imagen anterior">{Icons.arrL}</button>
          <button type="button" className="carrusel-imagenes__flecha carrusel-imagenes__flecha--der" onClick={() => irA(activo + 1)} aria-label="Imagen siguiente">{Icons.arrR}</button>
          <div className="carrusel-imagenes__puntos">
            {imagenes.map((img, i) => (
              <button
                key={img.id ?? i}
                type="button"
                className={`carrusel-imagenes__punto ${i === activo ? 'is-activo' : ''}`}
                onClick={() => irA(i)}
                aria-label={`Ir a la imagen ${i + 1} de ${total}`}
                aria-current={i === activo}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
