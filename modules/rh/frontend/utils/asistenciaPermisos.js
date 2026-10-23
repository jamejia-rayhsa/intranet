// Permisos de las pantallas de administración de Asistencia. Lógica pura (sin imports: jest evalúa el fuente).
// Solo decide qué mostrar: el backend (verificarPermiso) es la autoridad real.
export const OPCION_TURNOS = 'Turnos';
export const OPCION_INGESTA = 'Ingesta';

/**
 * Nivel de acceso a una opción del módulo RH: 'edicion' (incluye consulta), 'consulta' o null.
 * super_admin siempre tiene 'edicion'. `permisos` viene de /permisos/mis-permisos ([{modulo, opcion, tipo}]).
 */
export function nivelDePermiso(usuario, permisos, opcion) {
  if (usuario && (usuario.rol_nombre === 'super_admin' || (Array.isArray(usuario.roles) && usuario.roles.includes('super_admin')))) {
    return 'edicion';
  }
  let nivel = null;
  for (const p of Array.isArray(permisos) ? permisos : []) {
    if (String(p.modulo).toLowerCase() !== 'rh' || p.opcion !== opcion) continue;
    if (p.tipo === 'edicion') return 'edicion';
    if (p.tipo === 'consulta') nivel = 'consulta';
  }
  return nivel;
}
