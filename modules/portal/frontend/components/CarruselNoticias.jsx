// modules/portal/frontend/components/CarruselNoticias.jsx
import { useState, useEffect, useCallback } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace("/api", "");

const GRADIENTES = [
  "linear-gradient(135deg, #1a5276, #2e86c1)",
  "linear-gradient(135deg, #154360, #1a5276)",
  "linear-gradient(135deg, #0b3d91, #1a5276)",
  "linear-gradient(135deg, #1a5276, #0b5394)",
];

export default function CarruselNoticias({
  noticias = [],
  autoPlay = true,
  intervalo = 5000,
}) {
  const [indiceNoticia, setIndiceNoticia] = useState(0);
  const [indiceImagen, setIndiceImagen] = useState(0);
  const [pausado, setPausado] = useState(false);

  const noticia = noticias[indiceNoticia] || null;
  const imagenes = noticia?.imagenes || [];

  // Al cambiar de noticia, reiniciar índice de imagen
  useEffect(() => {
    setIndiceImagen(0);
  }, [indiceNoticia]);

  const siguienteNoticia = useCallback(() => {
    setIndiceNoticia((i) => (i + 1) % noticias.length);
  }, [noticias.length]);

  const anteriorNoticia = () =>
    setIndiceNoticia((i) => (i - 1 + noticias.length) % noticias.length);

  const siguienteImagen = () =>
    setIndiceImagen((i) => (i + 1) % imagenes.length);
  const anteriorImagen = () =>
    setIndiceImagen((i) => (i - 1 + imagenes.length) % imagenes.length);

  useEffect(() => {
    if (!autoPlay || pausado || noticias.length <= 1) return;
    const timer = setInterval(siguienteNoticia, intervalo);
    return () => clearInterval(timer);
  }, [autoPlay, pausado, siguienteNoticia, intervalo, noticias.length]);

  // Swipe táctil
  const [touchStart, setTouchStart] = useState(null);
  function onTouchStart(e) {
    setTouchStart(e.touches[0].clientX);
  }
  function onTouchEnd(e) {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? siguienteNoticia() : anteriorNoticia();
    setTouchStart(null);
  }

  if (!noticias.length || !noticia) return null;

  const imagenActual = imagenes[indiceImagen];
  const tieneImagenes = imagenes.length > 0;

  return (
    <div
      className="carrusel-noticias"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Encabezado: tipo + título + subtítulo */}
      <div className="carrusel-encabezado">
        {noticia.tipo && (
          <span className="carrusel-tipo">{noticia.tipo}</span>
        )}
        <h3 className="carrusel-titulo">{noticia.titulo}</h3>
        {noticia.subtitulo && (
          <p className="carrusel-subtitulo">{noticia.subtitulo}</p>
        )}
      </div>

      {/* Zona de imagen */}
      <div className="carrusel-imagen-zona">
        {tieneImagenes ? (
          <>
            <img
              src={`${API_BASE}${imagenActual.ruta_archivo}`}
              alt={imagenActual.nombre_archivo || noticia.titulo}
              className="carrusel-imagen"
            />
            {imagenes.length > 1 && (
              <>
                <button
                  className="carrusel-flecha carrusel-flecha-izq"
                  onClick={anteriorImagen}
                >
                  ‹
                </button>
                <button
                  className="carrusel-flecha carrusel-flecha-der"
                  onClick={siguienteImagen}
                >
                  ›
                </button>
                <div className="carrusel-puntos-imagen">
                  {imagenes.map((_, i) => (
                    <button
                      key={i}
                      className={`carrusel-punto ${i === indiceImagen ? "activo" : ""}`}
                      onClick={() => setIndiceImagen(i)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div
            className="carrusel-fondo-gradiente"
            style={{ background: GRADIENTES[indiceNoticia % GRADIENTES.length] }}
          />
        )}
      </div>

      {/* Contenido */}
      {noticia.contenido && (
        <div className="carrusel-contenido">
          {noticia.contenido.length > 180
            ? `${noticia.contenido.substring(0, 180)}...`
            : noticia.contenido}
        </div>
      )}

      {/* Navegación entre noticias */}
      {noticias.length > 1 && (
        <div className="carrusel-nav-noticias">
          <button className="carrusel-nav-btn" onClick={anteriorNoticia}>
            ‹
          </button>
          <div className="carrusel-puntos-noticias">
            {noticias.map((_, i) => (
              <button
                key={i}
                className={`carrusel-punto-noticia ${i === indiceNoticia ? "activo" : ""}`}
                onClick={() => setIndiceNoticia(i)}
              />
            ))}
          </div>
          <button className="carrusel-nav-btn" onClick={siguienteNoticia}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}
