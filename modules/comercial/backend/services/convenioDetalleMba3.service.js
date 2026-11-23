// modules/comercial/backend/services/convenioDetalleMba3.service.js
// Detalle de una línea de convenio construido EN VIVO desde MBA3 (sin copiar datos a nuestra BD):
//   - órdenes de compra: `recepciones-almacen-producto` (todas las recepciones del producto
//     desde la fecha del convenio; un producto puede tener varias OC en meses distintos),
//   - facturas: `ventas-cliente-producto` (todas las ventas de ese cliente+producto),
//   - existencias: `inventarios` sumando todos los almacenes reales (sin tránsito ni proveedor).
// Resumen = comprado − vendido (saldo teórico) contra la existencia real.

const Mba3 = require('./mba3Lectura.service');

// Almacenes que no son existencia física disponible: tránsito (TRN) y "PROVEEDOR" (RCP).
const ALMACENES_EXCLUIDOS = ['TRN', 'RCP'];
const TTL_EXISTENCIAS_MS = 10 * 60 * 1000;
const OPCIONES_PAGINA = { porPagina: 500, topePaginas: 20 };

function normalizarCliente(codigo) {
  return String(codigo ?? '').trim().toUpperCase().replace(/-R\d+$/, '');
}
function normalizarProducto(codigo) {
  return String(codigo ?? '').trim().toUpperCase().replace(/-R\d+$/, '');
}
function aFechaTexto(valor) {
  if (!valor) return null;
  const texto = valor instanceof Date ? valor.toISOString() : String(valor);
  return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : null;
}
function hoyTexto() {
  return new Date().toISOString().slice(0, 10);
}
function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}
function redondear(n) {
  return Math.round(n * 10000) / 10000;
}

async function listarOrdenesCompra(producto, desde) {
  const { data, advertencias } = await Mba3.paginarTodo(
    'recepciones-almacen-producto',
    { FECHA_DESDE: desde, FECHA_HASTA: hoyTexto(), PRODUCTO: producto },
    OPCIONES_PAGINA,
  );
  const filas = data
    .filter((x) => x.Anulada !== true)
    .map((x) => ({
      fecha: aFechaTexto(x.TRANS_DATE),
      recepcion: x.RECEPCION_ALMACEN ?? null,
      documento: x.DOC_ID_CORP ?? null,
      orden_compra: x.IDENT_LINEA_OC ?? null,
      proveedor: x.COD_PROVEEDOR ?? null,
      cantidad: numero(x.CANTIDAD),
      unidad: x.UNIDAD_MEDIDA ?? null,
      costo_unitario: x.UNIT_COST === undefined || x.UNIT_COST === null ? null : numero(x.UNIT_COST),
      moneda: x.CURRENCY_TYPE ?? null,
    }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return { filas, advertencias };
}

async function listarFacturas(cliente, producto, desde) {
  const { data, advertencias } = await Mba3.paginarTodo(
    'ventas-cliente-producto',
    { FECHA_INICIAL: desde, FECHA_FINAL: hoyTexto(), CLIENTE: cliente, PRODUCTO: producto },
    OPCIONES_PAGINA,
  );
  const filas = data
    .map((x) => ({
      fecha: aFechaTexto(x.FECHA_FACTURA),
      documento: x.DOCUMENTO_REL ?? x.DOCUMENTO ?? null,
      sucursal: x.SUCURSAL ?? null,
      cantidad: numero(x.CANTIDAD),
      precio: x.PRECIO_VENTA === undefined || x.PRECIO_VENTA === null ? null : numero(x.PRECIO_VENTA),
      total_mxn: x.TOTAL_VENTA_MXN === undefined || x.TOTAL_VENTA_MXN === null ? null : numero(x.TOTAL_VENTA_MXN),
      moneda: x.MONEDA ?? null,
    }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return { filas, advertencias };
}

// --- Existencias: mapa producto -> { total, almacenes[] } para TODO el inventario, en caché ---
let cacheExistencias = { mapa: null, cargadoEn: 0, enCurso: null, advertencias: [] };

async function cargarExistencias() {
  const almacenes = (await Mba3.paginarTodo('almacenes', {}, OPCIONES_PAGINA)).data;
  const mapa = new Map();
  const advertencias = [];
  for (const alm of almacenes) {
    const codigo = String(alm.ALMACEN ?? '').trim();
    if (!codigo || ALMACENES_EXCLUIDOS.includes(codigo.toUpperCase())) continue;
    try {
      const consultar = () => Mba3.paginarTodo('inventarios', { almacen: codigo, existencia_distinta_de: 0 }, OPCIONES_PAGINA);
      // MBA3 falla de forma intermitente con "Error ejecutando la consulta": un reintento basta.
      const r = await consultar().catch(() => consultar());
      for (const a of r.advertencias || []) advertencias.push(`${codigo}: ${a}`);
      for (const fila of r.data) {
        const producto = normalizarProducto(fila.PRODUCTO_CORP);
        const existencia = numero(fila.EXISTENCIA);
        if (!producto || existencia === 0) continue;
        const actual = mapa.get(producto) || { total: 0, almacenes: [] };
        actual.total += existencia;
        actual.almacenes.push({ almacen: codigo, nombre: alm.NOM_ALMACEN ?? null, existencia });
        mapa.set(producto, actual);
      }
    } catch (error) {
      advertencias.push(`Almacén ${codigo} no se pudo consultar: ${error.message}`);
    }
  }
  return { mapa, advertencias };
}

async function obtenerExistencias(producto, { forzar = false } = {}) {
  const vigente = cacheExistencias.mapa && Date.now() - cacheExistencias.cargadoEn < TTL_EXISTENCIAS_MS;
  if (!vigente || forzar) {
    if (!cacheExistencias.enCurso) {
      cacheExistencias.enCurso = cargarExistencias()
        .then(({ mapa, advertencias }) => {
          cacheExistencias = { mapa, cargadoEn: Date.now(), enCurso: null, advertencias };
        })
        .catch((error) => {
          cacheExistencias.enCurso = null;
          throw error;
        });
    }
    await cacheExistencias.enCurso;
  }
  const dato = cacheExistencias.mapa.get(normalizarProducto(producto)) || { total: 0, almacenes: [] };
  return {
    total: redondear(dato.total),
    almacenes: dato.almacenes,
    actualizado_en: new Date(cacheExistencias.cargadoEn).toISOString(),
    advertencias: cacheExistencias.advertencias,
  };
}

function construirResumen({ ordenes, facturas, existencias, plan }) {
  const comprado = redondear(ordenes.reduce((s, x) => s + x.cantidad, 0));
  const vendido = redondear(facturas.reduce((s, x) => s + x.cantidad, 0));
  const saldoTeorico = redondear(comprado - vendido);
  const existencia = existencias.total;
  return {
    comprado,
    vendido,
    saldo_teorico: saldoTeorico,
    existencia,
    // >0 sobra físico respecto al saldo teórico; <0 falta (vendido a otros, merma o aún sin recepcionar).
    diferencia: redondear(existencia - saldoTeorico),
    ordenes_compra: ordenes.length,
    facturas: facturas.length,
    plan,
  };
}

// `convenio` y `linea` con la forma de convenio.model.obtener.
async function obtenerDetalleLinea(convenio, linea, { forzarExistencias = false } = {}) {
  const producto = normalizarProducto(linea.producto_codigo);
  const cliente = normalizarCliente(convenio.cliente_codigo);
  const desde = aFechaTexto(convenio.fecha_inicio);
  if (!producto) return { error: 'La línea no tiene código de producto MBA3' };
  if (!cliente) return { error: 'El convenio no tiene código de cliente MBA3' };
  if (!desde) return { error: 'El convenio no tiene fecha de inicio válida' };

  const [ordenes, facturas, existencias] = await Promise.all([
    listarOrdenesCompra(producto, desde),
    listarFacturas(cliente, producto, desde),
    obtenerExistencias(producto, { forzar: forzarExistencias }),
  ]);

  return {
    producto,
    cliente,
    desde,
    ordenes_compra: ordenes.filas,
    facturas: facturas.filas,
    existencias,
    resumen: construirResumen({
      ordenes: ordenes.filas,
      facturas: facturas.filas,
      existencias,
      plan: { cantidad_periodica: linea.cantidad_periodica ?? null, periodo: linea.periodo ?? null },
    }),
    advertencias: [...ordenes.advertencias, ...facturas.advertencias, ...existencias.advertencias],
  };
}

// Solo tests.
function _resetCacheParaTests() {
  cacheExistencias = { mapa: null, cargadoEn: 0, enCurso: null, advertencias: [] };
}

module.exports = {
  ALMACENES_EXCLUIDOS,
  normalizarCliente,
  normalizarProducto,
  listarOrdenesCompra,
  listarFacturas,
  obtenerExistencias,
  construirResumen,
  obtenerDetalleLinea,
  _resetCacheParaTests,
};
