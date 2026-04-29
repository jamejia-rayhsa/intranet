import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerSaldo(empleadoId, periodo) {
  const parametros = new URLSearchParams();
  if (empleadoId) parametros.append("empleado_id", empleadoId);
  if (periodo) parametros.append("periodo", periodo);
  return solicitar(`/vacaciones/saldo?${parametros.toString()}`);
}

export async function crearSolicitud(datos) {
  return solicitar("/vacaciones", {
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

export async function obtenerSolicitud(id) {
  return solicitar(`/vacaciones/${id}`);
}

export async function responderSolicitud(id, estatus, motivoRechazo) {
  return solicitar(`/vacaciones/${id}/responder`, {
    method: "PUT",
    body: JSON.stringify({ estatus, motivo_rechazo: motivoRechazo || null }),
  });
}
