import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProveedorAuth, usarAuth } from "./context/AuthContext";
import { useEffect, useState } from "react";
import { obtenerModulosActivos } from "./services/modulos.service";

import PortalLogin from "./pages/PortalLogin";
import PortalRegistro from "./pages/PortalRegistro";
import PortalHome from "./pages/PortalHome";
import PortalNoticias from "./pages/PortalNoticias";
import PortalAdminModulos from "./pages/PortalAdminModulos";
import PortalAdminRoles from "./pages/PortalAdminRoles";
import MenuDinamico from "./components/MenuDinamico";

function RutaProtegida({ children }) {
  const { usuario, cargando } = usarAuth();

  if (cargando) {
    return <div className="cargando">Cargando...</div>;
  }

  if (!usuario) {
    return <Navigate to="/inicio-sesion" />;
  }

  return children;
}

function App() {
  const [modulos, setModulos] = useState([]);
  const { usuario } = usarAuth();

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

  return (
    <div className="aplicacion">
      {usuario && <MenuDinamico modulos={modulos} />}
      <main className="contenido-principal">
        <Routes>
          <Route path="/inicio-sesion" element={<PortalLogin />} />
          <Route path="/registro" element={<PortalRegistro />} />
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
