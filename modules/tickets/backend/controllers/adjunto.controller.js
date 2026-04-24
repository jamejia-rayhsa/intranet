const TicketAdjunto = require("../models/ticketAdjunto.model");
const ServicioArchivo = require("../services/archivo.service");
const {
  registrarAccion,
} = require("../../../auditoria/backend/services/auditoria.service");

const ControladorAdjunto = {
  async subir(req, res) {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ exito: false, mensaje: "No se recibió ningún archivo" });
      }

      if (!ServicioArchivo.validarTipoArchivo(req.file.mimetype)) {
        return res.status(400).json({
          exito: false,
          mensaje:
            "Tipo de archivo no permitido. Formatos aceptados: imágenes, PDF, Word, Excel, texto",
        });
      }

      const nombreArchivo = ServicioArchivo.generarNombreArchivo(
        req.file.originalname,
      );
      const rutaRelativa = `/uploads/tickets/${nombreArchivo}`;
      const rutaDestino = `${ServicioArchivo.obtenerRutaAlmacenamiento()}/${nombreArchivo}`;

      require("fs").renameSync(req.file.path, rutaDestino);

      const adjunto = await TicketAdjunto.crear({
        ticket_id: req.params.ticketId,
        nombre_archivo: req.file.originalname,
        tipo_mime: req.file.mimetype,
        ruta_archivo: rutaRelativa,
      });

      try {
        await registrarAccion(
          req,
          "tickets",
          "ticket_adjuntos",
          adjunto.id.toString(),
          "INSERT",
          null,
          adjunto,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.status(201).json({
        exito: true,
        datos: adjunto,
        mensaje: "Archivo subido exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al subir archivo",
        error: error.message,
      });
    }
  },

  async listar(req, res) {
    try {
      const adjuntos = await TicketAdjunto.obtenerPorTicket(
        req.params.ticketId,
      );
      res.json({ exito: true, datos: adjuntos });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar adjuntos",
        error: error.message,
      });
    }
  },

  async eliminar(req, res) {
    try {
      const adjunto = await TicketAdjunto.obtenerPorId(req.params.id);

      if (!adjunto) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Adjunto no encontrado" });
      }

      await ServicioArchivo.eliminarArchivo(adjunto.ruta_archivo);
      await TicketAdjunto.eliminar(req.params.id);

      try {
        await registrarAccion(
          req,
          "tickets",
          "ticket_adjuntos",
          adjunto.id.toString(),
          "DELETE",
          adjunto,
          null,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.json({ exito: true, mensaje: "Adjunto eliminado exitosamente" });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al eliminar adjunto",
        error: error.message,
      });
    }
  },
};

module.exports = ControladorAdjunto;
