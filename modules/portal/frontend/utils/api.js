import { obtenerToken } from "./token";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export async function solicitar(ruta, opciones = {}) {
  const token = await obtenerToken();

  const encabezados = {
    "Content-Type": "application/json",
    ...opciones.headers,
  };

  if (token) {
    encabezados["Authorization"] = `Bearer ${token}`;
  }

  const configuracion = {
    method: opciones.method || opciones.metodo || "GET",
    headers: encabezados,
  };

  if (opciones.body || opciones.cuerpo) {
    configuracion.body = opciones.body || opciones.cuerpo;
  }

  const respuesta = await fetch(`${API_URL}${ruta}`, configuracion);

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    const error = new Error(datos.mensaje || "Error en la solicitud");
    error.status = respuesta.status;
    throw error;
  }

  return datos;
}
