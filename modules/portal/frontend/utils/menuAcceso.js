// Decide si una entrada del menú lateral se muestra. Lógica pura (sin imports: jest evalúa el fuente).
// `estricto`: sin permiso explícito no se muestra (ni siquiera con la lista de permisos vacía).
// `requiere`: lista [opcion, tipo] de las que basta UNA (p. ej. gestión de asistencia: edición).
export function tieneAccesoMenu({ usuario, permisos, modulo, opcion, estricto = false, requiere = null }) {
  if (usuario && usuario.rol_nombre === 'super_admin') return true;
  const lista = Array.isArray(permisos) ? permisos : [];
  if (requiere) {
    return lista.some((p) => String(p.modulo).toLowerCase() === String(modulo).toLowerCase() && requiere.some(([o, t]) => p.opcion === o && p.tipo === t));
  }
  if (!opcion) return true;
  if (lista.length === 0 && !estricto) return true;
  return lista.some((p) => String(p.modulo).toLowerCase() === String(modulo).toLowerCase() && p.opcion === opcion);
}

/**
 * Entradas del menú que dependen de quién es el usuario para la asistencia (GET /asistencia/mi-contexto):
 * 'empleado' = tiene empleado vinculado; 'jefe' = jefe inmediato vigente de al menos un empleado activo. Sin contexto
 * (aún cargando, error o sin permiso) la entrada NO se muestra: el servidor es quien decide.
 */
export function visibleSegunContexto(requiereContexto, contexto) {
  if (!requiereContexto) return true;
  if (!contexto) return false;
  if (requiereContexto === 'empleado') return Boolean(contexto.vinculado);
  if (requiereContexto === 'jefe') return Boolean(contexto.es_jefe);
  return false;
}
