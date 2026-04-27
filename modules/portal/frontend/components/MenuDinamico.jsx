import { useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { usarAuth } from '../context/AuthContext';

const NOMBRE_EMPRESA = import.meta.env.VITE_NOMBRE_EMPRESA || 'Intranet';

const SUB_RUTAS = {
  portal: [
    { path: '/', label: 'Inicio' },
    { path: '/noticias', label: 'Noticias' },
  ],
  auditoria: [
    { path: '/auditoria', label: 'Dashboard' },
    { path: '/auditoria/logs', label: 'Logs' },
  ],
  rh: [
    { path: '/rh', label: 'Dashboard' },
    { path: '/rh/empleados', label: 'Empleados' },
    { path: '/rh/admin', label: 'Permisos y ausencias' },
    { path: '/rh/perfil', label: 'Mi perfil' },
    { path: '/rh/puestos', label: 'Puestos' },
    { path: '/rh/departamentos', label: 'Departamentos' },
    { path: '/rh/ubicaciones', label: 'Ubicaciones' },
  ],
  tickets: [
    { path: '/tickets', label: 'Dashboard' },
    { path: '/tickets/lista', label: 'Tickets' },
    { path: '/tickets/categorias', label: 'Categorías' },
    { path: '/tickets/encuestas', label: 'Encuestas' },
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

export default function MenuDinamico({ modulos = [], abierto, onCerrar }) {
  const { usuario, cerrarSesion } = usarAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    onCerrar?.();
  }, [location.pathname]);

  function handleCerrarSesion() {
    cerrarSesion();
    navigate('/inicio-sesion');
  }

  const esAdmin = usuario?.roles?.some(r => ROLES_ADMIN.includes(r));
  const modulosActivos = modulos.filter(m => m.activo);

  function esActivo(ruta) {
    if (ruta === '/') return location.pathname === '/';
    return location.pathname === ruta || location.pathname.startsWith(ruta + '/');
  }

  return (
    <aside className={`app-sidebar${abierto ? ' abierto' : ''}`}>
      <div className="sidebar-logo">
        <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>🏢</span>
        <span className="sidebar-empresa">{NOMBRE_EMPRESA}</span>
      </div>

      <nav className="sidebar-nav">
        {modulosActivos.map(m => {
          const subRutas = SUB_RUTAS[m.nombre];
          const label = m.nombre.charAt(0).toUpperCase() + m.nombre.slice(1);
          const icono = ICONOS_MODULOS[m.nombre] || '📁';

          if (!subRutas) {
            const ruta = RUTAS_MODULOS[m.nombre] || `/${m.nombre}`;
            return (
              <div key={m.id} className="sidebar-grupo">
                <Link to={ruta} className={esActivo(ruta) ? 'activo' : ''}>
                  <span style={{ fontSize: '0.95rem' }}>{icono}</span> {label}
                </Link>
              </div>
            );
          }

          return (
            <div key={m.id} className="sidebar-grupo">
              <span className="sidebar-seccion-titulo">{icono} {label}</span>
              {subRutas.map(sr => (
                <Link
                  key={sr.path}
                  to={sr.path}
                  className={esActivo(sr.path) ? 'activo' : ''}
                >
                  {sr.label}
                </Link>
              ))}
            </div>
          );
        })}

        {esAdmin && (
          <div className="sidebar-grupo">
            <span className="sidebar-seccion-titulo">⚙️ Admin</span>
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
        )}
      </nav>

      <div className="sidebar-pie">
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {usuario?.correo || usuario?.nombre}
        </div>
        <button className="sidebar-cerrar-sesion" onClick={handleCerrarSesion}>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
