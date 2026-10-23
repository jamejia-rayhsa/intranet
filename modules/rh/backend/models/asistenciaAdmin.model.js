// Consultas de LECTURA de las pantallas de administración de Asistencia (turnos en uso, buscador de empleados,
// marcas, códigos sin empleado, estado de la sincronización). Todo parametrizado; las fechas salen como texto
// 'YYYY-MM-DD' y los instantes como timestamptz (el cliente los muestra en America/Mexico_City con Intl).
// Nunca se seleccionan `crudo`, `area_externa`, hashes ni IP de los lotes: lo que no se muestra no se expone.
const { grupo } = require("../config/database");

const ZONA = "America/Mexico_City";
const NOMBRE_COMPLETO = (alias) => `concat_ws(' ', ${alias}.nombre, ${alias}.apellido_paterno, ${alias}.apellido_materno)`;

/** Escapa los comodines de LIKE para que el texto del usuario se busque literal. */
const escaparLike = (texto) => texto.replace(/[\\%_]/g, "\\$&");

// Fecha de hoy en México calculada por la BD (una sola fuente de tiempo)
const HOY = `(now() AT TIME ZONE '${ZONA}')::date`;

const AsistenciaAdmin = {
  escaparLike,

  /**
   * Uso de cada turno HOY (vigencias que contienen la fecha de hoy en México): departamentos asignados,
   * empleados con asignación individual y empleados ACTIVOS cuyo turno efectivo es ese (individual vigente; si no
   * tiene, el de su departamento). Una sola pasada, sin consultas por turno.
   */
  async usoDeTurnos(cliente = grupo) {
    const r = await cliente.query(
      `WITH hoy AS (SELECT ${HOY} AS d),
       deptos AS (
         SELECT td.turno_id, COUNT(DISTINCT td.departamento_id)::int AS departamentos
         FROM turno_departamento td, hoy
         WHERE hoy.d BETWEEN td.vigente_desde AND COALESCE(td.vigente_hasta, 'infinity'::date)
         GROUP BY td.turno_id
       ),
       individuales AS (
         SELECT te.turno_id, COUNT(DISTINCT te.empleado_id)::int AS empleados_individuales
         FROM turno_empleado te, hoy
         WHERE hoy.d BETWEEN te.vigente_desde AND COALESCE(te.vigente_hasta, 'infinity'::date)
         GROUP BY te.turno_id
       ),
       efectivos AS (
         SELECT COALESCE(
                  (SELECT te.turno_id FROM turno_empleado te
                   WHERE te.empleado_id = e.id AND hoy.d BETWEEN te.vigente_desde AND COALESCE(te.vigente_hasta, 'infinity'::date)
                   LIMIT 1),
                  (SELECT td.turno_id FROM turno_departamento td
                   WHERE td.departamento_id = e.departamento_id AND hoy.d BETWEEN td.vigente_desde AND COALESCE(td.vigente_hasta, 'infinity'::date)
                   LIMIT 1)
                ) AS turno_id
         FROM empleados e, hoy
         WHERE e.estatus = 'activo'
       ),
       efectivos_n AS (
         SELECT turno_id, COUNT(*)::int AS empleados_efectivos FROM efectivos WHERE turno_id IS NOT NULL GROUP BY turno_id
       )
       SELECT t.id AS turno_id,
              COALESCE(d.departamentos, 0) AS departamentos,
              COALESCE(i.empleados_individuales, 0) AS empleados_individuales,
              COALESCE(n.empleados_efectivos, 0) AS empleados_efectivos
       FROM turnos t
       LEFT JOIN deptos d ON d.turno_id = t.id
       LEFT JOIN individuales i ON i.turno_id = t.id
       LEFT JOIN efectivos_n n ON n.turno_id = t.id
       ORDER BY t.id`,
    );
    return r.rows;
  },

  /**
   * Buscador paginado de empleados (nombre completo o número de nómina) con su turno efectivo de hoy.
   * `texto` ya viene validado; los comodines se escapan aquí.
   */
  async buscarEmpleados({ texto, pagina, limite }, cliente = grupo) {
    const valores = [];
    let donde = "";
    if (texto) {
      valores.push(`%${escaparLike(texto)}%`);
      donde = `WHERE (${NOMBRE_COMPLETO("e")} ILIKE $1 OR e.numero_nomina ILIKE $1)`;
    }
    valores.push(limite, (pagina - 1) * limite);
    const r = await cliente.query(
      `WITH hoy AS (SELECT ${HOY} AS d)
       SELECT e.id, ${NOMBRE_COMPLETO("e")} AS nombre, e.numero_nomina, e.estatus,
              e.departamento_id, d.nombre AS departamento,
              ef.turno_id, tt.nombre AS turno_nombre, ef.origen,
              COUNT(*) OVER ()::int AS total
       FROM empleados e
       LEFT JOIN departamentos d ON d.id = e.departamento_id
       CROSS JOIN hoy
       LEFT JOIN LATERAL (
         SELECT x.turno_id, x.origen FROM (
           SELECT te.turno_id, 'empleado'::text AS origen, 1 AS prioridad FROM turno_empleado te
            WHERE te.empleado_id = e.id AND hoy.d BETWEEN te.vigente_desde AND COALESCE(te.vigente_hasta, 'infinity'::date)
           UNION ALL
           SELECT td.turno_id, 'departamento'::text, 2 FROM turno_departamento td
            WHERE td.departamento_id = e.departamento_id AND hoy.d BETWEEN td.vigente_desde AND COALESCE(td.vigente_hasta, 'infinity'::date)
         ) x ORDER BY x.prioridad LIMIT 1
       ) ef ON true
       LEFT JOIN turnos tt ON tt.id = ef.turno_id
       ${donde}
       ORDER BY e.nombre, e.apellido_paterno, e.id
       LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
      valores,
    );
    const total = r.rows.length ? r.rows[0].total : 0;
    return { empleados: r.rows.map(({ total: _t, ...fila }) => fila), total };
  },

  /**
   * Marcas del rango [desde, hasta] (fechas locales de México, ambas inclusivas) con filtros opcionales.
   * El rango se traduce a instantes (sargable con idx_asistencia_marcas_ts). Orden estable: marca_ts, id (desc).
   */
  async marcas({ desde, hasta, empleadoId, buscar, codigo, vinculadas, terminal, pagina, limite, contar }, cliente = grupo) {
    const valores = [desde, hasta];
    const condiciones = [
      `m.marca_ts >= ($1::date::timestamp AT TIME ZONE '${ZONA}')`,
      `m.marca_ts < (($2::date + 1)::timestamp AT TIME ZONE '${ZONA}')`,
    ];
    const param = (valor) => {
      valores.push(valor);
      return `$${valores.length}`;
    };
    if (empleadoId) condiciones.push(`m.empleado_id = ${param(empleadoId)}`);
    if (codigo) condiciones.push(`m.codigo_empleado = ${param(codigo)}`);
    if (buscar) {
      const exacto = param(buscar);
      const parcial = param(`%${escaparLike(buscar)}%`);
      condiciones.push(
        `(m.codigo_empleado = ${exacto} OR m.empleado_id IN (
            SELECT b.id FROM empleados b
            WHERE b.numero_nomina = ${exacto} OR ${NOMBRE_COMPLETO("b")} ILIKE ${parcial}))`,
      );
    }
    if (vinculadas === "si") condiciones.push("m.empleado_id IS NOT NULL");
    if (vinculadas === "no") condiciones.push("m.empleado_id IS NULL");
    if (terminal) {
      const exacto = param(terminal);
      const parcial = param(`%${escaparLike(terminal)}%`);
      condiciones.push(`(m.terminal_sn = ${exacto} OR m.terminal_alias ILIKE ${parcial})`);
    }
    const donde = condiciones.join(" AND ");

    let total = null;
    if (contar) {
      const c = await cliente.query(`SELECT COUNT(*)::int AS total FROM asistencia_marcas m WHERE ${donde}`, valores);
      total = c.rows[0].total;
    }
    const filas = await cliente.query(
      `SELECT m.id, m.id_externo, m.codigo_empleado, m.marca_ts, m.subida_ts, m.estado_marca, m.tipo_verificacion,
              m.terminal_sn, m.terminal_alias, m.empleado_id, ${NOMBRE_COMPLETO("e")} AS empleado_nombre
       FROM asistencia_marcas m
       LEFT JOIN empleados e ON e.id = m.empleado_id
       WHERE ${donde}
       ORDER BY m.marca_ts DESC, m.id DESC
       LIMIT ${param(limite)} OFFSET ${param((pagina - 1) * limite)}`,
      valores,
    );
    return { marcas: filas.rows, total };
  },

  /** Resumen por código de las marcas sin empleado (el más numeroso primero). */
  async codigosSinEmpleado({ limite }, cliente = grupo) {
    const r = await cliente.query(
      `WITH g AS (
         SELECT m.codigo_empleado AS codigo, COUNT(*)::int AS marcas, MIN(m.marca_ts) AS primera, MAX(m.marca_ts) AS ultima,
                (MAX(m.marca_ts) >= NOW() - interval '14 days') AS reciente
         FROM asistencia_marcas m
         WHERE m.empleado_id IS NULL
         GROUP BY m.codigo_empleado
       )
       SELECT g.codigo, g.marcas, g.primera, g.ultima, g.reciente,
              EXISTS (SELECT 1 FROM empleados e WHERE e.numero_nomina = g.codigo) AS hay_empleado_con_codigo,
              COUNT(*) OVER ()::int AS total_codigos,
              SUM(g.marcas) OVER ()::bigint AS total_marcas
       FROM g
       ORDER BY g.marcas DESC, g.codigo
       LIMIT $1`,
      [limite],
    );
    const primera = r.rows[0];
    return {
      codigos: r.rows.map(({ total_codigos: _a, total_marcas: _b, ...fila }) => fila),
      total_codigos: primera ? primera.total_codigos : 0,
      total_marcas: primera ? Number(primera.total_marcas) : 0,
    };
  },

  /** Empleados ACTIVOS sin número de nómina: sus marcas no se pueden vincular. */
  async empleadosSinNomina({ limite }, cliente = grupo) {
    const r = await cliente.query(
      `SELECT e.id, ${NOMBRE_COMPLETO("e")} AS nombre, d.nombre AS departamento, COUNT(*) OVER ()::int AS total
       FROM empleados e LEFT JOIN departamentos d ON d.id = e.departamento_id
       WHERE e.estatus = 'activo' AND (e.numero_nomina IS NULL OR btrim(e.numero_nomina) = '')
       ORDER BY e.nombre, e.apellido_paterno, e.id
       LIMIT $1`,
      [limite],
    );
    return {
      empleados: r.rows.map(({ total: _t, ...fila }) => fila),
      total: r.rows.length ? r.rows[0].total : 0,
    };
  },

  /**
   * Estado de la sincronización de un origen. Los conteos evitan el COUNT(*) pesado sobre la tabla de marcas:
   *  - marcas_sin_vincular: COUNT exacto con empleado_id IS NULL (índice por empleado_id; son pocas filas).
   *  - total_marcas: estimación de pg_class.reltuples (la mantiene autovacuum/ANALYZE) cuando es >= UMBRAL;
   *    por debajo (tabla pequeña o reltuples = -1 sin analizar) se cuenta exacto porque es barato.
   */
  async estadoSincronizacion(origen, { umbralEstimacion = 100000 } = {}, cliente = grupo) {
    const estado = await cliente.query(
      `SELECT s.origen, s.ultimo_id_externo::text AS ultimo_id_externo, s.ultima_marca_ts, s.ultima_subida_ts,
              s.ultima_sincronizacion AS ultimo_exito, s.ultimo_error, s.fecha_actualizacion, s.ultimo_lote_id
       FROM asistencia_sync_estado s WHERE s.origen = $1`,
      [origen],
    );
    const ultimoLote = await cliente.query(
      `SELECT l.id, l.estatus, l.fecha_recepcion, l.error
       FROM asistencia_sync_lotes l WHERE l.origen = $1 ORDER BY l.id DESC LIMIT 1`,
      [origen],
    );
    const ultimoOk = await cliente.query(
      `SELECT l.fecha_recepcion FROM asistencia_sync_lotes l WHERE l.origen = $1 AND l.estatus = 'ok' ORDER BY l.id DESC LIMIT 1`,
      [origen],
    );
    const huerfanas = await cliente.query(
      "SELECT COUNT(*)::int AS total FROM asistencia_marcas WHERE origen = $1 AND empleado_id IS NULL",
      [origen],
    );
    const estimado = await cliente.query(
      "SELECT reltuples::bigint AS estimado FROM pg_class WHERE oid = 'asistencia_marcas'::regclass",
    );
    let totalMarcas;
    let esEstimado = false;
    const aprox = Number(estimado.rows[0] && estimado.rows[0].estimado);
    if (Number.isFinite(aprox) && aprox >= umbralEstimacion) {
      totalMarcas = aprox;
      esEstimado = true;
    } else {
      const exacto = await cliente.query("SELECT COUNT(*)::int AS total FROM asistencia_marcas WHERE origen = $1", [origen]);
      totalMarcas = exacto.rows[0].total;
    }
    const ahora = await cliente.query("SELECT now() AS ahora");
    return {
      ...(estado.rows[0] || { origen, ultimo_id_externo: null, ultima_marca_ts: null, ultima_subida_ts: null, ultimo_exito: null, ultimo_error: null }),
      ultimo_lote: ultimoLote.rows[0] || null,
      ultimo_lote_ok: ultimoOk.rows[0] ? ultimoOk.rows[0].fecha_recepcion : null,
      total_marcas: totalMarcas,
      total_marcas_estimado: esEstimado,
      marcas_sin_vincular: huerfanas.rows[0].total,
      ahora: ahora.rows[0].ahora,
    };
  },

  /** Historial paginado de lotes (más reciente primero). Sin IP ni hash del cuerpo. */
  async lotes({ origen, pagina, limite }, cliente = grupo) {
    const total = await cliente.query("SELECT COUNT(*)::int AS total FROM asistencia_sync_lotes WHERE origen = $1", [origen]);
    const r = await cliente.query(
      `SELECT l.id, l.estatus, l.recibidas, l.insertadas, l.duplicadas, l.rechazadas, l.sin_empleado, l.error,
              l.fecha_recepcion, k.nombre AS llave_nombre, k.prefijo AS llave_prefijo
       FROM asistencia_sync_lotes l LEFT JOIN asistencia_llaves k ON k.id = l.llave_id
       WHERE l.origen = $1
       ORDER BY l.id DESC
       LIMIT $2 OFFSET $3`,
      [origen, limite, (pagina - 1) * limite],
    );
    return { lotes: r.rows, total: total.rows[0].total };
  },
};

module.exports = AsistenciaAdmin;
