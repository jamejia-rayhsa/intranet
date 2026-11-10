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

// Fase 2 — búsqueda en catálogos MBA3 (autocompletar al capturar un código en el formulario).
export async function buscarFichaClienteMba3(codigo) {
  return solicitar(`/comercial/mba3/ficha-cliente?codigo=${encodeURIComponent(codigo)}`);
}

export async function buscarVendedorMba3(codigo) {
  return solicitar(`/comercial/mba3/vendedores?codigo=${encodeURIComponent(codigo)}`);
}

export async function buscarProductoMba3(codigo) {
  return solicitar(`/comercial/mba3/productos?codigo=${encodeURIComponent(codigo)}`);
}

// MBA3 no tiene "listar todos los productos" (a diferencia de vendedores): la búsqueda de
// producto en el formulario es por código exacto (de arriba) O por nombre (esta).
export async function buscarProductoPorNombreMba3(nombre) {
  return solicitar(`/comercial/mba3/productos?nombre=${encodeURIComponent(nombre)}`);
}
