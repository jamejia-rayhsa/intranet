// modules/portal/frontend/main.jsx
//
// Cambios respecto a la versión original:
//   - Importa `rayhsa-system.css` además de `globales.css`.
//   - Reemplaza el header simple por <AppTopbar> con buscador + notificaciones.
//   - Pasa `breadcrumb` al topbar dependiendo de la ruta activa.
//   - Mantiene el resto del routing exactamente igual.

import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { ProveedorAuth, usarAuth } from './context/AuthContext';
import { obtenerModulosActivos } from './services/modulos.service';
import { solicitar } from './utils/api';
import './styles/globales.css';
import './styles/rayhsa-system.css'; // <-- NUEVO sistema visual

import PortalLogin from './pages/PortalLogin';
import AuthCallback from './pages/AuthCallback';
import PortalHome from './pages/PortalHome';
import PortalNoticias from './pages/PortalNoticias';
import PortalAdminModulos from './pages/PortalAdminModulos';
import PortalAdminRoles from './pages/PortalAdminRoles';
import PortalAdminNoticias from './pages/PortalAdminNoticias';
import PortalAdminUsuarios from './pages/PortalAdminUsuarios';
import PortalCambiarPassword from './pages/PortalCambiarPassword';
import PermisosAdminPage from './pages/PermisosAdminPage';
import AuditoriaPage from '../../auditoria/frontend/pages/AuditoriaPage';
import AuditoriaDashboard from '../../auditoria/frontend/pages/AuditoriaDashboard';
import RHDashboard from '../../rh/frontend/pages/RHDashboard';
import RHAdminPage from '../../rh/frontend/pages/RHAdminPage';
import EmpleadoPage from '../../rh/frontend/pages/EmpleadoPage';
import VacacionesPage from '../../rh/frontend/pages/VacacionesPage';
import VacacionesListadoPage from '../../rh/frontend/pages/VacacionesListadoPage';
import CalendarioLaboralPage from '../../rh/frontend/pages/CalendarioLaboralPage';
import AsistenciaTurnosPage from '../../rh/frontend/pages/AsistenciaTurnosPage';
import AsistenciaAsignacionesPage from '../../rh/frontend/pages/AsistenciaAsignacionesPage';
import AsistenciaMarcasPage from '../../rh/frontend/pages/AsistenciaMarcasPage';
import AsistenciaSincronizacionPage from '../../rh/frontend/pages/AsistenciaSincronizacionPage';
import AsistenciaLlavesPage from '../../rh/frontend/pages/AsistenciaLlavesPage';
import AsistenciaResultadosPage from '../../rh/frontend/pages/AsistenciaResultadosPage';
import AsistenciaPeriodosPage from '../../rh/frontend/pages/AsistenciaPeriodosPage';
import AsistenciaParametrosPage from '../../rh/frontend/pages/AsistenciaParametrosPage';
import MiAsistenciaPage from '../../rh/frontend/pages/MiAsistenciaPage';
import MiEquipoPage from '../../rh/frontend/pages/MiEquipoPage';
import PuestosPage from '../../rh/frontend/pages/PuestosPage';
import DepartamentosPage from '../../rh/frontend/pages/DepartamentosPage';
import AreasPage from '../../rh/frontend/pages/AreasPage';
import UbicacionesPage from '../../rh/frontend/pages/UbicacionesPage';
import TicketsDashboard from '../../tickets/frontend/pages/TicketsDashboard';
import TicketPage from '../../tickets/frontend/pages/TicketPage';
import CategoriasPage from '../../tickets/frontend/pages/CategoriasPage';
import EncuestasPage from '../../tickets/frontend/pages/EncuestasPage';
import ComercialDashboard from '../../comercial/frontend/pages/ComercialDashboard';
import SolicitudesListado from '../../comercial/frontend/pages/SolicitudesListado';
import SolicitudCreditoForm from '../../comercial/frontend/pages/SolicitudCreditoForm';

import MenuDinamico from './components/MenuDinamico';
import AppTopbar from './components/AppTopbar';

// ─── helper: ruta → breadcrumb [grupo, página] ───
const BREADCRUMBS = {
  '/':                   ['Portal', 'Inicio'],
  '/noticias':           ['Portal', 'Noticias'],
  '/tickets':            ['Soporte TI', 'Dashboard'],
  '/tickets/lista':      ['Soporte TI', 'Tickets'],
  '/tickets/categorias': ['Soporte TI', 'Categorías'],
  '/tickets/encuestas':  ['Soporte TI', 'Encuestas'],
  '/rh':                 ['Recursos Humanos', 'Dashboard'],
  '/rh/empleados':       ['Recursos Humanos', 'Empleados'],
  '/rh/admin':           ['Recursos Humanos', 'Permisos y ausencias'],
  '/rh/vacaciones':      ['Recursos Humanos', 'Vacaciones'],
  '/rh/calendario':      ['Recursos Humanos', 'Calendario'],
  '/rh/asistencia/mi-asistencia': ['Recursos Humanos', 'Mi asistencia'],
  '/rh/asistencia/mi-equipo':     ['Recursos Humanos', 'Mi equipo'],
  '/rh/asistencia/turnos':        ['Recursos Humanos', 'Asistencia · Turnos'],
  '/rh/asistencia/asignaciones':  ['Recursos Humanos', 'Asistencia · Asignaciones'],
  '/rh/asistencia/marcas':        ['Recursos Humanos', 'Asistencia · Marcas'],
  '/rh/asistencia/sincronizacion': ['Recursos Humanos', 'Asistencia · Sincronización'],
  '/rh/asistencia/llaves':        ['Recursos Humanos', 'Asistencia · Llaves de ingesta'],
  '/rh/asistencia/resultados':    ['Recursos Humanos', 'Asistencia · Resultados'],
  '/rh/asistencia/periodos':      ['Recursos Humanos', 'Asistencia · Periodos'],
  '/rh/asistencia/parametros':    ['Recursos Humanos', 'Asistencia · Parámetros'],
  '/auditoria':          ['Transversal', 'Auditoría'],
  '/auditoria/logs':     ['Transversal', 'Bitácora'],
  '/comercial':          ['Comercial', 'Dashboard'],
  '/comercial/creditos': ['Comercial', 'Solicitudes'],
  '/admin/usuarios':     ['Admin', 'Usuarios'],
  '/admin/roles':        ['Admin', 'Roles'],
  '/admin/modulos':      ['Admin', 'Módulos'],
  '/admin/noticias':     ['Admin', 'Noticias'],
  '/admin/permisos':     ['Admin', 'Permisos'],
};

function breadcrumbFor(pathname) {
  if (BREADCRUMBS[pathname]) return BREADCRUMBS[pathname];
  // fallback: match prefijo más largo
  const found = Object.keys(BREADCRUMBS)
    .filter(k => pathname.startsWith(k) && k !== '/')
    .sort((a, b) => b.length - a.length)[0];
  return BREADCRUMBS[found] || ['Portal'];
}

function RutaProtegida({ children }) {
  const { usuario, cargando } = usarAuth();
  const location = useLocation();
  if (cargando) return <div>Cargando…</div>;
  if (!usuario) return <Navigate to="/inicio-sesion" />;
  if (usuario.requiere_cambio_password && location.pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" />;
  }
  return children;
}

function LayoutConMenu({ children }) {
  const { usuario } = usarAuth();
  const [modulos, setModulos] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [sidebarAbierto, setSidebarAbierto] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (usuario) {
      obtenerModulosActivos()
        .then(r => { if (r.exito) setModulos(r.datos); })
        .catch(err => console.error('Error al cargar módulos:', err));
      solicitar('/permisos/mis-permisos')
        .then(d => { if (d.exito) setPermisos(d.datos); })
        .catch(err => console.error('Error al cargar permisos:', err));
    }
  }, [usuario]);

  // cierra el drawer cada vez que cambia la ruta (en mobile)
  useEffect(() => { setSidebarAbierto(false); }, [location.pathname]);

  // Cerrar el drawer sin navegar (overlay, botón «Cerrar menú», Escape) devuelve el foco al botón de menú
  const cerrarMenuConFoco = useCallback(() => {
    setSidebarAbierto(false);
    requestAnimationFrame(() => {
      const boton = document.querySelector('.responsive-hamburger');
      if (boton && boton.offsetParent !== null) boton.focus();
    });
  }, []);
  useEffect(() => {
    if (!sidebarAbierto) return undefined;
    const alTecla = (e) => { if (e.key === 'Escape') cerrarMenuConFoco(); };
    document.addEventListener('keydown', alTecla);
    return () => document.removeEventListener('keydown', alTecla);
  }, [sidebarAbierto, cerrarMenuConFoco]);

  if (!usuario) {
    return <main className="contenido-principal">{children}</main>;
  }

  return (
    <div className="rayhsa">
      <div className="app-shell">
        <MenuDinamico
          modulos={modulos}
          permisos={permisos}
          abierto={sidebarAbierto}
          onCerrar={() => setSidebarAbierto(false)}
          onCerrarMenu={cerrarMenuConFoco}
        />
        <div
          className={`responsive-overlay ${sidebarAbierto ? 'is-open' : ''}`}
          onClick={cerrarMenuConFoco}
        />
        <div className="app-main">
          <AppTopbar
            onMenu={() => setSidebarAbierto(true)}
            menuAbierto={sidebarAbierto}
            breadcrumb={breadcrumbFor(location.pathname)}
          />
          <main className="app-contenido">{children}</main>
        </div>
      </div>
    </div>
  );
}

function AppRutas() {
  return (
    <LayoutConMenu>
      <Routes>
        <Route path="/inicio-sesion" element={<PortalLogin />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<RutaProtegida><PortalHome /></RutaProtegida>} />
        <Route path="/noticias" element={<RutaProtegida><PortalNoticias /></RutaProtegida>} />
        <Route path="/admin/modulos" element={<RutaProtegida><PortalAdminModulos /></RutaProtegida>} />
        <Route path="/admin/roles" element={<RutaProtegida><PortalAdminRoles /></RutaProtegida>} />
        <Route path="/admin/usuarios" element={<RutaProtegida><PortalAdminUsuarios /></RutaProtegida>} />
        <Route path="/admin/noticias" element={<RutaProtegida><PortalAdminNoticias /></RutaProtegida>} />
        <Route path="/auditoria" element={<RutaProtegida><AuditoriaDashboard /></RutaProtegida>} />
        <Route path="/auditoria/logs" element={<RutaProtegida><AuditoriaPage /></RutaProtegida>} />
        <Route path="/cambiar-password" element={<RutaProtegida><PortalCambiarPassword /></RutaProtegida>} />
        <Route path="/rh" element={<RutaProtegida><RHDashboard /></RutaProtegida>} />
        <Route path="/rh/empleados" element={<RutaProtegida><EmpleadoPage /></RutaProtegida>} />
        <Route path="/rh/admin" element={<RutaProtegida><RHAdminPage /></RutaProtegida>} />
        <Route path="/rh/vacaciones" element={<RutaProtegida><VacacionesPage /></RutaProtegida>} />
        <Route path="/rh/vacaciones/listado" element={<RutaProtegida><VacacionesListadoPage /></RutaProtegida>} />
        <Route path="/rh/calendario" element={<RutaProtegida><CalendarioLaboralPage /></RutaProtegida>} />
        <Route path="/rh/asistencia/mi-asistencia" element={<RutaProtegida><MiAsistenciaPage /></RutaProtegida>} />
        <Route path="/rh/asistencia/mi-equipo" element={<RutaProtegida><MiEquipoPage /></RutaProtegida>} />
        <Route path="/rh/asistencia/turnos" element={<RutaProtegida><AsistenciaTurnosPage /></RutaProtegida>} />
        <Route path="/rh/asistencia/asignaciones" element={<RutaProtegida><AsistenciaAsignacionesPage /></RutaProtegida>} />
        <Route path="/rh/asistencia/marcas" element={<RutaProtegida><AsistenciaMarcasPage /></RutaProtegida>} />
        <Route path="/rh/asistencia/sincronizacion" element={<RutaProtegida><AsistenciaSincronizacionPage /></RutaProtegida>} />
        <Route path="/rh/asistencia/llaves" element={<RutaProtegida><AsistenciaLlavesPage /></RutaProtegida>} />
        <Route path="/rh/asistencia/resultados" element={<RutaProtegida><AsistenciaResultadosPage /></RutaProtegida>} />
        <Route path="/rh/asistencia/periodos" element={<RutaProtegida><AsistenciaPeriodosPage /></RutaProtegida>} />
        <Route path="/rh/asistencia/parametros" element={<RutaProtegida><AsistenciaParametrosPage /></RutaProtegida>} />
        <Route path="/rh/puestos" element={<RutaProtegida><PuestosPage /></RutaProtegida>} />
        <Route path="/rh/departamentos" element={<RutaProtegida><DepartamentosPage /></RutaProtegida>} />
        <Route path="/rh/areas" element={<RutaProtegida><AreasPage /></RutaProtegida>} />
        <Route path="/rh/ubicaciones" element={<RutaProtegida><UbicacionesPage /></RutaProtegida>} />
        <Route path="/tickets" element={<RutaProtegida><TicketsDashboard /></RutaProtegida>} />
        <Route path="/tickets/lista" element={<RutaProtegida><TicketPage /></RutaProtegida>} />
        <Route path="/tickets/categorias" element={<RutaProtegida><CategoriasPage /></RutaProtegida>} />
        <Route path="/tickets/encuestas" element={<RutaProtegida><EncuestasPage /></RutaProtegida>} />
        <Route path="/admin/permisos" element={<RutaProtegida><PermisosAdminPage /></RutaProtegida>} />
        <Route path="/comercial" element={<RutaProtegida><ComercialDashboard /></RutaProtegida>} />
        <Route path="/comercial/creditos" element={<RutaProtegida><SolicitudesListado /></RutaProtegida>} />
        <Route path="/comercial/creditos/nueva" element={<RutaProtegida><SolicitudCreditoForm /></RutaProtegida>} />
        <Route path="/comercial/creditos/:id/editar" element={<RutaProtegida><SolicitudCreditoForm /></RutaProtegida>} />
        <Route path="*" element={<Navigate to="/inicio-sesion" />} />
      </Routes>
    </LayoutConMenu>
  );
}

ReactDOM.createRoot(document.getElementById('raiz')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ProveedorAuth>
        <AppRutas />
      </ProveedorAuth>
    </BrowserRouter>
  </React.StrictMode>,
);
