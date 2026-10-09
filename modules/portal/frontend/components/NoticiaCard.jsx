import { urlImagenNoticia } from "../utils/storage";

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

const etiquetas = {
  noticia: "Noticia",
  comunicado: "Comunicado",
  oferta_empleo: "Oferta de Empleo",
};

export default function NoticiaCard({ noticia }) {
  const primeraImagen = noticia.imagenes?.[0];

  return (
    <article className={`noticia-tarjeta ${clasesPorTipo[noticia.tipo] || ""}`}>
      {primeraImagen && (
        <div className="noticia-imagen-preview">
          <img
            src={`${urlImagenNoticia(primeraImagen)}`}
            alt={noticia.titulo}
          />
        </div>
      )}

      <div className="noticia-encabezado">
        <span className="noticia-icono">{iconosPorTipo[noticia.tipo] || "📄"}</span>
        <span className={`badge ${clasesPorTipo[noticia.tipo] || ""}`}>
          {etiquetas[noticia.tipo] || noticia.tipo}
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
