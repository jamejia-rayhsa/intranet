import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { ProveedorAuth, usarAuth } from "./context/AuthContext";
import { obtenerModulosActivos } from "./services/modulos.service";
import { solicitar } from "./utils/api";
import "./styles/globales.css";

import PortalLogin from "./pages/PortalLogin";
import PortalRegistro from "./pages/PortalRegistro";
import PortalHome from "./pages/PortalHome";
import PortalNoticias from "./pages/PortalNoticias";
import PortalAdminModulos from "./pages/PortalAdminModulos";
import PortalAdminRoles from "./pages/PortalAdminRoles";
import PortalAdminNoticias from "./pages/PortalAdminNoticias";
import PortalAdminUsuarios from "./pages/PortalAdminUsuarios";
import PortalCambiarPassword from "./pages/PortalCambiarPassword";
import PermisosAdminPage from "./pages/PermisosAdminPage";
import AuditoriaPage from "../../auditoria/frontend/pages/AuditoriaPage";
import AuditoriaDashboard from "../../auditoria/frontend/pages/AuditoriaDashboard";
import RHDashboard from "../../rh/frontend/pages/RHDashboard";
import RHAdminPage from "../../rh/frontend/pages/RHAdminPage";
import EmpleadoPage from "../../rh/frontend/pages/EmpleadoPage";
import VacacionesPage from "../../rh/frontend/pages/VacacionesPage";
import VacacionesListadoPage from "../../rh/frontend/pages/VacacionesListadoPage";
import PuestosPage from "../../rh/frontend/pages/PuestosPage";
import DepartamentosPage from "../../rh/frontend/pages/DepartamentosPage";
import UbicacionesPage from "../../rh/frontend/pages/UbicacionesPage";
import TicketsDashboard from "../../tickets/frontend/pages/TicketsDashboard";
import TicketPage from "../../tickets/frontend/pages/TicketPage";
import CategoriasPage from "../../tickets/frontend/pages/CategoriasPage";
import EncuestasPage from "../../tickets/frontend/pages/EncuestasPage";
import MenuDinamico from "./components/MenuDinamico";

function RutaProtegida({ children, permisosRequeridos = [] }) {
  const { usuario, cargando } = usarAuth();
  const location = useLocation();

  if (cargando) {
    return <div>Cargando...</div>;
  }

  if (!usuario) {
    return <Navigate to="/inicio-sesion" />;
  }

  if (
    usuario.requiere_cambio_password &&
    location.pathname !== "/cambiar-password"
  ) {
    return <Navigate to="/cambiar-password" />;
  }

  return children;
}

function LayoutConMenu({ children }) {
  const { usuario } = usarAuth();
  const [modulos, setModulos] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [sidebarAbierto, setSidebarAbierto] = useState(false);

  useEffect(() => {
    if (usuario) {
      obtenerModulosActivos()
        .then((respuesta) => {
          if (respuesta.exito) setModulos(respuesta.datos);
        })
        .catch((error) => console.error("Error al cargar módulos:", error));

      solicitar('/permisos/mis-permisos')
        .then((data) => { if (data.exito) setPermisos(data.datos); })
        .catch((error) => console.error("Error al cargar permisos:", error));
    }
  }, [usuario]);

  if (!usuario) {
    return <main className="contenido-principal">{children}</main>;
  }

  return (
    <div className="app-shell">
      {sidebarAbierto && (
        <div className="sidebar-overlay" onClick={() => setSidebarAbierto(false)} />
      )}
      <MenuDinamico
        modulos={modulos}
        permisos={permisos}
        abierto={sidebarAbierto}
        onCerrar={() => setSidebarAbierto(false)}
      />
      <div className="app-main">
        <header className="app-topbar">
          <button
            className="topbar-hamburguesa"
            onClick={() => setSidebarAbierto(!sidebarAbierto)}
            aria-label="Menú"
          >
            ☰
          </button>
          <div className="topbar-usuario">
            <span className="topbar-nombre">{usuario.nombre}</span>
            <div className="topbar-avatar">
              {usuario.nombre?.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="app-contenido">{children}</main>
      </div>
    </div>
  );
}

function AppRutas() {
  return (
    <LayoutConMenu>
      <Routes>
        <Route path="/inicio-sesion" element={<PortalLogin />} />
        <Route path="/registro" element={<PortalRegistro />} />
        <Route
          path="/"
          element={
            <RutaProtegida>
              <PortalHome />
            </RutaProtegida>
          }
        />
        <Route
          path="/noticias"
          element={
            <RutaProtegida>
              <PortalNoticias />
            </RutaProtegida>
          }
        />
        <Route
          path="/admin/modulos"
          element={
            <RutaProtegida>
              <PortalAdminModulos />
            </RutaProtegida>
          }
        />
        <Route
          path="/admin/roles"
          element={
            <RutaProtegida>
              <PortalAdminRoles />
            </RutaProtegida>
          }
        />
        <Route
          path="/admin/usuarios"
          element={
            <RutaProtegida>
              <PortalAdminUsuarios />
            </RutaProtegida>
          }
        />
        <Route
          path="/admin/noticias"
          element={
            <RutaProtegida>
              <PortalAdminNoticias />
            </RutaProtegida>
          }
        />
        <Route
          path="/auditoria"
          element={
            <RutaProtegida>
              <AuditoriaDashboard />
            </RutaProtegida>
          }
        />
        <Route
          path="/auditoria/logs"
          element={
            <RutaProtegida>
              <AuditoriaPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/cambiar-password"
          element={
            <RutaProtegida>
              <PortalCambiarPassword />
            </RutaProtegida>
          }
        />
        <Route
          path="/rh"
          element={
            <RutaProtegida>
              <RHDashboard />
            </RutaProtegida>
          }
        />
        <Route
          path="/rh/empleados"
          element={
            <RutaProtegida>
              <EmpleadoPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/rh/admin"
          element={
            <RutaProtegida>
              <RHAdminPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/rh/vacaciones"
          element={
            <RutaProtegida>
              <VacacionesPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/rh/vacaciones/listado"
          element={
            <RutaProtegida>
              <VacacionesListadoPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/rh/puestos"
          element={
            <RutaProtegida>
              <PuestosPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/rh/departamentos"
          element={
            <RutaProtegida>
              <DepartamentosPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/rh/ubicaciones"
          element={
            <RutaProtegida>
              <UbicacionesPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/tickets"
          element={
            <RutaProtegida>
              <TicketsDashboard />
            </RutaProtegida>
          }
        />
        <Route
          path="/tickets/lista"
          element={
            <RutaProtegida>
              <TicketPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/tickets/categorias"
          element={
            <RutaProtegida>
              <CategoriasPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/tickets/encuestas"
          element={
            <RutaProtegida>
              <EncuestasPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/admin/permisos"
          element={
            <RutaProtegida>
              <PermisosAdminPage />
            </RutaProtegida>
          }
        />
        <Route path="*" element={<Navigate to="/inicio-sesion" />} />
      </Routes>
    </LayoutConMenu>
  );
}

ReactDOM.createRoot(document.getElementById("raiz")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ProveedorAuth>
        <AppRutas />
      </ProveedorAuth>
    </BrowserRouter>
  </React.StrictMode>,
);
