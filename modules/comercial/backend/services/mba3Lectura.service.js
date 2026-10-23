// modules/comercial/backend/services/mba3Lectura.service.js
// Cliente HTTP de la API de LECTURA de MBA3 (catálogos: ficha-cliente, clientes-vendedor,
// vendedores, productos, acuvtaprod). DISTINTA del web service de ESCRITURA que ya usa
// Solicitudes de Crédito (`wsAPIS/api_wr`, variables MBA3_URL/MBA3_CORP/MBA3_PASSWORD en
// solicitudCredito.controller.js): no se mezclan variables de entorno ni código entre ambas.
//
// Contrato (manual adjuntado por el humano 2026-10-23, ver decisions.md "MBA3 lectura: canal
// confirmado"): JWT con POST /v1/login y POST /v1/refresh; catálogo con POST /v1/api/{endpoint}
// ?limit=&offset= + Authorization Bearer; respuesta { data, pagination: {total,limit,offset,
// returned}, advertencias? }; errores siempre { detail }.
//
// SOLO el body de `ficha-cliente` está confirmado en el manual ({"codigo": "..."}). Los otros 4
// endpoints (clientes-vendedor, vendedores, productos, acuvtaprod) se intentaron verificar contra
// `GET /openapi.json` (Paso 0 del encargo) y NO se pudo: desde este sandbox SÍ hay salida a
// Internet y el dominio resuelve, pero `mba3api.rayhsa.net` está detrás de Cloudflare Access (Zero
// Trust) — tanto /openapi.json como /v1/login responden 302 a una pantalla de login de
// `rayhsa.cloudflareaccess.com` en vez de JSON (ver code-notes.md para el detalle completo: esto
// aplica a CUALQUIER llamada, con o sin credenciales de MBA3, porque Cloudflare Access intercepta
// antes de llegar a la API). Por lo tanto los bodies de esos 4 endpoints son SUPOSICIÓN SIN
// VERIFICAR, documentados campo por campo abajo y en mba3Catalogo.service.js.

const axios = require('axios');

// Leídas en cada llamada (no en una const de módulo) para que los tests puedan cambiar
// process.env sin necesitar jest.resetModules(); en producción el valor no cambia en caliente.
function urlBase() {
  return process.env.MBA3_LECTURA_URL || 'https://mba3api.rayhsa.net';
}
function usuario() {
  return process.env.MBA3_LECTURA_USUARIO;
}
function password() {
  return process.env.MBA3_LECTURA_PASSWORD;
}

// Tope de páginas por llamada para no colgar una petición si `pagination.total` viene mal o la API
// responde páginas vacías en bucle (defensivo, no se espera llegar a esto en uso normal).
const TOPE_PAGINAS = 20;
const TAMANO_PAGINA = 100;

class ErrorMba3NoConfigurado extends Error {
  constructor() {
    super('MBA3_LECTURA_USUARIO/MBA3_LECTURA_PASSWORD no están configurados en este entorno');
    this.name = 'ErrorMba3NoConfigurado';
  }
}

class ErrorMba3 extends Error {
  constructor(mensaje, { causa } = {}) {
    super(mensaje);
    this.name = 'ErrorMba3';
    this.causa = causa;
  }
}

// Token en memoria del proceso (nunca en BD): se pierde al reiniciar el backend, lo cual está
// bien porque un relogin es barato y evita persistir un refresh_token de 7 días en texto plano.
//
// R-F2-2 (revisión post Fase 2): `loginEnCurso`/`refrescarEnCurso` son single-flight — si ya hay
// un login o refresh en vuelo, las llamadas concurrentes esperan esa MISMA promesa en vez de
// disparar una petición nueva cada una. `cooldownLoginHasta` evita reintentar un login real que
// ya falló durante unos segundos, para no repetir el mismo fallo en bucle bajo carga: el manual
// dice que 5 intentos fallidos consecutivos bloquean la cuenta de servicio 15 min (y el login
// tiene un límite de 5 req/min), así que sin esto, N peticiones concurrentes sin token válido
// (cada blur del formulario, cada línea de producto al guardar) podían disparar N logins en
// paralelo con credenciales malas o un MBA3 caído.
const estado = {
  accessToken: null,
  refreshToken: null,
  loginEnCurso: null,
  refrescarEnCurso: null,
  cooldownLoginHasta: 0,
};

const COOLDOWN_LOGIN_MS = 5000;

// Expuesto solo para tests (resetear el token en memoria entre pruebas).
function _resetEstadoParaTests() {
  estado.accessToken = null;
  estado.refreshToken = null;
  estado.loginEnCurso = null;
  estado.refrescarEnCurso = null;
  estado.cooldownLoginHasta = 0;
}

function clienteAxios() {
  return axios.create({ baseURL: urlBase(), timeout: 10000 });
}

function detalleError(error) {
  return error?.response?.data?.detail || error?.message || 'error desconocido';
}

function convertirError(error) {
  if (error instanceof ErrorMba3NoConfigurado || error instanceof ErrorMba3) return error;
  return new ErrorMba3(`MBA3: ${detalleError(error)}`, { causa: error });
}

function esNoAutorizado(error) {
  return error?.response?.status === 401;
}

async function loginReal() {
  const usuarioActual = usuario();
  const passwordActual = password();
  if (!usuarioActual || !passwordActual) throw new ErrorMba3NoConfigurado();
  const resp = await clienteAxios().post('/v1/login', { username: usuarioActual, password: passwordActual });
  estado.accessToken = resp.data?.access_token || null;
  estado.refreshToken = resp.data?.refresh_token || null;
  if (!estado.accessToken) throw new ErrorMba3('Login a MBA3 sin access_token en la respuesta');
}

async function refrescarReal() {
  if (!estado.refreshToken) throw new ErrorMba3('Sin refresh_token disponible para refrescar');
  const resp = await clienteAxios().post('/v1/refresh', { refresh_token: estado.refreshToken });
  estado.accessToken = resp.data?.access_token || null;
  if (resp.data?.refresh_token) estado.refreshToken = resp.data.refresh_token;
  if (!estado.accessToken) throw new ErrorMba3('Refresh de MBA3 sin access_token en la respuesta');
}

// Single-flight + cooldown (R-F2-2): si ya hay un login en curso, se devuelve esa misma promesa;
// un fallo real de login (credenciales/red, NO "no configurado") deja un cooldown corto antes de
// permitir el siguiente intento, para no repetir un fallo real en bucle bajo carga concurrente.
async function login() {
  if (Date.now() < estado.cooldownLoginHasta) {
    const segundos = Math.ceil((estado.cooldownLoginHasta - Date.now()) / 1000);
    throw new ErrorMba3(`MBA3: login en cooldown tras un fallo reciente (reintentar en ${segundos} s)`);
  }
  if (!estado.loginEnCurso) {
    estado.loginEnCurso = loginReal()
      .catch((error) => {
        if (!(error instanceof ErrorMba3NoConfigurado)) {
          estado.cooldownLoginHasta = Date.now() + COOLDOWN_LOGIN_MS;
        }
        throw error;
      })
      .finally(() => {
        estado.loginEnCurso = null;
      });
  }
  return estado.loginEnCurso;
}

// Single-flight (R-F2-2): mismo patrón que login(), para que varios 401 concurrentes no disparen
// varios POST /v1/refresh en paralelo.
async function refrescar() {
  if (!estado.refrescarEnCurso) {
    estado.refrescarEnCurso = refrescarReal().finally(() => {
      estado.refrescarEnCurso = null;
    });
  }
  return estado.refrescarEnCurso;
}

async function logout() {
  if (!estado.accessToken) return;
  const token = estado.accessToken;
  estado.accessToken = null;
  estado.refreshToken = null;
  try {
    await clienteAxios().post('/v1/logout', {}, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    // Best-effort: un logout fallido no es un problema (el token simplemente expira solo).
    console.error('mba3Lectura.logout: fallo al revocar sesión (ignorado):', detalleError(error));
  }
}

async function peticion(endpoint, body, { limit, offset } = {}) {
  const params = {};
  if (limit !== undefined) params.limit = limit;
  if (offset !== undefined) params.offset = offset;
  return clienteAxios().post(`/v1/api/${endpoint}`, body, {
    params,
    headers: { Authorization: `Bearer ${estado.accessToken}` },
  });
}

// Punto de entrada de bajo nivel: una sola llamada a un endpoint de catálogo, con login
// automático si no hay sesión y UN reintento ante 401 (refresca el token; si el refresh falla,
// relogin desde cero antes de reintentar). Nunca más de 2 intentos reales al endpoint.
async function llamarEndpoint(endpoint, body = {}, opciones = {}) {
  if (!estado.accessToken) await login();
  try {
    const resp = await peticion(endpoint, body, opciones);
    return resp.data;
  } catch (error) {
    if (!esNoAutorizado(error)) throw convertirError(error);
    try {
      await refrescar();
    } catch (_errorRefresh) {
      await login();
    }
    try {
      const resp2 = await peticion(endpoint, body, opciones);
      return resp2.data;
    } catch (error2) {
      throw convertirError(error2);
    }
  }
}

// Pagina automáticamente mientras `pagination.total` sea mayor a lo recibido, con un tope de
// seguridad de TOPE_PAGINAS para no colgar la petición si la API responde algo inesperado.
async function paginarTodo(endpoint, body = {}, { porPagina = TAMANO_PAGINA, topePaginas = TOPE_PAGINAS } = {}) {
  let offset = 0;
  let acumulado = [];
  let advertencias = [];
  let truncadoPorTope = false;
  for (let pagina = 0; pagina < topePaginas; pagina++) {
    const resp = await llamarEndpoint(endpoint, body, { limit: porPagina, offset });
    const datos = Array.isArray(resp?.data) ? resp.data : [];
    acumulado = acumulado.concat(datos);
    if (Array.isArray(resp?.advertencias)) advertencias = advertencias.concat(resp.advertencias);
    const paginacion = resp?.pagination || {};
    const total = Number.isFinite(paginacion.total) ? paginacion.total : acumulado.length;
    const avance = Number.isFinite(paginacion.returned) ? paginacion.returned : datos.length;
    if (datos.length === 0 || acumulado.length >= total) break;
    offset += avance || porPagina;
    // R-F2-6: si se agota el tope de seguridad de páginas sin haber cubierto `total` (o sin
    // `total` fiable), el resultado quedó truncado — antes esto pasaba en silencio.
    if (pagina === topePaginas - 1) truncadoPorTope = true;
  }
  if (truncadoPorTope) {
    const mensaje = `Resultado truncado: se alcanzó el tope de ${topePaginas} páginas (${acumulado.length} registros) paginando "${endpoint}"`;
    advertencias = advertencias.concat(mensaje);
    console.warn(`mba3Lectura.paginarTodo: ${mensaje}`);
  }
  return { data: acumulado, advertencias };
}

// --- Funciones por catálogo ---
// Devuelven el registro crudo de MBA3 (o null si no hay match); la extracción de qué campo usar
// como "nombre"/"descripción" vive en mba3Catalogo.service.js, separada porque también es
// suposición sin verificar en 4 de los 5 endpoints.

// R-F2-1 (revisión post Fase 2): nombres de campo de código por entidad, para exigir coincidencia
// EXACTA del registro devuelto contra el código buscado. Antes se tomaba `data[0]`/`lista[0]` sin
// verificar, así que una API que devolviera varios registros (o el filtro por subcadena del
// controlador) podía guardar el nombre de OTRO cliente/vendedor/producto. "No hay coincidencia
// exacta" se trata igual que "no encontrado" (null), nunca "usa el primero que venga".
const CAMPOS_CODIGO = {
  cliente: ['codigo'],
  vendedor: ['codigo', 'codigo_vendedor'],
  producto: ['codigo', 'codigo_producto'],
};

function coincideExacto(registro, codigoBuscado, camposCodigo) {
  if (!registro || typeof registro !== 'object') return false;
  // Sin distinguir mayúsculas/minúsculas (igual que el resto de la búsqueda de catálogos), pero
  // SIEMPRE con igualdad completa, nunca subcadena.
  const buscado = String(codigoBuscado).trim().toLowerCase();
  return camposCodigo.some((campo) => {
    const valor = registro[campo];
    return valor !== undefined && valor !== null && String(valor).trim().toLowerCase() === buscado;
  });
}

// Busca en una lista el único registro cuyo código coincide EXACTO; si ninguno coincide (incluida
// una lista vacía), devuelve null — "no encontrado", nunca "usa el primero".
function encontrarPorCodigoExacto(lista, codigo, tipo) {
  if (!Array.isArray(lista)) return null;
  const campos = CAMPOS_CODIGO[tipo] || ['codigo'];
  return lista.find((registro) => coincideExacto(registro, codigo, campos)) || null;
}

// CONFIRMADO por el manual: body {"codigo": "C00001"}.
async function obtenerFichaCliente(codigo) {
  const resp = await llamarEndpoint('ficha-cliente', { codigo });
  const lista = Array.isArray(resp?.data) ? resp.data : [];
  return encontrarPorCodigoExacto(lista, codigo, 'cliente');
}

// SUPOSICIÓN SIN VERIFICAR: nombre de endpoint confirmado por el humano (`clientes-vendedor`),
// pero el campo de filtro es una suposición por analogía con ficha-cliente (`codigo_vendedor`).
async function listarClientesPorVendedor(codigoVendedor) {
  return paginarTodo('clientes-vendedor', { codigo_vendedor: codigoVendedor });
}

// SUPOSICIÓN SIN VERIFICAR: endpoint `vendedores` confirmado por el humano; el body asumido es
// {} para listar todos y {"codigo": "..."} para uno solo (mismo patrón que ficha-cliente).
async function listarVendedores(codigo) {
  return paginarTodo('vendedores', codigo ? { codigo } : {});
}

async function obtenerVendedor(codigo) {
  const { data } = await listarVendedores(codigo);
  return encontrarPorCodigoExacto(data, codigo, 'vendedor');
}

// SUPOSICIÓN SIN VERIFICAR: endpoint `productos` confirmado; body asumido igual que vendedores.
async function listarProductos(codigo) {
  return paginarTodo('productos', codigo ? { codigo } : {});
}

async function obtenerProducto(codigo) {
  const { data } = await listarProductos(codigo);
  return encontrarPorCodigoExacto(data, codigo, 'producto');
}

// SUPOSICIÓN SIN VERIFICAR: endpoint `acuvtaprod` confirmado (existencias y ventas de un
// producto); el campo de filtro asumido es `codigo_producto` (no `codigo`, por analogía con
// `codigo_vendedor` de clientes-vendedor: ambos son "el producto/vendedor de otra entidad").
async function obtenerExistenciasVentas(codigoProducto) {
  const resp = await llamarEndpoint('acuvtaprod', { codigo_producto: codigoProducto });
  return Array.isArray(resp?.data) ? resp.data : [];
}

module.exports = {
  ErrorMba3NoConfigurado,
  ErrorMba3,
  login,
  refrescar,
  logout,
  llamarEndpoint,
  paginarTodo,
  obtenerFichaCliente,
  listarClientesPorVendedor,
  listarVendedores,
  obtenerVendedor,
  listarProductos,
  obtenerProducto,
  obtenerExistenciasVentas,
  _resetEstadoParaTests,
};
