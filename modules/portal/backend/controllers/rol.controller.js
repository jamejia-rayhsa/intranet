const Rol = require('../models/rol.model');
const Delegacion = require('../services/delegacionPermisos');

// Quien no es super_admin no puede tocar roles con nombre privilegiado (super_admin, rh_admin,
// tickets_admin: el código decide por nombre) ni crear/renombrar otro rol con ese nombre.
function respuestaRolPrivilegiado(req, res, nombre) {
  if (!Delegacion.esSuperAdmin(req.user) && Delegacion.esNombrePrivilegiado(nombre)) {
    res.status(403).json({
      exito: false,
      mensaje: `Solo un super_admin puede crear, modificar o eliminar el rol ${nombre}`,
    });
    return true;
  }
  return false;
}

const ControladorRol = {
  async listar(req, res) {
    try {
      const roles = await Rol.obtenerTodos();
      res.json({ exito: true, datos: roles });
    } catch (error) {
      console.error('Error al listar roles:', error.message);
      res.status(500).json({ exito: false, mensaje: 'Error al listar roles' });
    }
  },

  async obtener(req, res) {
    try {
      const rol = await Rol.obtenerPorId(req.params.id);
      if (!rol) {
        return res.status(404).json({ exito: false, mensaje: 'Rol no encontrado' });
      }
      const permisos = await Rol.obtenerPermisos(rol.id);
      res.json({ exito: true, datos: { ...rol, permisos } });
    } catch (error) {
      console.error('Error al obtener rol:', error.message);
      res.status(500).json({ exito: false, mensaje: 'Error al obtener rol' });
    }
  },

  async crear(req, res) {
    try {
      const { nombre } = req.body;

      if (!nombre) {
        return res.status(400).json({ exito: false, mensaje: 'El nombre del rol es obligatorio' });
      }

      if (respuestaRolPrivilegiado(req, res, nombre)) return;

      const rol = await Rol.crear(nombre);
      res.status(201).json({ exito: true, datos: rol, mensaje: 'Rol creado exitosamente' });
    } catch (error) {
      console.error('Error al crear rol:', error.message);
      res.status(400).json({ exito: false, mensaje: 'Error al crear rol' });
    }
  },

  async actualizar(req, res) {
    try {
      const { nombre } = req.body;

      if (!nombre) {
        return res.status(400).json({ exito: false, mensaje: 'El nombre del rol es obligatorio' });
      }

      if (respuestaRolPrivilegiado(req, res, nombre)) return;
      const actual = await Rol.obtenerPorId(req.params.id);
      if (actual && respuestaRolPrivilegiado(req, res, actual.nombre)) return;

      const rol = await Rol.actualizar(req.params.id, nombre);
      if (!rol) {
        return res.status(404).json({ exito: false, mensaje: 'Rol no encontrado' });
      }
      res.json({ exito: true, datos: rol, mensaje: 'Rol actualizado exitosamente' });
    } catch (error) {
      console.error('Error al actualizar rol:', error.message);
      res.status(400).json({ exito: false, mensaje: 'Error al actualizar rol' });
    }
  },

  async eliminar(req, res) {
    try {
      // Borrar un rol deja sin acceso a todos sus usuarios: solo super_admin (decisión del humano)
      if (!Delegacion.esSuperAdmin(req.user)) {
        return res.status(403).json({
          exito: false,
          mensaje: 'Solo un super_admin puede eliminar roles',
        });
      }

      const rol = await Rol.eliminar(req.params.id);
      if (!rol) {
        return res.status(404).json({ exito: false, mensaje: 'Rol no encontrado' });
      }
      res.json({ exito: true, mensaje: 'Rol eliminado exitosamente' });
    } catch (error) {
      console.error('Error al eliminar rol:', error.message);
      res.status(500).json({ exito: false, mensaje: 'Error al eliminar rol' });
    }
  },

  async asignarPermisos(req, res) {
    try {
      // Tabla heredada rol_permiso (sin módulo/opción/tipo): no se puede verificar qué posee quien
      // delega, así que solo super_admin. No gobierna la autorización (solo la lee
      // ticket.controller.listarTecnicos); la autorización real es rol_opcion_permisos
      // (PUT /api/permisos/rol/:rol_id/modulo/:modulo).
      if (!Delegacion.esSuperAdmin(req.user)) {
        return res.status(403).json({
          exito: false,
          mensaje: 'Solo un super_admin puede asignar permisos con este método; usa la edición de permisos por módulo',
        });
      }
      const { permisos_ids } = req.body;

      if (!Array.isArray(permisos_ids)) {
        return res.status(400).json({ exito: false, mensaje: 'Se requiere un arreglo de IDs de permisos' });
      }

      const permisos = await Rol.asignarPermisos(req.params.id, permisos_ids);
      res.json({ exito: true, datos: permisos, mensaje: 'Permisos asignados exitosamente' });
    } catch (error) {
      console.error('Error al asignar permisos:', error.message);
      res.status(400).json({ exito: false, mensaje: 'Error al asignar permisos' });
    }
  },
};

module.exports = ControladorRol;
