import { urlImagenNoticia } from "../utils/storage";
import ImagenVertical from "./ImagenVertical";
import { etiquetaTipo, esBoletin, esEvento, eventoFinalizado, textoFechaLugar, tieneImagen } from "../utils/tiposNoticia";

const iconosPorTipo = {
  noticia: "📰",
  comunicado: "📢",
  oferta_empleo: "💼",
  evento: "📅",
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
 * Un evento se muestra como una noticia (portada, etiqueta, título) con fecha y lugar al pie, badge
 * "Finalizado" si ya pasó, y se abre igual con `onAbrir`.
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

  const evento = esEvento(noticia);

  return (
    <article
      className={`noticia-tarjeta ${clasesPorTipo[noticia.tipo] || ""} ${evento ? "noticia-tarjeta--evento" : ""}`.trim()}
      onClick={evento ? () => onAbrir?.(noticia) : undefined}
    >
      <ImagenVertical
        src={primeraImagen ? urlImagenNoticia(primeraImagen) : ""}
        alt={noticia.titulo}
        iconoVacio={iconosPorTipo[noticia.tipo]}
        className="imagen-vertical--tarjeta"
      />

      <div className="noticia-encabezado">
        <span className="noticia-icono">{iconosPorTipo[noticia.tipo] || "📄"}</span>
        <span className={`badge ${clasesPorTipo[noticia.tipo] || ""}`}>
          {etiquetaTipo(noticia.tipo)}
        </span>
        {evento && eventoFinalizado(noticia.fecha_evento) && <span className="badge badge-finalizado">Finalizado</span>}
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

      {evento ? (
        <div className="noticia-pie noticia-pie--evento">
          <span className="noticia-fecha-lugar">{textoFechaLugar(noticia)}</span>
          {/* El clic de la tarjeta abre el detalle; el botón permite hacerlo con teclado */}
          <button type="button" className="noticia-ver-detalle" aria-label={`Ver detalle del evento ${noticia.titulo}`}>
            Ver detalle
          </button>
        </div>
      ) : (
        <div className="noticia-pie">
          <span className="noticia-autor">
            Por: {noticia.autor_nombre} {noticia.autor_apellido}
          </span>
          <span className="noticia-fecha">
            {new Date(noticia.fecha_publicacion).toLocaleDateString("es-MX")}
          </span>
        </div>
      )}
    </article>
  );
}
