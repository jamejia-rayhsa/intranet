import { solicitar } from '../../../portal/frontend/utils/api';

export async function listarSolicitudes(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.estado) params.append('estado', filtros.estado);
  if (filtros.tipo_cliente) params.append('tipo_cliente', filtros.tipo_cliente);
  if (filtros.buscar) params.append('buscar', filtros.buscar);
  if (filtros.pagina) params.append('pagina', filtros.pagina);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return solicitar(`/comercial/solicitudes${qs}`);
}

export async function obtenerSolicitud(id) {
  return solicitar(`/comercial/solicitudes/${id}`);
}

export async function crearSolicitud(datos) {
  return solicitar('/comercial/solicitudes', { method: 'POST', body: JSON.stringify(datos) });
}

export async function actualizarSolicitud(id, datos) {
  return solicitar(`/comercial/solicitudes/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
}

export async function cambiarEstado(id, estado) {
  return solicitar(`/comercial/solicitudes/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) });
}

export async function obtenerEstadisticas() {
  return solicitar('/comercial/solicitudes/estadisticas');
}
