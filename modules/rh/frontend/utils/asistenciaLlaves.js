// Llaves de la ingesta de marcas: formato, estados y entradas del formulario. Lógica pura (sin imports: jest
// evalúa el fuente). La llave en claro NUNCA se procesa aquí: solo existe en el diálogo de "mostrar una vez".
export const LONGITUD_LLAVE = 56; // rhk_ + 8 hex + _ + 43 base64url
export const FORMATO_LLAVE = /^rhk_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/;
export const MAX_IPS = 20;
export const URL_INGESTA_TEXTO = 'http://<ip-interna-del-servidor>:4010/api/asistencia/ingesta/marcas';
export const ENCABEZADO_LLAVE = 'X-Api-Key';

/** Texto libre (coma, espacio o salto de línea) -> lista de entradas sin repetidos ni vacías. */
export function parsearIps(texto) {
  const lista = [];
  for (const parte of String(texto || '').split(/[\s,;]+/)) {
    const ip = parte.trim();
    if (ip && !lista.includes(ip)) lista.push(ip);
  }
  return lista;
}

/** Revisión previa en el cliente (el servidor valida IPv4/IPv6/CIDR de verdad). Devuelve '' si pasa. */
export function revisarIps(lista) {
  if (lista.length > MAX_IPS) return `Máximo ${MAX_IPS} direcciones.`;
  for (const ip of lista) {
    if (ip.length > 49 || !/^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(ip)) return `"${ip}" no parece una dirección IP o un rango CIDR.`;
  }
  return '';
}

const ESTADOS = {
  activa: 'Activa',
  vencida: 'Vencida',
  pendiente: 'Pendiente',
  revocada: 'Revocada',
};

export const etiquetaEstadoLlave = (llave) => ESTADOS[llave.estado_efectivo] || String(llave.estado_efectivo || '—');

/** Una llave activa con fecha de fin ya fue rotada (sigue válida durante el solape) o tiene vencimiento. */
export const estaEnSolape = (llave) => llave.estado_efectivo === 'activa' && llave.vigente_hasta !== null && llave.vigente_hasta !== undefined;

/** El servidor solo rota llaves activas, vigentes y sin fecha de fin. */
export const puedeRotar = (llave) => llave.estado_efectivo === 'activa' && (llave.vigente_hasta === null || llave.vigente_hasta === undefined);
/** Revocar y editar IP se permiten mientras el estado guardado sea 'activa' (incluye vencidas y pendientes). */
export const puedeRevocar = (llave) => llave.estado === 'activa';
export const puedeEditarIps = (llave) => llave.estado === 'activa';

/** Alta: nombre obligatorio, IP obligatorias en la interfaz salvo que se confirme dejarlas vacías. */
export function validarAltaLlave({ nombre, ips, vencimiento, permitirSinIps }) {
  const errores = {};
  const limpio = (nombre || '').trim();
  if (!limpio) errores.nombre = 'El nombre es obligatorio';
  else if (limpio.length > 100) errores.nombre = 'El nombre no puede superar 100 caracteres';
  const errorIps = revisarIps(ips);
  if (errorIps) errores.ips = errorIps;
  else if (ips.length === 0 && !permitirSinIps) errores.ips = 'Indica al menos una IP permitida (la de la interfaz) o confirma que aceptas dejarla sin restricción';
  if (vencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(vencimiento)) errores.vencimiento = 'El vencimiento debe ser una fecha válida';
  return errores;
}

/** Texto de la lista de IP para mostrar en la tabla. */
export const textoIps = (llave) => (llave.ips_permitidas && llave.ips_permitidas.length ? llave.ips_permitidas.join(', ') : 'Sin restricción');

export const MENSAJE_RESPUESTA_PERDIDA =
  'No se recibió la respuesta del servidor: puede que la llave sí se haya creado. Si no ves la llave, revoca la creada y crea otra. ' +
  'La lista se actualizó para que veas si quedó una llave nueva.';

/** Error sin respuesta del servidor (red caída, proxy con HTML): el servidor pudo haber hecho el cambio. */
export const esErrorSinRespuesta = (err) => Boolean(err) && (err.status === undefined || err.status === null || err.status >= 502);

/** Edición de IP: dejar la lista vacía quita la restricción y exige confirmación explícita. '' si es válida. */
export function validarEdicionIps(ips, confirmoSinIps) {
  const problema = revisarIps(ips);
  if (problema) return problema;
  if (ips.length === 0 && !confirmoSinIps) {
    return 'Dejar la lista vacía permite que la llave funcione desde cualquier IP. Confirma que aceptas el riesgo o escribe al menos una IP.';
  }
  return '';
}
