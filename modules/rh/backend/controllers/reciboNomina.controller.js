const ReciboNomina = require("../models/reciboNomina.model");
const ServicioArchivoRH = require("../services/archivo.service");
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

      let rutaArchivo = null;

      if (req.file) {
        if (!ServicioArchivoRH.validarTipoRecibo(req.file.mimetype)) {
          return res.status(400).json({
            exito: false,
            mensaje: "Solo se permiten archivos PDF para recibos de nómina",
          });
        }

        const nombreArchivo = ServicioArchivoRH.generarNombreArchivo(
          req.file.originalname,
        );
        rutaArchivo = `/uploads/recibos/${nombreArchivo}`;
        const rutaDestino = `${ServicioArchivoRH.obtenerRutaRecibos()}/${nombreArchivo}`;
        await require("fs").promises.rename(req.file.path, rutaDestino);
      }

      const recibo = await ReciboNomina.crear({
        empleado_id,
        periodo,
        fecha_pago,
        importe_total,
        ruta_archivo: rutaArchivo,
        descripcion,
        creado_por_id: req.user.usuario_id,
      });

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

      if (recibo.ruta_archivo) {
        await ServicioArchivoRH.eliminarArchivo(recibo.ruta_archivo);
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
