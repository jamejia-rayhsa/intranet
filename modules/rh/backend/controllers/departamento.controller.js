const { validarCuerpoImportacion, normalizarClave } = require("../utils/importarEmpleados");
const { auditarImportacion } = require("../utils/auditoriaImportacion");
const { describirErrorSql } = require("../utils/logSeguro");
const { esImportacionEnCurso, responderImportacionEnCurso } = require("../utils/candadosImportacion");
const { tienePermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const Turno = require("../models/turno.model");
const Departamento = require("../models/departamento.model");
const { grupo } = require("../config/database");

const CUPO_MAXIMO = 2147483647;

// Devuelve el entero normalizado, o null si no es un entero entre 1 y INT4.
function normalizarCupo(valor) {
  const n = typeof valor === "string" && /^\d+$/.test(valor.trim()) ? Number(valor) : valor;
  return Number.isInteger(n) && n >= 1 && n <= CUPO_MAXIMO ? n : null;
}

const MENSAJE_CUPO = "cupo_vacaciones debe ser un entero mayor o igual a 1";

const ControladorDepartamento = {
  async listar(req, res) {
    try {
      const conTurno = await tienePermiso(req.user, "rh", "Turnos", "consulta");
      const departamentos = await Departamento.obtenerTodos({ conTurno: !!conTurno });
      res.json({ exito: true, datos: departamentos });
    } catch (error) {
      console.error(`[departamentos] ${describirErrorSql(error)}`);
      res
        .status(500)
        .json({ exito: false, mensaje: "Error al listar departamentos" });
    }
  },

  async crear(req, res) {
    const cuerpo = { ...req.body };
    if (cuerpo.cupo_vacaciones !== undefined) {
      cuerpo.cupo_vacaciones = normalizarCupo(cuerpo.cupo_vacaciones);
      if (cuerpo.cupo_vacaciones === null)
        return res.status(400).json({ exito: false, mensaje: MENSAJE_CUPO });
    }
    try {
      const depto = await Departamento.crear(cuerpo);
      res
        .status(201)
        .json({
          exito: true,
          datos: depto,
          mensaje: "Departamento creado exitosamente",
        });
    } catch (error) {
      console.error(`[departamentos] ${describirErrorSql(error)}`);
      res
        .status(400)
        .json({ exito: false, mensaje: "Error al crear departamento" });
    }
  },

  async actualizar(req, res) {
    const cuerpo = { ...req.body };
    if (cuerpo.cupo_vacaciones !== undefined) {
      cuerpo.cupo_vacaciones = normalizarCupo(cuerpo.cupo_vacaciones);
      if (cuerpo.cupo_vacaciones === null)
        return res.status(400).json({ exito: false, mensaje: MENSAJE_CUPO });
    }
    try {
      const depto = await Departamento.actualizar(req.params.id, cuerpo);
      if (!depto)
        return res
          .status(404)
          .json({ exito: false, mensaje: "Departamento no encontrado" });
      res.json({
        exito: true,
        datos: depto,
        mensaje: "Departamento actualizado exitosamente",
      });
    } catch (error) {
      console.error(`[departamentos] ${describirErrorSql(error)}`);
      res
        .status(400)
        .json({ exito: false, mensaje: "Error al actualizar departamento" });
    }
  },

  async eliminar(req, res) {
    try {
      const depto = await Departamento.eliminar(req.params.id);
      if (!depto)
        return res
          .status(404)
          .json({ exito: false, mensaje: "Departamento no encontrado" });
      res.json({ exito: true, mensaje: "Departamento eliminado exitosamente" });
    } catch (error) {
      if (error && error.code === "23503") {
        const conTurnos = /^turno_/.test(error.constraint || "");
        return res.status(409).json({
          exito: false,
          mensaje: conTurnos
            ? "El departamento tiene turnos asignados (el historial de asignaciones se conserva) y no se puede eliminar; desactívalo"
            : "El departamento tiene empleados u otros registros relacionados y no se puede eliminar; reasígnalos o desactívalo",
        });
      }
      console.error(`[departamentos] ${describirErrorSql(error)}`);
      res
        .status(500)
        .json({ exito: false, mensaje: "Error al eliminar departamento" });
    }
  },

  async importar(req, res) {
    try {
      const { filas, modo } = req.body || {};
      const problema = validarCuerpoImportacion(filas);
      if (problema) return res.status(400).json({ exito: false, mensaje: problema });
      if (modo !== undefined && modo !== "omitir" && modo !== "actualizar") {
        return res.status(400).json({ exito: false, mensaje: "Modo de importación no válido (usa 'omitir' o 'actualizar')" });
      }

      // Catálogos completos (tablas pequeñas): la comparación sin acentos ni mayúsculas se hace en JS.
      const [resAreas, resTurnos, puedeTurnos, hoy] = await Promise.all([
        grupo.query("SELECT id, nombre FROM areas ORDER BY id"),
        grupo.query("SELECT id, nombre, activo FROM turnos ORDER BY id"),
        tienePermiso(req.user, "rh", "Turnos", "edicion"),
        Turno.hoyMexico(),
      ]);
      const mapaAreas = {};
      resAreas.rows.forEach((r) => { const k = normalizarClave(r.nombre); if (k && mapaAreas[k] === undefined) mapaAreas[k] = r.id; });
      const mapaTurnos = {};
      resTurnos.rows.forEach((r) => { const k = normalizarClave(r.nombre); if (k && mapaTurnos[k] === undefined) mapaTurnos[k] = r; });

      const resultado = await Departamento.importarLote(
        filas,
        { mapaAreas, mapaTurnos, puedeTurnos: !!puedeTurnos, hoy, usuarioId: req.user && req.user.usuario_id },
        { modo: modo || "omitir" }
      );

      // La acción de auditoría admite 20 caracteres: IMPORTAR_DEPARTAMENTOS (22) no cabe
      await auditarImportacion(req, "departamentos", "IMPORTAR_DEPTOS", {
        filas_recibidas: filas.length,
        modo: modo || "omitir",
        creados: resultado.creados,
        actualizados: resultado.actualizados,
        sin_cambios: resultado.sin_cambios,
        duplicados: resultado.duplicados,
        turnos_asignados: resultado.turnos_asignados,
        turnos_cambiados: resultado.turnos_cambiados,
        turnos_sin_cambio: resultado.turnos_sin_cambio,
        errores: resultado.errores.length,
        advertencias: resultado.advertencias.length + resultado.advertencias_omitidas,
      });

      res.json({ exito: true, datos: resultado });
    } catch (error) {
      if (esImportacionEnCurso(error)) return responderImportacionEnCurso(res);
      console.error(`[departamentos] importar: ${describirErrorSql(error)}`);
      res.status(500).json({ exito: false, mensaje: "Error al importar departamentos" });
    }
  },
};

module.exports = ControladorDepartamento;
