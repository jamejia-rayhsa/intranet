// modules/comercial/backend/controllers/mba3.controller.js
// Búsqueda en catálogos MBA3 para que el frontend complete datos ANTES de crear/editar un
// convenio (el autocompletar real al guardar vive en convenio.controller.js). Mismo contrato de
// respuesta que el resto de Convenios: { exito, datos, advertencias? }. Un error de MBA3 aquí
// SÍ se refleja como error al usuario (son endpoints de búsqueda explícita, no un guardado que no
// deba bloquearse), pero nunca como 500 genérico de Node: se traduce a un mensaje claro.
const Mba3Catalogo = require('../services/mba3Catalogo.service');
const Mba3Lectura = require('../services/mba3Lectura.service');

function manejarError(res, error, contexto) {
  if (error instanceof Mba3Lectura.ErrorMba3NoConfigurado) {
    return res.status(503).json({ exito: false, mensaje: 'La integración de lectura de MBA3 no está configurada en este entorno' });
  }
  console.error(`Error en ${contexto}:`, error.message);
  return res.status(502).json({ exito: false, mensaje: `No se pudo consultar MBA3 (${contexto})`, error: error.message });
}

const ControladorMba3 = {
  async ficha(req, res) {
    try {
      const codigo = String(req.query.codigo || '').trim();
      if (!codigo) return res.status(400).json({ exito: false, mensaje: 'codigo es requerido' });
      const { datos, advertencia } = await Mba3Catalogo.resolverCliente(codigo);
      const respuesta = { exito: true, datos };
      if (advertencia) respuesta.advertencias = [advertencia];
      return res.json(respuesta);
    } catch (error) {
      return manejarError(res, error, 'ficha de cliente');
    }
  },

  async clientesPorVendedor(req, res) {
    try {
      const vendedor = String(req.query.vendedor || '').trim();
      if (!vendedor) return res.status(400).json({ exito: false, mensaje: 'vendedor es requerido' });
      const { datos, advertencia } = await Mba3Catalogo.buscarClientesPorVendedor(vendedor);
      const respuesta = { exito: true, datos };
      if (advertencia) respuesta.advertencias = [advertencia];
      return res.json(respuesta);
    } catch (error) {
      return manejarError(res, error, 'clientes por vendedor');
    }
  },

  async vendedores(req, res) {
    try {
      const { datos, advertencia } = await Mba3Catalogo.buscarVendedores();
      // R-F2-1: coincidencia EXACTA de código (sin distinguir mayúsculas/minúsculas, igual que
      // antes), no subcadena (buscar "1" ya no trae "10"/"11").
      const codigo = req.query.codigo ? String(req.query.codigo).trim().toLowerCase() : null;
      const filtrados = codigo
        ? (datos || []).filter((v) => String(v?.codigo ?? '').trim().toLowerCase() === codigo)
        : datos;
      const respuesta = { exito: true, datos: filtrados };
      if (advertencia) respuesta.advertencias = [advertencia];
      return res.json(respuesta);
    } catch (error) {
      return manejarError(res, error, 'vendedores');
    }
  },

  async productos(req, res) {
    try {
      const codigo = req.query.codigo ? String(req.query.codigo).trim() : null;
      const { datos, advertencia } = await Mba3Catalogo.buscarProductos(codigo);
      // R-F2-1: con un código buscado, solo devolver registros con ese código EXACTO (sin
      // distinguir mayúsculas/minúsculas, no subcadena); no confiar en que MBA3 ya filtró exacto
      // con el body asumido `{codigo}` (defensa en profundidad).
      const codigoMin = codigo ? codigo.toLowerCase() : null;
      const filtrados = codigoMin
        ? (Array.isArray(datos) ? datos : []).filter((p) => String(p?.codigo ?? '').trim().toLowerCase() === codigoMin)
        : datos;
      const respuesta = { exito: true, datos: filtrados };
      if (advertencia) respuesta.advertencias = [advertencia];
      return res.json(respuesta);
    } catch (error) {
      return manejarError(res, error, 'productos');
    }
  },

  async existenciasVentas(req, res) {
    try {
      const codigo = String(req.query.codigo || '').trim();
      if (!codigo) return res.status(400).json({ exito: false, mensaje: 'codigo es requerido' });
      const { datos, advertencia } = await Mba3Catalogo.resolverExistenciasVentas(codigo);
      const respuesta = { exito: true, datos };
      if (advertencia) respuesta.advertencias = [advertencia];
      return res.json(respuesta);
    } catch (error) {
      return manejarError(res, error, 'existencias y ventas');
    }
  },
};

module.exports = ControladorMba3;
