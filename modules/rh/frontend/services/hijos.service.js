import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerHijos(empleadoId) {
  return solicitar(`/empleados/${empleadoId}/hijos`);
}

export async function crearHijo(empleadoId, datos) {
  return solicitar(`/empleados/${empleadoId}/hijos`, {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export async function actualizarHijo(id, datos) {
  return solicitar(`/empleados/hijos/${id}`, {
    method: "PUT",
    body: JSON.stringify(datos),
  });
}

export async function eliminarHijo(id) {
  return solicitar(`/empleados/hijos/${id}`, { method: "DELETE" });
}
