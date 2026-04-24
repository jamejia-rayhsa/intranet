const jwt = require("jsonwebtoken");
const Usuario = require("../models/usuario.model");
const Rol = require("../models/rol.model");
const { grupo } = require("../config/database");

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

  try {
    const decodificado = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decodificado;

    const resultadoUsuario = await grupo.query(
      `SELECT ur.rol_id, r.nombre AS rol_nombre
       FROM usuario_rol ur
       INNER JOIN roles r ON r.id = ur.rol_id
       WHERE ur.usuario_id = $1
       LIMIT 1`,
      [req.user.usuario_id]
    );

    if (resultadoUsuario.rows.length > 0) {
      req.user.rol_id = resultadoUsuario.rows[0].rol_id;
      req.user.rol_nombre = resultadoUsuario.rows[0].rol_nombre;
    } else {
      req.user.rol_id = null;
      req.user.rol_nombre = null;
    }

    // Mantener compatibilidad con código que usa req.user.roles (array)
    req.user.roles = req.user.rol_nombre ? [req.user.rol_nombre] : [];

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

module.exports = { authenticateJWT, autorizar };
