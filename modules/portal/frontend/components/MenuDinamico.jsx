import { Fragment, useEffect, useLayoutEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { usarAuth } from '../context/AuthContext';
import { tieneAccesoMenu, visibleSegunContexto } from '../utils/menuAcceso';
import useContextoAsistencia from '../../../rh/frontend/hooks/useContextoAsistencia';

const NOMBRE_EMPRESA = import.meta.env.VITE_NOMBRE_EMPRESA || 'Intranet';

// Lectura de la gestión de asistencia (resultados, periodos, parámetros): RH = Asistencia:edicion o Empleados:edicion
const REQUIERE_GESTION_ASISTENCIA = [['Asistencia', 'edicion'], ['Empleados', 'edicion']];
// «Mi asistencia» y «Mi equipo»: cualquier nivel de Asistencia (consulta basta); además dependen del contexto del servidor
const REQUIERE_CONSULTA_ASISTENCIA = [['Asistencia', 'consulta'], ['Asistencia', 'edicion']];

/**
 * Contenedor de los subitems de un grupo del menú. La altura abierta NO es fija: el CSS deja `max-height: none` cuando está
 * abierto (cabe cualquier número de enlaces) y aquí solo se anima la apertura/cierre midiendo la altura real del contenido.
 */
function Subitems({ abierto, children }) {
  const ref = useRef(null);
  const previo = useRef(abierto);
  const altura = useRef(0);
  // Altura real del contenido mientras está abierto: se guarda ANTES de cerrar porque leer scrollHeight tras quitar la clase
  // fuerza un cálculo de estilo con max-height 0 y la transición de cierre arrancaría desde 0 (saltaba en un cuadro)
  useLayoutEffect(() => {
    if (abierto && ref.current) altura.current = ref.current.scrollHeight;
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || previo.current === abierto) return undefined;
    previo.current = abierto;
    // prefers-reduced-motion: sin animación (el CSS ya pone la transición en none); solo cambia el estado
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const limpiar = () => { el.style.maxHeight = ''; };
    let r1 = 0;
    let r2 = 0;
    if (abierto) {
      el.style.maxHeight = '0px';
      void el.offsetHeight; // fuerza el cálculo para que arranque la transición
      el.style.maxHeight = `${el.scrollHeight}px`;
    } else {
      // Cierre: el CSS ya dejó max-height en 0 (clase quitada); se fija la altura real y, DOS cuadros después, 0, para que
      // el navegador vea el cambio px -> 0 y lo anime (con un solo reflow forzado el cierre saltaba en un cuadro)
      el.style.maxHeight = `${altura.current || el.scrollHeight}px`;
      r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => { el.style.maxHeight = '0px'; }); });
    }
    const t = setTimeout(limpiar, 360);
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(t); limpiar(); };
  }, [abierto]);
  return <div ref={ref} className={`sidebar-subitems${abierto ? ' abierto' : ''}`}>{children}</div>;
}

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
    // Asistencia propia y del equipo (fuera del grupo «Asistencia» de administración): según el contexto del servidor
    { path: '/rh/asistencia/mi-asistencia', label: 'Mi asistencia', opcion: 'Asistencia', requiere: REQUIERE_CONSULTA_ASISTENCIA, contexto: 'empleado' },
    { path: '/rh/asistencia/mi-equipo', label: 'Mi equipo', opcion: 'Asistencia', requiere: REQUIERE_CONSULTA_ASISTENCIA, contexto: 'jefe' },
    { path: '/rh/calendario', label: 'Calendario', opcion: 'Calendario' },
    { path: '/rh/areas', label: 'Áreas', opcion: 'Empleados' },
    { path: '/rh/departamentos', label: 'Departamentos', opcion: 'Departamentos' },
    { path: '/rh/puestos', label: 'Puestos', opcion: 'Empleados' },
    { path: '/rh/ubicaciones', label: 'Ubicaciones', opcion: 'Empleados' },
    // Grupo «Asistencia» (administración): visible solo con el permiso de Turnos / Ingesta
    { path: '/rh/asistencia/turnos', label: 'Turnos', opcion: 'Turnos', grupo: 'Asistencia' },
    { path: '/rh/asistencia/asignaciones', label: 'Asignaciones', opcion: 'Turnos', grupo: 'Asistencia' },
    { path: '/rh/asistencia/marcas', label: 'Marcas', opcion: 'Ingesta', grupo: 'Asistencia' },
    { path: '/rh/asistencia/sincronizacion', label: 'Sincronización', opcion: 'Ingesta', grupo: 'Asistencia' },
    { path: '/rh/asistencia/llaves', label: 'Llaves de ingesta', opcion: 'Ingesta', grupo: 'Asistencia' },
    // Resultados del motor (gestión): Asistencia:edicion o Empleados:edicion (rh_empleado solo tiene Asistencia:consulta)
    { path: '/rh/asistencia/resultados', label: 'Resultados', opcion: 'Asistencia', requiere: REQUIERE_GESTION_ASISTENCIA, grupo: 'Asistencia' },
    { path: '/rh/asistencia/periodos', label: 'Periodos', opcion: 'Asistencia', requiere: REQUIERE_GESTION_ASISTENCIA, grupo: 'Asistencia' },
    { path: '/rh/asistencia/parametros', label: 'Parámetros', opcion: 'Asistencia', requiere: REQUIERE_GESTION_ASISTENCIA, grupo: 'Asistencia' },
  ],
  tickets: [
    { path: '/tickets', label: 'Dashboard', opcion: null },
    { path: '/tickets/lista', label: 'Tickets', opcion: 'Tickets' },
    { path: '/tickets/categorias', label: 'Categorías', opcion: 'Categorías' },
    { path: '/tickets/encuestas', label: 'Encuestas', opcion: 'Encuestas' },
  ],
  comercial: [
    { path: '/comercial', label: 'Dashboard', opcion: null },
    { path: '/comercial/creditos', label: 'Solicitudes de Crédito', opcion: 'Solicitudes de Crédito' },
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

export default function MenuDinamico({ modulos = [], permisos = [], abierto, onCerrar, onCerrarMenu }) {
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

  // Contexto de asistencia (caché corta en cliente): solo se pide a quien tiene Asistencia:consulta
  const consultaAsistencia = tieneAccesoMenu({ usuario, permisos, modulo: 'rh', opcion: 'Asistencia', requiere: REQUIERE_CONSULTA_ASISTENCIA });
  const { datos: contextoAsistencia } = useContextoAsistencia({ habilitado: Boolean(usuario) && consultaAsistencia, refrescarCon: location.pathname });
  const esAdmin = usuario?.roles?.some(r => ROLES_ADMIN.includes(r));
  const modulosActivos = modulos.filter(m => m.activo);

  // Filtra módulos donde el usuario tiene acceso a al menos una sub-ruta
  const modulosVisibles = modulosActivos.filter((m) => {
    const subRutas = SUB_RUTAS[m.nombre] || [];
    if (subRutas.length === 0) return true; // módulos sin sub-rutas siempre se muestran
    return subRutas.some((sr) => tieneAcceso(m.nombre, sr.opcion, Boolean(sr.grupo), sr.requiere) && visibleSegunContexto(sr.contexto, contextoAsistencia));
  });

  function esActivo(ruta) {
    if (ruta === '/') return location.pathname === '/';
    return location.pathname === ruta || location.pathname.startsWith(ruta + '/');
  }

  function tieneAcceso(moduloNombre, opcion, estricto = false, requiere = null) {
    return tieneAccesoMenu({ usuario, permisos, modulo: moduloNombre, opcion, estricto, requiere });
  }

  return (
    <aside className={`app-sidebar${abierto ? ' abierto' : ''}`}>
      {/* Solo se ve cuando el menú es un drawer sin otro botón a mano (franja 641-768 px) */}
      <button type="button" className="sidebar-cerrar-menu" onClick={onCerrarMenu || onCerrar}>Cerrar menú</button>
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

              <Subitems abierto={estaAbierto}>
                {subRutas
                  .filter((sr) => tieneAcceso(m.nombre, sr.opcion, Boolean(sr.grupo), sr.requiere) && visibleSegunContexto(sr.contexto, contextoAsistencia))
                  .map((sr, i, visibles) => (
                    <Fragment key={sr.path}>
                      {sr.grupo && visibles[i - 1]?.grupo !== sr.grupo && (
                        <div className="sidebar-subgrupo" role="presentation">{sr.grupo}</div>
                      )}
                      <Link to={sr.path} className={esActivo(sr.path) ? 'activo' : ''}>
                        {sr.label}
                      </Link>
                    </Fragment>
                  ))}
              </Subitems>
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
              <Subitems abierto={estaAbierto}>
                {ADMIN_ITEMS.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={location.pathname === item.path ? 'activo' : ''}
                  >
                    {item.label}
                  </Link>
                ))}
              </Subitems>
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
