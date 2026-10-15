// modules/portal/frontend/components/ImagenVertical.jsx
import { useState } from 'react';

/**
 * ImagenVertical — marco vertical 2:3 (hasta 500 x 750 px) para imágenes de noticias.
 *
 * La imagen se muestra COMPLETA (object-fit: contain) sobre un fondo desenfocado hecho con
 * la misma imagen. El tamaño del marco lo limita la variable CSS `--iv-alto-max` (por defecto
 * 750px), que cada contexto (carrusel, modal, tarjeta) puede redefinir para no desbordar la ventana.
 *
 * @param {string} [src] — URL de la imagen; si falta se pinta el placeholder institucional
 * @param {string} [alt] — texto alternativo ("" cuando la imagen es decorativa)
 * @param {boolean} [prioritaria] — true para la imagen visible al cargar (carga inmediata)
 * @param {string} [className] — clases extra para el marco (modificadores por contexto)
 * @param {string} [iconoVacio] — icono del placeholder (📄 por defecto; 📅 para eventos)
 * @param {string} [textoVacio] — leyenda bajo el 📄 cuando no hay imagen (p. ej. "Sin imagen")
 * @param {React.ReactNode} [children] — contenido superpuesto dentro del marco (texto, etiquetas)
 */export default function ImagenVertical({ src, alt = '', prioritaria = false, className = '', textoVacio = '', iconoVacio = '📄', children }) {
  // Si la imagen no carga (404, red) se muestra el placeholder en lugar del icono roto del navegador
  const [srcFallida, setSrcFallida] = useState(null);
  const hayImagen = Boolean(src) && srcFallida !== src;
  return (
    <div className={`imagen-vertical ${className}`.trim()}>
      {hayImagen ? (
        <>
          <img
            className="imagen-vertical__fondo"
            src={src}
            alt=""
            aria-hidden="true"
            loading={prioritaria ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            onError={() => setSrcFallida(src)}
          />
          <img
            className="imagen-vertical__imagen"
            src={src}
            alt={alt}
            loading={prioritaria ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            onError={() => setSrcFallida(src)}
          />
        </>
      ) : (
        <div className="imagen-vertical__vacia" aria-hidden="true">
          <span>{iconoVacio}</span>
          {textoVacio && <small className="imagen-vertical__texto-vacio">{textoVacio}</small>}
        </div>
      )}
      {children}
    </div>
  );
}
