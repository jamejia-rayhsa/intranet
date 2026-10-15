import { urlImagenNoticia } from "../utils/storage";
import ImagenVertical from "./ImagenVertical";
import { etiquetaTipo, esBoletin, tieneImagen } from "../utils/tiposNoticia";

const iconosPorTipo = {
  noticia: "📰",
  comunicado: "📢",
  oferta_empleo: "💼",
};

const clasesPorTipo = {
  noticia: "badge-noticia",
  comunicado: "badge-comunicado",
  oferta_empleo: "badge-oferta",
};

/**
 * NoticiaCard — tarjeta de /noticias.
 * Un boletín muestra SOLO el marco de imagen (sin título, fecha, tipo, extracto ni autor) y, al
 * hacer clic, llama a `onAbrir(noticia)` para ampliarla. Un boletín sin imagen no se pinta.
 */
export default function NoticiaCard({ noticia, onAbrir }) {
  const primeraImagen = noticia.imagenes?.[0];

  if (esBoletin(noticia)) {
    if (!tieneImagen(noticia)) return null;
    return (
      <article className="noticia-tarjeta noticia-tarjeta--boletin">
        <button
          type="button"
          className="noticia-boletin-boton"
          onClick={() => onAbrir?.(noticia)}
          aria-label="Ampliar boletín"
        >
          <ImagenVertical
            src={urlImagenNoticia(primeraImagen)}
            alt="Boletín"
            className="imagen-vertical--tarjeta"
          />
        </button>
      </article>
    );
  }

  return (
    <article className={`noticia-tarjeta ${clasesPorTipo[noticia.tipo] || ""}`}>
      <ImagenVertical
        src={primeraImagen ? urlImagenNoticia(primeraImagen) : ""}
        alt={noticia.titulo}
        className="imagen-vertical--tarjeta"
      />

      <div className="noticia-encabezado">
        <span className="noticia-icono">{iconosPorTipo[noticia.tipo] || "📄"}</span>
        <span className={`badge ${clasesPorTipo[noticia.tipo] || ""}`}>
          {etiquetaTipo(noticia.tipo)}
        </span>
      </div>

      <h3>{noticia.titulo}</h3>

      {noticia.subtitulo && <p className="noticia-subtitulo">{noticia.subtitulo}</p>}

      {noticia.contenido && (
        <p className="noticia-resumen">
          {noticia.contenido.length > 200
            ? `${noticia.contenido.substring(0, 200)}...`
            : noticia.contenido}
        </p>
      )}

      <div className="noticia-pie">
        <span className="noticia-autor">
          Por: {noticia.autor_nombre} {noticia.autor_apellido}
        </span>
        <span className="noticia-fecha">
          {new Date(noticia.fecha_publicacion).toLocaleDateString("es-MX")}
        </span>
      </div>
    </article>
  );
}
