const { validarCuerpoImportacion, nombresUnicos } = require("../utils/importarEmpleados");
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
      const departamentos = await Departamento.obtenerTodos();
      res.json({ exito: true, datos: departamentos });
    } catch (error) {
      console.error("[departamentos]", error);
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
      console.error("[departamentos]", error);
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
      console.error("[departamentos]", error);
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
      console.error("[departamentos]", error);
      res
        .status(500)
        .json({ exito: false, mensaje: "Error al eliminar departamento" });
    }
  },

  async importar(req, res) {
    try {
      const { filas } = req.body;
      const problema = validarCuerpoImportacion(filas);
      if (problema) return res.status(400).json({ exito: false, mensaje: problema });

      const nombresArea = nombresUnicos(filas, 'area');
      const mapaAreas = {};
      if (nombresArea.length > 0) {
        const res2 = await grupo.query(
          "SELECT id, LOWER(nombre) AS nombre FROM areas WHERE LOWER(nombre) = ANY($1)",
          [nombresArea]
        );
        res2.rows.forEach(r => { mapaAreas[r.nombre] = r.id; });
      }

      const resultado = await Departamento.importarLote(filas, mapaAreas);
      res.json({ exito: true, datos: resultado });
    } catch (error) {
      console.error("[departamentos]", error);
      res.status(500).json({ exito: false, mensaje: "Error al importar departamentos" });
    }
  },
};

module.exports = ControladorDepartamento;
