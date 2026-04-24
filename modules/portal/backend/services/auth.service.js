const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Usuario = require("../models/usuario.model");
const Rol = require("../models/rol.model");
const { grupo } = require("../config/database");

const ServicioAuth = {
  async registroLocal(datos) {
    const { correo, nombre, apellido, contraseña } = datos;

    // Verificar si el usuario ya existe
    const existente = await Usuario.buscarPorCorreo(correo);
    if (existente) {
      throw new Error("Ya existe un usuario con ese correo");
    }

    // Generar hash de la contraseña
    const sal = await bcrypt.genSalt(10);
    const hashContraseña = await bcrypt.hash(contraseña, sal);

    // Crear usuario
    const usuario = await Usuario.crear({
      correo,
      nombre,
      apellido,
      auth_tipo: "local",
      hash_password: hashContraseña,
    });

    // Generar token JWT
    const token = this.generarToken(usuario);

    return { usuario, token };
  },

  async inicioSesionLocal(correo, contraseña) {
    const usuario = await Usuario.buscarPorCorreo(correo);

    if (!usuario) {
      throw new Error("Correo o contraseña incorrectos");
    }

    if (!usuario.activo) {
      throw new Error("Usuario desactivado");
    }

    if (!usuario.hash_password) {
      throw new Error("Este usuario usa autenticación MS365");
    }

    const contraseñaValida = await bcrypt.compare(
      contraseña,
      usuario.hash_password,
    );
    if (!contraseñaValida) {
      throw new Error("Correo o contraseña incorrectos");
    }

    const consultaRoles = `
      SELECT r.id as rol_id, r.nombre as rol_nombre
      FROM usuario_rol ur
      INNER JOIN roles r ON ur.rol_id = r.id
      WHERE ur.usuario_id = $1
    `;
    const resultadoRoles = await grupo.query(consultaRoles, [usuario.id]);
    const roles = resultadoRoles.rows.map((r) => r.rol_nombre);

    const permisosUsuario = new Set();
    for (const rol of resultadoRoles.rows) {
      const permisos = await Rol.obtenerPermisos(rol.rol_id);
      permisos.forEach((p) => permisosUsuario.add(p.nombre));
    }

    const token = this.generarToken(usuario);

    return {
      usuario: {
        id: usuario.id,
        correo: usuario.correo,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        auth_tipo: usuario.auth_tipo,
        requiere_cambio_password: usuario.requiere_cambio_password || false,
        roles,
        permisos: Array.from(permisosUsuario),
      },
      token,
    };
  },

  async recuperarContraseña(correo) {
    const usuario = await Usuario.buscarPorCorreo(correo);

    if (!usuario) {
      // No revelar si el correo existe o no
      return {
        mensaje:
          "Si el correo existe, recibirás instrucciones para recuperar tu contraseña",
      };
    }

    // TODO: Implementar envío de correo con enlace de recuperación
    throw new Error(
      "Servicio de recuperación de contraseña no implementado aún",
    );
  },

  generarToken(usuario) {
    const cargaUtil = {
      usuario_id: usuario.id,
      correo: usuario.correo,
      nombre: usuario.nombre,
    };

    return jwt.sign(cargaUtil, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    });
  },

  verificarToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error("Token inválido o expirado");
    }
  },
};

module.exports = ServicioAuth;
