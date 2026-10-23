// modules/comercial/backend/services/mba3Catalogo.service.js
// Capa de catálogo para Convenios de compra: combina el cliente HTTP (mba3Lectura.service.js) con
// la caché local (cacheMba3.model.js) y expone lo que necesita el controlador de convenios
// (autocompletar al crear/editar) y las rutas de búsqueda del formulario (mba3.routes.js).
//
// TTL por tipo (decisión de la Fase 2, no pedida explícitamente por el humano): catálogos que
// cambian poco (vendedor, producto) cachean más tiempo que datos de cliente/existencias, que
// pueden moverse más seguido. Si MBA3 no responde pero hay un dato cacheado (aunque esté vencido),
// se devuelve ese dato "obsoleto" en vez de fallar — mejor un snapshot viejo que nada, y nunca
// debe tumbar la creación de un convenio.
// R-F2-4 (revisión post Fase 2): 'vendedor_listado'/'producto_listado' son tipos DISTINTOS de
// 'vendedor'/'producto' (mismo TTL, clave de caché separada). Antes el catálogo completo se
// cacheaba con el mismo `tipo` que una resolución individual, bajo el código centinela '*' — un
// vendedor o producto cuyo código REAL fuera literalmente "*" colisionaba con esa clave y
// envenenaba el catálogo completo durante el TTL entero (o viceversa). Con un `tipo` propio para
// "listado completo", ningún código real (sea cual sea) puede coincidir con esa clave.
const TTL_MS = {
  cliente: 15 * 60 * 1000, // 15 min
  vendedor: 60 * 60 * 1000, // 1 h — catálogo de vendedores cambia poco
  vendedor_listado: 60 * 60 * 1000,
  producto: 30 * 60 * 1000, // 30 min
  producto_listado: 30 * 60 * 1000,
  clientes_vendedor: 15 * 60 * 1000,
  existencias_ventas: 5 * 60 * 1000, // más volátil: pensado para el dashboard de la Fase 5
};

const Mba3Lectura = require('./mba3Lectura.service');
const CacheMba3 = require('../models/cacheMba3.model');

// Envuelve una consulta a MBA3 con caché + TTL + fallback a lo último conocido si MBA3 falla.
// Nunca lanza si hay algo en caché (aunque esté vencido); solo lanza si MBA3 falla Y no hay nada
// cacheado — en ese caso el llamador (resolverSnapshots) decide qué hacer (advertencia, no 500).
async function conCache(tipo, codigo, fnConsulta) {
  const ttl = TTL_MS[tipo] ?? 15 * 60 * 1000;
  let cacheado = null;
  try {
    cacheado = await CacheMba3.obtener(tipo, codigo);
  } catch (error) {
    // Un fallo leyendo la caché (BD caída) no debe impedir intentar la consulta en vivo.
    console.error('mba3Catalogo.conCache: fallo al leer caché (ignorado):', error.message);
  }
  const vigente = cacheado && Date.now() - new Date(cacheado.consultado_en).getTime() < ttl;
  if (vigente) return { datos: cacheado.datos, deCache: true };

  try {
    const datos = await fnConsulta();
    try {
      await CacheMba3.guardar(tipo, codigo, datos);
    } catch (error) {
      console.error('mba3Catalogo.conCache: fallo al guardar caché (ignorado):', error.message);
    }
    return { datos, deCache: false };
  } catch (error) {
    if (cacheado) {
      return {
        datos: cacheado.datos,
        deCache: true,
        advertencia: `MBA3 no respondió (${error.message}); usando el último dato conocido (${cacheado.consultado_en.toISOString?.() || cacheado.consultado_en})`,
      };
    }
    throw error;
  }
}

async function resolverCliente(codigo) {
  return conCache('cliente', codigo, () => Mba3Lectura.obtenerFichaCliente(codigo));
}

async function resolverVendedor(codigo) {
  return conCache('vendedor', codigo, () => Mba3Lectura.obtenerVendedor(codigo));
}

async function resolverProducto(codigo) {
  return conCache('producto', codigo, () => Mba3Lectura.obtenerProducto(codigo));
}

async function buscarClientesPorVendedor(codigoVendedor) {
  const resultado = await conCache('clientes_vendedor', codigoVendedor, async () => {
    const { data } = await Mba3Lectura.listarClientesPorVendedor(codigoVendedor);
    return data;
  });
  return resultado;
}

async function buscarVendedores() {
  // Catálogo completo: tipo propio ('vendedor_listado'), nunca comparte clave con resolverVendedor.
  return conCache('vendedor_listado', '*', async () => {
    const { data } = await Mba3Lectura.listarVendedores();
    return data;
  });
}

async function buscarProductos(codigo) {
  if (!codigo) {
    // Catálogo completo: tipo propio ('producto_listado'), nunca comparte clave con resolverProducto.
    return conCache('producto_listado', '*', async () => {
      const { data } = await Mba3Lectura.listarProductos();
      return data;
    });
  }
  return conCache('producto', codigo, async () => {
    const { data } = await Mba3Lectura.listarProductos(codigo);
    return data;
  });
}

async function resolverExistenciasVentas(codigoProducto) {
  return conCache('existencias_ventas', codigoProducto, () => Mba3Lectura.obtenerExistenciasVentas(codigoProducto));
}

// --- Extracción de nombre/descripción desde el registro crudo de MBA3 ---
// Solo `ficha-cliente` tiene su BODY confirmado por el manual; la FORMA de la respuesta (nombres
// de campo exactos del registro) no vino detallada ahí tampoco, así que esta extracción es
// SUPOSICIÓN SIN VERIFICAR para los 3 campos: intenta varios nombres plausibles en orden y usa el
// primero que exista. Ajustar esta lista es un cambio de una línea cuando se confirme en vivo.
function primerCampo(registro, nombres) {
  if (!registro || typeof registro !== 'object') return null;
  for (const nombre of nombres) {
    const valor = registro[nombre];
    if (valor !== undefined && valor !== null && String(valor).trim()) return String(valor).trim();
  }
  return null;
}

function extraerNombreCliente(registro) {
  return primerCampo(registro, ['nombre', 'cliente_nombre', 'razon_social', 'nombre_cliente']);
}

function extraerNombreVendedor(registro) {
  return primerCampo(registro, ['nombre', 'vendedor_nombre', 'nombre_vendedor']);
}

function extraerDescripcionProducto(registro) {
  return primerCampo(registro, ['descripcion', 'producto_descripcion', 'nombre', 'descripcion_producto']);
}

module.exports = {
  TTL_MS,
  resolverCliente,
  resolverVendedor,
  resolverProducto,
  buscarClientesPorVendedor,
  buscarVendedores,
  buscarProductos,
  resolverExistenciasVentas,
  extraerNombreCliente,
  extraerNombreVendedor,
  extraerDescripcionProducto,
};
