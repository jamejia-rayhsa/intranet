import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerAreas() {
  return solicitar("/areas");
}
