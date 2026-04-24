import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerCategorias() {
  return solicitar("/categorias/public");
}
