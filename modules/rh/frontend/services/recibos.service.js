import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerRecibos(empleadoId) {
  return solicitar(`/recibos/empleado/${empleadoId}`);
}

export async function obtenerRecibo(id) {
  return solicitar(`/recibos/${id}`);
}

export async function obtenerRecibosPorPeriodo(periodo) {
  return solicitar(`/recibos/periodo/${periodo}`);
}

export async function crearRecibo(datos) {
  return solicitar("/recibos", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export async function eliminarRecibo(id) {
  return solicitar(`/recibos/${id}`, {
    method: "DELETE",
  });
}
