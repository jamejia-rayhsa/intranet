import { solicitar } from "../../../portal/frontend/utils/api";
import { mensajeErrorRed } from "../utils/calendarioLaboral";

// solicitar() lanza SyntaxError (HTML de un 502) o TypeError (sin red): se traducen a un mensaje legible
// sin tocar api.js (compartido por todos los módulos); los errores del backend conservan su `mensaje`.
async function solicitarLegible(ruta, opciones) {
  try {
    return await solicitar(ruta, opciones);
  } catch (err) {
    if (err && (err.name === "SyntaxError" || err.name === "TypeError")) {
      const legible = new Error(mensajeErrorRed(err));
      legible.status = err.status;
      throw legible;
    }
    throw err;
  }
}

export async function obtenerSaldo(empleadoId, periodo) {
  const parametros = new URLSearchParams();
  if (empleadoId) parametros.append("empleado_id", empleadoId);
  if (periodo) parametros.append("periodo", periodo);
  return solicitar(`/vacaciones/saldo?${parametros.toString()}`);
}

export async function crearSolicitud(datos) {
  return solicitarLegible("/vacaciones", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export async function listarSolicitudes(filtros = {}) {
  const parametros = new URLSearchParams();
  if (filtros.pagina) parametros.append("pagina", filtros.pagina);
  if (filtros.limite) parametros.append("limite", filtros.limite);
  if (filtros.estatus) parametros.append("estatus", filtros.estatus);
  if (filtros.periodo) parametros.append("periodo", filtros.periodo);
  if (filtros.empleado_id) parametros.append("empleado_id", filtros.empleado_id);
  if (filtros.busqueda) parametros.append("busqueda", filtros.busqueda);
  return solicitar(`/vacaciones?${parametros.toString()}`);
}

// Cálculo de días hábiles, cupo y conflictos: lo decide el backend (única fuente de la regla).
export async function consultarDisponibilidad({ fecha_inicial, fecha_final, empleado_id } = {}) {
  const parametros = new URLSearchParams({ fecha_inicial, fecha_final });
  if (empleado_id) parametros.append("empleado_id", empleado_id);
  return solicitarLegible(`/vacaciones/disponibilidad?${parametros.toString()}`);
}

// Fechas llenas, no hábiles y eventos de un rango (máx. 366 días) para el calendario de ocupación.
export async function consultarOcupacion({ desde, hasta, empleado_id } = {}) {
  const parametros = new URLSearchParams({ desde, hasta });
  if (empleado_id) parametros.append("empleado_id", empleado_id);
  return solicitarLegible(`/vacaciones/ocupacion?${parametros.toString()}`);
}

export async function obtenerSolicitud(id) {
  return solicitar(`/vacaciones/${id}`);
}

export async function responderSolicitud(id, estatus, motivoRechazo) {
  return solicitarLegible(`/vacaciones/${id}/responder`, {
    method: "PUT",
    body: JSON.stringify({ estatus, motivo_rechazo: motivoRechazo || null }),
  });
}
