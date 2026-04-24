import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerPuestos() {
  return solicitar("/puestos");
}

export async function crearPuesto(datos) {
  return solicitar("/puestos", {
    metodo: "POST",
    cuerpo: JSON.stringify(datos),
  });
}

export async function actualizarPuesto(id, datos) {
  return solicitar(`/puestos/${id}`, {
    metodo: "PUT",
    cuerpo: JSON.stringify(datos),
  });
}

export async function eliminarPuesto(id) {
  return solicitar(`/puestos/${id}`, { metodo: "DELETE" });
}
