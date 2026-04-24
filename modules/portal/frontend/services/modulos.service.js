import { solicitar } from '../utils/api';

export async function obtenerModulos() {
  return solicitar('/modulos');
}

export async function obtenerModulosActivos() {
  return solicitar('/modulos/activos');
}

export async function crearModulo(datos) {
  return solicitar('/modulos', {
    metodo: 'POST',
    cuerpo: JSON.stringify(datos),
  });
}

export async function actualizarModulo(id, datos) {
  return solicitar(`/modulos/${id}`, {
    metodo: 'PUT',
    cuerpo: JSON.stringify(datos),
  });
}

export async function eliminarModulo(id) {
  return solicitar(`/modulos/${id}`, {
    metodo: 'DELETE',
  });
}
