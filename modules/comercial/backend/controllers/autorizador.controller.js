const Autorizador = require('../models/autorizador.model');
const { registrarAccion } = require('../../../auditoria/backend/services/auditoria.service');
const { idValido } = require('../utils/validacion');

function usuarioId(req) {
  return req.user?.usuario_id || req.user?.id;
}

const ControladorAutorizador = {
  async listar(req, res) {
    try {
      const autorizadores = await Autorizador.listar();
      return res.json({ exito: true, datos: autorizadores });
    } catch (error) {
      console.error('Error al listar autorizadores:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al listar autorizadores' });
    }
  },

  async agregar(req, res) {
    try {
      const { usuario_id } = req.body;
      if (!usuario_id) {
        return res.status(400).json({ exito: false, mensaje: 'usuario_id es requerido' });
      }
      if (!idValido(usuario_id)) {
        return res.status(400).json({ exito: false, mensaje: 'usuario_id inválido' });
      }

      const autorizador = await Autorizador.agregar(usuario_id, usuarioId(req));

      await registrarAccion(req, 'comercial', 'comercial_autorizadores', usuario_id, 'agregar', null, {
        usuario_id,
        activo: true,
      });

      return res.status(201).json({ exito: true, datos: autorizador });
    } catch (error) {
      if (error.code === '23503') {
        return res.status(400).json({ exito: false, mensaje: 'usuario_id no corresponde a un usuario existente' });
      }
      console.error('Error al agregar autorizador:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al agregar autorizador' });
    }
  },

  async quitar(req, res) {
    try {
      if (!idValido(req.params.usuario_id)) {
        return res.status(400).json({ exito: false, mensaje: 'usuario_id inválido' });
      }
      const autorizador = await Autorizador.quitar(req.params.usuario_id);
      if (!autorizador) {
        return res.status(404).json({ exito: false, mensaje: 'Autorizador no encontrado o ya inactivo' });
      }

      await registrarAccion(req, 'comercial', 'comercial_autorizadores', req.params.usuario_id, 'quitar', { activo: true }, {
        activo: false,
      });

      return res.json({ exito: true, datos: autorizador });
    } catch (error) {
      console.error('Error al quitar autorizador:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al quitar autorizador' });
    }
  },
};

module.exports = ControladorAutorizador;
