const TicketAdjunto = require("../models/ticketAdjunto.model");
const ServicioArchivo = require("../services/archivo.service");
const storage = require("../../../portal/backend/services/storage.service");
const {
  registrarAccion,
} = require("../../../auditoria/backend/services/auditoria.service");

const SEGUNDOS_URL = 300;

function esRutaLegada(ruta) {
  return typeof ruta === "string" && ruta.startsWith("/uploads/");
}

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

      const clave = `${req.params.ticketId}/${storage.claveSegura(req.file.originalname)}`;
      await storage.subir(
        storage.BUCKETS.TICKETS,
        clave,
        req.file.buffer,
        req.file.mimetype,
      );

      let adjunto;
      try {
        adjunto = await TicketAdjunto.crear({
          ticket_id: req.params.ticketId,
          nombre_archivo: req.file.originalname,
          tipo_mime: req.file.mimetype,
          ruta_archivo: clave,
        });
      } catch (errorBd) {
        // No dejar objetos huérfanos en Storage si falla el INSERT
        await storage
          .eliminar(storage.BUCKETS.TICKETS, clave)
          .catch(() => console.warn("No se pudo limpiar el objeto de Storage tras fallo de BD"));
        throw errorBd;
      }

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

  // Misma autorización que listar: verificarPermiso("tickets","Adjuntos","consulta") en la ruta
  async obtenerUrl(req, res) {
    try {
      const adjunto = await TicketAdjunto.obtenerPorId(req.params.id);

      if (!adjunto) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Adjunto no encontrado" });
      }

      if (esRutaLegada(adjunto.ruta_archivo)) {
        return res.status(409).json({
          exito: false,
          mensaje: "Archivo pendiente de migración a Storage",
        });
      }

      const url = await storage.urlFirmada(
        storage.BUCKETS.TICKETS,
        adjunto.ruta_archivo,
        { segundos: SEGUNDOS_URL, descargar: adjunto.nombre_archivo },
      );

      res.json({
        exito: true,
        datos: {
          url,
          nombre_archivo: adjunto.nombre_archivo,
          expira_en: SEGUNDOS_URL,
        },
      });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al generar la URL del adjunto",
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

      // Filas legadas (/uploads/...) siguen en disco hasta migrarse: no hay objeto que borrar
      if (!esRutaLegada(adjunto.ruta_archivo)) {
        try {
          await storage.eliminar(storage.BUCKETS.TICKETS, adjunto.ruta_archivo);
        } catch (errorStorage) {
          console.warn(
            `No se pudo eliminar el objeto de Storage del adjunto ${adjunto.id}: ${errorStorage.message}`,
          );
        }
      }
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
