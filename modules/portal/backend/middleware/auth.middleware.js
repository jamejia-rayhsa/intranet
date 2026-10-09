const jwt = require("jsonwebtoken");
const Usuario = require("../models/usuario.model");
const Rol = require("../models/rol.model");
const { grupo } = require("../config/database");

function authLegacyActivo() {
  return process.env.AUTH_LEGACY_ENABLED !== "false";
}

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
 * Busca el usuario local por auth_uid (sub). Si no existe, intenta vincular
 * por correo (solo si el usuario local aún no tiene auth_uid).
 */
async function resolverUsuarioSupabase(claims) {
  const porUid = await grupo.query(
    `SELECT ${COLUMNAS_USUARIO} FROM usuarios WHERE auth_uid = $1`,
    [claims.sub],
  );
  if (porUid.rows.length > 0) return porUid.rows[0];

  const verificado =
    !claims.user_metadata || claims.user_metadata.email_verified !== false;
  if (!claims.email || !verificado) return null;

  const vinculado = await grupo.query(
    `UPDATE usuarios SET auth_uid = $1
     WHERE lower(correo) = lower($2) AND auth_uid IS NULL
     RETURNING ${COLUMNAS_USUARIO}`,
    [claims.sub, claims.email],
  );
  if (vinculado.rows.length > 0) return vinculado.rows[0];

  // Otra petición pudo vincularlo en paralelo
  const reintento = await grupo.query(
    `SELECT ${COLUMNAS_USUARIO} FROM usuarios WHERE auth_uid = $1`,
    [claims.sub],
  );
  return reintento.rows[0] || null;
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

  // 1) Token de Supabase Auth (HS256, aud=authenticated)
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

  // 2) Flujo legado (JWT_SECRET), solo si la flag lo permite
  if (!authLegacyActivo()) {
    return res.status(401).json({
      exito: false,
      mensaje: "Token inválido o expirado",
    });
  }

  try {
    const decodificado = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decodificado;
    await completarRol(req.user);
    next();
  } catch (error) {
    return res.status(401).json({
      exito: false,
      mensaje: "Token inválido o expirado",
    });
  }
}

/**
 * Middleware para verificar que el usuario tenga los permisos requeridos.
 * Uso: autorizar(['portal.admin', 'rh.view'])
 */
function autorizar(permisosRequeridos) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        exito: false,
        mensaje: "Usuario no autenticado",
      });
    }

    // Obtener roles del usuario
    const consultaRoles = `
      SELECT r.id as rol_id, r.nombre as rol_nombre
      FROM usuario_rol ur
      INNER JOIN roles r ON ur.rol_id = r.id
      WHERE ur.usuario_id = $1
    `;

    const resultadoRoles = await grupo.query(consultaRoles, [
      req.user.usuario_id,
    ]);
    const rolesUsuario = resultadoRoles.rows;

    // Si el usuario tiene rol super_admin, tiene todos los permisos
    const tieneSuperAdmin = rolesUsuario.some(
      (r) => r.rol_nombre === "super_admin",
    );
    if (tieneSuperAdmin) {
      return next();
    }

    // Obtener todos los permisos del usuario a través de sus roles
    const permisosUsuario = new Set();
    for (const rol of rolesUsuario) {
      const permisos = await Rol.obtenerPermisos(rol.rol_id);
      permisos.forEach((p) => permisosUsuario.add(p.nombre));
    }

    // Verificar si tiene al menos uno de los permisos requeridos
    const tienePermiso = permisosRequeridos.some((permiso) =>
      permisosUsuario.has(permiso),
    );

    if (!tienePermiso) {
      return res.status(403).json({
        exito: false,
        mensaje: "No tienes permisos suficientes para realizar esta acción",
        permisos_requeridos: permisosRequeridos,
      });
    }

    next();
  };
}

/**
 * Protege rutas del auth legado: responde 404 si AUTH_LEGACY_ENABLED=false.
 */
function soloLegacy(req, res, next) {
  if (!authLegacyActivo()) {
    return res.status(404).json({
      exito: false,
      mensaje: "Ruta no encontrada",
    });
  }
  next();
}

module.exports = { authenticateJWT, autorizar, soloLegacy };
