// Recalcula la foto del resumen MBA3 de TODAS las líneas de convenios autorizados (la que lee el
// dashboard). Tarda minutos (2 consultas por línea), por eso corre en segundo plano y el dashboard
// solo lee la foto guardada. Una sola corrida a la vez en este proceso.

const Detalle = require('./convenioDetalleMba3.service');
const ResumenMba3 = require('../models/resumenMba3.model');

const progreso = { enCurso: false, procesadas: 0, total: 0, iniciadoEn: null };

function maxFecha(filas) {
  return filas.reduce((m, f) => (f.fecha && (!m || f.fecha > m) ? f.fecha : m), null);
}

async function recalcular() {
  if (progreso.enCurso) return { yaEnCurso: true };
  progreso.enCurso = true;
  progreso.procesadas = 0;
  progreso.iniciadoEn = new Date().toISOString();
  const resultado = { lineas: 0, con_error: 0, errores: [] };
  try {
    const lineas = await ResumenMba3.lineasAutorizadas();
    progreso.total = lineas.length;
    resultado.lineas = lineas.length;
    await ResumenMba3.marcarInicio();
    let primera = true;
    for (const l of lineas) {
      try {
        const convenio = { cliente_codigo: l.cliente_codigo, fecha_inicio: l.fecha_inicio };
        const linea = { producto_codigo: l.producto_codigo, cantidad_periodica: l.cantidad_periodica, periodo: l.periodo };
        // Existencias frescas solo en la primera línea; el resto reutiliza esa caché.
        const d = await Detalle.obtenerDetalleLinea(convenio, linea, { forzarExistencias: primera });
        primera = false;
        if (d.error) {
          await ResumenMba3.guardar(l.linea_id, { error: d.error });
          resultado.con_error += 1;
        } else {
          await ResumenMba3.guardar(l.linea_id, {
            comprado: d.resumen.comprado,
            vendido: d.resumen.vendido,
            existencia: d.resumen.existencia,
            ordenes_compra: d.resumen.ordenes_compra,
            facturas: d.resumen.facturas,
            ultima_oc: maxFecha(d.ordenes_compra),
            ultima_factura: maxFecha(d.facturas),
          });
        }
      } catch (error) {
        resultado.con_error += 1;
        if (resultado.errores.length < 20) resultado.errores.push(`línea ${l.linea_id}: ${error.message}`);
        // Se conserva la foto anterior de esa línea; no se pisa con ceros.
      }
      progreso.procesadas += 1;
    }
    await ResumenMba3.marcarFin({ ok: resultado.con_error === 0, resultado });
    return { yaEnCurso: false, resultado };
  } catch (error) {
    await ResumenMba3.marcarFin({ ok: false, resultado: { ...resultado, fatal: error.message } }).catch(() => {});
    throw error;
  } finally {
    progreso.enCurso = false;
  }
}

async function estado() {
  const guardado = await ResumenMba3.obtenerEstado();
  return {
    en_curso: progreso.enCurso,
    procesadas: progreso.procesadas,
    total: progreso.total,
    ultima_ejecucion: guardado.ultima_ejecucion,
    ultima_ejecucion_ok: guardado.ultima_ejecucion_ok,
    ultimo_resultado: guardado.ultimo_resultado,
  };
}

module.exports = { recalcular, estado, _progreso: progreso };
