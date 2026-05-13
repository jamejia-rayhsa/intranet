import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { usarAuth } from '../context/AuthContext';

const NOMBRE_EMPRESA = import.meta.env.VITE_NOMBRE_EMPRESA || 'Intranet';

const SUB_RUTAS = {
  portal: [
    { path: '/', label: 'Inicio', opcion: null },
    { path: '/noticias', label: 'Noticias', opcion: 'Noticias' },
  ],
  auditoria: [
    { path: '/auditoria', label: 'Dashboard', opcion: null },
    { path: '/auditoria/logs', label: 'Logs', opcion: 'Logs' },
  ],
  rh: [
    { path: '/rh', label: 'Dashboard', opcion: null },
    { path: '/rh/empleados', label: 'Empleados', opcion: 'Empleados' },
    { path: '/rh/admin', label: 'Permisos y ausencias', opcion: 'Permisos' },
    { path: '/rh/vacaciones', label: 'Vacaciones', opcion: 'Vacaciones' },
    { path: '/rh/vacaciones/listado', label: 'Solicitudes', opcion: 'Vacaciones' },
    { path: '/rh/puestos', label: 'Puestos', opcion: 'Empleados' },
    { path: '/rh/departamentos', label: 'Departamentos', opcion: 'Empleados' },
    { path: '/rh/ubicaciones', label: 'Ubicaciones', opcion: 'Empleados' },
  ],
  tickets: [
    { path: '/tickets', label: 'Dashboard', opcion: null },
    { path: '/tickets/lista', label: 'Tickets', opcion: 'Tickets' },
    { path: '/tickets/categorias', label: 'Categorías', opcion: 'Categorías' },
    { path: '/tickets/encuestas', label: 'Encuestas', opcion: 'Encuestas' },
  ],
};

const RUTAS_MODULOS = {
  portal: '/',
  tickets: '/tickets',
  rh: '/rh',
  auditoria: '/auditoria',
  bi: '/bi',
  comercial: '/comercial',
};

const ADMIN_ITEMS = [
  { path: '/admin/usuarios', label: 'Usuarios' },
  { path: '/admin/roles', label: 'Roles' },
  { path: '/admin/modulos', label: 'Módulos' },
  { path: '/admin/noticias', label: 'Noticias' },
  { path: '/admin/permisos', label: 'Permisos' },
];

const ROLES_ADMIN = ['super_admin', 'portal_admin'];

const ICONOS_MODULOS = {
  portal: '🏠',
  rh: '👥',
  tickets: '🎫',
  auditoria: '📋',
  bi: '📊',
  comercial: '💼',
};

function moduloContienePath(nombre, pathname) {
  const subRutas = SUB_RUTAS[nombre];
  if (!subRutas) {
    const ruta = RUTAS_MODULOS[nombre] || `/${nombre}`;
    if (ruta === '/') return pathname === '/';
    return pathname === ruta || pathname.startsWith(ruta + '/');
  }
  return subRutas.some(sr => {
    if (sr.path === '/') return pathname === '/';
    return pathname === sr.path || pathname.startsWith(sr.path + '/');
  });
}

function SidebarLogo() {
  const imgRef = useRef(null);
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem', letterSpacing: '0.04em' }}>
        RAYHSA
      </span>
    );
  }

  return (
    <img
      ref={imgRef}
      src="/logo-rayhsa.png"
      alt="RAYHSA"
      onError={() => setImgError(true)}
      style={{ height: '42px', width: 'auto', objectFit: 'contain' }}
    />
  );
}

export default function MenuDinamico({ modulos = [], permisos = [], abierto, onCerrar }) {
  const { usuario, cerrarSesion } = usarAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [seccionAbierta, setSeccionAbierta] = useState(() => {
    if (location.pathname.startsWith('/admin')) return 'admin';
    for (const nombre of Object.keys(SUB_RUTAS)) {
      if (moduloContienePath(nombre, location.pathname)) return nombre;
    }
    return null;
  });

  useEffect(() => {
    onCerrar?.();
  }, [location.pathname]);

  function toggleSeccion(nombre) {
    setSeccionAbierta(prev => (prev === nombre ? null : nombre));
  }

  function handleCerrarSesion() {
    cerrarSesion();
    navigate('/inicio-sesion');
  }

  const esAdmin = usuario?.roles?.some(r => ROLES_ADMIN.includes(r));
  const modulosActivos = modulos.filter(m => m.activo);

  // Filtra módulos donde el usuario tiene acceso a al menos una sub-ruta
  const modulosVisibles = modulosActivos.filter((m) => {
    const subRutas = SUB_RUTAS[m.nombre] || [];
    if (subRutas.length === 0) return true; // módulos sin sub-rutas siempre se muestran
    return subRutas.some((sr) => tieneAcceso(m.nombre, sr.opcion));
  });

  function esActivo(ruta) {
    if (ruta === '/') return location.pathname === '/';
    return location.pathname === ruta || location.pathname.startsWith(ruta + '/');
  }

  function tieneAcceso(moduloNombre, opcion) {
    if (usuario?.rol_nombre === 'super_admin') return true;
    if (!opcion) return true;
    if (permisos.length === 0) return true;
    return permisos.some(
      (p) =>
        p.modulo.toLowerCase() === moduloNombre.toLowerCase() &&
        p.opcion === opcion
    );
  }

  return (
    <aside className={`app-sidebar${abierto ? ' abierto' : ''}`}>
      <div className="sidebar-logo" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <SidebarLogo />
      </div>

      <nav className="sidebar-nav">
        {modulosVisibles.map(m => {
          const subRutas = SUB_RUTAS[m.nombre];
          const label = m.nombre.charAt(0).toUpperCase() + m.nombre.slice(1);
          const icono = ICONOS_MODULOS[m.nombre] || '📁';

          // Módulo sin sub-rutas — link directo
          if (!subRutas) {
            const ruta = RUTAS_MODULOS[m.nombre] || `/${m.nombre}`;
            return (
              <div key={m.id} className="sidebar-grupo">
                <Link to={ruta} className={`sidebar-link-directo${esActivo(ruta) ? ' activo' : ''}`}>
                  <span className="sidebar-icono">{icono}</span>
                  <span>{label}</span>
                </Link>
              </div>
            );
          }

          const estaAbierto = seccionAbierta === m.nombre;
          const tieneActivo = moduloContienePath(m.nombre, location.pathname);

          return (
            <div key={m.id} className="sidebar-grupo">
              <button
                className={`sidebar-seccion-btn${tieneActivo ? ' con-activo' : ''}`}
                onClick={() => toggleSeccion(m.nombre)}
                aria-expanded={estaAbierto}
              >
                <span className="sidebar-seccion-label">
                  <span className="sidebar-icono">{icono}</span>
                  {label}
                </span>
                <span className={`sidebar-chevron${estaAbierto ? ' abierto' : ''}`}>›</span>
              </button>

              <div className={`sidebar-subitems${estaAbierto ? ' abierto' : ''}`}>
                {subRutas
                  .filter((sr) => tieneAcceso(m.nombre, sr.opcion))
                  .map(sr => (
                    <Link
                      key={sr.path}
                      to={sr.path}
                      className={esActivo(sr.path) ? 'activo' : ''}
                    >
                      {sr.label}
                    </Link>
                  ))}
              </div>
            </div>
          );
        })}

        {esAdmin && (() => {
          const estaAbierto = seccionAbierta === 'admin';
          const tieneActivo = location.pathname.startsWith('/admin');
          return (
            <div className="sidebar-grupo">
              <button
                className={`sidebar-seccion-btn${tieneActivo ? ' con-activo' : ''}`}
                onClick={() => toggleSeccion('admin')}
                aria-expanded={estaAbierto}
              >
                <span className="sidebar-seccion-label">
                  <span className="sidebar-icono">⚙️</span>
                  Admin
                </span>
                <span className={`sidebar-chevron${estaAbierto ? ' abierto' : ''}`}>›</span>
              </button>
              <div className={`sidebar-subitems${estaAbierto ? ' abierto' : ''}`}>
                {ADMIN_ITEMS.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={location.pathname === item.path ? 'activo' : ''}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })()}
      </nav>

      <div className="sidebar-pie">
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {usuario?.correo || usuario?.nombre}
        </div>
        <button className="sidebar-cerrar-sesion" onClick={handleCerrarSesion}>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
