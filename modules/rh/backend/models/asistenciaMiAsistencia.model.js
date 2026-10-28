// Lecturas de «Mi asistencia» y «Mi equipo»: contexto del usuario (empleado vinculado, equipo, periodo actual) y estado
// de HOY de los subordinados directos. Solo lectura y sin reglas de cálculo: el estado del día sale de lo que el motor
// ya guardó en asistencia_diaria y de las marcas de hoy.
const { grupo } = require("../../../portal/backend/config/database");
const { subordinadoVigente } = require("./asistenciaResultados.model");

const LIMITE_EQUIPO = 500;
const ZONA = "America/Mexico_City";

const AsistenciaMiAsistencia = {
  /**
   * Ficha mínima del propio empleado: nombre, si tiene número de nómina y si lo comparte con otro registro de periodo
   * traslapado (en ambos casos el motor no analiza al empleado). No devuelve quién lo comparte. Incluye el estatus: solo
   * un empleado ACTIVO ve «Mi asistencia» y «Mi equipo».
   */
  async fichaPropia(empleadoId, cliente = grupo) {
    const r = await cliente.query(
      `SELECT e.id, e.nombre, e.apellido_paterno, e.apellido_materno, e.estatus,
              to_char(e.fecha_baja, 'YYYY-MM-DD') AS fecha_baja,
              (e.numero_nomina IS NOT NULL AND btrim(e.numero_nomina) <> '') AS tiene_nomina,
              (e.numero_nomina IS NOT NULL AND btrim(e.numero_nomina) <> '' AND EXISTS (
                 SELECT 1 FROM empleados o
                 WHERE o.id <> e.id AND o.numero_nomina = e.numero_nomina
                   AND daterange(COALESCE(o.fecha_ingreso, '-infinity'::date), COALESCE(o.fecha_baja, 'infinity'::date), '[]')
                    && daterange(COALESCE(e.fecha_ingreso, '-infinity'::date), COALESCE(e.fecha_baja, 'infinity'::date), '[]')
              )) AS nomina_compartida
       FROM empleados e WHERE e.id = $1`,
      [empleadoId],
    );
    return r.rows[0] || null;
  },

  /** Subordinados directos ACTIVOS del jefe inmediato vigente (el propio empleado nunca cuenta; un suspendido tampoco) */
  async contarSubordinadosDirectos(jefeId, cliente = grupo) {
    const r = await cliente.query(
      `SELECT COUNT(*)::int AS n FROM empleados WHERE jefe_inmediato_id = $1 AND id <> $1 AND estatus = 'activo'`,
      [jefeId],
    );
    return r.rows[0] ? r.rows[0].n : 0;
  },

  /** Quincena que contiene `hoy`; null si el motor aún no la ha creado */
  async periodoDe(hoy, cliente = grupo) {
    const r = await cliente.query(
      `SELECT id, to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin, estado
       FROM asistencia_periodos WHERE $1::date BETWEEN fecha_inicio AND fecha_fin ORDER BY fecha_inicio DESC LIMIT 1`,
      [hoy],
    );
    return r.rows[0] || null;
  },

  /**
   * Estado de hoy de los subordinados directos: la fila de hoy del motor (si existe) y las marcas de hoy (conteo, primera
   * y última). Un dado de baja solo aparece si su baja es de hoy en adelante. Incluye a quienes no tienen nómina (el motor
   * no los analiza) para que el jefe sepa que faltan datos. Sin ids internos: solo `empleado_id` para abrir su detalle.
   */
  async equipoHoy(jefeId, hoy, cliente = grupo) {
    const r = await cliente.query(
      `SELECT e.id AS empleado_id, e.nombre, e.apellido_paterno, e.apellido_materno, e.numero_nomina, e.estatus,
              (e.numero_nomina IS NOT NULL AND btrim(e.numero_nomina) <> '') AS tiene_nomina,
              (e.numero_nomina IS NOT NULL AND btrim(e.numero_nomina) <> '' AND EXISTS (
                 SELECT 1 FROM empleados o
                 WHERE o.id <> e.id AND o.numero_nomina = e.numero_nomina
                   AND daterange(COALESCE(o.fecha_ingreso, '-infinity'::date), COALESCE(o.fecha_baja, 'infinity'::date), '[]')
                    && daterange(COALESCE(e.fecha_ingreso, '-infinity'::date), COALESCE(e.fecha_baja, 'infinity'::date), '[]')
              )) AS nomina_compartida,
              d.estatus AS dia_estatus, d.minutos_retardo, d.minutos_salida_anticipada, d.primera_marca,
              to_char(d.entrada_programada, 'HH24:MI') AS entrada_programada,
              to_char(d.salida_programada, 'HH24:MI') AS salida_programada, d.cruza_medianoche, d.umbral_falta_min,
              COALESCE(d.detalle->'banderas' @> '"ultima_marca_en_comida"'::jsonb, false) AS ultima_marca_en_comida,
              COALESCE(m.marcas_hoy, 0) AS marcas_hoy, m.primera_hoy
       FROM empleados e
       LEFT JOIN asistencia_diaria d ON d.empleado_id = e.id AND d.fecha = $2::date
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS marcas_hoy, MIN(x.marca_ts) AS primera_hoy
         FROM asistencia_marcas x
         WHERE x.empleado_id = e.id
           AND x.marca_ts >= ($2::date::timestamp AT TIME ZONE '${ZONA}')
           AND x.marca_ts < (($2::date + 1)::timestamp AT TIME ZONE '${ZONA}')
       ) m ON true
       WHERE e.jefe_inmediato_id = $1 AND e.id <> $1
         AND ${subordinadoVigente("e", "$2")}
       ORDER BY e.apellido_paterno, e.nombre, e.id
       LIMIT ${LIMITE_EQUIPO}`,
      [jefeId, hoy],
    );
    return r.rows;
  },
};

module.exports = AsistenciaMiAsistencia;
module.exports.LIMITE_EQUIPO = LIMITE_EQUIPO;
