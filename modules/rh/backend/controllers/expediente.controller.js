const ExpedienteDocumento = require("../models/expedienteDocumento.model");
const ServicioArchivoRH = require("../services/archivo.service");
const {
  registrarAccion,
} = require("../../../auditoria/backend/services/auditoria.service");

const ControladorExpediente = {
  async listar(req, res) {
    try {
      const documentos = await ExpedienteDocumento.obtenerPorEmpleado(
        req.params.empleadoId,
      );
      res.json({ exito: true, datos: documentos });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar documentos",
        error: error.message,
      });
    }
  },

  async subir(req, res) {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ exito: false, mensaje: "No se recibió ningún archivo" });
      }

      const rutaRelativa = `/uploads/expedientes/${req.file.filename}`;

      const documento = await ExpedienteDocumento.crear({
        empleado_id: req.params.empleadoId,
        tipo_documento: req.body.tipo_documento || "otro",
        nombre_archivo: req.file.originalname,
        ruta_archivo: rutaRelativa,
        descripcion: req.body.descripcion || null,
      });

      try {
        await registrarAccion(
          req,
          "rh",
          "expediente_documentos",
          documento.id.toString(),
          "INSERT",
          null,
          documento,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.status(201).json({
        exito: true,
        datos: documento,
        mensaje: "Documento subido exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al subir documento",
        error: error.message,
      });
    }
  },

  async eliminar(req, res) {
    try {
      const documento = await ExpedienteDocumento.obtenerPorId(req.params.id);

      if (!documento) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Documento no encontrado" });
      }

      await ServicioArchivoRH.eliminarArchivo(documento.ruta_archivo);
      await ExpedienteDocumento.eliminar(req.params.id);

      try {
        await registrarAccion(
          req,
          "rh",
          "expediente_documentos",
          documento.id.toString(),
          "DELETE",
          documento,
          null,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.json({ exito: true, mensaje: "Documento eliminado exitosamente" });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al eliminar documento",
        error: error.message,
      });
    }
  },
};

module.exports = ControladorExpediente;
