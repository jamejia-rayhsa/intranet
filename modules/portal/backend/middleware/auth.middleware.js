const jwt = require("jsonwebtoken");
const Usuario = require("../models/usuario.model");
const { grupo } = require("../config/database");

/** Devuelve los claims si el token es un JWT de Supabase válido; si no, null. */
function verificarTokenSupabase(token) {
  const secreto = process.env.SUPABASE_JWT_SECRET;
  if (!secreto) return null;
  try {
    return jwt.verify(token, secreto, {
      algorithms: ["HS256"],
      audience: "authenticated",
    });
  } catch (error) {
    return null;
  }
}

const COLUMNAS_USUARIO = "id, correo, nombre, apellido, activo, auth_uid";

/**
 * Busca el usuario local por auth_uid (sub del token de GoTrue).
 *
 * NO se vincula por correo: el correo y user_metadata de un usuario de GoTrue los puede
 * editar el propio usuario (PUT /auth/v1/user) y, con SUPABASE_EMAIL_AUTOCONFIRM activo,
 * el cambio de correo no pide confirmación. Vincular por correo permitiría a cualquier
 * cuenta de GoTrue adueñarse de una fila local sin auth_uid con solo poner su correo.
 * El vínculo lo crea siempre un administrador (alta de usuario/empleado o
 * scripts/migrar-usuarios-supabase.js).
 */
async function resolverUsuarioSupabase(claims) {
  const porUid = await grupo.query(
    `SELECT ${COLUMNAS_USUARIO} FROM usuarios WHERE auth_uid = $1`,
    [claims.sub],
  );
  return porUid.rows[0] || null;
}

/** Agrega rol_id, rol_nombre y roles a req.user (misma forma que antes). */
async function completarRol(user) {
  const resultado = await grupo.query(
    `SELECT ur.rol_id, r.nombre AS rol_nombre
     FROM usuario_rol ur
     INNER JOIN roles r ON r.id = ur.rol_id
     WHERE ur.usuario_id = $1
     LIMIT 1`,
    [user.usuario_id],
  );
  if (resultado.rows.length > 0) {
    user.rol_id = resultado.rows[0].rol_id;
    user.rol_nombre = resultado.rows[0].rol_nombre;
  } else {
    user.rol_id = null;
    user.rol_nombre = null;
  }
  // Compatibilidad con código que usa req.user.roles (array)
  user.roles = user.rol_nombre ? [user.rol_nombre] : [];
}

/**
 * Middleware para autenticar el token JWT.
 * Pone req.user con los datos del usuario.
 */
async function authenticateJWT(req, res, next) {
  const encabezadoAut = req.headers["authorization"];

  if (!encabezadoAut) {
    return res.status(401).json({
      exito: false,
      mensaje: "Token de autenticación no proporcionado",
    });
  }

  const partes = encabezadoAut.split(" ");
  if (partes.length !== 2 || partes[0] !== "Bearer") {
    return res.status(401).json({
      exito: false,
      mensaje: "Formato de token inválido",
    });
  }

  const token = partes[1];

  // Único tipo de token aceptado: Supabase Auth (HS256, aud=authenticated)
  const claims = verificarTokenSupabase(token);
  if (claims) {
    try {
      const usuario = await resolverUsuarioSupabase(claims);
      if (!usuario) {
        return res.status(403).json({
          exito: false,
          mensaje: "Usuario no registrado en la intranet",
        });
      }
      if (usuario.activo === false) {
        return res.status(403).json({
          exito: false,
          mensaje: "Usuario desactivado",
        });
      }
      req.user = {
        usuario_id: usuario.id,
        correo: usuario.correo,
        nombre: usuario.nombre,
        auth_uid: usuario.auth_uid,
        iat: claims.iat,
        exp: claims.exp,
      };
      await completarRol(req.user);
      return next();
    } catch (error) {
      console.error("Error al autenticar token Supabase:", error.message);
      return res.status(500).json({
        exito: false,
        mensaje: "Error interno de autenticación",
      });
    }
  }

  // Cualquier otro token (firma ajena, expirado, malformado) se rechaza.
  return res.status(401).json({
    exito: false,
    mensaje: "Token inválido o expirado",
  });
}

module.exports = { authenticateJWT };
