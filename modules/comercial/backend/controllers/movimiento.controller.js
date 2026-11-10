const Convenio = require('../models/convenio.model');
const Movimiento = require('../models/movimiento.model');
const { registrarAccion } = require('../../../auditoria/backend/services/auditoria.service');
const { idValido, fechaValida, numeroValido } = require('../utils/validacion');

const MSG_ID_INVALIDO = 'id inválido';
const TIPOS_VALIDOS = ['compra_inicial', 'consumo'];

// cantidad de un movimiento: a diferencia de empaque/precio (que admiten 0 u opcional), un
// movimiento sin cantidad > 0 no tiene sentido (CHECK cantidad > 0 en la BD lo exige también).
function cantidadValida(valor) {
  return numeroValido(valor, { permitirNulo: false }) && Number(valor) > 0;
}

// Carga convenio + línea de producto y verifica que la línea pertenezca a ESE convenio (evita que
// un id de línea de otro convenio se use por error/IDOR). Devuelve { convenio, producto } o un
// objeto { status, mensaje } si algo no es válido.
async function cargarConvenioYProducto(req) {
  if (!idValido(req.params.id) || !idValido(req.params.productoId)) {
    return { error: { status: 400, mensaje: MSG_ID_INVALIDO } };
  }
  const convenio = await Convenio.obtener(req.params.id);
  if (!convenio) return { error: { status: 404, mensaje: 'Convenio no encontrado' } };
  const producto = convenio.productos.find((p) => String(p.id) === String(req.params.productoId));
  if (!producto) return { error: { status: 404, mensaje: 'Línea de producto no encontrada en este convenio' } };
  return { convenio, producto };
}

const ControladorMovimiento = {
  // Estado de consumo de TODAS las líneas de un convenio en una sola llamada (para la pantalla de
  // detalle, sin pedir una por línea).
  async estadoConvenio(req, res) {
    try {
      if (!idValido(req.params.id)) return res.status(400).json({ exito: false, mensaje: MSG_ID_INVALIDO });
      const convenio = await Convenio.obtener(req.params.id);
      if (!convenio) return res.status(404).json({ exito: false, mensaje: 'Convenio no encontrado' });

      const lineas = [];
      for (const producto of convenio.productos) {
        const estado = await Movimiento.calcularEstado(producto.id);
        const datos = Movimiento.proyectarEstimado(estado, producto);
        lineas.push({ producto_id: producto.id, ...datos });
      }
      return res.json({ exito: true, datos: { convenio_id: convenio.id, lineas } });
    } catch (error) {
      console.error('Error al calcular el estado de consumo del convenio:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al calcular el estado de consumo del convenio' });
    }
  },

  async listar(req, res) {
    try {
      const { error, producto } = await cargarConvenioYProducto(req);
      if (error) return res.status(error.status).json({ exito: false, mensaje: error.mensaje });

      const estado = await Movimiento.calcularEstado(producto.id);
      const datos = Movimiento.proyectarEstimado(estado, producto);
      return res.json({ exito: true, datos });
    } catch (error) {
      console.error('Error al listar movimientos:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al listar movimientos' });
    }
  },

  async registrar(req, res) {
    try {
      const { error, convenio, producto } = await cargarConvenioYProducto(req);
      if (error) return res.status(error.status).json({ exito: false, mensaje: error.mensaje });

      // Solo se registra consumo/compra real sobre un convenio ya autorizado (lo demás no está en
      // operación todavía: pendiente, rechazado o cancelado).
      if (convenio.estatus !== 'autorizado') {
        return res.status(409).json({
          exito: false,
          mensaje: 'Solo se pueden registrar movimientos sobre un convenio autorizado',
        });
      }

      const { tipo, cantidad, fecha_movimiento, orden_compra, comentario } = req.body;
      if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
        return res.status(400).json({ exito: false, mensaje: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}` });
      }
      if (!cantidadValida(cantidad)) {
        return res.status(400).json({ exito: false, mensaje: 'cantidad debe ser un número mayor a 0' });
      }
      if (!fechaValida(fecha_movimiento)) {
        return res.status(400).json({ exito: false, mensaje: 'fecha_movimiento debe tener formato AAAA-MM-DD y ser una fecha real' });
      }
      if (orden_compra !== undefined && orden_compra !== null && typeof orden_compra !== 'string') {
        return res.status(400).json({ exito: false, mensaje: 'orden_compra debe ser texto' });
      }
      if (comentario !== undefined && comentario !== null && typeof comentario !== 'string') {
        return res.status(400).json({ exito: false, mensaje: 'comentario debe ser texto' });
      }

      if (tipo === 'consumo') {
        const tieneCompraInicial = await Movimiento.existeCompraInicial(producto.id);
        if (!tieneCompraInicial) {
          return res.status(409).json({
            exito: false,
            mensaje: 'Primero debes registrar la compra inicial de esta línea antes de registrar consumo',
          });
        }
      }

      let movimiento;
      try {
        movimiento = await Movimiento.registrar(
          producto.id,
          { tipo, cantidad, fecha_movimiento, orden_compra, comentario },
          req.user?.usuario_id || req.user?.id,
        );
      } catch (errorBd) {
        if (errorBd.code === Movimiento.ERROR_UNICIDAD) {
          return res.status(409).json({ exito: false, mensaje: 'Ya se registró la compra inicial de esta línea' });
        }
        throw errorBd;
      }

      await registrarAccion(req, 'comercial', 'comercial_convenio_movimientos', movimiento.id, 'crear', null, {
        convenio_id: convenio.id,
        convenio_producto_id: producto.id,
        tipo: movimiento.tipo,
        cantidad: movimiento.cantidad,
      });

      const estado = await Movimiento.calcularEstado(producto.id);
      const datos = Movimiento.proyectarEstimado(estado, producto);
      return res.status(201).json({ exito: true, datos: { movimiento, estado: datos } });
    } catch (error) {
      console.error('Error al registrar movimiento:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al registrar movimiento' });
    }
  },
};

module.exports = ControladorMovimiento;
