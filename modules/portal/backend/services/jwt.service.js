const jwt = require("jsonwebtoken");

const ServicioJWT = {
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

  generarTokenRenovacion(usuarioId) {
    const cargaUtil = {
      usuario_id: usuarioId,
      tipo: "renovacion",
    };

    return jwt.sign(cargaUtil, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
  },
};

module.exports = ServicioJWT;
