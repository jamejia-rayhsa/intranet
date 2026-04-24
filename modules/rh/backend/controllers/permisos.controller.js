const PermisoAusencia = require("../models/permisoAusencia.model");
const Empleado = require("../models/empleado.model");
const ServicioNotificacionRH = require("../services/notificacion.service");
const {
  registrarAccion,
} = require("../../../auditoria/backend/services/auditoria.service");

const tiposValidos = ["vacaciones", "incapacidad", "asunto_personal", "otro"];
const estatusValidos = ["pendiente", "aprobado", "rechazado"];

const ControladorPermisos = {
  async crear(req, res) {
    try {
      const { empleado_id, tipo, fecha_inicio, fecha_fin, motivo } = req.body;

      if (!empleado_id || !tipo || !fecha_inicio || !fecha_fin) {
        return res.status(400).json({
          exito: false,
          mensaje: "Empleado, tipo, fecha inicio y fecha fin son obligatorios",
        });
      }

      if (!tiposValidos.includes(tipo)) {
        return res.status(400).json({
          exito: false,
          mensaje: `Tipo inválido. Valores permitidos: ${tiposValidos.join(", ")}`,
        });
      }

      if (new Date(fecha_fin) < new Date(fecha_inicio)) {
        return res.status(400).json({
          exito: false,
          mensaje: "La fecha fin no puede ser anterior a la fecha inicio",
        });
      }

      const tieneTraslape = await PermisoAusencia.tieneTraslape(
        empleado_id,
        fecha_inicio,
        fecha_fin,
      );

      if (tieneTraslape) {
        return res.status(400).json({
          exito: false,
          mensaje:
            "Ya existe un permiso pendiente o aprobado en ese rango de fechas",
        });
      }

      const permiso = await PermisoAusencia.crear({
        empleado_id,
        tipo,
        fecha_inicio,
        fecha_fin,
        motivo,
      });

      const empleado = await Empleado.obtenerPorId(empleado_id);

      if (empleado && empleado.jefe_inmediato_id) {
        const jefe = await Empleado.obtenerPorId(empleado.jefe_inmediato_id);
        if (jefe) {
          try {
            await ServicioNotificacionRH.notificarNuevoPermiso(
              jefe.usuario_correo || "",
              `${empleado.nombre} ${empleado.apellido}`,
              tipo,
              fecha_inicio,
              fecha_fin,
            );
          } catch (error) {
            console.error("Error al notificar al jefe:", error.message);
          }
        }
      }

      try {
        await registrarAccion(
          req,
          "rh",
          "permisos_ausencias",
          permiso.id.toString(),
          "INSERT",
          null,
          permiso,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.status(201).json({
        exito: true,
        datos: permiso,
        mensaje: "Solicitud de permiso creada exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al crear solicitud de permiso",
        error: error.message,
      });
    }
  },

  async listar(req, res) {
    try {
      const { pagina = 1, limite = 20, estatus, tipo, empleado_id } = req.query;

      const filtros = {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        estatus,
        tipo,
        empleado_id: empleado_id ? parseInt(empleado_id) : null,
      };

      const permisos = await PermisoAusencia.listar(filtros);
      const total = await PermisoAusencia.contar(filtros);

      res.json({
        exito: true,
        datos: {
          permisos,
          total,
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          paginas_totales: Math.ceil(total / limite),
        },
      });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar permisos",
        error: error.message,
      });
    }
  },

  async obtener(req, res) {
    try {
      const permiso = await PermisoAusencia.obtenerPorId(req.params.id);

      if (!permiso) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Permiso no encontrado" });
      }

      res.json({ exito: true, datos: permiso });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener permiso",
        error: error.message,
      });
    }
  },

  async responder(req, res) {
    try {
      const { estatus } = req.body;

      if (!estatus || !estatusValidos.includes(estatus)) {
        return res.status(400).json({
          exito: false,
          mensaje: `Estatus inválido. Valores permitidos: ${estatusValidos.join(", ")}`,
        });
      }

      if (estatus === "pendiente") {
        return res.status(400).json({
          exito: false,
          mensaje: "No se puede responder con estado pendiente",
        });
      }

      const anterior = await PermisoAusencia.obtenerPorId(req.params.id);

      if (!anterior) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Permiso no encontrado" });
      }

      if (anterior.estatus !== "pendiente") {
        return res.status(400).json({
          exito: false,
          mensaje: "Solo se pueden responder permisos pendientes",
        });
      }

      const empleado = await Empleado.obtenerPorId(anterior.empleado_id);
      const aprobadorId = req.user.usuario_id || null;

      const permiso = await PermisoAusencia.responder(
        req.params.id,
        estatus,
        aprobadorId,
      );

      if (empleado && empleado.usuario_correo) {
        try {
          if (estatus === "aprobado") {
            await ServicioNotificacionRH.notificarPermisoAprobado(
              empleado.usuario_correo,
              anterior.tipo,
              anterior.fecha_inicio,
              anterior.fecha_fin,
            );
          } else {
            await ServicioNotificacionRH.notificarPermisoRechazado(
              empleado.usuario_correo,
              anterior.tipo,
              req.body.motivo,
            );
          }
        } catch (error) {
          console.error("Error al enviar notificación:", error.message);
        }
      }

      try {
        await registrarAccion(
          req,
          "rh",
          "permisos_ausencias",
          permiso.id.toString(),
          "UPDATE",
          { estatus: anterior.estatus },
          { estatus: permiso.estatus, aprobado_por_id: aprobadorId },
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.json({
        exito: true,
        datos: permiso,
        mensaje: `Permiso ${estatus} exitosamente`,
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al responder permiso",
        error: error.message,
      });
    }
  },
};

module.exports = ControladorPermisos;
