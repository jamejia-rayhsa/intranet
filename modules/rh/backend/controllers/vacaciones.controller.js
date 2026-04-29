const SolicitudVacaciones = require("../models/solicitudVacaciones.model");
const Empleado = require("../models/empleado.model");
const ServicioNotificacionRH = require("../services/notificacion.service");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");

const ControladorVacaciones = {
  async obtenerSaldo(req, res) {
    try {
      let { empleado_id, periodo } = req.query;

      if (!empleado_id) {
        const empleadoUsuario = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);
        if (!empleadoUsuario) {
          return res.status(404).json({
            exito: false,
            mensaje: "No se encontró el empleado asociado a este usuario",
          });
        }
        empleado_id = empleadoUsuario.id;
      }

      if (!periodo) {
        periodo = new Date().getFullYear();
      }

      const saldo = await SolicitudVacaciones.calcularSaldo(
        parseInt(empleado_id),
        parseInt(periodo),
      );

      if (!saldo) {
        return res.status(404).json({
          exito: false,
          mensaje: "Empleado no encontrado",
        });
      }

      res.json({ exito: true, datos: { ...saldo, periodo: parseInt(periodo) } });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al calcular saldo de vacaciones",
        error: error.message,
      });
    }
  },

  async crear(req, res) {
    try {
      let {
        empleado_id,
        fecha_inicial,
        fecha_final,
        fecha_regreso,
        observaciones,
        periodo,
      } = req.body;

      if (!fecha_inicial || !fecha_final) {
        return res.status(400).json({
          exito: false,
          mensaje: "Fecha inicial y fecha final son obligatorias",
        });
      }

      if (!empleado_id) {
        const empleadoUsuario = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);
        if (!empleadoUsuario) {
          return res.status(404).json({
            exito: false,
            mensaje: "No se encontró el empleado asociado a este usuario",
          });
        }
        empleado_id = empleadoUsuario.id;
      }

      const inicio = new Date(fecha_inicial);
      const fin = new Date(fecha_final);

      if (fin < inicio) {
        return res.status(400).json({
          exito: false,
          mensaje: "La fecha final no puede ser anterior a la fecha inicial",
        });
      }

      const periodoCalculado =
        parseInt(periodo) || new Date(fecha_inicial).getFullYear();

      const empleado = await Empleado.obtenerPorId(empleado_id);
      if (!empleado) {
        return res.status(404).json({
          exito: false,
          mensaje: "Empleado no encontrado",
        });
      }

      const traslape = await SolicitudVacaciones.tieneTraslape(
        empleado_id,
        fecha_inicial,
        fecha_final,
      );
      if (traslape) {
        return res.status(400).json({
          exito: false,
          mensaje:
            "Ya existe una solicitud pendiente o aprobada en ese rango de fechas",
        });
      }

      const saldo = await SolicitudVacaciones.calcularSaldo(
        empleado_id,
        periodoCalculado,
      );

      const diffMs = fin - inicio;
      const dias_a_disfrutar = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;

      if (dias_a_disfrutar > saldo.dias_pendientes) {
        return res.status(400).json({
          exito: false,
          mensaje: `No hay suficientes días disponibles. Días pendientes: ${saldo.dias_pendientes}, días solicitados: ${dias_a_disfrutar}`,
        });
      }

      const fechaIngreso = empleado.fecha_ingreso
        ? new Date(empleado.fecha_ingreso)
        : null;
      const antiguedad = fechaIngreso
        ? Math.max(1, periodoCalculado - fechaIngreso.getFullYear())
        : 0;

      const jefe = empleado.jefe_inmediato_id
        ? await Empleado.obtenerPorId(empleado.jefe_inmediato_id)
        : null;

      const jefeNombre = jefe
        ? `${jefe.nombre} ${jefe.apellido_paterno}`.trim()
        : null;

      const solicitud = await SolicitudVacaciones.crear({
        empleado_id,
        numero_nomina: empleado.numero_nomina,
        nombre: empleado.nombre,
        apellido_paterno: empleado.apellido_paterno,
        apellido_materno: empleado.apellido_materno,
        fecha_imss: empleado.fecha_imss,
        antiguedad,
        ubicacion: empleado.ubicacion,
        departamento: empleado.departamento,
        jefe_inmediato_id: empleado.jefe_inmediato_id,
        jefe_nombre: jefeNombre,
        fecha_inicial,
        fecha_final,
        fecha_regreso: fecha_regreso || null,
        periodo: periodoCalculado,
        dias_periodo: saldo.dias_periodo,
        dias_disfrutados: saldo.dias_disfrutados,
        dias_pendientes_inicial: saldo.dias_pendientes,
        dias_a_disfrutar,
        dias_pendientes_final: saldo.dias_pendientes - dias_a_disfrutar,
        observaciones,
      });

      if (jefe) {
        try {
          await ServicioNotificacionRH.notificarNuevoPermiso(
            jefe.usuario_correo || "",
            `${empleado.nombre} ${empleado.apellido_paterno}`,
            "vacaciones",
            fecha_inicial,
            fecha_final,
          );
        } catch (errorNotif) {
          console.error("Error al notificar al jefe:", errorNotif.message);
        }
      }

      try {
        await registrarAccion(
          req,
          "rh",
          "solicitudes_vacaciones",
          solicitud.id.toString(),
          "INSERT",
          null,
          solicitud,
        );
      } catch (errorAuditoria) {
        console.error("Error al registrar auditoría:", errorAuditoria.message);
      }

      res.status(201).json({
        exito: true,
        datos: solicitud,
        mensaje: "Solicitud de vacaciones creada exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al crear solicitud de vacaciones",
        error: error.message,
      });
    }
  },

  async listar(req, res) {
    try {
      const { pagina = 1, limite = 20, estatus, periodo, busqueda } = req.query;

      const rolNombre = req.user.rol_nombre;
      const esAdmin = ["super_admin", "rh_admin"].includes(rolNombre);

      const empleadoUsuario = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);

      const filtros = {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        estatus: estatus || null,
        periodo: periodo ? parseInt(periodo) : null,
        busqueda: busqueda || null,
      };

      if (esAdmin) {
        filtros.ver_todo = true;
      } else if (empleadoUsuario) {
        filtros.empleado_o_jefe_id = empleadoUsuario.id;
      }

      const solicitudes = await SolicitudVacaciones.listar(filtros);
      const total = await SolicitudVacaciones.contar(filtros);

      const solicitudesEnriquecidas = solicitudes.map((sol) => ({
        ...sol,
        puede_responder:
          sol.estatus === "pendiente" &&
          (esAdmin ||
            (empleadoUsuario && sol.empleado_id !== empleadoUsuario.id)),
      }));

      res.json({
        exito: true,
        datos: {
          solicitudes: solicitudesEnriquecidas,
          total,
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          paginas_totales: Math.ceil(total / parseInt(limite)),
          es_admin: esAdmin,
        },
      });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar solicitudes de vacaciones",
        error: error.message,
      });
    }
  },

  async obtener(req, res) {
    try {
      const solicitud = await SolicitudVacaciones.obtenerPorId(req.params.id);
      if (!solicitud) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Solicitud no encontrada" });
      }
      res.json({ exito: true, datos: solicitud });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener solicitud",
        error: error.message,
      });
    }
  },

  async responder(req, res) {
    try {
      const { estatus, motivo_rechazo } = req.body;

      if (!estatus || !["aprobado", "rechazado"].includes(estatus)) {
        return res.status(400).json({
          exito: false,
          mensaje: "Estatus inválido. Valores permitidos: aprobado, rechazado",
        });
      }

      if (estatus === "rechazado" && !motivo_rechazo) {
        return res.status(400).json({
          exito: false,
          mensaje: "El motivo de rechazo es obligatorio al rechazar",
        });
      }

      const anterior = await SolicitudVacaciones.obtenerPorId(req.params.id);
      if (!anterior) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Solicitud no encontrada" });
      }

      if (anterior.estatus !== "pendiente") {
        return res.status(400).json({
          exito: false,
          mensaje: "Solo se pueden responder solicitudes pendientes",
        });
      }

      const empleadoAutoriza = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);
      const autorizaNombre = empleadoAutoriza
        ? `${empleadoAutoriza.nombre} ${empleadoAutoriza.apellido_paterno}`.trim()
        : req.user.nombre || null;

      const solicitud = await SolicitudVacaciones.responder(
        req.params.id,
        estatus,
        req.user.usuario_id,
        autorizaNombre,
        motivo_rechazo || null,
      );

      const empleado = await Empleado.obtenerPorId(anterior.empleado_id);
      if (empleado && empleado.usuario_correo) {
        try {
          if (estatus === "aprobado") {
            await ServicioNotificacionRH.notificarPermisoAprobado(
              empleado.usuario_correo,
              "vacaciones",
              anterior.fecha_inicial,
              anterior.fecha_final,
            );
          } else {
            await ServicioNotificacionRH.notificarPermisoRechazado(
              empleado.usuario_correo,
              "vacaciones",
              motivo_rechazo,
            );
          }
        } catch (errorNotif) {
          console.error("Error al notificar al empleado:", errorNotif.message);
        }
      }

      try {
        await registrarAccion(
          req,
          "rh",
          "solicitudes_vacaciones",
          solicitud.id.toString(),
          "UPDATE",
          { estatus: anterior.estatus },
          { estatus: solicitud.estatus, autoriza_id: req.user.usuario_id, motivo_rechazo },
        );
      } catch (errorAuditoria) {
        console.error("Error al registrar auditoría:", errorAuditoria.message);
      }

      res.json({
        exito: true,
        datos: solicitud,
        mensaje: `Solicitud ${estatus} exitosamente`,
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al responder solicitud",
        error: error.message,
      });
    }
  },
};

module.exports = ControladorVacaciones;
