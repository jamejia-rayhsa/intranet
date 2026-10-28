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
