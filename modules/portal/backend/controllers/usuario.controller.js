const bcrypt = require("bcrypt");
const Usuario = require("../models/usuario.model");
const { grupo } = require("../config/database");

const ControladorUsuario = {
  async listar(req, res) {
    try {
      const usuarios = await Usuario.obtenerTodos();
      res.json({ exito: true, datos: usuarios });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar usuarios",
        error: error.message,
      });
    }
  },

  async obtener(req, res) {
    try {
      const usuario = await Usuario.buscarPorId(req.params.id);
      if (!usuario) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }
      res.json({ exito: true, datos: usuario });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener usuario",
        error: error.message,
      });
    }
  },

  async crear(req, res) {
    try {
      const { correo, nombre, apellido, contraseña, rol_id, activo } = req.body;

      if (!correo || !nombre || !contraseña) {
        return res.status(400).json({
          exito: false,
          mensaje: "Correo, nombre y contraseña son obligatorios",
        });
      }

      const existente = await Usuario.buscarPorCorreo(correo);
      if (existente) {
        return res.status(400).json({
          exito: false,
          mensaje: "Ya existe un usuario con ese correo",
        });
      }

      const sal = await bcrypt.genSalt(10);
      const hashContraseña = await bcrypt.hash(contraseña, sal);

      const usuario = await Usuario.crear({
        correo,
        nombre,
        apellido,
        auth_tipo: "local",
        hash_password: hashContraseña,
        activo: activo !== undefined ? activo : true,
      });

      if (rol_id) {
        await grupo.query(
          "INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [usuario.id, rol_id],
        );
      }

      res.status(201).json({
        exito: true,
        datos: usuario,
        mensaje: "Usuario creado exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al crear usuario",
        error: error.message,
      });
    }
  },

  async actualizar(req, res) {
    try {
      const {
        nombre,
        apellido,
        contraseña,
        rol_id,
        activo,
        requiere_cambio_password,
      } = req.body;

      const datos = {};
      if (nombre !== undefined) datos.nombre = nombre;
      if (apellido !== undefined) datos.apellido = apellido;
      if (activo !== undefined) datos.activo = activo;
      if (requiere_cambio_password !== undefined)
        datos.requiere_cambio_password = requiere_cambio_password;
      if (contraseña) {
        const sal = await bcrypt.genSalt(10);
        datos.hash_password = await bcrypt.hash(contraseña, sal);
        datos.requiere_cambio_password = true;
      }

      const usuario = await Usuario.actualizar(req.params.id, datos);
      if (!usuario) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }

      await grupo.query("DELETE FROM usuario_rol WHERE usuario_id = $1", [
        req.params.id,
      ]);
      if (rol_id) {
        await grupo.query(
          "INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [req.params.id, rol_id],
        );
      }

      res.json({
        exito: true,
        datos: usuario,
        mensaje: "Usuario actualizado exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al actualizar usuario",
        error: error.message,
      });
    }
  },

  async resetearPassword(req, res) {
    try {
      const { id } = req.params;
      const usuario = await Usuario.buscarPorId(id);

      if (!usuario) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }

      if (usuario.auth_tipo !== "local") {
        return res.status(400).json({
          exito: false,
          mensaje: "Solo se puede resetear contraseña de usuarios locales",
        });
      }

      const contraseñaTemporal = Math.random().toString(36).slice(-8);
      const sal = await bcrypt.genSalt(10);
      const hashContraseña = await bcrypt.hash(contraseñaTemporal, sal);

      await Usuario.actualizar(id, {
        hash_password: hashContraseña,
        requiere_cambio_password: true,
      });

      res.json({
        exito: true,
        datos: { contraseña_temporal: contraseñaTemporal },
        mensaje: "Contraseña reseteada exitosamente",
      });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al resetear contraseña",
        error: error.message,
      });
    }
  },

  async eliminar(req, res) {
    try {
      const usuario = await Usuario.eliminar(req.params.id);
      if (!usuario) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }
      res.json({ exito: true, mensaje: "Usuario eliminado exitosamente" });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al eliminar usuario",
        error: error.message,
      });
    }
  },

  async asignarRol(req, res) {
    try {
      const { id } = req.params;
      const { rol_id } = req.body;

      if (!rol_id) {
        return res.status(400).json({
          exito: false,
          mensaje: "rol_id es obligatorio",
        });
      }

      const usuario = await Usuario.buscarPorId(id);
      if (!usuario) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }

      await grupo.query("DELETE FROM usuario_rol WHERE usuario_id = $1", [id]);
      await grupo.query(
        "INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [id, rol_id],
      );

      res.json({
        exito: true,
        mensaje: "Rol asignado exitosamente",
      });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al asignar rol",
        error: error.message,
      });
    }
  },
};

module.exports = ControladorUsuario;
