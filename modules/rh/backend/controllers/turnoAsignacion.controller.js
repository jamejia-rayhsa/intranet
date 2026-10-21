const Turno = require("../models/turno.model");
const TurnoAsignacion = require("../models/turnoAsignacion.model");
const { ErrorAsistencia } = require("../utils/erroresAsistencia");
const { validarAsignacion, esIdValido, esFechaValida } = require("../utils/turnoValidacion");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");

const MSG_ID = "El identificador debe ser un número entero positivo";

// Datos no sensibles para la bitácora: solo ids y fechas
const resumen = (tipo, fila) => {
  if (!fila) return null;
  const { columna } = TurnoAsignacion.TIPOS[tipo];
  return {
    [columna]: fila[columna],
    turno_id: fila.turno_id,
    vigente_desde: fila.vigente_desde,
    vigente_hasta: fila.vigente_hasta,
  };
};

async function auditar(req, tipo, id, accion, previos, nuevos) {
  try {
    await registrarAccion(req, "rh", TurnoAsignacion.TIPOS[tipo].tabla, id, accion, previos, nuevos);
  } catch (error) {
    console.error("[Turnos] Error al registrar auditoría:", error.message);
  }
}

// ErrorAsistencia y errores de restricción -> respuesta; nunca error.message de Postgres
function responderError(res, contexto, error) {
  if (error instanceof ErrorAsistencia) {
    return res.status(error.estado).json({ exito: false, mensaje: error.message });
  }
  if (error && error.code === "23P01") {
    return res.status(409).json({ exito: false, mensaje: "La vigencia se traslapa con otra asignación" });
  }
  if (error && error.code === "23503") {
    return res.status(409).json({ exito: false, mensaje: "El turno o el destino de la asignación ya no existe" });
  }
  if (error && error.code === "23514") {
    return res.status(400).json({ exito: false, mensaje: "Las fechas de la asignación no son válidas" });
  }
  console.error(`[Turnos] ${contexto}:`, error.message);
  return res.status(500).json({ exito: false, mensaje: `Error al ${contexto}` });
}

const crearControlador = (tipo) => {
  const { columna } = TurnoAsignacion.TIPOS[tipo];
  return {
    async listar(req, res) {
      const padre = req.query[columna];
      const turno = req.query.turno_id;
      if (padre !== undefined && !esIdValido(padre)) {
        return res.status(400).json({ exito: false, mensaje: `${columna} debe ser un entero positivo` });
      }
      if (turno !== undefined && !esIdValido(turno)) {
        return res.status(400).json({ exito: false, mensaje: "turno_id debe ser un entero positivo" });
      }
      try {
        const datos = await TurnoAsignacion.listar(tipo, {
          padreId: padre === undefined ? undefined : Number(padre),
          turnoId: turno === undefined ? undefined : Number(turno),
        });
        res.json({ exito: true, datos });
      } catch (error) {
        responderError(res, "listar las asignaciones de turno", error);
      }
    },

    async asignar(req, res) {
      const { error, datos } = validarAsignacion(req.body, columna);
      if (error) return res.status(400).json({ exito: false, mensaje: error });
      try {
        const fila = await TurnoAsignacion.asignar(tipo, {
          ...datos,
          creado_por: req.user && (req.user.usuario_id || req.user.id),
        });
        await auditar(req, tipo, fila.id, "INSERT", null, resumen(tipo, fila));
        res.status(201).json({ exito: true, datos: fila, mensaje: "Turno asignado" });
      } catch (err) {
        responderError(res, "asignar el turno", err);
      }
    },

    async terminar(req, res) {
      const { id } = req.params;
      if (!esIdValido(id)) return res.status(400).json({ exito: false, mensaje: MSG_ID });
      const hasta = req.body && req.body.vigente_hasta;
      if (!esFechaValida(hasta)) {
        return res
          .status(400)
          .json({ exito: false, mensaje: "vigente_hasta debe tener el formato YYYY-MM-DD y ser una fecha real" });
      }
      try {
        const resultado = await TurnoAsignacion.terminar(tipo, Number(id), hasta);
        if (!resultado) return res.status(404).json({ exito: false, mensaje: "Asignación no encontrada" });
        await auditar(req, tipo, id, "TERMINAR", resumen(tipo, resultado.previo), resumen(tipo, resultado.actual));
        res.json({ exito: true, datos: resultado.actual, mensaje: "Asignación terminada" });
      } catch (err) {
        responderError(res, "terminar la asignación", err);
      }
    },
  };
};

// Por empleado. El acceso (propio / jefe vigente / RH) lo decide el middleware de la ruta.
const ControladorTurnoEmpleado = {
  async turnoEfectivo(req, res) {
    const { empleadoId } = req.params;
    if (!esIdValido(empleadoId)) return res.status(400).json({ exito: false, mensaje: MSG_ID });
    let { fecha } = req.query;
    if (fecha !== undefined && !esFechaValida(fecha)) {
      return res
        .status(400)
        .json({ exito: false, mensaje: "fecha debe tener el formato YYYY-MM-DD y ser una fecha real" });
    }
    try {
      const empleado = await TurnoAsignacion.obtenerEmpleadoBasico(Number(empleadoId));
      if (!empleado) return res.status(404).json({ exito: false, mensaje: "Empleado no encontrado" });
      if (fecha === undefined) fecha = await Turno.hoyMexico();
      const efectivo = await Turno.obtenerEfectivo(Number(empleadoId), fecha);
      res.json({
        exito: true,
        datos: efectivo
          ? { empleado_id: empleado.id, fecha, ...efectivo }
          : { empleado_id: empleado.id, fecha, origen: null, asignacion_id: null, turno: null, turno_activo: null },
      });
    } catch (error) {
      responderError(res, "consultar el turno del empleado", error);
    }
  },

  async historial(req, res) {
    const { empleadoId } = req.params;
    if (!esIdValido(empleadoId)) return res.status(400).json({ exito: false, mensaje: MSG_ID });
    try {
      const datos = await TurnoAsignacion.historialEmpleado(Number(empleadoId));
      if (!datos) return res.status(404).json({ exito: false, mensaje: "Empleado no encontrado" });
      res.json({ exito: true, datos });
    } catch (error) {
      responderError(res, "consultar el historial de turnos", error);
    }
  },
};

module.exports = {
  departamento: crearControlador("departamento"),
  empleado: crearControlador("empleado"),
  ...ControladorTurnoEmpleado,
};
