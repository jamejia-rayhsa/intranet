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

export const OPCION_ASISTENCIA = 'Asistencia';
export const OPCION_EMPLEADOS = 'Empleados';

/**
 * Acceso a la gestión de resultados, periodos y parámetros: leer con Asistencia:edicion o Empleados:edicion (como la API:
 * «RH»), escribir solo con Asistencia:edicion. Niveles undefined = aún cargando.
 * @returns {{cargando:boolean, puedeLeer:boolean, puedeEscribir:boolean}}
 */
export function accesoGestionAsistencia(nivelAsistencia, nivelEmpleados) {
  if (nivelAsistencia === undefined || nivelEmpleados === undefined) return { cargando: true, puedeLeer: false, puedeEscribir: false };
  const puedeEscribir = nivelAsistencia === 'edicion';
  return { cargando: false, puedeLeer: puedeEscribir || nivelEmpleados === 'edicion', puedeEscribir };
}
