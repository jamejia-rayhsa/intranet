import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { usarAuth } from '../context/AuthContext';

const NOMBRE_EMPRESA = import.meta.env.VITE_NOMBRE_EMPRESA || 'Intranet';

// Sub-rutas por módulo
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

export default function MenuDinamico({ modulos = [] }) {
  const { usuario, cerrarSesion } = usarAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [dropdownActivo, setDropdownActivo] = useState(null); // 'admin' | 'usuario' | módulo.nombre
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef(null);

  // Cierra dropdowns al cambiar de ruta
  useEffect(() => {
    setDropdownActivo(null);
    setMenuAbierto(false);
  }, [location.pathname]);

  // Cierra dropdown al click fuera
  useEffect(() => {
    function handleClickFuera(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setDropdownActivo(null);
      }
    }
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  function toggleDropdown(nombre) {
    setDropdownActivo(prev => (prev === nombre ? null : nombre));
  }

  function handleCerrarSesion() {
    cerrarSesion();
    navigate('/inicio-sesion');
  }

  const esAdmin = usuario?.roles?.some(r => ROLES_ADMIN.includes(r));
  const modulosActivos = modulos.filter(m => m.activo);

  const esModuloActivo = (modNombre) => {
    const ruta = RUTAS_MODULOS[modNombre] || `/${modNombre}`;
    if (ruta === '/') return location.pathname === '/';
    return location.pathname === ruta || location.pathname.startsWith(ruta + '/');
  };

  const esAdminActivo = location.pathname.startsWith('/admin');

  return (
    <nav ref={navRef} style={{ background: 'var(--color-primario)', position: 'relative', zIndex: 100 }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', height: '56px', gap: '0.5rem' }}>

        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none', flexShrink: 0, marginRight: '0.5rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
            🏢
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', whiteSpace: 'nowrap' }}>{NOMBRE_EMPRESA}</span>
        </Link>

        {/* Links de módulos — desktop */}
        <div className="menu-nav-links" style={{ display: 'flex', gap: '0.15rem', flex: 1 }}>

          {modulosActivos.map(m => {
            const subRutas = SUB_RUTAS[m.nombre];
            const activo = esModuloActivo(m.nombre);
            const abierto = dropdownActivo === m.nombre;
            const label = m.nombre.charAt(0).toUpperCase() + m.nombre.slice(1);

            // Módulo sin subrutassimple
            if (!subRutas) {
              const ruta = RUTAS_MODULOS[m.nombre] || `/${m.nombre}`;
              return (
                <Link key={m.id} to={ruta} style={estiloEnlace(activo)}>
                  {label}
                </Link>
              );
            }

            // Módulo con dropdown
            return (
              <div key={m.id} style={{ position: 'relative' }}>
                <button
                  onClick={() => toggleDropdown(m.nombre)}
                  style={{ ...estiloEnlace(activo || abierto), background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  {label}
                  <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>{abierto ? '▲' : '▼'}</span>
                </button>
                {abierto && (
                  <div style={estiloDropdown}>
                    {subRutas.map(sr => (
                      <Link key={sr.path} to={sr.path} style={estiloDropdownItem(location.pathname === sr.path)}>
                        {sr.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Admin dropdown — solo para admins */}
          {esAdmin && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => toggleDropdown('admin')}
                style={{ ...estiloEnlace(esAdminActivo || dropdownActivo === 'admin'), background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                Admin
                <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>{dropdownActivo === 'admin' ? '▲' : '▼'}</span>
              </button>
              {dropdownActivo === 'admin' && (
                <div style={estiloDropdown}>
                  {ADMIN_ITEMS.map(item => (
                    <Link key={item.path} to={item.path} style={estiloDropdownItem(location.pathname === item.path)}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Avatar usuario — derecha */}
        {usuario && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => toggleDropdown('usuario')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px', padding: '0.25rem 0.75rem 0.25rem 0.25rem', cursor: 'pointer', color: '#fff', fontSize: '0.875rem', fontWeight: 500 }}
            >
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>
                {usuario.nombre?.charAt(0).toUpperCase()}
              </div>
              <span>{usuario.nombre}</span>
              <span>▾</span>
            </button>

            {dropdownActivo === 'usuario' && (
              <div style={{ ...estiloDropdown, right: 0, left: 'auto', minWidth: '160px' }}>
                <Link to="/rh/perfil" style={estiloDropdownItem(location.pathname === '/rh/perfil')}>
                  Mi perfil
                </Link>
                <hr style={{ margin: '0.25rem 0', border: 'none', borderTop: '1px solid var(--color-borde)' }} />
                <button onClick={handleCerrarSesion} style={{ width: '100%', padding: '0.625rem 1rem', background: 'none', border: 'none', color: 'var(--color-error)', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem' }}>
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        )}

        {/* Hamburguesa móvil */}
        <button
          className="menu-hamburguesa"
          onClick={() => setMenuAbierto(!menuAbierto)}
          style={{ display: 'none', background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', marginLeft: 'auto' }}
        >
          {menuAbierto ? '✕' : '☰'}
        </button>
      </div>

      {/* Menú móvil */}
      {menuAbierto && (
        <div style={{ background: 'var(--color-primario-oscuro)', padding: '0.75rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {modulosActivos.map(m => {
            const subRutas = SUB_RUTAS[m.nombre];
            const ruta = RUTAS_MODULOS[m.nombre] || `/${m.nombre}`;
            const label = m.nombre.charAt(0).toUpperCase() + m.nombre.slice(1);
            if (!subRutas) {
              return (
                <Link key={m.id} to={ruta} style={{ color: 'rgba(255,255,255,0.9)', textDecoration: 'none', padding: '0.5rem 0', fontSize: '0.95rem' }}>
                  {label}
                </Link>
              );
            }
            return (
              <div key={m.id}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.5rem 0 0.25rem', display: 'block' }}>{label}</span>
                {subRutas.map(sr => (
                  <Link key={sr.path} to={sr.path} style={{ color: 'rgba(255,255,255,0.85)', textDecoration: 'none', padding: '0.35rem 0.75rem', fontSize: '0.9rem', display: 'block' }}>
                    {sr.label}
                  </Link>
                ))}
              </div>
            );
          })}
          {esAdmin && (
            <div>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.5rem 0 0.25rem', display: 'block' }}>Admin</span>
              {ADMIN_ITEMS.map(item => (
                <Link key={item.path} to={item.path} style={{ color: 'rgba(255,255,255,0.85)', textDecoration: 'none', padding: '0.35rem 0.75rem', fontSize: '0.9rem', display: 'block' }}>
                  {item.label}
                </Link>
              ))}
            </div>
          )}
          {usuario && (
            <button onClick={handleCerrarSesion} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', textAlign: 'left', padding: '0.625rem 0', fontSize: '0.95rem', cursor: 'pointer' }}>
              Cerrar sesión
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

function estiloEnlace(activo) {
  return {
    color: activo ? '#fff' : 'rgba(255,255,255,0.75)',
    textDecoration: 'none',
    padding: '0.4rem 0.75rem',
    borderRadius: '6px',
    fontWeight: activo ? 600 : 400,
    fontSize: '0.9rem',
    background: activo ? 'rgba(255,255,255,0.15)' : 'transparent',
    whiteSpace: 'nowrap',
  };
}

const estiloDropdown = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  background: '#fff',
  border: '1px solid var(--color-borde)',
  borderRadius: '8px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  minWidth: '160px',
  zIndex: 200,
  overflow: 'hidden',
};

function estiloDropdownItem(activo) {
  return {
    display: 'block',
    padding: '0.6rem 1rem',
    color: activo ? 'var(--color-primario)' : 'var(--color-texto)',
    textDecoration: 'none',
    fontSize: '0.9rem',
    fontWeight: activo ? 600 : 400,
    background: activo ? 'var(--color-fondo)' : 'transparent',
  };
}
