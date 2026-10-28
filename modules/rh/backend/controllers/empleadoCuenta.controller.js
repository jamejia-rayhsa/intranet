// Relación cuenta de usuario <-> empleado (solo empleados.usuario_id). Los permisos los fija la ruta (Empleados:edicion).
const EmpleadoCuenta = require("../models/empleadoCuenta.model");
const { auditarImportacion } = require("../utils/auditoriaImportacion");
const { describirErrorSql } = require("../utils/logSeguro");
const {
  normalizarPaginacion, normalizarBusqueda, validarParesVinculacion, enteroPositivo, ESTADOS_SUGERENCIA,
} = require("../utils/vincularCuentas");

const { ErrorVinculacion } = EmpleadoCuenta;
const ESTADOS_VALIDOS = Object.values(ESTADOS_SUGERENCIA);

function responderError(res, error, contexto) {
  if (error instanceof ErrorVinculacion) {
    return res.status(error.estado).json({ exito: false, mensaje: error.message, ...error.extra });
  }
  console.error(`[empleados] ${contexto}: ${describirErrorSql(error)}`);
  return res.status(500).json({ exito: false, mensaje: "Error al procesar la vinculación de cuentas" });
}

const ControladorEmpleadoCuenta = {
  async vistaPrevia(req, res) {
    try {
      const { pagina, limite } = normalizarPaginacion(req.query.pagina, req.query.limite);
      const estado = typeof req.query.estado === "string" && ESTADOS_VALIDOS.includes(req.query.estado) ? req.query.estado : "";
      const datos = await EmpleadoCuenta.vistaPrevia({ pagina, limite, estado });
      res.json({ exito: true, datos });
    } catch (error) {
      responderError(res, error, "vista previa de cuentas");
    }
  },

  async disponibles(req, res) {
    try {
      const { pagina, limite } = normalizarPaginacion(req.query.pagina, req.query.limite);
      const datos = await EmpleadoCuenta.cuentasDisponibles({ busqueda: normalizarBusqueda(req.query.busqueda), pagina, limite });
      res.json({ exito: true, datos });
    } catch (error) {
      responderError(res, error, "cuentas disponibles");
    }
  },

  async vincular(req, res) {
    try {
      const cuerpo = req.body || {};
      if (cuerpo.confirmar !== true) {
        return res.status(400).json({ exito: false, mensaje: "Falta la confirmación explícita de la vinculación" });
      }
      const { error, pares } = validarParesVinculacion(cuerpo.pares);
      if (error) return res.status(400).json({ exito: false, mensaje: error });

      const resultado = await EmpleadoCuenta.vincularLote(pares, { confirmarPrivilegiadas: cuerpo.confirmar_privilegiadas === true });
      await auditarImportacion(req, "empleados", "VINCULAR_CUENTAS", {
        pares_recibidos: pares.length,
        vinculadas: resultado.vinculadas,
        omitidas: resultado.omitidas,
        privilegiadas: resultado.privilegiadas,
        sin_acceso_asistencia: resultado.sin_acceso_asistencia,
        pares: resultado.detalle.filter((d) => d.resultado === "vinculada").map((d) => [d.usuario_id, d.empleado_id]),
      }, "cuentas");
      res.json({ exito: true, datos: resultado });
    } catch (error) {
      responderError(res, error, "vincular cuentas");
    }
  },

  // Cuerpo { usuario_id: N } vincula; { usuario_id: null, confirmar: true } desvincula.
  async cambiarCuenta(req, res) {
    try {
      const cuerpo = req.body || {};
      const empleadoId = enteroPositivo(req.params.id);
      if (!empleadoId) return res.status(400).json({ exito: false, mensaje: "Empleado no válido" });
      if (!Object.prototype.hasOwnProperty.call(cuerpo, "usuario_id")) {
        return res.status(400).json({ exito: false, mensaje: "usuario_id es obligatorio (null para desvincular)" });
      }
      let usuarioId = null;
      if (cuerpo.usuario_id !== null) {
        usuarioId = enteroPositivo(cuerpo.usuario_id);
        if (!usuarioId) return res.status(400).json({ exito: false, mensaje: "Cuenta no válida" });
      } else if (cuerpo.confirmar !== true) {
        return res.status(400).json({ exito: false, mensaje: "Falta la confirmación explícita de la desvinculación" });
      }

      let r;
      try {
        r = await EmpleadoCuenta.cambiarCuentaDeEmpleado(empleadoId, usuarioId, { confirmarPrivilegiada: cuerpo.confirmar_privilegiada === true });
      } catch (e) {
        if (e instanceof ErrorVinculacion && e.extra.conflictos && e.extra.conflictos[0] && e.extra.conflictos[0].motivo === "empleado_no_existe") {
          return res.status(404).json({ exito: false, mensaje: "Empleado no encontrado" });
        }
        throw e;
      }
      if (r.accion === "vinculada" || r.accion === "desvinculada") {
        await auditarImportacion(
          req, "empleados", r.accion === "vinculada" ? "VINCULAR_CUENTA" : "DESVINCULAR_CUENTA",
          { empleado_id: empleadoId, usuario_id: r.accion === "vinculada" ? usuarioId : r.anterior }, String(empleadoId),
        );
      }
      res.json({
        exito: true,
        datos: {
          accion: r.accion, empleado_id: empleadoId, usuario_id: r.usuario_id,
          sin_acceso_asistencia: Boolean(r.cuenta && r.accion === "vinculada" && r.cuenta.sin_acceso_asistencia),
          privilegiada: Boolean(r.cuenta && r.cuenta.privilegiada),
        },
      });
    } catch (error) {
      responderError(res, error, "cambiar la cuenta de un empleado");
    }
  },
};

module.exports = ControladorEmpleadoCuenta;
