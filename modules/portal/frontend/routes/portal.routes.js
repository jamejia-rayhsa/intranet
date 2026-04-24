import { Routes, Route, Navigate } from "react-router-dom";
import { usarAuth } from "../context/AuthContext";

import PortalLogin from "../pages/PortalLogin";
import PortalRegistro from "../pages/PortalRegistro";
import PortalHome from "../pages/PortalHome";
import PortalNoticias from "../pages/PortalNoticias";
import PortalAdminModulos from "../pages/PortalAdminModulos";
import PortalAdminRoles from "../pages/PortalAdminRoles";

function RutaProtegida({ hijos }) {
  const { usuario, cargando } = usarAuth();

  if (cargando) {
    return <div className="cargando">Cargando...</div>;
  }

  if (!usuario) {
    return <Navigate to="/inicio-sesion" />;
  }

  return hijos;
}

export default function RutasPortal() {
  return (
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
  );
}
