import { useState, useEffect } from "react";
import {
  obtenerPermisos,
  responderPermiso,
} from "../services/permisos.service";
import PermisosList from "../components/PermisosList";
import "../styles/permisos.css";

const etiquetasEstatus = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

export default function RHAdminPage() {
  const [permisos, setPermisos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [paginasTotales, setPaginasTotales] = useState(1);
  const [filtroEstatus, setFiltroEstatus] = useState("pendiente");

  useEffect(() => {
    cargarPermisos();
  }, [pagina, filtroEstatus]);

  async function cargarPermisos() {
    setCargando(true);
    try {
      const respuesta = await obtenerPermisos({
        pagina,
        limite: 15,
        estatus: filtroEstatus,
      });
      if (respuesta.exito) {
        setPermisos(respuesta.datos.permisos);
        setPaginasTotales(respuesta.datos.paginas_totales);
      }
    } catch (error) {
      console.error("Error al cargar permisos:", error);
    } finally {
      setCargando(false);
    }
  }

  async function manejarRespuesta(id, estatus) {
    try {
      await responderPermiso(id, estatus);
      cargarPermisos();
    } catch (error) {
      console.error("Error al responder permiso:", error);
    }
  }

  if (cargando) {
    return <div className="cargando">Cargando permisos...</div>;
  }

  return (
    <div className="rh-admin-page">
      <h1>Panel de Administración RH</h1>

      <div className="admin-filtros">
        <h2>Solicitudes de Permisos</h2>
        <div className="filtros-grupo">
          {["pendiente", "aprobado", "rechazado", ""].map((estatus) => (
            <button
              key={estatus}
              className={filtroEstatus === estatus ? "activo" : ""}
              onClick={() => {
                setFiltroEstatus(estatus);
                setPagina(1);
              }}
            >
              {estatus ? etiquetasEstatus[estatus] : "Todos"}
            </button>
          ))}
        </div>
      </div>

      <PermisosList permisos={permisos} onResponder={manejarRespuesta} />

      {paginasTotales > 1 && (
        <div className="paginacion">
          <button disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </button>
          <span>
            Página {pagina} de {paginasTotales}
          </span>
          <button
            disabled={pagina >= paginasTotales}
            onClick={() => setPagina(pagina + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
