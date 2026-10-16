const CalendarioLaboral = require("../models/calendarioLaboral.model");
const SolicitudVacaciones = require("../models/solicitudVacaciones.model");
const { esFinDeSemana } = require("../utils/diasHabiles");
const { tienePermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");

const TIPOS = CalendarioLaboral.TIPOS_CALENDARIO;
const MAX_NOMBRE = 150;
const MAX_DESCRIPCION = 1000;
const MAX_INT4 = 2147483647;

// Fecha estricta 'YYYY-MM-DD' y que exista en el calendario (rechaza 2026-02-30)
function esFechaValida(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split("-").map(Number);
  if (anio < 1900 || anio > 2200) return false;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

function esIdValido(valor) {
  return /^\d{1,10}$/.test(String(valor)) && Number(valor) >= 1 && Number(valor) <= MAX_INT4;
}

/**
 * Valida el cuerpo. En alta (parcial=false) fecha, tipo y nombre son obligatorios;
 * en edición (parcial=true) solo se validan los campos presentes.
 * @returns {{error?: string, datos?: object}}
 */
function validarCuerpo(cuerpo, parcial) {
  const c = cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo) ? cuerpo : {};
  const datos = {};

  if (c.fecha !== undefined || !parcial) {
    if (!esFechaValida(c.fecha)) return { error: "La fecha debe tener el formato YYYY-MM-DD y ser una fecha real" };
    datos.fecha = c.fecha;
  }
  if (c.tipo !== undefined || !parcial) {
    if (!TIPOS.includes(c.tipo)) return { error: `El tipo debe ser uno de: ${TIPOS.join(", ")}` };
    datos.tipo = c.tipo;
  }
  if (c.nombre !== undefined || !parcial) {
    const nombre = typeof c.nombre === "string" ? c.nombre.trim() : "";
    if (!nombre) return { error: "El nombre es obligatorio" };
    if (nombre.length > MAX_NOMBRE) return { error: `El nombre no puede superar ${MAX_NOMBRE} caracteres` };
    datos.nombre = nombre;
  }
  if (c.descripcion !== undefined && c.descripcion !== null) {
    if (typeof c.descripcion !== "string") return { error: "La descripción debe ser texto" };
    const descripcion = c.descripcion.trim();
    if (descripcion.length > MAX_DESCRIPCION) {
      return { error: `La descripción no puede superar ${MAX_DESCRIPCION} caracteres` };
    }
    datos.descripcion = descripcion;
  } else if (c.descripcion === null) {
    datos.descripcion = null;
  }
  if (c.activo !== undefined) {
    if (typeof c.activo !== "boolean") return { error: "activo debe ser verdadero o falso" };
    datos.activo = c.activo;
  }
  if (parcial && Object.keys(datos).length === 0) return { error: "No hay campos para actualizar" };
  return { datos };
}

// Datos no sensibles para la bitácora
const resumen = (fila) =>
  fila && { fecha: fila.fecha, tipo: fila.tipo, nombre: fila.nombre, activo: fila.activo };

// registrarAccion nunca lanza (devuelve null si falla); el try/catch es defensivo
async function auditar(req, id, accion, previos, nuevos) {
  try {
    await registrarAccion(req, "rh", "calendario_laboral", id, accion, previos, nuevos);
  } catch (error) {
    console.error("[Calendario] Error al registrar auditoría:", error.message);
  }
}

const esDuplicado = (error) => error && error.code === "23505";
const MENSAJE_DUPLICADO = "Ya existe una fecha de ese tipo en el calendario";

function errorInterno(res, contexto, error) {
  console.error(`[Calendario] ${contexto}:`, error.message);
  return res.status(500).json({ exito: false, mensaje: `Error al ${contexto}` });
}

/**
 * Aviso para RH al registrar o editar un Día Actividad Empresa: cuántas solicitudes aprobadas y
 * pendientes incluyen esa fecha como día hábil. Solo conteos (sin nombres); NO modifica solicitudes.
 * Devuelve undefined si la fila no es una actividad y null si el cálculo falla (la escritura ya se
 * hizo: un fallo aquí no puede convertir el éxito en error).
 */
async function calcularAvisos(fila) {
  if (!fila || fila.tipo !== CalendarioLaboral.TIPO_BLOQUEO) return undefined;
  const sinEfecto = { solicitudes_aprobadas: 0, solicitudes_pendientes: 0 };
  try {
    // Inactiva, sábado/domingo o festivo/descanso del mismo día: no bloquea nada
    if (!fila.activo || esFinDeSemana(fila.fecha)) return sinEfecto;
    const noHabiles = await CalendarioLaboral.obtenerFechasNoHabiles(fila.fecha, fila.fecha);
    if (noHabiles.length > 0) return sinEfecto;
    const conteo = await SolicitudVacaciones.contarSolicitudesEnFecha(fila.fecha);
    return { solicitudes_aprobadas: conteo.aprobadas, solicitudes_pendientes: conteo.pendientes };
  } catch (error) {
    console.error("[Calendario] Error al calcular los avisos de la actividad:", error.message);
    return null;
  }
}

const ControladorCalendarioLaboral = {
  async listar(req, res) {
    const { desde, hasta, tipo } = req.query;
    if (desde !== undefined && !esFechaValida(desde)) {
      return res.status(400).json({ exito: false, mensaje: "desde debe tener el formato YYYY-MM-DD y ser una fecha real" });
    }
    if (hasta !== undefined && !esFechaValida(hasta)) {
      return res.status(400).json({ exito: false, mensaje: "hasta debe tener el formato YYYY-MM-DD y ser una fecha real" });
    }
    if (desde && hasta && desde > hasta) {
      return res.status(400).json({ exito: false, mensaje: "desde no puede ser posterior a hasta" });
    }
    if (tipo !== undefined && !TIPOS.includes(tipo)) {
      return res.status(400).json({ exito: false, mensaje: `El tipo debe ser uno de: ${TIPOS.join(", ")}` });
    }
    try {
      // Las fechas inactivas solo las ven quienes pueden editar el calendario (o super_admin)
      const puedeEditar = await tienePermiso(req.user, "rh", "Calendario", "edicion");
      const datos = await CalendarioLaboral.listar({ desde, hasta, tipo, soloActivos: !puedeEditar });
      res.json({ exito: true, datos });
    } catch (error) {
      errorInterno(res, "listar el calendario laboral", error);
    }
  },

  async crear(req, res) {
    const { error, datos } = validarCuerpo(req.body, false);
    if (error) return res.status(400).json({ exito: false, mensaje: error });
    try {
      const fila = await CalendarioLaboral.crear({
        ...datos,
        creado_por: req.user && (req.user.usuario_id || req.user.id),
      });
      await auditar(req, fila.id, "INSERT", null, resumen(fila));
      const avisos = await calcularAvisos(fila);
      res.status(201).json({
        exito: true,
        datos: fila,
        mensaje: "Fecha agregada al calendario",
        ...(avisos !== undefined && { avisos }),
      });
    } catch (err) {
      if (esDuplicado(err)) return res.status(409).json({ exito: false, mensaje: MENSAJE_DUPLICADO });
      errorInterno(res, "crear la fecha del calendario", err);
    }
  },

  async actualizar(req, res) {
    const { id } = req.params;
    if (!esIdValido(id)) {
      return res.status(400).json({ exito: false, mensaje: "El identificador debe ser un número entero positivo" });
    }
    const { error, datos } = validarCuerpo(req.body, true);
    if (error) return res.status(400).json({ exito: false, mensaje: error });
    try {
      const previo = await CalendarioLaboral.obtenerPorId(Number(id));
      if (!previo) return res.status(404).json({ exito: false, mensaje: "Fecha del calendario no encontrada" });
      const fila = await CalendarioLaboral.actualizar(Number(id), datos);
      if (!fila) return res.status(404).json({ exito: false, mensaje: "Fecha del calendario no encontrada" });
      await auditar(req, fila.id, "UPDATE", resumen(previo), resumen(fila));
      const avisos = await calcularAvisos(fila);
      res.json({
        exito: true,
        datos: fila,
        mensaje: "Fecha del calendario actualizada",
        ...(avisos !== undefined && { avisos }),
      });
    } catch (err) {
      if (esDuplicado(err)) return res.status(409).json({ exito: false, mensaje: MENSAJE_DUPLICADO });
      errorInterno(res, "actualizar la fecha del calendario", err);
    }
  },

  async eliminar(req, res) {
    const { id } = req.params;
    if (!esIdValido(id)) {
      return res.status(400).json({ exito: false, mensaje: "El identificador debe ser un número entero positivo" });
    }
    try {
      const fila = await CalendarioLaboral.eliminar(Number(id));
      if (!fila) return res.status(404).json({ exito: false, mensaje: "Fecha del calendario no encontrada" });
      await auditar(req, fila.id, "DELETE", resumen(fila), null);
      res.json({ exito: true, mensaje: "Fecha eliminada del calendario" });
    } catch (err) {
      errorInterno(res, "eliminar la fecha del calendario", err);
    }
  },
};

module.exports = ControladorCalendarioLaboral;
module.exports.esFechaValida = esFechaValida;
