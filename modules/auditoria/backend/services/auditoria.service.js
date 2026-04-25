const Auditoria = require('../models/auditoria.model');

const AuditoriaService = {
  async registrarAccion(req, modulo, tabla, registroId, accion, valoresPrevios, valoresNuevos) {
    try {
      const usuario_id = req.user?.usuario_id || req.user?.id || null;
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;

      return await Auditoria.crear({
        usuario_id,
        modulo,
        tabla,
        registro_id: String(registroId),
        accion,
        valores_previos: valoresPrevios || null,
        valores_nuevos: valoresNuevos || null,
        ip_origen: ip,
        user_agent: userAgent,
      });
    } catch (error) {
      // La auditoría nunca debe interrumpir el flujo principal
      console.error('[Auditoría] Error al registrar acción:', error.message);
      return null;
    }
  },

  async obtenerRegistros(pagina, limite, filtros) {
    const registros = await Auditoria.obtenerTodos(pagina, limite, filtros);
    const total = await Auditoria.contar(filtros);
    return {
      registros,
      total,
      pagina: parseInt(pagina),
      limite: parseInt(limite),
      paginas_totales: Math.ceil(total / limite),
    };
  },

  async obtenerPorModulo(modulo, pagina, limite) {
    return await Auditoria.obtenerPorModulo(modulo, pagina, limite);
  },

  async obtenerPorUsuario(usuario_id, pagina, limite) {
    return await Auditoria.obtenerPorUsuario(usuario_id, pagina, limite);
  },
};

module.exports = AuditoriaService;
