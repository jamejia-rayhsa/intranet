import { solicitar } from '../../../portal/frontend/utils/api';

export async function listarConvenios(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.estatus) params.append('estatus', filtros.estatus);
  if (filtros.cliente_nombre) params.append('cliente_nombre', filtros.cliente_nombre);
  if (filtros.vendedor_nombre) params.append('vendedor_nombre', filtros.vendedor_nombre);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return solicitar(`/comercial/convenios${qs}`);
}

export async function obtenerConvenio(id) {
  return solicitar(`/comercial/convenios/${id}`);
}

export async function crearConvenio(datos) {
  return solicitar('/comercial/convenios', { method: 'POST', body: JSON.stringify(datos) });
}

export async function actualizarConvenio(id, datos) {
  return solicitar(`/comercial/convenios/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
}

export async function autorizarConvenio(id) {
  return solicitar(`/comercial/convenios/${id}/autorizar`, { method: 'PUT' });
}

export async function rechazarConvenio(id, motivo_rechazo) {
  return solicitar(`/comercial/convenios/${id}/rechazar`, { method: 'PUT', body: JSON.stringify({ motivo_rechazo }) });
}

export async function cancelarConvenio(id) {
  return solicitar(`/comercial/convenios/${id}/cancelar`, { method: 'PUT' });
}

export async function listarAutorizadores() {
  return solicitar('/comercial/autorizadores');
}

export async function agregarAutorizador(usuario_id) {
  return solicitar('/comercial/autorizadores', { method: 'POST', body: JSON.stringify({ usuario_id }) });
}

export async function quitarAutorizador(usuario_id) {
  return solicitar(`/comercial/autorizadores/${usuario_id}`, { method: 'DELETE' });
}
