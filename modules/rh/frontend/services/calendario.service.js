import { solicitar as solicitarApi } from "../../../portal/frontend/utils/api";
import { mensajeErrorRed } from "../utils/calendarioLaboral";

// solicitar() lanza SyntaxError si el proxy devuelve HTML (502/504) y TypeError si no hay red:
// aquí se traducen a un mensaje legible sin tocar api.js (compartido por todos los módulos).
async function solicitar(ruta, opciones) {
  try {
    return await solicitarApi(ruta, opciones);
  } catch (err) {
    if (err && (err.name === "SyntaxError" || err.name === "TypeError")) {
      const legible = new Error(mensajeErrorRed(err));
      legible.status = err.status;
      throw legible;
    }
    throw err;
  }
}

export async function listarCalendario({ desde, hasta, tipo } = {}) {
  const parametros = new URLSearchParams();
  if (desde) parametros.append("desde", desde);
  if (hasta) parametros.append("hasta", hasta);
  if (tipo) parametros.append("tipo", tipo);
  const consulta = parametros.toString();
  return solicitar(`/calendario-laboral${consulta ? `?${consulta}` : ""}`);
}

export async function crearFechaCalendario(datos) {
  return solicitar("/calendario-laboral", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export async function actualizarFechaCalendario(id, datos) {
  return solicitar(`/calendario-laboral/${id}`, {
    method: "PUT",
    body: JSON.stringify(datos),
  });
}

export async function eliminarFechaCalendario(id) {
  return solicitar(`/calendario-laboral/${id}`, { method: "DELETE" });
}

export async function obtenerMisPermisos() {
  return solicitar("/permisos/mis-permisos");
}
