import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerEmpleados(filtros = {}) {
  const parametros = new URLSearchParams();

  if (filtros.pagina) parametros.append("pagina", filtros.pagina);
  if (filtros.limite) parametros.append("limite", filtros.limite);
  if (filtros.estatus) parametros.append("estatus", filtros.estatus);
  if (filtros.departamento)
    parametros.append("departamento", filtros.departamento);
  if (filtros.busqueda) parametros.append("busqueda", filtros.busqueda);

  return solicitar(`/empleados?${parametros.toString()}`);
}

export async function obtenerEmpleado(id) {
  return solicitar(`/empleados/${id}`);
}

export async function obtenerMiPerfil() {
  return solicitar("/empleados/mi-perfil");
}

export async function crearEmpleado(datos) {
  return solicitar("/empleados", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export async function actualizarEmpleado(id, datos) {
  return solicitar(`/empleados/${id}`, {
    method: "PUT",
    body: JSON.stringify(datos),
  });
}

export async function marcarBaja(id, motivo = "") {
  return solicitar(`/empleados/${id}/baja`, {
    method: "PUT",
    body: JSON.stringify({ motivo }),
  });
}

export async function obtenerSubordinados(jefeId) {
  return solicitar(`/empleados/jefe/${jefeId}/subordinados`);
}

export async function obtenerRoles() {
  return solicitar("/roles");
}
