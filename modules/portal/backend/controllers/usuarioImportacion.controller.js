// POST /api/usuarios/importar/vista-previa y POST /api/usuarios/importar (solo super_admin: lo exige la ruta).
const UsuarioImportacion = require("../models/usuarioImportacion.model");
const { prepararFilasUsuarios } = require("../utils/importarUsuarios");
const { huellaValida } = require("../utils/huellaVistaPrevia");
const { auditarImportacion } = require("../../../rh/backend/utils/auditoriaImportacion");
const { describirErrorSql } = require("../../../rh/backend/utils/logSeguro");

const { ErrorImportacionUsuarios } = UsuarioImportacion;

function responderError(res, error, contexto) {
  if (error instanceof ErrorImportacionUsuarios) return res.status(error.estado).json({ exito: false, mensaje: error.message });
  console.error(`[usuarios] ${contexto}: ${describirErrorSql(error)}`);
  return res.status(500).json({ exito: false, mensaje: "Error al procesar la importación de usuarios" });
}

const ControladorUsuarioImportacion = {
  async vistaPrevia(req, res) {
    try {
      const { error, filas } = prepararFilasUsuarios(req.body && req.body.filas);
      if (error) return res.status(400).json({ exito: false, mensaje: error });
      const datos = await UsuarioImportacion.vistaPrevia(filas, req.user.usuario_id);
      res.json({ exito: true, datos });
    } catch (e) {
      responderError(res, e, "vista previa de importar usuarios");
    }
  },

  async importar(req, res) {
    try {
      const cuerpo = req.body || {};
      if (cuerpo.confirmar !== true) {
        return res.status(400).json({ exito: false, mensaje: "Falta la confirmación explícita de la importación" });
      }
      const { error, filas } = prepararFilasUsuarios(cuerpo.filas);
      if (error) return res.status(400).json({ exito: false, mensaje: error });

      // La vista previa es obligatoria TAMBIÉN en el servidor: cada fila válida debe traer la huella firmada que devolvió la vista
      // previa de este mismo usuario (y no vencida) para ESA fila; si falta o no coincide, 400 y no se escribe nada
      const sinVistaPrevia = filas.filter((f) => f.fila && !huellaValida(req.user.usuario_id, f.fila, f.huella));
      if (sinVistaPrevia.length) {
        return res.status(400).json({
          exito: false,
          mensaje: `${sinVistaPrevia.length} fila(s) no pasaron por la vista previa (o esta venció, pasan más de 30 minutos): vuelve a verificar el archivo. No se aplicó nada`,
        });
      }
      const r = await UsuarioImportacion.aplicar(filas);
      // Solo conteos e ids (nunca correos, nombres ni identificadores del empleado)
      await auditarImportacion(req, "usuarios", "IMPORTAR_USUARIOS", {
        filas_recibidas: filas.length,
        creadas: r.creadas,
        omitidas: r.omitidas,
        errores: r.errores,
        por_verificar: r.verificar,
        usuarios_creados: r.filas.filter((f) => f.estado === "creada").map((f) => f.usuario_id),
        pares: r.filas.filter((f) => f.estado === "creada").map((f) => [f.usuario_id, f.empleado_id]),
        usuarios_por_verificar: r.filas.filter((f) => f.estado === "verificar" && f.usuario_id).map((f) => f.usuario_id),
      }, "importacion", "portal");

      // Forma compatible con el resumen de ImportadorArchivo (insertados/duplicados/errores) más el detalle por fila
      res.json({
        exito: true,
        datos: {
          insertados: r.creadas,
          duplicados: r.omitidas,
          verificar: r.verificar,
          errores: r.filas.filter((f) => f.estado === "error" || f.estado === "verificar").map((f) => ({
            fila: f.fila, nombre: f.nombre, error: f.estado === "verificar" ? `Verificar: ${f.motivo}` : f.motivo,
          })),
          duplicados_detalle: r.filas.filter((f) => f.estado === "omitida").map((f) => ({ fila: f.fila, nombre: f.nombre, motivo: f.motivo })),
          advertencias: r.filas.flatMap((f) => (f.avisos || []).map((motivo) => ({ fila: f.fila, nombre: f.nombre, campo: "nombre", valor_recibido: null, motivo }))),
          filas: r.filas,
        },
      });
    } catch (e) {
      responderError(res, e, "importar usuarios");
    }
  },
};

module.exports = ControladorUsuarioImportacion;
