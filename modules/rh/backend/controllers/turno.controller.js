const Turno = require("../models/turno.model");
const { validarTurno, esIdValido } = require("../utils/turnoValidacion");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");

const MSG_ID = "El identificador debe ser un número entero positivo";

// Datos no sensibles para la bitácora
const resumen = (t) =>
  t && {
    nombre: t.nombre,
    activo: t.activo,
    tolerancia_retardo_min: t.tolerancia_retardo_min,
    umbral_falta_min: t.umbral_falta_min,
    tolerancia_salida_min: t.tolerancia_salida_min,
    ventana_entrada_antes_min: t.ventana_entrada_antes_min,
    ventana_entrada_despues_min: t.ventana_entrada_despues_min,
    ventana_salida_antes_min: t.ventana_salida_antes_min,
    ventana_salida_despues_min: t.ventana_salida_despues_min,
    descanso_inicio: t.descanso_inicio,
    descanso_min: t.descanso_min,
    dias: (t.dias || []).map((d) => ({
      dia_semana: d.dia_semana,
      laborable: d.laborable,
      hora_entrada: d.hora_entrada,
      hora_salida: d.hora_salida,
    })),
  };

// registrarAccion nunca lanza (devuelve null si falla); el try/catch es defensivo
async function auditar(req, id, accion, previos, nuevos) {
  try {
    await registrarAccion(req, "rh", "turnos", id, accion, previos, nuevos);
  } catch (error) {
    console.error("[Turnos] Error al registrar auditoría:", error.message);
  }
}

function errorInterno(res, contexto, error) {
  console.error(`[Turnos] ${contexto}:`, error.message);
  return res.status(500).json({ exito: false, mensaje: `Error al ${contexto}` });
}

// Errores de restricción de Postgres -> respuesta; devuelve true si respondió
function responderRestriccion(res, error) {
  if (error && error.code === "23505") {
    res.status(409).json({ exito: false, mensaje: "Ya existe un turno con ese nombre" });
    return true;
  }
  if (error && error.code === "23503") {
    res.status(409).json({
      exito: false,
      mensaje: "El turno tiene asignaciones o asistencia calculada; desactívalo en lugar de eliminarlo",
    });
    return true;
  }
  if (error && error.code === "23514") {
    res.status(400).json({ exito: false, mensaje: "Los datos del turno no cumplen las reglas de horario" });
    return true;
  }
  return false;
}

const ControladorTurno = {
  async listar(req, res) {
    const { activo } = req.query;
    let filtro;
    if (activo !== undefined) {
      if (activo !== "true" && activo !== "false") {
        return res.status(400).json({ exito: false, mensaje: "activo debe ser true o false" });
      }
      filtro = activo === "true";
    }
    try {
      const datos = await Turno.listar({ activo: filtro });
      res.json({ exito: true, datos });
    } catch (error) {
      errorInterno(res, "listar los turnos", error);
    }
  },

  async obtener(req, res) {
    const { id } = req.params;
    if (!esIdValido(id)) return res.status(400).json({ exito: false, mensaje: MSG_ID });
    try {
      const datos = await Turno.obtenerPorId(Number(id));
      if (!datos) return res.status(404).json({ exito: false, mensaje: "Turno no encontrado" });
      res.json({ exito: true, datos });
    } catch (error) {
      errorInterno(res, "obtener el turno", error);
    }
  },

  async crear(req, res) {
    const { error, datos } = validarTurno(req.body, { parcial: false });
    if (error) return res.status(400).json({ exito: false, mensaje: error });
    try {
      const turno = await Turno.crear({
        ...datos,
        creado_por: req.user && (req.user.usuario_id || req.user.id),
      });
      await auditar(req, turno.id, "INSERT", null, resumen(turno));
      res.status(201).json({ exito: true, datos: turno, mensaje: "Turno creado" });
    } catch (err) {
      if (responderRestriccion(res, err)) return;
      errorInterno(res, "crear el turno", err);
    }
  },

  async actualizar(req, res) {
    const { id } = req.params;
    if (!esIdValido(id)) return res.status(400).json({ exito: false, mensaje: MSG_ID });
    try {
      const previo = await Turno.obtenerPorId(Number(id));
      if (!previo) return res.status(404).json({ exito: false, mensaje: "Turno no encontrado" });
      const { error, datos } = validarTurno(req.body, { parcial: true, base: previo });
      if (error) return res.status(400).json({ exito: false, mensaje: error });
      const turno = await Turno.actualizar(Number(id), datos);
      if (!turno) return res.status(404).json({ exito: false, mensaje: "Turno no encontrado" });
      await auditar(req, turno.id, "UPDATE", resumen(previo), resumen(turno));
      res.json({ exito: true, datos: turno, mensaje: "Turno actualizado" });
    } catch (err) {
      if (responderRestriccion(res, err)) return;
      errorInterno(res, "actualizar el turno", err);
    }
  },

  async eliminar(req, res) {
    const { id } = req.params;
    if (!esIdValido(id)) return res.status(400).json({ exito: false, mensaje: MSG_ID });
    try {
      const turno = await Turno.eliminar(Number(id));
      if (!turno) return res.status(404).json({ exito: false, mensaje: "Turno no encontrado" });
      await auditar(req, turno.id, "DELETE", resumen(turno), null);
      res.json({ exito: true, mensaje: "Turno eliminado" });
    } catch (err) {
      if (responderRestriccion(res, err)) return;
      errorInterno(res, "eliminar el turno", err);
    }
  },
};

module.exports = ControladorTurno;
