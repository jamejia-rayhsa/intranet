// modules/portal/frontend/components/StatusPill.jsx
const STATUS_MAP = {
  'Abierto':       { bg: '#fee2e2', fg: '#dc2626' },
  'abierto':       { bg: '#fee2e2', fg: '#dc2626' },
  'En proceso':    { bg: '#fef3c7', fg: '#d97706' },
  'en_proceso':    { bg: '#fef3c7', fg: '#d97706' },
  'En revisión':   { bg: '#fef3c7', fg: '#d97706' },
  'Pendiente':     { bg: '#fef3c7', fg: '#d97706' },
  'pendiente':     { bg: '#fef3c7', fg: '#d97706' },
  'Cerrado':       { bg: '#dcfce7', fg: '#16a34a' },
  'cerrado':       { bg: '#dcfce7', fg: '#16a34a' },
  'Aprobada':      { bg: '#dcfce7', fg: '#16a34a' },
  'Aprobado':      { bg: '#dcfce7', fg: '#16a34a' },
  'aprobado':      { bg: '#dcfce7', fg: '#16a34a' },
  'Rechazada':     { bg: '#fee2e2', fg: '#dc2626' },
  'rechazado':     { bg: '#fee2e2', fg: '#dc2626' },
  'INSERT':        { bg: '#dcfce7', fg: '#16a34a' },
  'UPDATE':        { bg: '#e0f2fe', fg: '#0284c7' },
  'DELETE':        { bg: '#fee2e2', fg: '#dc2626' },
  'Borrador':      { bg: '#ece9e3', fg: '#766E63' },
  'borrador':      { bg: '#ece9e3', fg: '#766E63' },
  'urgente':       { bg: '#fee2e2', fg: '#dc2626' },
  'normal':        { bg: '#e0f2fe', fg: '#0284c7' },
  'activo':        { bg: '#dcfce7', fg: '#16a34a' },
  'baja':          { bg: '#fee2e2', fg: '#dc2626' },
};

/**
 * StatusPill — píldora coloreada según el estado.
 */
export default function StatusPill({ estado, children }) {
  const label = children || estado;
  const s = STATUS_MAP[estado] || STATUS_MAP[estado?.toLowerCase()] || { bg: '#ece9e3', fg: '#766E63' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '0.18rem 0.6rem',
      borderRadius: 999,
      background: s.bg,
      color: s.fg,
      fontSize: '0.72rem',
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

/**
 * Piramide — visualización de prioridad (1–4 niveles)
 */
export function Piramide({ nivel = 0, niveles = 4 }) {
  return (
    <span className="piramide" title={`Nivel ${nivel}`}>
      {Array.from({ length: niveles }).map((_, i) => (
        <span key={i} className={i < nivel ? 'activa' : ''}>▰</span>
      ))}
    </span>
  );
}

/**
 * Avatar — pill con iniciales + nombre + área
 */
export function Avatar({ iniciales, nombre, sub }) {
  const ini = iniciales || (nombre ? nombre.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() : '?');
  return (
    <span className="avatar-pill">
      <span className="avatar-pill__avi">{ini}</span>
      <span>
        <span className="avatar-pill__nom">{nombre}</span>
        {sub && <span className="avatar-pill__sub">{sub}</span>}
      </span>
    </span>
  );
}
