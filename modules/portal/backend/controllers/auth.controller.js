const Usuario = require("../models/usuario.model");
const sinSecretos = require("../utils/sinSecretos");
const SupabaseAdmin = require("../services/supabaseAdmin.service");

// GoTrue responde 400 (invalid_credentials) o 401/422 ante credenciales malas.
const ESTADOS_CREDENCIALES = [400, 401, 422];

const ControladorAuth = {
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

      const usuario = await Usuario.buscarPorId(req.user.usuario_id);

      if (!usuario) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }

      if (!usuario.auth_uid) {
        return res.status(409).json({
          exito: false,
          mensaje: "El usuario no tiene cuenta en Supabase Auth",
        });
      }

      // La contraseña actual se valida contra GoTrue (única fuente de verdad).
      try {
        await SupabaseAdmin.iniciarSesion(usuario.correo, contraseña_actual);
      } catch (error) {
        if (ESTADOS_CREDENCIALES.includes(error.status)) {
          return res.status(400).json({
            exito: false,
            mensaje: "La contraseña actual es incorrecta",
          });
        }
        throw error;
      }

      await SupabaseAdmin.actualizarPassword(
        usuario.auth_uid,
        contraseña_nueva,
      );
      await Usuario.actualizar(usuario.id, {
        requiere_cambio_password: false,
      });

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
