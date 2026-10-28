// API de «Mi asistencia» y «Mi equipo» (/api/asistencia/mi-contexto y /mi-equipo/hoy). Solo lectura. El servidor decide
// quién es jefe: jefe inmediato VIGENTE de al menos un empleado activo (se lee en cada petición). Cada usuario recibe
// únicamente lo suyo y lo de sus subordinados directos; nada de gestión (ids internos, quién cerró, terminales).
const Empleado = require("../models/empleado.model");
const Turno = require("../models/turno.model");
const Mi = require("../models/asistenciaMiAsistencia.model");
const Motor = require("../services/asistencia/motorAsistencia");
const { quincenaDe } = require("../services/asistencia/periodos");
const { diaIso } = require("../services/asistencia/tiempo");

function responderError(res, contexto, error) {
  console.error(`[MiAsistencia] ${contexto}: ${(error && (error.code || error.name)) || "Error"}`);
  return res.status(500).json({ exito: false, mensaje: `Error al ${contexto}` });
}

const nombreCompleto = (f) => [f.nombre, f.apellido_paterno, f.apellido_materno].filter((x) => x && String(x).trim()).join(" ");

/** Turno que le toca hoy: nombre, de dónde viene y el horario de HOY (null si hoy no es laborable) */
function resumenTurno(efectivo, hoy) {
  if (!efectivo || !efectivo.turno) return null;
  const dia = (efectivo.turno.dias || []).find((d) => Number(d.dia_semana) === diaIso(hoy));
  return {
    nombre: efectivo.turno.nombre,
    origen: efectivo.origen,
    entrada_hoy: dia && dia.laborable ? dia.hora_entrada : null,
    salida_hoy: dia && dia.laborable ? dia.hora_salida : null,
    descanso_min: efectivo.turno.descanso_min,
  };
}

// El motor crea las quincenas al correr: si la actual aún no existe se calcula con la misma regla (1-15 y 16-fin de mes)
function periodoSinCrear(hoy) {
  const q = quincenaDe(hoy);
  return { id: null, fecha_inicio: q.inicio, fecha_fin: q.fin, estado: "abierto" };
}

const Controlador = {
  /**
   * Quién es el usuario para la asistencia: su empleado vinculado, si tiene nómina, su turno vigente, si es jefe (y de
   * cuántos), desde cuándo se analiza y la quincena actual. Sin empleado vinculado responde 200 con vinculado:false.
   */
  async miContexto(req, res) {
    try {
      const propio = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);
      const hoy = await Turno.hoyMexico();
      const parametros = await Motor.leerParametros();
      const periodo = (await Mi.periodoDe(hoy)) || periodoSinCrear(hoy);
      const base = { hoy, analisis_desde: parametros.analisis_desde, periodo_actual: periodo };
      res.set("Cache-Control", "no-store");
      if (!propio) {
        return res.json({ exito: true, datos: { ...base, vinculado: false, empleado: null, es_jefe: false, subordinados_directos: 0 } });
      }
      const ficha = await Mi.fichaPropia(propio.id);
      if (!ficha) {
        return res.json({ exito: true, datos: { ...base, vinculado: false, empleado: null, es_jefe: false, subordinados_directos: 0 } });
      }
      const [efectivo, subordinados] = await Promise.all([Turno.obtenerEfectivo(propio.id, hoy), Mi.contarSubordinadosDirectos(propio.id)]);
      return res.json({
        exito: true,
        datos: {
          ...base,
          vinculado: true,
          empleado: {
            id: ficha.id,
            nombre: nombreCompleto(ficha),
            estatus: ficha.estatus,
            fecha_baja: ficha.fecha_baja,
            tiene_nomina: ficha.tiene_nomina,
            nomina_compartida: ficha.nomina_compartida,
            turno: resumenTurno(efectivo, hoy),
          },
          es_jefe: subordinados > 0,
          subordinados_directos: subordinados,
        },
      });
    } catch (error) {
      return responderError(res, "consultar tu contexto de asistencia", error);
    }
  },

  /**
   * Estado de hoy de los subordinados directos del usuario. Sin subordinados responde 200 con es_jefe:false y lista vacía
   * (la pantalla muestra un mensaje). Siempre es el equipo del propio usuario, también para RH.
   */
  async miEquipoHoy(req, res) {
    try {
      const propio = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);
      const hoy = await Turno.hoyMexico();
      res.set("Cache-Control", "no-store");
      const ahora = new Date().toISOString();
      if (!propio) return res.json({ exito: true, datos: { hoy, ahora, es_jefe: false, equipo: [], truncado: false } });
      const filas = await Mi.equipoHoy(propio.id, hoy);
      const equipo = filas.map((f) => ({ ...f, nombre_completo: nombreCompleto(f) }));
      return res.json({
        exito: true,
        datos: {
          hoy,
          ahora,
          es_jefe: filas.some((f) => f.estatus === "activo"),
          equipo,
          truncado: filas.length >= Mi.LIMITE_EQUIPO,
        },
      });
    } catch (error) {
      return responderError(res, "consultar el estado de hoy de tu equipo", error);
    }
  },
};

module.exports = Controlador;
