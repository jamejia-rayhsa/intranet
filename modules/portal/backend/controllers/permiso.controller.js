const Permiso = require('../models/permiso.model');
const { grupo } = require('../config/database');
const Delegacion = require('../services/delegacionPermisos');

const ControladorPermiso = {
  async listar(req, res) {
    try {
      const permisos = await Permiso.obtenerTodos();
      res.json({ exito: true, datos: permisos });
    } catch (error) {
      console.error('Error al listar permisos:', error.message);
      res.status(500).json({ exito: false, mensaje: 'Error al listar permisos' });
    }
  },

  async crear(req, res) {
    try {
      const { nombre } = req.body;

      if (!nombre) {
        return res.status(400).json({ exito: false, mensaje: 'El nombre del permiso es obligatorio' });
      }

      const permiso = await Permiso.crear(nombre);
      res.status(201).json({ exito: true, datos: permiso, mensaje: 'Permiso creado exitosamente' });
    } catch (error) {
      console.error('Error al crear permiso:', error.message);
      res.status(400).json({ exito: false, mensaje: 'Error al crear permiso' });
    }
  },

  async actualizar(req, res) {
    try {
      const { nombre } = req.body;

      if (!nombre) {
        return res.status(400).json({ exito: false, mensaje: 'El nombre del permiso es obligatorio' });
      }

      const permiso = await Permiso.actualizar(req.params.id, nombre);
      if (!permiso) {
        return res.status(404).json({ exito: false, mensaje: 'Permiso no encontrado' });
      }
      res.json({ exito: true, datos: permiso, mensaje: 'Permiso actualizado exitosamente' });
    } catch (error) {
      console.error('Error al actualizar permiso:', error.message);
      res.status(400).json({ exito: false, mensaje: 'Error al actualizar permiso' });
    }
  },

  async eliminar(req, res) {
    try {
      const permiso = await Permiso.eliminar(req.params.id);
      if (!permiso) {
        return res.status(404).json({ exito: false, mensaje: 'Permiso no encontrado' });
      }
      res.json({ exito: true, mensaje: 'Permiso eliminado exitosamente' });
    } catch (error) {
      console.error('Error al eliminar permiso:', error.message);
      res.status(500).json({ exito: false, mensaje: 'Error al eliminar permiso' });
    }
  },

  async guardarPermisosModulo(req, res) {
    try {
      const { rol_id, modulo } = req.params;
      await Delegacion.guardarPermisosDeModulo(grupo, req.user, rol_id, modulo, req.body && req.body.permisos);
      res.json({ exito: true, mensaje: 'Permisos actualizados' });
    } catch (error) {
      if (Delegacion.responderErrorDelegacion(res, error)) return;
      console.error('guardarPermisosModulo:', error.message);
      res.status(500).json({ exito: false, mensaje: 'Error al guardar permisos' });
    }
  },

  async misPermisos(req, res) {
    try {
      const permisos = await Permiso.obtenerPorUsuarioId(req.user.usuario_id);
      res.json({ exito: true, datos: permisos });
    } catch (err) {
      console.error('misPermisos:', err);
      res.status(500).json({ exito: false, mensaje: 'Error al obtener permisos' });
    }
  },
};

module.exports = ControladorPermiso;
