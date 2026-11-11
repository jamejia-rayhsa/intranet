// modules/comercial/backend/services/convenioConsumoMba3.service.js
// Sincroniza el consumo de las líneas de Convenios de compra desde MBA3 (decisiones del humano,
// 2026-11-10): consumo = lo FACTURADO del renglón de pedido (ver cantidadFacturada); las devoluciones (notas de crédito de
// ventas, concepto DEVV) se restan; una vez al día (lo programa planificadorConsumoMba3.js).
//
// Flujo (probado en vivo contra MBA3 el 2026-11-10):
//   facturas(FECHA_INI, FECHA_FIN)  → pedidos de los clientes con convenio  (no trae producto/cantidad)
//   pedidos-detalle(pedido)         → renglones: CLIENTE, PRODUCTO, FACTURADOS, FECHA_FACTURA
//   notascredito(FECHA_INI, FECHA_FIN) → renglones DEVV: CLIENTE_EMPRESA ("C00255-R0001"), PRODUCTO, CANTIDAD
// Cada renglón se enlaza a una línea de convenio por (cliente_codigo, producto_codigo) y se escribe
// con referencia estable → volver a correr actualiza, nunca duplica.

const Mba3 = require('./mba3Lectura.service');
const Movimiento = require('../models/movimiento.model');
const SincronizacionMba3 = require('../models/sincronizacionMba3.model');
const { grupo } = require('../../../portal/backend/config/database');

const DIAS_POR_TROZO = 7; // ~500 facturas por trozo: muy por debajo del tope de 2000 de paginarTodo
const DIAS_TRASLAPE = 5; // las vueltas diarias reexaminan los últimos días (facturas/NC que llegan tarde)
const CONCEPTO_DEVOLUCION = 'DEVV'; // "Devoluciones de Ventas"; las demás NC son financieras (anticipos, saldos)

// MBA3 devuelve el cliente de las notas de crédito como "C00255-R0001" (cliente-empresa) y el de
// facturas/pedidos como "C00255": se compara sin el sufijo de empresa.
function normalizarCliente(codigo) {
  return String(codigo ?? '').trim().toUpperCase().replace(/-R\d+$/, '');
}
function normalizarProducto(codigo) {
  return String(codigo ?? '').trim().toUpperCase();
}

function aFechaTexto(valor) {
  if (!valor) return null;
  const texto = valor instanceof Date ? valor.toISOString() : String(valor);
  return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : null;
}

function sumarDias(fechaTexto, dias) {
  const [a, m, d] = fechaTexto.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Divide [desde, hasta] (ambos incluidos) en trozos de a lo más `dias` días.
function dividirEnTrozos(desde, hasta, dias = DIAS_POR_TROZO) {
  const trozos = [];
  let inicio = desde;
  while (inicio <= hasta) {
    const fin = sumarDias(inicio, dias - 1) < hasta ? sumarDias(inicio, dias - 1) : hasta;
    trozos.push([inicio, fin]);
    inicio = sumarDias(fin, 1);
  }
  return trozos;
}

// Regla del humano (2026-11-10): solo cuenta lo YA FACTURADO. Verificado en vivo contra MBA3 (60
// pedidos, 398 renglones): el campo FACTURADOS vale 0 SIEMPRE, incluso en los 261 renglones con
// FACTURADO=true y número de factura — no es una cantidad utilizable. La señal confiable es la
// bandera FACTURADO (renglón facturado) y la cantidad real entregada, DESPACHADOS (igual a
// CANT_PEDIDO en 369/398). Si algún día MBA3 llena FACTURADOS con la cantidad facturada, se usa.
function cantidadFacturada(renglon) {
  const facturados = Number(renglon.FACTURADOS) || 0;
  if (facturados > 0) return facturados;
  if (renglon.FACTURADO === true) return Number(renglon.DESPACHADOS) || 0;
  return 0;
}

function redondear(numero) {
  return Math.round(Number(numero) * 10000) / 10000;
}

function indexarLineas(lineas) {
  const indice = new Map();
  for (const linea of lineas) {
    const clave = `${normalizarCliente(linea.cliente_codigo)}|${normalizarProducto(linea.producto_codigo)}`;
    const base = { ...linea, fecha_base: aFechaTexto(linea.fecha_base) };
    if (!indice.has(clave)) indice.set(clave, []);
    indice.get(clave).push(base);
  }
  return indice;
}

// Si dos convenios comparten cliente+producto, el renglón va a la línea cuya compra inicial es la
// más reciente que no sea posterior al movimiento (la que estaba vigente en esa fecha).
function elegirLinea(indice, cliente, producto, fecha) {
  const candidatas = (indice.get(`${normalizarCliente(cliente)}|${normalizarProducto(producto)}`) || []).filter(
    (l) => l.fecha_base && fecha >= l.fecha_base,
  );
  if (!candidatas.length) return null;
  return candidatas.reduce((mejor, l) => (l.fecha_base > mejor.fecha_base ? l : mejor));
}

class ErrorTrozoIncompleto extends Error {}

function verificarCompleto(resp, nombre) {
  if ((resp.advertencias || []).some((a) => /truncad/i.test(String(a)))) {
    throw new ErrorTrozoIncompleto(`Resultado truncado paginando "${nombre}": reducir el tamaño del trozo`);
  }
}

function contadoresVacios() {
  return { insertados: 0, actualizados: 0, sin_cambios: 0, retirados: 0 };
}

function aplicarResultado(contadores, resultado) {
  if (resultado === 'insertado') contadores.insertados++;
  else if (resultado === 'actualizado') contadores.actualizados++;
  else contadores.sin_cambios++;
}

async function sincronizarRango({ desde, hasta, lineas, mba3 = Mba3, movimientos = Movimiento }) {
  const indice = indexarLineas(lineas);
  const clientes = new Set(lineas.map((l) => normalizarCliente(l.cliente_codigo)));
  const resultado = {
    desde,
    hasta,
    trozos_completos: 0,
    trozos_total: 0,
    facturas_revisadas: 0,
    pedidos_consultados: 0,
    notas_credito_revisadas: 0,
    sin_fecha_factura: 0,
    consumos: contadoresVacios(),
    devoluciones: contadoresVacios(),
    ultima_fecha_completa: null,
    error: null,
  };

  const pedidosVistos = new Set();
  const trozos = dividirEnTrozos(desde, hasta);
  resultado.trozos_total = trozos.length;

  for (const [ini, fin] of trozos) {
    try {
      // --- Consumo: facturas → pedidos → renglones ---
      const facturas = await mba3.paginarTodo('facturas', { FECHA_INI: ini, FECHA_FIN: fin });
      verificarCompleto(facturas, 'facturas');
      resultado.facturas_revisadas += facturas.data.length;
      const pedidos = [];
      for (const f of facturas.data) {
        const pedido = Number(f.NUMERO_PEDIDO);
        if (!pedido || pedidosVistos.has(pedido)) continue;
        if (!clientes.has(normalizarCliente(f.CODIGO_CLIENTE))) continue;
        pedidosVistos.add(pedido);
        pedidos.push(pedido);
      }
      for (const pedido of pedidos) {
        const detalle = await mba3.paginarTodo('pedidos-detalle', { pedido });
        resultado.pedidos_consultados++;
        for (const renglon of detalle.data) {
          const facturados = cantidadFacturada(renglon);
          const fechaFactura = aFechaTexto(renglon.FECHA_FACTURA);
          // Sin fecha de factura no se sabe cuándo cuenta (y con 0 facturados no hay consumo que
          // retirar de una fecha base): se evalúa contra la fecha del pedido solo para ubicar la línea.
          const fechaReferencia = fechaFactura || aFechaTexto(renglon.FECHA_PEDIDO);
          if (!fechaReferencia) continue;
          const linea = elegirLinea(indice, renglon.CLIENTE, renglon.PRODUCTO, fechaReferencia);
          if (!linea) continue;
          const referencia = `PED:${renglon.PEDIDO}:${renglon.PEDIDOLINEA}`;
          if (facturados <= 0) {
            if (await movimientos.eliminarAutomatico(linea.convenio_producto_id, referencia)) resultado.consumos.retirados++;
            continue;
          }
          if (!fechaFactura) {
            resultado.sin_fecha_factura++;
            continue;
          }
          const r = await movimientos.upsertAutomatico(linea.convenio_producto_id, {
            tipo: 'consumo',
            cantidad: redondear(facturados),
            fecha_movimiento: fechaFactura,
            comentario: `MBA3: pedido ${renglon.PEDIDO} línea ${renglon.PEDIDOLINEA}${renglon.FACTURA ? `, factura ${renglon.FACTURA}` : ''}`,
            referencia_externa: referencia,
          });
          aplicarResultado(resultado.consumos, r);
        }
      }

      // --- Devoluciones: notas de crédito DEVV ---
      const notas = await mba3.paginarTodo('notascredito', { FECHA_INI: ini, FECHA_FIN: fin });
      verificarCompleto(notas, 'notascredito');
      resultado.notas_credito_revisadas += notas.data.length;
      const porReferencia = new Map();
      for (const n of notas.data) {
        if (String(n.CONCEPTO || '').trim().toUpperCase() !== CONCEPTO_DEVOLUCION) continue;
        const fecha = aFechaTexto(n.FECHA_CONFIRMACION);
        const cantidad = Number(n.CANTIDAD) || 0;
        if (!fecha || cantidad <= 0) continue;
        const linea = elegirLinea(indice, n.CLIENTE_EMPRESA, n.PRODUCTO, fecha);
        if (!linea) continue;
        const referencia = `NC:${n.DOCUMENTO}:${normalizarProducto(n.PRODUCTO)}`;
        const previo = porReferencia.get(`${linea.convenio_producto_id}|${referencia}`);
        // Dos renglones del mismo producto en la misma nota se suman en un solo movimiento.
        if (previo) previo.cantidad += cantidad;
        else porReferencia.set(`${linea.convenio_producto_id}|${referencia}`, { linea, referencia, cantidad, fecha, documento: n.DOCUMENTO, relacionada: n.DOCUMENTO_REL });
      }
      for (const d of porReferencia.values()) {
        const r = await movimientos.upsertAutomatico(d.linea.convenio_producto_id, {
          tipo: 'devolucion',
          cantidad: redondear(d.cantidad),
          fecha_movimiento: d.fecha,
          comentario: `MBA3: nota de crédito ${d.documento}${d.relacionada ? ` (relacionada a ${d.relacionada})` : ''}`,
          referencia_externa: d.referencia,
        });
        aplicarResultado(resultado.devoluciones, r);
      }

      resultado.trozos_completos++;
      resultado.ultima_fecha_completa = fin;
    } catch (error) {
      // Solo el mensaje (nunca el objeto de axios: sus headers llevan el Service Token de Cloudflare).
      resultado.error = `Trozo ${ini}..${fin}: ${error.message}`;
      break;
    }
  }
  return resultado;
}

// Una vuelta completa: calcula el rango, sincroniza y deja constancia en la tabla de estado.
// `desde` (AAAA-MM-DD) permite forzar un reproceso histórico (p. ej. al agregar una línea cuya
// compra inicial es anterior al punto cubierto).
async function sincronizar({ desde = null, mba3 = Mba3, movimientos = Movimiento, modelo = SincronizacionMba3 } = {}) {
  const estado = await modelo.obtenerEstado();
  const hoy = estado?.hoy_mx;
  const lineas = await modelo.lineasElegibles();
  const omitidas = await modelo.contarLineasOmitidas();

  if (!lineas.length) {
    const vacio = { lineas_elegibles: 0, lineas_omitidas: omitidas, mensaje: 'No hay líneas sincronizables', error: null };
    await modelo.guardarResultado({ ok: true, fechaCubierta: null, resultado: vacio });
    return vacio;
  }

  const base = lineas.map((l) => aFechaTexto(l.fecha_base)).filter(Boolean).sort()[0];
  const cubierta = estado?.ultima_fecha_cubierta || null;
  let inicio = desde || (cubierta ? sumarDias(cubierta, -DIAS_TRASLAPE) : base);
  if (inicio < base) inicio = base;
  if (inicio > hoy) inicio = hoy;

  const resultado = await sincronizarRango({ desde: inicio, hasta: hoy, lineas, mba3, movimientos });
  resultado.lineas_elegibles = lineas.length;
  resultado.lineas_omitidas = omitidas;

  const completo = !resultado.error;
  // El punto cubierto nunca retrocede (un reproceso histórico forzado no debe reabrir lo ya cubierto).
  const avanzada = resultado.ultima_fecha_completa;
  const nuevaCubierta = avanzada && (!cubierta || avanzada > cubierta) ? avanzada : null;
  await modelo.guardarResultado({ ok: completo, fechaCubierta: nuevaCubierta, resultado });
  return resultado;
}

// Con candado de PostgreSQL: si otra réplica/proceso ya está sincronizando, esta vuelta se omite.
async function sincronizarConCandado(opciones = {}) {
  const conexion = await grupo.connect();
  try {
    const { rows } = await conexion.query('SELECT pg_try_advisory_lock($1) AS obtenido', [SincronizacionMba3.CANDADO_SYNC_CONVENIOS]);
    if (!rows[0]?.obtenido) return { omitida: true };
    try {
      return await sincronizar(opciones);
    } finally {
      await conexion.query('SELECT pg_advisory_unlock($1)', [SincronizacionMba3.CANDADO_SYNC_CONVENIOS]);
    }
  } finally {
    conexion.release();
  }
}

module.exports = {
  DIAS_TRASLAPE,
  CONCEPTO_DEVOLUCION,
  cantidadFacturada,
  normalizarCliente,
  normalizarProducto,
  aFechaTexto,
  sumarDias,
  dividirEnTrozos,
  elegirLinea,
  indexarLineas,
  sincronizarRango,
  sincronizar,
  sincronizarConCandado,
};
