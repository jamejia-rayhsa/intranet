const ExpedienteDocumento = require("../models/expedienteDocumento.model");
const storage = require("../../../portal/backend/services/storage.service");

const { BUCKETS } = storage;
const SEGUNDOS_URL = 300;
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

  // Misma autorización que el listado: verificarPermiso("rh","Expedientes","consulta")
  // en la ruta; el listado no aplica pertenencia por empleado.
  async obtenerUrl(req, res) {
    try {
      const documento = await ExpedienteDocumento.obtenerPorId(req.params.id);

      if (!documento || !documento.ruta_archivo) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Documento no encontrado" });
      }

      if (documento.ruta_archivo.startsWith("/uploads/")) {
        return res.status(409).json({
          exito: false,
          mensaje: "Archivo pendiente de migración a Storage",
        });
      }

      const url = await storage.urlFirmada(
        BUCKETS.EXPEDIENTES,
        documento.ruta_archivo,
        { segundos: SEGUNDOS_URL, descargar: documento.nombre_archivo },
      );

      res.json({
        exito: true,
        datos: {
          url,
          nombre_archivo: documento.nombre_archivo,
          expira_en: SEGUNDOS_URL,
        },
      });
    } catch (error) {
      res.status(error.status === 404 ? 404 : 500).json({
        exito: false,
        mensaje: "Error al generar la URL del documento",
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

      if (!/^\d+$/.test(String(req.params.empleadoId))) {
        return res
          .status(400)
          .json({ exito: false, mensaje: "Empleado no válido" });
      }

      const clave = `${req.params.empleadoId}/${storage.claveSegura(req.file.originalname)}`;
      await storage.subir(
        BUCKETS.EXPEDIENTES,
        clave,
        req.file.buffer,
        req.file.mimetype,
      );

      let documento;
      try {
        documento = await ExpedienteDocumento.crear({
          empleado_id: req.params.empleadoId,
          tipo_documento: req.body.tipo_documento || "otro",
          nombre_archivo: req.file.originalname,
          ruta_archivo: clave,
          descripcion: req.body.descripcion || null,
        });
      } catch (error) {
        await Promise.resolve()
          .then(() => storage.eliminar(BUCKETS.EXPEDIENTES, clave))
          .catch(() =>
            console.warn("No se pudo limpiar el objeto huérfano (expediente)"),
          );
        throw error;
      }

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

      if (
        documento.ruta_archivo &&
        !documento.ruta_archivo.startsWith("/uploads/")
      ) {
        try {
          await storage.eliminar(BUCKETS.EXPEDIENTES, documento.ruta_archivo);
        } catch (error) {
          console.warn(
            "No se pudo eliminar el objeto de Storage (expediente):",
            error.status || error.message,
          );
        }
      }
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
