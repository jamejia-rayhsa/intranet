import { urlImagenNoticia } from "../utils/storage";
import { useState, useRef } from "react";
import {
  TIPOS_NOTICIA,
  limiteImagenes,
  esBoletin as esTipoBoletin,
  esEvento as esTipoEvento,
  etiquetaTipo,
  isoAInputLocal,
  inputLocalAIso,
} from "../utils/tiposNoticia";
import {
  crearNoticia,
  actualizarNoticia,
  subirImagenNoticia,
  eliminarImagenNoticia,
  reordenarImagenesNoticia,
} from "../services/noticias.service";

export default function NewsEditorModal({ noticiaEditar, alCerrar, alGuardar }) {
  const [formulario, setFormulario] = useState(
    noticiaEditar
      ? { ...noticiaEditar, fecha_evento: isoAInputLocal(noticiaEditar.fecha_evento), lugar: noticiaEditar.lugar || "" }
      : {
      titulo: "",
      subtitulo: "",
      contenido: "",
      tipo: "noticia",
      fecha_publicacion: new Date().toISOString().split("T")[0],
      publicada: false,
      fecha_evento: "",
      lugar: "",
    },
  );
  const [imagenes, setImagenes] = useState(
    noticiaEditar?.imagenes || [],
  );
  const [cargando, setCargando] = useState(false);
  const [subiendoImg, setSubiendoImg] = useState(false);
  const [progreso, setProgreso] = useState(null); // { actual, total } durante la subida múltiple
  const [error, setError] = useState("");
  const inputArchivoRef = useRef(null);
  const [reordenando, setReordenando] = useState(false);
  const reordenandoRef = useRef(false); // una sola petición de reorden en vuelo

  // Boletín: solo imagen; el título es interno y no hay subtítulo ni contenido
  const esBoletin = esTipoBoletin(formulario);
  const esEvento = esTipoEvento(formulario);
  const maxImagenes = limiteImagenes(formulario.tipo);

  function manejarCambio(evento) {
    const { name, value, type, checked } = evento.target;
    if (name === "tipo") setError(""); // el aviso anterior puede ya no aplicar al nuevo tipo
    setFormulario({ ...formulario, [name]: type === "checkbox" ? checked : value });
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");

    if (esBoletin && formulario.publicada && imagenes.length === 0) {
      setError(
        "Un boletín no se puede publicar sin imagen. Guarda el boletín, sube la imagen y luego márcalo como publicado.",
      );
      return;
    }
    // Cambiar a un tipo con menor límite de imágenes que las actuales no se permite
    const cambiaTipo = !noticiaEditar || formulario.tipo !== noticiaEditar.tipo;
    if (cambiaTipo && imagenes.length > maxImagenes) {
      setError(
        `Esta publicación tiene ${imagenes.length} imágenes; el tipo ${etiquetaTipo(formulario.tipo)} admite ${maxImagenes}. Quita imágenes antes de cambiar el tipo.`,
      );
      return;
    }

    if (esEvento) {
      if (!formulario.fecha_evento) {
        setError("El evento necesita fecha y hora de inicio.");
        return;
      }
      if (!formulario.lugar.trim()) {
        setError("El evento necesita un lugar.");
        return;
      }
    }

    setCargando(true);

    try {
      // Un boletín no usa subtítulo ni contenido: se guardan vacíos
      let datos = esBoletin ? { ...formulario, subtitulo: "", contenido: "" } : { ...formulario };
      // Evento: datetime-local (hora local) -> ISO con zona; otros tipos no envían fecha ni lugar de evento
      if (esEvento) {
        datos = { ...datos, fecha_evento: inputLocalAIso(formulario.fecha_evento), lugar: formulario.lugar.trim() };
      } else {
        delete datos.fecha_evento;
        delete datos.lugar;
      }
      if (noticiaEditar) {
        await actualizarNoticia(noticiaEditar.id, datos);
      } else {
        await crearNoticia(datos);
      }
      alGuardar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  // Subida múltiple: secuencial, con progreso y error por archivo; respeta el máximo del tipo
  async function manejarSubidaImagen(evento) {
    const archivos = Array.from(evento.target.files || []);
    if (inputArchivoRef.current) inputArchivoRef.current.value = "";
    if (archivos.length === 0) return;
    if (!noticiaEditar) {
      setError("Guarda la noticia primero antes de agregar imágenes.");
      return;
    }
    const caben = maxImagenes - imagenes.length;
    if (caben <= 0) {
      setError(`Límite de ${maxImagenes} ${maxImagenes === 1 ? "imagen" : "imágenes"} alcanzado.`);
      return;
    }

    const aSubir = archivos.slice(0, caben);
    const mensajes = [];
    if (archivos.length > caben) {
      mensajes.push(`Solo caben ${caben} más: se omitieron ${archivos.length - caben} archivo(s).`);
    }

    setSubiendoImg(true);
    setError("");
    for (let i = 0; i < aSubir.length; i++) {
      setProgreso({ actual: i + 1, total: aSubir.length });
      try {
        const resp = await subirImagenNoticia(noticiaEditar.id, aSubir[i]);
        setImagenes((prev) => [...prev, resp.datos]);
      } catch (err) {
        mensajes.push(`${aSubir[i].name}: ${err.message}`);
      }
    }
    setProgreso(null);
    setSubiendoImg(false);
    if (mensajes.length) setError(mensajes.join(" "));
  }

  // Sube/baja una imagen: orden optimista. Las peticiones se serializan (los botones se deshabilitan
  // mientras hay una en vuelo), así que `confirmado` es siempre el último orden aceptado por el
  // servidor y es al que se vuelve, con aviso, si la petición falla.
  async function moverImagen(indice, delta) {
    const destino = indice + delta;
    if (!noticiaEditar || reordenandoRef.current || destino < 0 || destino >= imagenes.length) return;
    reordenandoRef.current = true;
    setReordenando(true);
    const confirmado = imagenes;
    const nuevo = [...imagenes];
    [nuevo[indice], nuevo[destino]] = [nuevo[destino], nuevo[indice]];
    setImagenes(nuevo);
    try {
      await reordenarImagenesNoticia(noticiaEditar.id, nuevo.map((img) => img.id));
    } catch (err) {
      setImagenes(confirmado);
      setError(`No se pudo guardar el nuevo orden de las imágenes: ${err.message}`);
    } finally {
      reordenandoRef.current = false;
      setReordenando(false);
    }
  }

  async function manejarEliminarImagen(imagenId) {
    if (!noticiaEditar) return;
    try {
      await eliminarImagenNoticia(noticiaEditar.id, imagenId);
      setImagenes((prev) => prev.filter((img) => img.id !== imagenId));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal-editor">
      <div className="modal-contenido">
        <h2>{noticiaEditar ? "Editar Noticia" : "Nueva Noticia"}</h2>

        {error && <div className="mensaje-error">{error}</div>}

        <form onSubmit={manejarEnvio}>
          <div className="campo">
            <label htmlFor="titulo">
              {esBoletin ? "Título interno (no se muestra al público)" : "Título"}
            </label>
            <input
              type="text"
              id="titulo"
              name="titulo"
              value={formulario.titulo}
              onChange={manejarCambio}
              required
            />
          </div>

          {!esBoletin && (
          <div className="campo">
            <label htmlFor="subtitulo">Subtítulo</label>
            <input
              type="text"
              id="subtitulo"
              name="subtitulo"
              value={formulario.subtitulo}
              onChange={manejarCambio}
            />
          </div>
          )}

          <div className="campo">
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" name="tipo" value={formulario.tipo} onChange={manejarCambio}>
              {TIPOS_NOTICIA.map((t) => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
          </div>

          {esEvento && (
            <>
              <div className="campo">
                <label htmlFor="fecha_evento">Fecha y hora del evento</label>
                <input
                  type="datetime-local"
                  id="fecha_evento"
                  name="fecha_evento"
                  value={formulario.fecha_evento}
                  onChange={manejarCambio}
                  required
                />
              </div>
              <div className="campo">
                <label htmlFor="lugar">Lugar</label>
                <input
                  type="text"
                  id="lugar"
                  name="lugar"
                  maxLength={255}
                  value={formulario.lugar}
                  onChange={manejarCambio}
                  required
                />
              </div>
            </>
          )}

          {!esBoletin && (
          <div className="campo">
            <label htmlFor="contenido">Contenido</label>
            <textarea
              id="contenido"
              name="contenido"
              value={formulario.contenido}
              onChange={manejarCambio}
              rows={6}
            />
          </div>
          )}

          <div className="campo">
            <label htmlFor="fecha_publicacion">Fecha de Publicación</label>
            <input
              type="date"
              id="fecha_publicacion"
              name="fecha_publicacion"
              value={formulario.fecha_publicacion}
              onChange={manejarCambio}
            />
          </div>

          <div className="campo-casilla">
            <input
              type="checkbox"
              id="publicada"
              name="publicada"
              checked={formulario.publicada}
              onChange={manejarCambio}
            />
            <label htmlFor="publicada">Publicada</label>
          </div>

          {/* Sección de imágenes — solo disponible al editar */}
          <div className="campo">
            <label>
              {esBoletin ? "Imagen del boletín" : "Imágenes del carrusel"}{" "}
              <span style={{ fontWeight: 400, color: "#666" }}>
                ({imagenes.length}/{maxImagenes})
              </span>
            </label>

            {!noticiaEditar && (
              <p style={{ fontSize: "0.82rem", color: "#888", margin: "0.25rem 0 0.5rem" }}>
                Guarda la noticia primero para poder agregar imágenes.
              </p>
            )}

            {noticiaEditar && (
              <>
                <div className="noticia-imagenes-grid">
                  {imagenes.map((img, indice) => (
                    <div key={img.id} className="noticia-imagen-item">
                      <div className="noticia-imagen-miniatura">
                        <img
                          src={`${urlImagenNoticia(img)}`}
                          alt={img.nombre_archivo || "Imagen"}
                        />
                        <button
                          type="button"
                          className="noticia-imagen-eliminar"
                          onClick={() => manejarEliminarImagen(img.id)}
                          title="Eliminar imagen"
                          aria-label={`Eliminar imagen ${indice + 1}`}
                        >
                          ✕
                        </button>
                        {indice === 0 && imagenes.length > 1 && <span className="noticia-imagen-portada">Portada</span>}
                      </div>
                      {imagenes.length > 1 && (
                        <div className="noticia-imagen-orden">
                          <button
                            type="button"
                            onClick={() => moverImagen(indice, -1)}
                            disabled={reordenando || subiendoImg || indice === 0}
                            aria-label={`Subir la imagen ${indice + 1}`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moverImagen(indice, 1)}
                            disabled={reordenando || subiendoImg || indice === imagenes.length - 1}
                            aria-label={`Bajar la imagen ${indice + 1}`}
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {imagenes.length < maxImagenes && (
                  <label className="btn-subir-imagen">
                    {subiendoImg
                      ? `Subiendo ${progreso ? `${progreso.actual} de ${progreso.total}` : ""}...`
                      : maxImagenes > 1 ? "+ Agregar imágenes" : "+ Agregar imagen"}
                    <input
                      ref={inputArchivoRef}
                      type="file"
                      multiple={maxImagenes > 1}
                      accept=".jpg,.jpeg,.png,.gif,.webp"
                      style={{ display: "none" }}
                      onChange={manejarSubidaImagen}
                      disabled={subiendoImg || imagenes.length >= maxImagenes}
                    />
                  </label>
                )}
                {maxImagenes > 1 && imagenes.length < maxImagenes && (
                  <p style={{ fontSize: "0.78rem", color: "#888", margin: "0.3rem 0 0" }}>
                    Puedes seleccionar varias; quedan {maxImagenes - imagenes.length}. La primera es la portada.
                  </p>
                )}
                {imagenes.length >= maxImagenes && (
                  <p style={{ fontSize: "0.78rem", color: "#888", margin: "0.3rem 0 0" }}>
                    {esBoletin
                      ? "El boletín ya tiene su imagen. Elimínala para subir otra."
                      : `Límite de ${maxImagenes} imágenes alcanzado.`}
                  </p>
                )}
                <p style={{ fontSize: "0.78rem", color: "#888", margin: "0.3rem 0 0" }}>
                  Formatos: JPG, PNG, GIF, WebP · Máx. 5 MB por imagen
                </p>
              </>
            )}
          </div>

          <div className="formulario-botones">
            <button type="submit" disabled={cargando}>
              {cargando ? "Guardando..." : noticiaEditar ? "Actualizar" : "Crear"}
            </button>
            <button type="button" onClick={alCerrar}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
