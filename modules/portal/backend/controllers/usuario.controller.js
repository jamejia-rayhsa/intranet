const Usuario = require("../models/usuario.model");
const { grupo } = require("../config/database");
const supabaseAdmin = require("../services/supabaseAdmin.service");
const sinSecretos = require("../utils/sinSecretos");
const {
  generarContraseñaTemporal,
} = require("../utils/contrasenaTemporal");

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
      res.json({ exito: true, datos: sinSecretos(usuario) });
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

      // 1) Crear primero en GoTrue (única fuente de la contraseña);
      // 2) guardar auth_uid en el INSERT local (sin hash_password).
      const nuevoAuth = await supabaseAdmin.crearUsuario({
        correo: correo.trim().toLowerCase(),
        password: contraseña,
        metadata: { nombre, apellido },
      });

      let usuario;
      try {
        usuario = await Usuario.crear({
          correo,
          nombre,
          apellido,
          auth_tipo: "local",
          auth_uid: nuevoAuth.id,
          activo: activo !== undefined ? activo : true,
        });
      } catch (errorInsert) {
        // Compensacion: no dejar huerfano en GoTrue
        try {
          await supabaseAdmin.eliminarUsuario(nuevoAuth.id);
        } catch (errorComp) {
          console.error(
            "No se pudo compensar el alta en Supabase Auth:",
            errorComp.message,
          );
        }
        throw errorInsert;
      }

      if (rol_id) {
        await grupo.query(
          "INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [usuario.id, rol_id],
        );
      }

      res.status(201).json({
        exito: true,
        datos: sinSecretos(usuario),
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
        datos.requiere_cambio_password = true;
      }

      // TODO(supabase): este endpoint no permite cambiar correo; si se agrega,
      // sincronizarlo en GoTrue (el contrato de supabaseAdmin aun no lo ofrece).
      if (contraseña) {
        const actual = await Usuario.buscarPorId(req.params.id);
        if (!actual) {
          return res
            .status(404)
            .json({ exito: false, mensaje: "Usuario no encontrado" });
        }
        if (!actual.auth_uid) {
          return res.status(409).json({
            exito: false,
            mensaje: "El usuario no tiene cuenta en Supabase Auth",
          });
        }
        await supabaseAdmin.actualizarPassword(actual.auth_uid, contraseña);
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
        datos: sinSecretos(usuario),
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

      const contraseñaTemporal = generarContraseñaTemporal();
      if (!usuario.auth_uid) {
        return res.status(409).json({
          exito: false,
          mensaje: "El usuario no tiene cuenta en Supabase Auth",
        });
      }

      // La contraseña vive solo en GoTrue
      await supabaseAdmin.actualizarPassword(usuario.auth_uid, contraseñaTemporal);
      await Usuario.actualizar(id, { requiere_cambio_password: true });

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
      // Orden deliberado: primero la fila local, despues GoTrue. El middleware
      // autoriza por la fila local, asi que una identidad huerfana en GoTrue
      // recibe 403; invertirlo seria irrecuperable si fallara el borrado local.
      // Un fallo de limpieza en GoTrue se registra y no bloquea la respuesta.
      const previo = await Usuario.buscarPorId(req.params.id);
      const usuario = await Usuario.eliminar(req.params.id);
      if (!usuario) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }
      if (previo && previo.auth_uid) {
        try {
          await supabaseAdmin.eliminarUsuario(previo.auth_uid);
        } catch (e) {
          console.warn(
            `Usuario ${req.params.id} eliminado local; fallo limpieza en Supabase Auth: ${e.message}`,
          );
        }
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
module.exports.generarContraseñaTemporal = generarContraseñaTemporal;
