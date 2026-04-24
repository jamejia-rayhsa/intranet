const AuditoriaService = require('../services/auditoria.service');

const AuditoriaController = {
  async obtenerRegistros(req, res) {
    try {
      const { pagina = 1, limite = 20, modulo, tabla, accion, fecha_desde, fecha_hasta } = req.query;

      const filtros = {};
      if (modulo) filtros.modulo = modulo;
      if (tabla) filtros.tabla = tabla;
      if (accion) filtros.accion = accion;
      if (fecha_desde) filtros.fecha_desde = fecha_desde;
      if (fecha_hasta) filtros.fecha_hasta = fecha_hasta;

      const resultado = await AuditoriaService.obtenerRegistros(pagina, limite, filtros);

      res.json({
        exito: true,
        datos: resultado,
      });
    } catch (error) {
      console.error('Error al obtener registros de auditoría:', error);
      res.status(500).json({
        exito: false,
        mensaje: 'Error al obtener los registros de auditoría',
        error: error.message,
      });
    }
  },

  async obtenerPorModulo(req, res) {
    try {
      const { modulo } = req.params;
      const { pagina = 1, limite = 20 } = req.query;

      const registros = await AuditoriaService.obtenerPorModulo(modulo, pagina, limite);

      res.json({
        exito: true,
        datos: registros,
      });
    } catch (error) {
      console.error('Error al obtener registros por módulo:', error);
      res.status(500).json({
        exito: false,
        mensaje: 'Error al obtener los registros del módulo',
        error: error.message,
      });
    }
  },
};

module.exports = AuditoriaController;
