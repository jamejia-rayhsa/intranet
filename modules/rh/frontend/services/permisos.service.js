import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerPermisos(filtros = {}) {
  const parametros = new URLSearchParams();

  if (filtros.pagina) parametros.append("pagina", filtros.pagina);
  if (filtros.limite) parametros.append("limite", filtros.limite);
  if (filtros.estatus) parametros.append("estatus", filtros.estatus);
  if (filtros.tipo) parametros.append("tipo", filtros.tipo);
  if (filtros.empleado_id)
    parametros.append("empleado_id", filtros.empleado_id);

  return solicitar(`/permisos-rh?${parametros.toString()}`);
}

export async function obtenerPermiso(id) {
  return solicitar(`/permisos-rh/${id}`);
}

export async function solicitarPermiso(datos) {
  return solicitar("/permisos-rh", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export async function responderPermiso(id, estatus) {
  return solicitar(`/permisos-rh/${id}/responder`, {
    method: "PUT",
    body: JSON.stringify({ estatus }),
  });
}
