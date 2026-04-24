import { Routes, Route } from "react-router-dom";
import EmpleadoPage from "../pages/EmpleadoPage";
import RHAdminPage from "../pages/RHAdminPage";
import PerfilPage from "../pages/PerfilPage";

export default function RutasRH() {
  return (
    <Routes>
      <Route path="/empleados" element={<EmpleadoPage />} />
      <Route path="/empleados/:id" element={<PerfilPage />} />
      <Route path="/admin" element={<RHAdminPage />} />
      <Route path="/mi-perfil" element={<PerfilPage />} />
    </Routes>
  );
}
