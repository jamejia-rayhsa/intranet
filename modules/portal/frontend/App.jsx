import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProveedorAuth, usarAuth } from "./context/AuthContext";
import { useEffect, useState } from "react";
import { obtenerModulosActivos } from "./services/modulos.service";

import PortalLogin from "./pages/PortalLogin";
import PortalHome from "./pages/PortalHome";
import PortalNoticias from "./pages/PortalNoticias";
import PortalAdminModulos from "./pages/PortalAdminModulos";
import PortalAdminRoles from "./pages/PortalAdminRoles";
import MenuDinamico from "./components/MenuDinamico";

function RutaProtegida({ children }) {
  const { usuario, cargando } = usarAuth();

  if (cargando) {
    return <div className="cargando-app">Cargando...</div>;
  }

  if (!usuario) {
    return <Navigate to="/inicio-sesion" />;
  }

  return children;
}

function App() {
  const [modulos, setModulos] = useState([]);
  const [sidebarAbierto, setSidebarAbierto] = useState(false);
  const { usuario, cargando } = usarAuth();

  useEffect(() => {
    if (usuario) {
      obtenerModulosActivos()
        .then((respuesta) => {
          if (respuesta.exito) {
            setModulos(respuesta.datos);
          }
        })
        .catch((error) => {
          console.error("Error al cargar módulos:", error);
        });
    }
  }, [usuario]);

  if (cargando) {
    return <div className="cargando-app">Cargando...</div>;
  }

  if (!usuario) {
    return (
      <Routes>
        <Route path="/inicio-sesion" element={<PortalLogin />} />
        <Route path="*" element={<Navigate to="/inicio-sesion" />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      {sidebarAbierto && (
        <div className="sidebar-overlay" onClick={() => setSidebarAbierto(false)} />
      )}
      <MenuDinamico
        modulos={modulos}
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
        <main className="app-contenido">
          <Routes>
            <Route path="/" element={<PortalHome />} />
            <Route path="/noticias" element={<PortalNoticias />} />
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
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function AppConProveedor() {
  return (
    <BrowserRouter>
      <ProveedorAuth>
        <App />
      </ProveedorAuth>
    </BrowserRouter>
  );
}
