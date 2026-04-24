const AuditoriaService = require('../services/auditoria.service');

/**
 * Middleware de auditoría para registrar cambios en las rutas.
 * Uso: router.post('/recurso', auditoriaMiddleware('modulo', 'tabla', 'INSERT'), controlador)
 */
function auditoriaMiddleware(modulo, tabla, accion) {
  return async (req, res, next) => {
    // Guardar la función original de res.json para interceptar la respuesta
    const jsonOriginal = res.json.bind(res);

    res.json = function (cuerpoRespuesta) {
      // Determinar el ID del registro afectado
      let registroId = req.params.id || null;

      // Si es un INSERT y el cuerpo de respuesta tiene un id, usarlo
      if (accion === 'INSERT' && cuerpoRespuesta && cuerpoRespuesta.id) {
        registroId = cuerpoRespuesta.id;
      }

      // Si no hay ID, intentar con el body
      if (!registroId && req.body && req.body.id) {
        registroId = req.body.id;
      }

      // Si aún no hay ID, usar 'pendiente'
      if (!registroId) {
        registroId = 'pendiente';
      }

      // Registrar la acción de auditoría
      AuditoriaService.registrarAccion(
        req,
        modulo,
        tabla,
        registroId,
        accion,
        null, // valores previos se pasan desde el controlador en caso de UPDATE/DELETE
        req.body || null
      ).catch((error) => {
        console.error('Error al registrar auditoría:', error.message);
      });

      // Llamar al json original
      return jsonOriginal(cuerpoRespuesta);
    };

    next();
  };
}

/**
 * Middleware para registrar auditoría con valores previos (para UPDATE/DELETE).
 * Requiere que el controlador haya cargado los valores previos en req.valores_previos
 */
function auditoriaConValoresPrevios(modulo, tabla, accion) {
  return async (req, res, next) => {
    const jsonOriginal = res.json.bind(res);

    res.json = function (cuerpoRespuesta) {
      let registroId = req.params.id || req.body?.id || 'pendiente';

      if (accion === 'INSERT' && cuerpoRespuesta?.id) {
        registroId = cuerpoRespuesta.id;
      }

      AuditoriaService.registrarAccion(
        req,
        modulo,
        tabla,
        registroId,
        accion,
        req.valores_previos || null,
        req.body || cuerpoRespuesta || null
      ).catch((error) => {
        console.error('Error al registrar auditoría:', error.message);
      });

      return jsonOriginal(cuerpoRespuesta);
    };

    next();
  };
}

module.exports = {
  auditoriaMiddleware,
  auditoriaConValoresPrevios,
};
