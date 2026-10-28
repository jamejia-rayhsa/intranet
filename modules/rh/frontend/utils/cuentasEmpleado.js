// Lógica pura de la pantalla "Vincular cuentas" (sin imports: jest evalúa el fuente). El backend revalida todo.
export const TAMANO_LOTE_VINCULAR = 50;

export const ETIQUETAS_SUGERENCIA = {
  exacta: 'Coincidencia exacta única',
  varias: 'Varias posibles',
  sin_coincidencia: 'Sin coincidencia',
};

export function dividirLotes(lista, tamano = TAMANO_LOTE_VINCULAR) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}

/**
 * `seleccion`: Map/objeto cuentaId -> { cuenta, candidato } con lo que RH marcó. Devuelve los pares para el servidor, los
 * contadores para el texto de confirmación y los empleados elegidos para más de una cuenta (bloquean la aplicación).
 */
export function resumirSeleccion(seleccion) {
  const entradas = seleccion instanceof Map ? [...seleccion.values()] : Object.values(seleccion || {});
  const pares = [];
  const usadosPorEmpleado = new Map();
  let sinAcceso = 0;
  let privilegiadas = 0;
  let inactivas = 0;
  for (const { cuenta, candidato } of entradas) {
    pares.push({ usuario_id: cuenta.id, empleado_id: candidato.id });
    usadosPorEmpleado.set(candidato.id, (usadosPorEmpleado.get(candidato.id) || 0) + 1);
    if (!cuenta.con_acceso_asistencia) sinAcceso++;
    if (cuenta.privilegiada) privilegiadas++;
    if (!cuenta.activo) inactivas++;
  }
  const repetidos = [...usadosPorEmpleado.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  return { pares, total: pares.length, sinAcceso, privilegiadas, inactivas, repetidos };
}

export function textoConfirmacion(resumen) {
  const partes = [`Vas a vincular ${resumen.total} ${resumen.total === 1 ? 'cuenta' : 'cuentas'} a ${resumen.total} ${resumen.total === 1 ? 'empleado' : 'empleados'}.`];
  partes.push('Cada persona verá la asistencia del empleado al que quede vinculada su cuenta: revisa que nombre, correo y departamento correspondan.');
  if (resumen.sinAcceso) partes.push(`${resumen.sinAcceso} sin un rol con acceso a Asistencia: no verán "Mi asistencia" hasta que el administrador de usuarios les asigne el rol.`);
  return partes.join(' ');
}
