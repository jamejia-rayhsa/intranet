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
  let jefes = 0;
  for (const { cuenta, candidato } of entradas) {
    pares.push({ usuario_id: cuenta.id, empleado_id: candidato.id });
    usadosPorEmpleado.set(candidato.id, (usadosPorEmpleado.get(candidato.id) || 0) + 1);
    if (!cuenta.con_acceso_asistencia) sinAcceso++;
    if (cuenta.privilegiada) privilegiadas++;
    if (!cuenta.activo) inactivas++;
    if (candidato.subordinados > 0) jefes++;
  }
  const repetidos = [...usadosPorEmpleado.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  return { pares, total: pares.length, sinAcceso, privilegiadas, inactivas, jefes, repetidos };
}

// Alcance REAL de empleados.usuario_id (acceso-empleado.middleware.js, solicitudVacaciones.model.js): se dice igual en toda la UI.
export const AVISO_ALCANCE = 'Al vincular, quien use esa cuenta verá y podrá gestionar lo que corresponde a ese empleado: su asistencia, su expediente, sus recibos de nómina y, si es jefe, aprobar vacaciones de su equipo. Verifica que cuenta y empleado sean la misma persona.';

export const MENSAJE_SOLO_ACTIVOS = 'Solo se vinculan cuentas a empleados con estatus activo (los suspendidos y los dados de baja no se vinculan).';

/**
 * Atajo "Marcar las coincidencias exactas": SOLO marca las coincidencias exactas únicas SEGURAS. Deja fuera a propósito (RH las
 * marca a mano, con su confirmación) las cuentas privilegiadas o con permisos de administración, las de correo duplicado entre
 * cuentas y las inactivas; los homónimos ('varias') nunca son 'exacta'. Devuelve { marcadas:[{cuenta,candidato}], omitidas }.
 */
export function seleccionarExactasSeguras(cuentas) {
  const marcadas = [];
  const omitidas = { privilegiadas: 0, duplicadas: 0, inactivas: 0 };
  for (const c of cuentas || []) {
    const s = c.sugerencia;
    if (!s || s.estado !== 'exacta' || !s.candidatos || s.candidatos.length !== 1) continue;
    if (c.privilegiada) { omitidas.privilegiadas++; continue; }
    if (c.correo_duplicado) { omitidas.duplicadas++; continue; }
    if (c.activo === false) { omitidas.inactivas++; continue; }
    marcadas.push({ cuenta: c, candidato: s.candidatos[0] });
  }
  return { marcadas, omitidas };
}

export function textoConfirmacion(resumen) {
  const partes = [`Vas a vincular ${resumen.total} ${resumen.total === 1 ? 'cuenta' : 'cuentas'} a ${resumen.total} ${resumen.total === 1 ? 'empleado' : 'empleados'}.`];
  partes.push(AVISO_ALCANCE);
  if (resumen.jefes) partes.push(`${resumen.jefes} de esos empleados ${resumen.jefes === 1 ? 'es jefe' : 'son jefes'} con personal a su cargo: ${resumen.jefes === 1 ? 'su cuenta podrá' : 'sus cuentas podrán'} aprobar o rechazar las vacaciones de su equipo.`);
  if (resumen.sinAcceso) partes.push(`${resumen.sinAcceso} sin un rol con acceso a Asistencia: no verán "Mi asistencia" hasta que el administrador de usuarios les asigne el rol.`);
  return partes.join(' ');
}
