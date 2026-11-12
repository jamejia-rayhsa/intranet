const SincronizacionMba3 = require('../models/sincronizacionMba3.model');
const Servicio = require('../services/convenioConsumoMba3.service');
const { registrarAccion } = require('../../../auditoria/backend/services/auditoria.service');
const { fechaValida } = require('../utils/validacion');

// Una sincronización manual a la vez por proceso (el candado de PostgreSQL cubre otras réplicas).
let enCurso = false;

const ControladorSincronizacionMba3 = {
  async estado(req, res) {
    try {
      const estado = await SincronizacionMba3.obtenerEstado();
      return res.json({
        exito: true,
        datos: {
          en_curso: enCurso,
          ultima_fecha_cubierta: estado?.ultima_fecha_cubierta || null,
          ultima_ejecucion: estado?.ultima_ejecucion || null,
          ultima_ejecucion_ok: estado?.ultima_ejecucion_ok || null,
          ultimo_resultado: estado?.ultimo_resultado || null,
        },
      });
    } catch (error) {
      console.error('Error al consultar la sincronización con MBA3:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al consultar la sincronización con MBA3' });
    }
  },

  // Dispara la sincronización en segundo plano (puede tardar minutos si se reprocesa mucho
  // histórico) y responde 202; el avance/resultado se consulta con `estado`. `desde` es opcional
  // (AAAA-MM-DD) y sirve para reprocesar desde una fecha anterior al punto ya cubierto.
  async ejecutar(req, res) {
    try {
      const { desde } = req.body || {};
      if (desde !== undefined && desde !== null && !fechaValida(desde)) {
        return res.status(400).json({ exito: false, mensaje: 'desde debe tener formato AAAA-MM-DD y ser una fecha real' });
      }
      if (enCurso) {
        return res.status(409).json({ exito: false, mensaje: 'Ya hay una sincronización en curso' });
      }
      enCurso = true;
      Servicio.sincronizarConCandado({ desde: desde || null })
        .catch((error) => console.error('Error en la sincronización manual con MBA3:', error.message))
        .finally(() => {
          enCurso = false;
        });
      await registrarAccion(req, 'comercial', 'comercial_convenio_sync_mba3', 1, 'sincronizar', null, { desde: desde || null });
      return res.status(202).json({ exito: true, datos: { iniciada: true } });
    } catch (error) {
      enCurso = false;
      console.error('Error al iniciar la sincronización con MBA3:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al iniciar la sincronización con MBA3' });
    }
  },
};

module.exports = ControladorSincronizacionMba3;
