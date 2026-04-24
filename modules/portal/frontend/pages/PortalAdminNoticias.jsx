import { useState, useEffect } from "react";
import {
  obtenerNoticiasTodas,
  eliminarNoticia,
} from "../services/noticias.service";
import NewsEditorModal from "../components/NewsEditorModal";

export default function PortalAdminNoticias() {
  const [noticias, setNoticias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarEditor, setMostrarEditor] = useState(false);
  const [editando, setEditando] = useState(null);

  useEffect(() => {
    cargarNoticias();
  }, []);

  async function cargarNoticias() {
    try {
      const respuesta = await obtenerNoticiasTodas(1, 100);
      if (respuesta.exito) {
        setNoticias(respuesta.datos.noticias);
      }
    } catch (error) {
      console.error("Error al cargar noticias:", error);
    } finally {
      setCargando(false);
    }
  }

  async function manejarEliminar(id) {
    if (confirm("¿Estás seguro de eliminar esta noticia?")) {
      try {
        await eliminarNoticia(id);
        cargarNoticias();
      } catch (error) {
        console.error("Error al eliminar noticia:", error);
      }
    }
  }

  function abrirEditor(noticia = null) {
    setEditando(noticia);
    setMostrarEditor(true);
  }

  function cerrarEditor() {
    setMostrarEditor(false);
    setEditando(null);
  }

  if (cargando) return <p>Cargando noticias...</p>;

  return (
    <div className="admin-noticias">
      <div className="admin-encabezado">
        <h1>Administración de Noticias</h1>
        <button onClick={() => abrirEditor()}>Nueva Noticia</button>
      </div>

      {mostrarEditor && (
        <NewsEditorModal
          noticiaEditar={editando}
          alCerrar={cerrarEditor}
          alGuardar={() => {
            cerrarEditor();
            cargarNoticias();
          }}
        />
      )}

      <table className="noticias-tabla">
        <thead>
          <tr>
            <th>Título</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Autor</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {noticias.map((noticia) => (
            <tr key={noticia.id}>
              <td>{noticia.titulo}</td>
              <td>{noticia.tipo}</td>
              <td>{noticia.publicada ? "Publicada" : "Borrador"}</td>
              <td>
                {new Date(noticia.fecha_publicacion).toLocaleDateString(
                  "es-MX",
                )}
              </td>
              <td>
                {noticia.autor_nombre} {noticia.autor_apellido}
              </td>
              <td>
                <button onClick={() => abrirEditor(noticia)}>Editar</button>
                <button
                  className="boton-eliminar"
                  onClick={() => manejarEliminar(noticia.id)}
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
