import { obtenerToken } from "../../../portal/frontend/utils/token";
import { solicitar } from "../../../portal/frontend/utils/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export async function obtenerDocumentos(empleadoId) {
  return solicitar(`/expediente/${empleadoId}`);
}

export async function subirDocumento(
  empleadoId,
  archivo,
  tipoDocumento,
  descripcion = "",
) {
  const token = await obtenerToken();
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  formulario.append("tipo_documento", tipoDocumento);
  if (descripcion) formulario.append("descripcion", descripcion);

  const respuesta = await fetch(`${API_URL}/expediente/${empleadoId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formulario,
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(datos.mensaje || "Error al subir documento");
  }

  return datos;
}

export async function eliminarDocumento(id) {
  return solicitar(`/expediente/${id}`, {
    method: "DELETE",
  });
}

export async function obtenerUrlDocumento(id) {
  return solicitar(`/expediente/${id}/url`);
}
