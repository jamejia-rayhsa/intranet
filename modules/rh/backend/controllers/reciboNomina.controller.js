const ReciboNomina = require("../models/reciboNomina.model");
const ServicioArchivoRH = require("../services/archivo.service");
const storage = require("../../../portal/backend/services/storage.service");

const { BUCKETS } = storage;
const SEGUNDOS_URL = 300;
const {
  registrarAccion,
} = require("../../../auditoria/backend/services/auditoria.service");

const ControladorReciboNomina = {
  async listar(req, res) {
    try {
      const recibos = await ReciboNomina.obtenerPorEmpleado(
        req.params.empleadoId,
      );
      res.json({ exito: true, datos: recibos });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar recibos",
        error: error.message,
      });
    }
  },

  async listarPorPeriodo(req, res) {
    try {
      const recibos = await ReciboNomina.listarPorPeriodo(req.params.periodo);
      res.json({ exito: true, datos: recibos });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar recibos por periodo",
        error: error.message,
      });
    }
  },

  async obtener(req, res) {
    try {
      const recibo = await ReciboNomina.obtenerPorId(req.params.id);

      if (!recibo) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Recibo no encontrado" });
      }

      res.json({ exito: true, datos: recibo });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener recibo",
        error: error.message,
      });
    }
  },

  // Misma autorización que obtener/listar: verificarPermiso("rh","Recibos","consulta")
  // en la ruta; esas rutas no filtran por empleado propietario.
  async obtenerUrl(req, res) {
    try {
      const recibo = await ReciboNomina.obtenerPorId(req.params.id);

      if (!recibo || !recibo.ruta_archivo) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Recibo no encontrado" });
      }

      if (recibo.ruta_archivo.startsWith("/uploads/")) {
        return res.status(409).json({
          exito: false,
          mensaje: "Archivo pendiente de migración a Storage",
        });
      }

      const nombre = `recibo-${recibo.periodo}.pdf`;
      const url = await storage.urlFirmada(BUCKETS.RECIBOS, recibo.ruta_archivo, {
        segundos: SEGUNDOS_URL,
        descargar: nombre,
      });

      res.json({
        exito: true,
        datos: { url, nombre_archivo: nombre, expira_en: SEGUNDOS_URL },
      });
    } catch (error) {
      res.status(error.status === 404 ? 404 : 500).json({
        exito: false,
        mensaje: "Error al generar la URL del recibo",
      });
    }
  },

  async crear(req, res) {
    try {
      const { empleado_id, periodo, fecha_pago, importe_total, descripcion } =
        req.body;

      if (!empleado_id || !periodo) {
        return res.status(400).json({
          exito: false,
          mensaje: "Empleado y periodo son obligatorios",
        });
      }

      if (!/^\d+$/.test(String(empleado_id))) {
        return res
          .status(400)
          .json({ exito: false, mensaje: "Empleado no válido" });
      }

      let rutaArchivo = null;

      if (req.file) {
        if (!ServicioArchivoRH.validarTipoRecibo(req.file.mimetype)) {
          return res.status(400).json({
            exito: false,
            mensaje: "Solo se permiten archivos PDF para recibos de nómina",
          });
        }

        rutaArchivo = `${empleado_id}/${storage.claveSegura(req.file.originalname)}`;
        await storage.subir(
          BUCKETS.RECIBOS,
          rutaArchivo,
          req.file.buffer,
          req.file.mimetype,
        );
      }

      let recibo;
      try {
        recibo = await ReciboNomina.crear({
          empleado_id,
          periodo,
          fecha_pago,
          importe_total,
          ruta_archivo: rutaArchivo,
          descripcion,
          creado_por_id: req.user.usuario_id,
        });
      } catch (error) {
        if (rutaArchivo) {
          await Promise.resolve()
            .then(() => storage.eliminar(BUCKETS.RECIBOS, rutaArchivo))
            .catch(() =>
              console.warn("No se pudo limpiar el objeto huérfano (recibo)"),
            );
        }
        throw error;
      }

      try {
        await registrarAccion(
          req,
          "rh",
          "recibos_nomina",
          recibo.id.toString(),
          "INSERT",
          null,
          recibo,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.status(201).json({
        exito: true,
        datos: recibo,
        mensaje: "Recibo de nómina creado exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al crear recibo de nómina",
        error: error.message,
      });
    }
  },

  async eliminar(req, res) {
    try {
      const recibo = await ReciboNomina.obtenerPorId(req.params.id);

      if (!recibo) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Recibo no encontrado" });
      }

      if (recibo.ruta_archivo && !recibo.ruta_archivo.startsWith("/uploads/")) {
        try {
          await storage.eliminar(BUCKETS.RECIBOS, recibo.ruta_archivo);
        } catch (error) {
          console.warn(
            "No se pudo eliminar el objeto de Storage (recibo):",
            error.status || error.message,
          );
        }
      }

      await ReciboNomina.eliminar(req.params.id);

      try {
        await registrarAccion(
          req,
          "rh",
          "recibos_nomina",
          recibo.id.toString(),
          "DELETE",
          recibo,
          null,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.json({ exito: true, mensaje: "Recibo eliminado exitosamente" });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al eliminar recibo",
        error: error.message,
      });
    }
  },
};

module.exports = ControladorReciboNomina;
