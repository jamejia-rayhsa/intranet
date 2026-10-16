const SolicitudVacaciones = require("../models/solicitudVacaciones.model");
const CalendarioLaboral = require("../models/calendarioLaboral.model");
const Empleado = require("../models/empleado.model");
const ServicioNotificacionRH = require("../services/notificacion.service");
const { tienePermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");
const {
  validarRango,
  esFechaValida,
  anioDeFecha,
  listarDiasHabiles,
  primeraFechaLlena,
  fechasLlenas,
} = require("../utils/diasHabiles");

// Error esperado dentro de una transacción: provoca ROLLBACK y se responde con su estado.
// `auditoria` (opcional) = datos para registrar el rechazo por cupo (sin datos de compañeros).
class ErrorVacaciones extends Error {
  constructor(estado, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.codigo = extra.codigo || null;
    this.auditoria = extra.auditoria || null;
  }
}

// Rango del periodo consultable en GET /saldo (años respecto al actual)
const PERIODOS_ATRAS = 10;
const PERIODOS_ADELANTE = 2;

const formatearFecha = (texto) => {
  const [anio, mes, dia] = texto.split("-");
  return `${dia}/${mes}/${anio}`;
};

const mensajeCupoCrear = (fecha, cupo) =>
  `El ${formatearFecha(fecha)} ya no hay lugar: el cupo de vacaciones de tu departamento (${cupo} ${cupo === 1 ? "persona" : "personas"} a la vez) está lleno`;
const mensajeCupoAprobar = (fecha, cupo) =>
  `No se puede aprobar: el ${formatearFecha(fecha)} el cupo de vacaciones del departamento (${cupo} ${cupo === 1 ? "persona" : "personas"} a la vez) ya está lleno`;

const mensajeActividadCrear = (fecha, nombre) =>
  `El ${formatearFecha(fecha)} es Día Actividad Empresa (${nombre}) y las vacaciones están bloqueadas para todos ese día`;
const mensajeActividadAprobar = (fecha, nombre) =>
  `No se puede aprobar: el ${formatearFecha(fecha)} es Día Actividad Empresa (${nombre}) y las vacaciones están bloqueadas para todos ese día`;

// Días Actividad Empresa que caen en día HÁBIL del rango (los de sábado, domingo, festivo o descanso
// otorgado no bloquean: de todos modos no son días de vacaciones). `diasHabiles` ya excluye esos días.
function actividadesEnDiasHabiles(actividades, diasHabiles) {
  const habiles = new Set(diasHabiles);
  return actividades.filter((a) => habiles.has(a.fecha));
}

const MSG_TRASLAPE = "Ya existe una solicitud pendiente o aprobada en ese rango de fechas";
const MSG_SIN_HABILES = "El rango no incluye ningún día hábil (lunes a viernes sin festivos ni descansos)";
const mensajeSaldo = (pendientes, solicitados) =>
  `No hay suficientes días disponibles. Días pendientes: ${pendientes}, días solicitados: ${solicitados}`;

// Responde el error de una operación: los esperados con su estado; el resto, 500 genérico
async function responderError(req, res, error, mensajeGenerico) {
  if (error instanceof ErrorVacaciones) {
    if (error.auditoria) {
      try {
        await registrarAccion(
          req,
          "rh",
          "solicitudes_vacaciones",
          String(error.auditoria.registroId),
          error.codigo === "ACTIVIDAD_EMPRESA" ? "RECHAZO_ACTIVIDAD" : "RECHAZO_CUPO",
          null,
          error.auditoria.datos,
        );
      } catch (errorAuditoria) {
        console.error("Error al registrar auditoría:", errorAuditoria.message);
      }
    }
    return res.status(error.estado).json({ exito: false, mensaje: error.message });
  }
  console.error(`${mensajeGenerico}:`, error.message);
  return res.status(500).json({ exito: false, mensaje: mensajeGenerico });
}

// Quién puede aprobar o rechazar: el jefe inmediato VIGENTE del solicitante (empleados.jefe_inmediato_id
// hoy, `jefe_vigente_id`; no el guardado al crear), RH y super_admin; nadie lo propio.
// Devuelve el mensaje de rechazo (403) o null si puede. Función pura: no consulta la BD.
const MSG_PROPIA = "No puedes aprobar ni rechazar tu propia solicitud de vacaciones";
const MSG_SIN_AUTORIDAD = "No tienes autoridad para responder esta solicitud de vacaciones";
function motivoSinAutoridad(solicitud, empleadoAutoriza, esRH) {
  if (empleadoAutoriza && String(empleadoAutoriza.id) === String(solicitud.empleado_id)) {
    return MSG_PROPIA;
  }
  if (esRH) return null;
  const esJefe =
    empleadoAutoriza &&
    solicitud.jefe_vigente_id != null &&
    String(solicitud.jefe_vigente_id) === String(empleadoAutoriza.id);
  return esJefe ? null : MSG_SIN_AUTORIDAD;
}

// `?empleado_id=` debe ser un entero int4 en forma de texto o número: arrays (`empleado_id[]=9`) y
// objetos (`empleado_id[a]=1`) no son un id. Ausente o vacío = el empleado del token.
const INT4_MAX = 2147483647;
function empleadoIdDeLaConsultaValido(valor) {
  if (valor === undefined || valor === null || valor === "") return true;
  return (
    (typeof valor === "string" || typeof valor === "number") &&
    /^\d+$/.test(String(valor)) &&
    Number(valor) <= INT4_MAX
  );
}
const respuestaEmpleadoInvalido = (res) =>
  res.status(400).json({ exito: false, mensaje: "Parametro empleado_id no valido" });

// Empleado sobre el que se consulta: el pedido (si el middleware lo permitió) o el del token
async function empleadoDeLaConsulta(req) {
  if (req.query.empleado_id) return Empleado.obtenerPorId(req.query.empleado_id);
  return Empleado.obtenerPorUsuarioId(req.user.usuario_id);
}

// Datos del calendario laboral (solo oficial/otorgado/evento/actividad activos, sin nada de compañeros)
function separarCalendario(filas) {
  const noHabilesLista = filas
    .filter((f) => CalendarioLaboral.TIPOS_NO_HABILES.includes(f.tipo))
    .map((f) => ({ fecha: f.fecha, tipo: f.tipo, nombre: f.nombre }));
  const eventos = filas
    .filter((f) => f.tipo === "evento")
    .map((f) => ({ fecha: f.fecha, nombre: f.nombre }));
  const actividades = filas
    .filter((f) => f.tipo === CalendarioLaboral.TIPO_BLOQUEO)
    .map((f) => ({ fecha: f.fecha, nombre: f.nombre }));
  return {
    noHabilesLista,
    eventos,
    actividades,
    noHabiles: new Set(noHabilesLista.map((f) => f.fecha)),
  };
}

// Al aprobar: con la fila del departamento bloqueada, revalida traslape propio, saldo y cupo con
// los datos actuales (excluyendo la propia solicitud). Los días guardados NO se recalculan; el
// calendario actual solo decide qué días del rango cuentan para el cupo.
async function revalidarAprobacion(solicitud, cliente) {
  const inicio = solicitud.fecha_inicial_txt;
  const fin = solicitud.fecha_final_txt;

  let departamentoId = solicitud.departamento_id;
  if (!departamentoId) {
    // Solicitudes antiguas sin departamento_id: el del empleado hoy (si no tiene, no hay cupo)
    const empleado = await Empleado.obtenerPorId(solicitud.empleado_id, cliente);
    departamentoId = empleado ? empleado.departamento_id : null;
  }
  const departamento = departamentoId
    ? await SolicitudVacaciones.bloquearDepartamento(departamentoId, cliente)
    : null;

  // Un Día Actividad Empresa en día hábil del rango bloquea la aprobación (aunque la solicitud se
  // creó antes de registrarlo). Se evalúa antes que traslape, saldo y cupo, igual que al crear.
  const noHabiles = await CalendarioLaboral.obtenerFechasNoHabiles(inicio, fin, cliente);
  const diasHabiles = listarDiasHabiles(inicio, fin, noHabiles);
  const actividades = actividadesEnDiasHabiles(
    await CalendarioLaboral.obtenerFechasBloqueadas(inicio, fin, cliente),
    diasHabiles,
  );
  if (actividades.length > 0) {
    const [primera] = actividades;
    throw new ErrorVacaciones(409, mensajeActividadAprobar(primera.fecha, primera.nombre), {
      codigo: "ACTIVIDAD_EMPRESA",
      auditoria: {
        registroId: solicitud.id,
        datos: {
          operacion: "aprobar",
          empleado_id: solicitud.empleado_id,
          departamento_id: departamentoId || null,
          fecha_inicial: inicio,
          fecha_final: fin,
          fecha_bloqueada: primera.fecha,
        },
      },
    });
  }

  const traslape = await SolicitudVacaciones.tieneTraslape(
    solicitud.empleado_id,
    inicio,
    fin,
    solicitud.id,
    cliente,
  );
  if (traslape) throw new ErrorVacaciones(409, MSG_TRASLAPE);

  const saldo = await SolicitudVacaciones.calcularSaldo(
    solicitud.empleado_id,
    solicitud.periodo,
    cliente,
  );
  if (saldo && solicitud.dias_a_disfrutar > saldo.dias_pendientes) {
    throw new ErrorVacaciones(409, mensajeSaldo(saldo.dias_pendientes, solicitud.dias_a_disfrutar));
  }

  if (departamento) {
    const ocupacion = await SolicitudVacaciones.ocupacionPorDia(
      departamento.id,
      inicio,
      fin,
      solicitud.id,
      cliente,
    );
    const llena = primeraFechaLlena(diasHabiles, ocupacion, departamento.cupo_vacaciones);
    if (llena) {
      throw new ErrorVacaciones(409, mensajeCupoAprobar(llena, departamento.cupo_vacaciones), {
        codigo: "CUPO_LLENO",
        auditoria: {
          registroId: solicitud.id,
          datos: {
            operacion: "aprobar",
            empleado_id: solicitud.empleado_id,
            departamento_id: departamento.id,
            fecha_inicial: inicio,
            fecha_final: fin,
            fecha_llena: llena,
            cupo: departamento.cupo_vacaciones,
          },
        },
      });
    }
  }
}

const ControladorVacaciones = {
  async obtenerSaldo(req, res) {
    try {
      let { empleado_id, periodo } = req.query;
      if (!empleadoIdDeLaConsultaValido(empleado_id)) return respuestaEmpleadoInvalido(res);

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

      // `periodo` por query es SOLO una consulta de lectura del saldo de ese año. Crear y
      // disponibilidad nunca lo toman del cliente: usan el año de fecha_inicial.
      const anioActual = new Date().getFullYear();
      if (periodo === undefined || periodo === "") {
        periodo = anioActual;
      } else if (
        typeof periodo !== "string" ||
        !/^\d{4}$/.test(periodo) ||
        Number(periodo) < anioActual - PERIODOS_ATRAS ||
        Number(periodo) > anioActual + PERIODOS_ADELANTE
      ) {
        return res.status(400).json({
          exito: false,
          mensaje: `El periodo debe ser un año entre ${anioActual - PERIODOS_ATRAS} y ${anioActual + PERIODOS_ADELANTE}`,
        });
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
      console.error("Error al calcular saldo de vacaciones:", error.message);
      res.status(500).json({ exito: false, mensaje: "Error al calcular saldo de vacaciones" });
    }
  },

  async crear(req, res) {
    try {
      // `periodo` del cuerpo se IGNORA a propósito: el periodo siempre es el año de fecha_inicial
      let { empleado_id, fecha_inicial, fecha_final, fecha_regreso, observaciones } = req.body;

      if (!fecha_inicial || !fecha_final) {
        return res.status(400).json({
          exito: false,
          mensaje: "Fecha inicial y fecha final son obligatorias",
        });
      }

      const rango = validarRango(fecha_inicial, fecha_final);
      if (!rango.ok) {
        return res.status(400).json({ exito: false, mensaje: rango.mensaje });
      }
      if (fecha_regreso) {
        if (!esFechaValida(fecha_regreso)) {
          return res.status(400).json({
            exito: false,
            mensaje: "La fecha de regreso debe ser válida con formato AAAA-MM-DD",
          });
        }
        if (fecha_regreso < fecha_final) {
          return res.status(400).json({
            exito: false,
            mensaje: "La fecha de regreso no puede ser anterior a la fecha final",
          });
        }
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
      if (typeof empleado_id !== "string" && typeof empleado_id !== "number") {
        return res.status(400).json({ exito: false, mensaje: "El empleado indicado no es válido" });
      }
      const idNumerico = Number(empleado_id);
      if (!Number.isInteger(idNumerico) || idNumerico < 1 || idNumerico > 2147483647) {
        return res.status(400).json({ exito: false, mensaje: "El empleado indicado no es válido" });
      }

      // Periodo = año de la fecha inicial leído del texto (sin zona horaria)
      const periodoCalculado = anioDeFecha(fecha_inicial);

      // Todo lo que decide si cabe (traslape, saldo, cupo) y el INSERT van en una transacción.
      // Orden de bloqueos: empleado (candado de aplicación) -> departamento (FOR UPDATE). Con el
      // empleado bloqueado se lee su departamento, así que el cupo se aplica al vigente. Dentro de
      // la transacción TODA consulta usa `cliente` (una segunda conexión del pool puede agotarlo).
      const { solicitud, empleado, jefe } = await SolicitudVacaciones.enTransaccion(
        async (cliente) => {
          await SolicitudVacaciones.bloquearEmpleado(idNumerico, cliente);

          const empleadoTx = await Empleado.obtenerPorId(idNumerico, cliente);
          if (!empleadoTx) throw new ErrorVacaciones(404, "Empleado no encontrado");
          const jefeTx = empleadoTx.jefe_inmediato_id
            ? await Empleado.obtenerPorId(empleadoTx.jefe_inmediato_id, cliente)
            : null;
          const jefeNombre = jefeTx ? `${jefeTx.nombre} ${jefeTx.apellido_paterno}`.trim() : null;

          let cupo = null;
          if (empleadoTx.departamento_id) {
            const departamento = await SolicitudVacaciones.bloquearDepartamento(
              empleadoTx.departamento_id,
              cliente,
            );
            cupo = departamento ? departamento.cupo_vacaciones : null;
          }

          const noHabiles = await CalendarioLaboral.obtenerFechasNoHabiles(
            fecha_inicial,
            fecha_final,
            cliente,
          );
          const diasHabiles = listarDiasHabiles(fecha_inicial, fecha_final, noHabiles);
          const dias_a_disfrutar = diasHabiles.length;
          if (dias_a_disfrutar === 0) throw new ErrorVacaciones(400, MSG_SIN_HABILES);

          // Día Actividad Empresa en día hábil: bloquea para todos (no se salta ni se descuenta)
          const actividades = actividadesEnDiasHabiles(
            await CalendarioLaboral.obtenerFechasBloqueadas(fecha_inicial, fecha_final, cliente),
            diasHabiles,
          );
          if (actividades.length > 0) {
            const [primera] = actividades;
            throw new ErrorVacaciones(409, mensajeActividadCrear(primera.fecha, primera.nombre), {
              codigo: "ACTIVIDAD_EMPRESA",
              auditoria: {
                registroId: "nueva",
                datos: {
                  operacion: "crear",
                  empleado_id: idNumerico,
                  departamento_id: empleadoTx.departamento_id || null,
                  fecha_inicial,
                  fecha_final,
                  fecha_bloqueada: primera.fecha,
                },
              },
            });
          }

          const traslape = await SolicitudVacaciones.tieneTraslape(
            idNumerico,
            fecha_inicial,
            fecha_final,
            null,
            cliente,
          );
          if (traslape) throw new ErrorVacaciones(409, MSG_TRASLAPE);

          const saldo = await SolicitudVacaciones.calcularSaldo(
            idNumerico,
            periodoCalculado,
            cliente,
          );
          if (dias_a_disfrutar > saldo.dias_pendientes) {
            throw new ErrorVacaciones(400, mensajeSaldo(saldo.dias_pendientes, dias_a_disfrutar));
          }

          if (cupo !== null) {
            const ocupacion = await SolicitudVacaciones.ocupacionPorDia(
              empleadoTx.departamento_id,
              fecha_inicial,
              fecha_final,
              null,
              cliente,
            );
            const llena = primeraFechaLlena(diasHabiles, ocupacion, cupo);
            if (llena) {
              throw new ErrorVacaciones(409, mensajeCupoCrear(llena, cupo), {
                codigo: "CUPO_LLENO",
                auditoria: {
                  registroId: "nueva",
                  datos: {
                    operacion: "crear",
                    empleado_id: idNumerico,
                    departamento_id: empleadoTx.departamento_id,
                    fecha_inicial,
                    fecha_final,
                    fecha_llena: llena,
                    cupo,
                  },
                },
              });
            }
          }

          const creada = await SolicitudVacaciones.crear(
            {
              empleado_id: idNumerico,
              numero_nomina: empleadoTx.numero_nomina,
              nombre: empleadoTx.nombre,
              apellido_paterno: empleadoTx.apellido_paterno,
              apellido_materno: empleadoTx.apellido_materno,
              fecha_imss: empleadoTx.fecha_imss,
              antiguedad: saldo.antiguedad,
              ubicacion: empleadoTx.ubicacion,
              departamento: empleadoTx.departamento,
              departamento_id: empleadoTx.departamento_id,
              jefe_inmediato_id: empleadoTx.jefe_inmediato_id,
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
            },
            cliente,
          );
          return { solicitud: creada, empleado: empleadoTx, jefe: jefeTx };
        },
      );

      // Después del COMMIT nada de lo siguiente puede convertir el éxito en error
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
      await responderError(req, res, error, "Error al crear solicitud de vacaciones");
    }
  },

  async listar(req, res) {
    try {
      const { pagina = 1, limite = 20, estatus, periodo, busqueda } = req.query;

      // Misma función central que `responder` (RH = Empleados:edicion; tienePermiso ya cubre a super_admin)
      const esAdmin = await tienePermiso(req.user, "rh", "Empleados", "edicion");

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
      } else {
        // Sin empleado vinculado no hay "lo propio": antes caia en listado completo
        return res
          .status(403)
          .json({ exito: false, mensaje: "No tienes acceso a este recurso" });
      }

      const solicitudes = await SolicitudVacaciones.listar(filtros);
      const total = await SolicitudVacaciones.contar(filtros);

      // La ruta de responder exige Vacaciones:edicion: sin él no se ofrece Aprobar/Rechazar
      const puedeEditar = await tienePermiso(req.user, "rh", "Vacaciones", "edicion");
      const solicitudesEnriquecidas = solicitudes.map((sol) => ({
        ...sol,
        puede_responder:
          puedeEditar &&
          sol.estatus === "pendiente" &&
          motivoSinAutoridad(sol, empleadoUsuario, esAdmin) === null,
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
      console.error("Error al listar solicitudes de vacaciones:", error.message);
      res.status(500).json({ exito: false, mensaje: "Error al listar solicitudes de vacaciones" });
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
      console.error("Error al obtener solicitud:", error.message);
      res.status(500).json({ exito: false, mensaje: "Error al obtener solicitud" });
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

      const empleadoAutoriza = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);
      const autorizaNombre = empleadoAutoriza
        ? `${empleadoAutoriza.nombre} ${empleadoAutoriza.apellido_paterno}`.trim()
        : req.user.nombre || null;

      // Autoridad (RH = Empleados:edicion o super_admin). Se resuelve ANTES de la transacción: usa el
      // pool, y dentro de la transacción solo se puede usar `cliente`.
      const esRH = await tienePermiso(req.user, "rh", "Empleados", "edicion");

      // Orden de bloqueos (el mismo que crear, sin ciclos): empleado (candado de aplicación, solo al
      // aprobar) -> solicitud (FOR UPDATE) -> departamento (FOR UPDATE, solo al aprobar). Para tomar
      // el candado del empleado primero se lee su id SIN bloquear la fila. Dentro de la transacción
      // toda consulta usa `cliente`.
      const { anterior, solicitud } = await SolicitudVacaciones.enTransaccion(async (cliente) => {
        if (estatus === "aprobado") {
          const empleadoDeLaSolicitud = await SolicitudVacaciones.empleadoIdDeSolicitud(
            req.params.id,
            cliente,
          );
          if (empleadoDeLaSolicitud) {
            await SolicitudVacaciones.bloquearEmpleado(empleadoDeLaSolicitud, cliente);
          }
        }

        const actual = await SolicitudVacaciones.obtenerParaResponder(req.params.id, cliente);
        if (!actual) throw new ErrorVacaciones(404, "Solicitud no encontrada");

        // Con la fila ya bloqueada: la ruta pudo decidir con datos anteriores. Autoriza el jefe VIGENTE
        // del empleado (SELECT con `cliente`, dentro de la transacción); el jefe guardado en la
        // solicitud es solo histórico. FOR SHARE sobre la fila del empleado: un cambio de jefe concurrente
        // espera al COMMIT (orden: candado empleado -> solicitud -> fila empleado -> departamento; las
        // demás rutas no bloquean la fila del empleado, así que no hay ciclo).
        const jefeVigenteId = await SolicitudVacaciones.jefeVigenteDeEmpleado(
          actual.empleado_id,
          cliente,
          true,
        );
        const motivoDenegado = motivoSinAutoridad(
          { ...actual, jefe_vigente_id: jefeVigenteId },
          empleadoAutoriza,
          esRH,
        );
        if (motivoDenegado) throw new ErrorVacaciones(403, motivoDenegado);

        if (actual.estatus !== "pendiente") {
          throw new ErrorVacaciones(409, "Solo se pueden responder solicitudes pendientes");
        }

        if (estatus === "aprobado") {
          await revalidarAprobacion(actual, cliente);
        }

        const respondida = await SolicitudVacaciones.responder(
          req.params.id,
          estatus,
          req.user.usuario_id,
          autorizaNombre,
          motivo_rechazo || null,
          cliente,
        );
        if (!respondida) {
          throw new ErrorVacaciones(409, "Solo se pueden responder solicitudes pendientes");
        }
        return { anterior: actual, solicitud: respondida };
      });

      // Ya hay COMMIT: notificar y auditar no pueden devolver error (un reintento daría 409)
      try {
        const empleado = await Empleado.obtenerPorId(anterior.empleado_id);
        if (empleado && empleado.usuario_correo) {
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
        }
      } catch (errorNotif) {
        console.error("Error al notificar al empleado:", errorNotif.message);
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
      await responderError(req, res, error, "Error al responder solicitud");
    }
  },

  // Vista previa para el formulario: días hábiles, no hábiles/eventos del rango, días llenos del
  // departamento (solo fechas, nunca quién), cupo, saldo y el primer conflicto que impediría crear.
  async disponibilidad(req, res) {
    try {
      const { fecha_inicial, fecha_final } = req.query;
      if (!empleadoIdDeLaConsultaValido(req.query.empleado_id)) return respuestaEmpleadoInvalido(res);
      const rango = validarRango(fecha_inicial, fecha_final);
      if (!rango.ok) return res.status(400).json({ exito: false, mensaje: rango.mensaje });

      const empleado = await empleadoDeLaConsulta(req);
      if (!empleado) {
        return res.status(404).json({ exito: false, mensaje: "Empleado no encontrado" });
      }

      const filas = await CalendarioLaboral.listar({
        desde: fecha_inicial,
        hasta: fecha_final,
        soloActivos: true,
      });
      const { noHabilesLista, eventos, actividades, noHabiles } = separarCalendario(filas);
      const diasHabiles = listarDiasHabiles(fecha_inicial, fecha_final, noHabiles);
      const bloqueadas = actividadesEnDiasHabiles(actividades, diasHabiles);

      let cupo = null;
      let llenas = [];
      if (empleado.departamento_id) {
        cupo = await SolicitudVacaciones.obtenerCupoDepartamento(empleado.departamento_id);
        if (cupo !== null) {
          const ocupacion = await SolicitudVacaciones.ocupacionPorDia(
            empleado.departamento_id,
            fecha_inicial,
            fecha_final,
          );
          llenas = fechasLlenas(diasHabiles, ocupacion, cupo);
        }
      }

      const periodo = anioDeFecha(fecha_inicial);
      const saldo = await SolicitudVacaciones.calcularSaldo(empleado.id, periodo);
      const diasPendientes = saldo ? saldo.dias_pendientes : null;

      let conflicto = null;
      if (diasHabiles.length === 0) {
        conflicto = { codigo: "SIN_DIAS_HABILES", mensaje: MSG_SIN_HABILES };
      } else if (bloqueadas.length > 0) {
        conflicto = {
          codigo: "ACTIVIDAD_EMPRESA",
          mensaje: mensajeActividadCrear(bloqueadas[0].fecha, bloqueadas[0].nombre),
        };
      } else if (
        await SolicitudVacaciones.tieneTraslape(empleado.id, fecha_inicial, fecha_final)
      ) {
        conflicto = { codigo: "TRASLAPE", mensaje: MSG_TRASLAPE };
      } else if (diasPendientes !== null && diasHabiles.length > diasPendientes) {
        conflicto = {
          codigo: "SALDO_INSUFICIENTE",
          mensaje: mensajeSaldo(diasPendientes, diasHabiles.length),
        };
      } else if (llenas.length > 0) {
        conflicto = { codigo: "CUPO_LLENO", mensaje: mensajeCupoCrear(llenas[0], cupo) };
      }

      res.json({
        exito: true,
        datos: {
          dias_habiles: diasHabiles.length,
          dias_no_habiles: noHabilesLista,
          eventos,
          fechas_llenas: llenas,
          fechas_bloqueadas: bloqueadas,
          cupo,
          saldo: diasPendientes,
          conflicto,
        },
      });
    } catch (error) {
      await responderError(req, res, error, "Error al calcular la disponibilidad");
    }
  },

  // Para pintar el calendario de ocupación del formulario: solo fechas llenas, no hábiles y eventos
  async ocupacion(req, res) {
    try {
      const { desde, hasta } = req.query;
      if (!empleadoIdDeLaConsultaValido(req.query.empleado_id)) return respuestaEmpleadoInvalido(res);
      const rango = validarRango(desde, hasta);
      if (!rango.ok) return res.status(400).json({ exito: false, mensaje: rango.mensaje });

      const empleado = await empleadoDeLaConsulta(req);
      if (!empleado) {
        return res.status(404).json({ exito: false, mensaje: "Empleado no encontrado" });
      }

      const filas = await CalendarioLaboral.listar({ desde, hasta, soloActivos: true });
      const { noHabilesLista, eventos, actividades, noHabiles } = separarCalendario(filas);
      const bloqueadas = actividadesEnDiasHabiles(actividades, listarDiasHabiles(desde, hasta, noHabiles));

      let llenas = [];
      if (empleado.departamento_id) {
        const cupo = await SolicitudVacaciones.obtenerCupoDepartamento(empleado.departamento_id);
        if (cupo !== null) {
          const ocupacion = await SolicitudVacaciones.ocupacionPorDia(
            empleado.departamento_id,
            desde,
            hasta,
          );
          llenas = fechasLlenas(listarDiasHabiles(desde, hasta, noHabiles), ocupacion, cupo);
        }
      }

      res.json({
        exito: true,
        datos: {
          fechas_llenas: llenas,
          fechas_bloqueadas: bloqueadas,
          dias_no_habiles: noHabilesLista,
          eventos,
        },
      });
    } catch (error) {
      await responderError(req, res, error, "Error al consultar la ocupación");
    }
  },
};

module.exports = ControladorVacaciones;
module.exports.MSG_PROPIA = MSG_PROPIA;
module.exports.MSG_SIN_AUTORIDAD = MSG_SIN_AUTORIDAD;
