import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerDepartamentos() {
  return solicitar("/departamentos");
}

export async function crearDepartamento(datos) {
  return solicitar("/departamentos", {
    metodo: "POST",
    cuerpo: JSON.stringify(datos),
  });
}

export async function actualizarDepartamento(id, datos) {
  return solicitar(`/departamentos/${id}`, {
    metodo: "PUT",
    cuerpo: JSON.stringify(datos),
  });
}

export async function eliminarDepartamento(id) {
  return solicitar(`/departamentos/${id}`, { metodo: "DELETE" });
}
