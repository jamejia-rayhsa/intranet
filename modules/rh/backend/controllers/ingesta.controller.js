// Ingesta de marcas de asistencia (contrato v1: docs/asistencia/contrato-ingesta-marcas.md).
// Las rutas llegan aquí ya autenticadas por llave (req.llave) y con el cuerpo parseado (límite 1 MB).
const Ingesta = require("../models/ingesta.model");
const { MAX_MARCAS, validarMarca, compararIds } = require("../utils/marcaValidacion");

const MAX_RECHAZOS = 50;

const esObjetoPlano = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Los instantes salen en ISO con Z; sin milésimas cuando son cero (igual que el ejemplo del contrato)
const iso = (fecha) => (fecha ? new Date(fecha).toISOString().replace(".000Z", "Z") : null);

const IngestaControlador = {
  async recibir(req, res) {
    const cuerpo = req.body;
    if (!esObjetoPlano(cuerpo)) {
      return res.status(400).json({ exito: false, mensaje: "El cuerpo debe ser un objeto JSON con la lista marcas" });
    }
    const origenLlave = req.llave.origen;
    if (cuerpo.origen !== undefined && cuerpo.origen !== null) {
      if (typeof cuerpo.origen !== "string" || cuerpo.origen !== origenLlave) {
        return res.status(400).json({ exito: false, mensaje: "El origen no coincide con el de la llave" });
      }
    }
    const marcas = cuerpo.marcas;
    if (!Array.isArray(marcas) || marcas.length === 0) {
      return res.status(400).json({ exito: false, mensaje: "marcas debe ser una lista con al menos una marca" });
    }
    if (marcas.length > MAX_MARCAS) {
      return res.status(400).json({ exito: false, mensaje: `Se admiten como máximo ${MAX_MARCAS} marcas por envío` });
    }

    // Validación marca por marca: éxito parcial. La primera aparición de un id gana; las repetidas del
    // mismo envío cuentan como duplicadas (no como error).
    const ahora = Date.now();
    const unicas = new Map();
    const rechazos = [];
    let rechazadas = 0;
    let duplicadasEnEnvio = 0;
    marcas.forEach((entrada, indice) => {
      const r = validarMarca(entrada, { origen: origenLlave, ahora });
      if (!r.ok) {
        rechazadas += 1;
        if (rechazos.length < MAX_RECHAZOS) rechazos.push({ indice, id_externo: r.id_externo, motivo: r.motivo });
        return;
      }
      if (unicas.has(r.marca.id_externo)) duplicadasEnEnvio += 1;
      else unicas.set(r.marca.id_externo, r.marca);
    });
    const validas = [...unicas.values()].sort((a, b) => compararIds(a.id_externo, b.id_externo));

    try {
      const r = await Ingesta.procesarEnvio({
        llaveId: req.llave.id,
        origen: origenLlave,
        ip: req.ipIngesta ? String(req.ipIngesta).slice(0, 45) : null,
        hashCuerpo: req.hashCuerpo || null,
        recibidas: marcas.length,
        rechazadas,
        duplicadasEnEnvio,
        validas,
      });
      return res.json({
        exito: true,
        datos: {
          lote_id: r.lote_id,
          recibidas: marcas.length,
          insertadas: r.insertadas,
          duplicadas: r.duplicadas,
          rechazadas,
          sin_empleado: r.sin_empleado,
          ultimo_id_externo: r.ultimo_id_externo,
          rechazos,
        },
      });
    } catch (error) {
      console.error("[Ingesta] Error al procesar el envío:", error.message);
      return res.status(500).json({ exito: false, mensaje: "Error interno al procesar el envío" });
    }
  },

  async estado(req, res) {
    try {
      const e = await Ingesta.estado(req.llave.origen);
      return res.json({
        exito: true,
        datos: {
          origen: req.llave.origen,
          ultimo_id_externo: e.ultimo_id_externo === undefined || e.ultimo_id_externo === null ? null : String(e.ultimo_id_externo),
          ultima_marca_ts: iso(e.ultima_marca_ts),
          ultima_subida_ts: iso(e.ultima_subida_ts),
          ultimo_exito: iso(e.ultimo_exito),
          ultimo_error: e.ultimo_error || null,
          total_marcas: e.total_marcas,
        },
      });
    } catch (error) {
      console.error("[Ingesta] Error al consultar el estado:", error.message);
      return res.status(500).json({ exito: false, mensaje: "Error interno al consultar el estado" });
    }
  },
};

module.exports = IngestaControlador;
