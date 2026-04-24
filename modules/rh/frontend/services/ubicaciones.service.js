import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerUbicaciones() {
  return solicitar("/ubicaciones");
}

export async function crearUbicacion(datos) {
  return solicitar("/ubicaciones", {
    metodo: "POST",
    cuerpo: JSON.stringify(datos),
  });
}

export async function actualizarUbicacion(id, datos) {
  return solicitar(`/ubicaciones/${id}`, {
    metodo: "PUT",
    cuerpo: JSON.stringify(datos),
  });
}

export async function eliminarUbicacion(id) {
  return solicitar(`/ubicaciones/${id}`, { metodo: "DELETE" });
}
