import { solicitar as solicitarApi } from "../../../portal/frontend/utils/api";
import { mensajeErrorRed } from "../utils/calendarioLaboral";

// solicitar() lanza SyntaxError si el proxy devuelve HTML (502/504) y TypeError si no hay red: se traducen a
// un mensaje legible conservando el status (403 -> la pantalla muestra "sin permiso").
async function solicitar(ruta, opciones) {
  try {
    return await solicitarApi(ruta, opciones);
  } catch (err) {
    if (err && (err.name === "SyntaxError" || err.name === "TypeError")) {
      const legible = new Error(mensajeErrorRed(err));
      legible.status = err.status;
      throw legible;
    }
    throw err;
  }
}

const json = (datos) => JSON.stringify(datos);
const base = "/asistencia";

// --- Turnos ---
export const listarTurnos = () => solicitar(`${base}/turnos`);
export const obtenerTurno = (id) => solicitar(`${base}/turnos/${id}`);
export const usoDeTurnos = () => solicitar(`${base}/turnos/uso`);
export const crearTurno = (datos) => solicitar(`${base}/turnos`, { method: "POST", body: json(datos) });
export const actualizarTurno = (id, datos) => solicitar(`${base}/turnos/${id}`, { method: "PUT", body: json(datos) });
export const eliminarTurno = (id) => solicitar(`${base}/turnos/${id}`, { method: "DELETE" });

// --- Asignaciones ---
export const listarAsignaciones = (tipo) => solicitar(`${base}/asignaciones/${tipo === "departamento" ? "departamentos" : "empleados"}`);
export const asignarTurno = (tipo, datos) =>
  solicitar(`${base}/asignaciones/${tipo === "departamento" ? "departamentos" : "empleados"}`, { method: "POST", body: json(datos) });
export const terminarAsignacion = (tipo, id, vigenteHasta) =>
  solicitar(`${base}/asignaciones/${tipo === "departamento" ? "departamentos" : "empleados"}/${id}/terminar`, {
    method: "PUT",
    body: json({ vigente_hasta: vigenteHasta }),
  });
export const buscarEmpleados = ({ q, pagina, limite }) => {
  const p = new URLSearchParams({ pagina: String(pagina), limite: String(limite) });
  if (q) p.set("q", q);
  return solicitar(`${base}/empleados?${p.toString()}`);
};
export const historialEmpleado = (id) => solicitar(`${base}/empleados/${id}/turnos`);
export const listarDepartamentos = () => solicitar("/departamentos");

// --- Marcas ---
export const consultarMarcas = (consulta) => solicitar(`${base}/marcas?${consulta}`);
export const codigosSinEmpleado = () => solicitar(`${base}/marcas/codigos-sin-empleado`);
export const empleadosSinNomina = () => solicitar(`${base}/empleados-sin-nomina`);
export const registrarExportacionMarcas = (filas) => solicitar(`${base}/marcas/exportaciones`, { method: "POST", body: json({ filas }) });
export const revincularMarcas = () => solicitar(`${base}/marcas/revincular`, { method: "POST", body: json({}) });

// --- Sincronización ---
export const estadoSincronizacion = () => solicitar(`${base}/sincronizacion/estado`);
export const lotesSincronizacion = ({ pagina, limite }) => solicitar(`${base}/sincronizacion/lotes?pagina=${pagina}&limite=${limite}`);

// --- Llaves ---
export const listarLlaves = () => solicitar(`${base}/llaves`);
export const crearLlave = (datos) => solicitar(`${base}/llaves`, { method: "POST", body: json(datos) });
export const rotarLlave = (id, datos) => solicitar(`${base}/llaves/${id}/rotar`, { method: "POST", body: json(datos) });
export const revocarLlave = (id) => solicitar(`${base}/llaves/${id}/revocar`, { method: "POST", body: json({}) });
export const editarIpsLlave = (id, ips) => solicitar(`${base}/llaves/${id}/ips`, { method: "PUT", body: json({ ips_permitidas: ips }) });

// --- Resultados del motor, periodos y parámetros (gestión de RH) ---
export const listarPeriodos = ({ pagina = 1, limite = 100 } = {}) => solicitar(`${base}/periodos?pagina=${pagina}&limite=${limite}`);
export const resumenResultados = ({ desde, hasta, departamentoId, pagina = 1, limite = 500 }) => {
  const p = new URLSearchParams({ desde, hasta, pagina: String(pagina), limite: String(limite) });
  if (departamentoId) p.set("departamento_id", String(departamentoId));
  return solicitar(`${base}/resumen?${p.toString()}`);
};
export const listarResultados = ({ desde, hasta, empleadoId, pagina = 1, limite = 500 }) => {
  const p = new URLSearchParams({ desde, hasta, pagina: String(pagina), limite: String(limite) });
  if (empleadoId) p.set("empleado_id", String(empleadoId));
  return solicitar(`${base}/resultados?${p.toString()}`);
};
export const detalleDia = (empleadoId, fecha) => solicitar(`${base}/resultados/dia?empleado_id=${empleadoId}&fecha=${fecha}`);
export const justificarDia = (datos) => solicitar(`${base}/incidencias`, { method: "POST", body: json(datos) });
export const anularJustificacion = (id) => solicitar(`${base}/incidencias/${id}/anular`, { method: "POST", body: json({}) });
export const sinIdentificador = ({ pagina = 1, limite = 100 } = {}) => solicitar(`${base}/sin-identificador?pagina=${pagina}&limite=${limite}`);
export const registrarExportacionResultados = (tipo, filas) =>
  solicitar(`${base}/resultados/exportaciones`, { method: "POST", body: json({ tipo, filas }) });
export const contadoresPeriodo = (id) => solicitar(`${base}/periodos/${id}/contadores`);
export const cerrarPeriodo = (id, esperados) => solicitar(`${base}/periodos/${id}/cerrar`, { method: "POST", body: json({ esperados }) });
export const reabrirPeriodo = (id, motivo) => solicitar(`${base}/periodos/${id}/reabrir`, { method: "POST", body: json({ motivo }) });
export const recalcularRango = (datos) => solicitar(`${base}/recalcular`, { method: "POST", body: json(datos) });
export const listarAjustes = ({ pagina = 1, limite = 50 } = {}) => solicitar(`${base}/ajustes-pendientes?pagina=${pagina}&limite=${limite}`);
export const resolverAjuste = (id, nota) => solicitar(`${base}/ajustes-pendientes/${id}/resolver`, { method: "POST", body: json(nota ? { nota } : {}) });
export const listarEjecuciones = (limite = 20) => solicitar(`${base}/ejecuciones?limite=${limite}`);
export const obtenerParametros = () => solicitar(`${base}/parametros`);
export const guardarParametros = (cambios, confirmacion) =>
  solicitar(`${base}/parametros`, { method: "PUT", body: json(confirmacion ? { ...cambios, confirmacion } : cambios) });

/** Mensaje para mostrar: 403 -> sin permiso; el resto, el del servidor o el de red. */
export function mensajeDeError(err, porDefecto) {
  if (err && err.status === 403) return "No tienes permiso para esta pantalla o acción.";
  return (err && err.message) || porDefecto;
}
