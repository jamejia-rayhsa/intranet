const bcrypt = require("bcrypt");
const ServicioAuth = require("../services/auth.service");
const ServicioMS365 = require("../services/ms365.service");
const Usuario = require("../models/usuario.model");
const sinSecretos = require("../utils/sinSecretos");
const SupabaseAdmin = require("../services/supabaseAdmin.service");

const ControladorAuth = {
  async registroLocal(req, res) {
    try {
      const { correo, nombre, apellido, contraseña } = req.body;

      if (!correo || !nombre || !contraseña) {
        return res.status(400).json({
          exito: false,
          mensaje: "Correo, nombre y contraseña son obligatorios",
        });
      }

      const resultado = await ServicioAuth.registroLocal({
        correo,
        nombre,
        apellido,
        contraseña,
      });

      res.status(201).json({
        exito: true,
        datos: { ...resultado, usuario: sinSecretos(resultado.usuario) },
        mensaje: "Usuario registrado exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: error.message,
      });
    }
  },

  async inicioSesionLocal(req, res) {
    try {
      const { correo, contraseña } = req.body;

      if (!correo || !contraseña) {
        return res.status(400).json({
          exito: false,
          mensaje: "Correo y contraseña son obligatorios",
        });
      }

      const resultado = await ServicioAuth.inicioSesionLocal(
        correo,
        contraseña,
      );

      res.json({
        exito: true,
        datos: { ...resultado, usuario: sinSecretos(resultado.usuario) },
        mensaje: "Inicio de sesión exitoso",
      });
    } catch (error) {
      res.status(401).json({
        exito: false,
        mensaje: error.message,
      });
    }
  },

  redirigirMS365(req, res) {
    const url = ServicioMS365.obtenerUrlAutorizacion();
    res.redirect(url);
  },

  async callbackMS365(req, res) {
    try {
      const { codigo } = req.query;

      if (!codigo) {
        return res.status(400).json({
          exito: false,
          mensaje: "Código de autorización no recibido",
        });
      }

      const datosToken = await ServicioMS365.obtenerTokenDesdeCodigo(codigo);
      const perfilMS = await ServicioMS365.obtenerPerfilUsuario(
        datosToken.access_token,
      );

      // Buscar o crear usuario
      let usuario = await Usuario.buscarPorCorreo(perfilMS.mail);

      if (!usuario) {
        const nombres = perfilMS.displayName.split(" ");
        usuario = await Usuario.crear({
          correo: perfilMS.mail,
          nombre: nombres[0],
          apellido: nombres.slice(1).join(" "),
          auth_tipo: "ms365",
          external_id: perfilMS.id,
        });
      }

      const token = ServicioAuth.generarToken(usuario);

      // Redirigir al frontend con el token
      res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:3000"}/auth/callback?token=${token}`,
      );
    } catch (error) {
      console.error("Error en autenticación MS365:", error);
      res.status(500).json({
        exito: false,
        mensaje: "Error al autenticar con MS365",
      });
    }
  },

  async renovarToken(req, res) {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        return res.status(400).json({
          exito: false,
          mensaje: "Token de renovación requerido",
        });
      }

      // TODO: Implementar refresh tokens con almacenamiento en BD
      res.json({
        exito: false,
        mensaje: "Renovación de tokens no implementada aún",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: error.message,
      });
    }
  },

  async recuperarPassword(req, res) {
    try {
      const { correo } = req.body;

      if (!correo) {
        return res.status(400).json({
          exito: false,
          mensaje: "Correo es obligatorio",
        });
      }

      const resultado = await ServicioAuth.recuperarContraseña(correo);

      res.json({
        exito: true,
        mensaje: resultado.mensaje,
      });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: error.message,
      });
    }
  },

  async obtenerPerfil(req, res) {
    try {
      const usuario = await Usuario.buscarPorId(req.user.usuario_id);

      if (!usuario) {
        return res.status(404).json({
          exito: false,
          mensaje: "Usuario no encontrado",
        });
      }

      const consultaRoles = `
        SELECT r.id as rol_id, r.nombre as rol_nombre
        FROM usuario_rol ur
        INNER JOIN roles r ON ur.rol_id = r.id
        WHERE ur.usuario_id = $1
      `;
      const Rol = require("../models/rol.model");
      const { grupo } = require("../config/database");
      const resultadoRoles = await grupo.query(consultaRoles, [
        req.user.usuario_id,
      ]);
      const roles = resultadoRoles.rows.map((r) => r.rol_nombre);

      const permisosUsuario = new Set();
      for (const rol of resultadoRoles.rows) {
        const permisos = await Rol.obtenerPermisos(rol.rol_id);
        permisos.forEach((p) => permisosUsuario.add(p.nombre));
      }

      res.json({
        exito: true,
        datos: {
          ...sinSecretos(usuario),
          roles,
          permisos: Array.from(permisosUsuario),
        },
      });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener el perfil",
      });
    }
  },

  async cambiarPassword(req, res) {
    try {
      const { contraseña_actual, contraseña_nueva } = req.body;

      if (!contraseña_actual || !contraseña_nueva) {
        return res.status(400).json({
          exito: false,
          mensaje: "Contraseña actual y nueva son obligatorias",
        });
      }

      const usuario = await Usuario.buscarPorIdConHash(req.user.usuario_id);

      if (!usuario) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }

      if (!usuario.hash_password) {
        return res.status(400).json({
          exito: false,
          mensaje: "Este usuario usa autenticación MS365",
        });
      }

      const contraseñaValida = await bcrypt.compare(
        contraseña_actual,
        usuario.hash_password,
      );
      if (!contraseñaValida) {
        return res.status(400).json({
          exito: false,
          mensaje: "La contraseña actual es incorrecta",
        });
      }

      const sal = await bcrypt.genSalt(10);
      const hashNueva = await bcrypt.hash(contraseña_nueva, sal);

      // Escritura doble: Supabase Auth primero (si falla, no se cambia nada)
      if (usuario.auth_uid) {
        await SupabaseAdmin.actualizarPassword(
          usuario.auth_uid,
          contraseña_nueva,
        );
      }

      try {
        await Usuario.actualizar(usuario.id, {
          hash_password: hashNueva,
          requiere_cambio_password: false,
        });
      } catch (errorLocal) {
        if (usuario.auth_uid) {
          await SupabaseAdmin.actualizarPassword(
            usuario.auth_uid,
            contraseña_actual,
          ).catch(() => {});
        }
        throw errorLocal;
      }

      res.json({ exito: true, mensaje: "Contraseña actualizada exitosamente" });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: error.message,
      });
    }
  },
};

module.exports = ControladorAuth;
