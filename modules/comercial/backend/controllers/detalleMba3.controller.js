const Convenio = require('../models/convenio.model');
const Detalle = require('../services/convenioDetalleMba3.service');
const Mba3 = require('../services/mba3Lectura.service');
const { idValido } = require('../utils/validacion');

// GET /convenios/:id/productos/:productoId/mba3 — órdenes de compra, facturas, existencias y
// resumen de UNA línea, consultados en vivo a MBA3 (la pantalla lo pide al abrir cada línea).
const ControladorDetalleMba3 = {
  async obtener(req, res) {
    try {
      if (!idValido(req.params.id) || !idValido(req.params.productoId)) {
        return res.status(400).json({ exito: false, mensaje: 'id inválido' });
      }
      const convenio = await Convenio.obtener(req.params.id);
      if (!convenio) return res.status(404).json({ exito: false, mensaje: 'Convenio no encontrado' });
      const linea = convenio.productos.find((p) => String(p.id) === String(req.params.productoId));
      if (!linea) return res.status(404).json({ exito: false, mensaje: 'Línea de producto no encontrada en este convenio' });

      const datos = await Detalle.obtenerDetalleLinea(convenio, linea, { forzarExistencias: req.query.refrescar === '1' });
      if (datos.error) return res.status(422).json({ exito: false, mensaje: datos.error });
      return res.json({ exito: true, datos });
    } catch (error) {
      if (error instanceof Mba3.ErrorMba3NoConfigurado) {
        return res.status(503).json({ exito: false, mensaje: 'La integración con MBA3 no está configurada' });
      }
      console.error('Error al consultar el detalle MBA3 del convenio:', error.message);
      return res.status(502).json({ exito: false, mensaje: 'No se pudo consultar MBA3' });
    }
  },
};

module.exports = ControladorDetalleMba3;
