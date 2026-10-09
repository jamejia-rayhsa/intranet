import { urlImagenNoticia } from "../utils/storage";
import { useState, useRef } from "react";
import {
  crearNoticia,
  actualizarNoticia,
  subirImagenNoticia,
  eliminarImagenNoticia,
} from "../services/noticias.service";

const MAX_IMAGENES = 5;

export default function NewsEditorModal({ noticiaEditar, alCerrar, alGuardar }) {
  const [formulario, setFormulario] = useState(
    noticiaEditar || {
      titulo: "",
      subtitulo: "",
      contenido: "",
      tipo: "noticia",
      fecha_publicacion: new Date().toISOString().split("T")[0],
      publicada: false,
    },
  );
  const [imagenes, setImagenes] = useState(
    noticiaEditar?.imagenes || [],
  );
  const [cargando, setCargando] = useState(false);
  const [subiendoImg, setSubiendoImg] = useState(false);
  const [error, setError] = useState("");
  const inputArchivoRef = useRef(null);

  function manejarCambio(evento) {
    const { name, value, type, checked } = evento.target;
    setFormulario({ ...formulario, [name]: type === "checkbox" ? checked : value });
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");
    setCargando(true);

    try {
      if (noticiaEditar) {
        await actualizarNoticia(noticiaEditar.id, formulario);
      } else {
        await crearNoticia(formulario);
      }
      alGuardar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function manejarSubidaImagen(evento) {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    if (!noticiaEditar) {
      setError("Guarda la noticia primero antes de agregar imágenes.");
      return;
    }
    if (imagenes.length >= MAX_IMAGENES) {
      setError(`Límite de ${MAX_IMAGENES} imágenes alcanzado.`);
      return;
    }

    setSubiendoImg(true);
    setError("");
    try {
      const resp = await subirImagenNoticia(noticiaEditar.id, archivo);
      setImagenes((prev) => [...prev, resp.datos]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendoImg(false);
      if (inputArchivoRef.current) inputArchivoRef.current.value = "";
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
            <label htmlFor="titulo">Título</label>
            <input
              type="text"
              id="titulo"
              name="titulo"
              value={formulario.titulo}
              onChange={manejarCambio}
              required
            />
          </div>

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

          <div className="campo">
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" name="tipo" value={formulario.tipo} onChange={manejarCambio}>
              <option value="noticia">Noticia</option>
              <option value="comunicado">Comunicado</option>
              <option value="oferta_empleo">Oferta de Empleo</option>
            </select>
          </div>

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
              Imágenes del carrusel{" "}
              <span style={{ fontWeight: 400, color: "#666" }}>
                ({imagenes.length}/{MAX_IMAGENES})
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
                  {imagenes.map((img) => (
                    <div key={img.id} className="noticia-imagen-miniatura">
                      <img
                        src={`${urlImagenNoticia(img)}`}
                        alt={img.nombre_archivo || "Imagen"}
                      />
                      <button
                        type="button"
                        className="noticia-imagen-eliminar"
                        onClick={() => manejarEliminarImagen(img.id)}
                        title="Eliminar imagen"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {imagenes.length < MAX_IMAGENES && (
                  <label className="btn-subir-imagen">
                    {subiendoImg ? "Subiendo..." : "+ Agregar imagen"}
                    <input
                      ref={inputArchivoRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.gif,.webp"
                      style={{ display: "none" }}
                      onChange={manejarSubidaImagen}
                      disabled={subiendoImg}
                    />
                  </label>
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
