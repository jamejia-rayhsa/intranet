// Lecturas y escrituras de la API del motor de asistencia (resultados por día, resumen, periodos, ajustes
// pendientes, incidencias de RH). El cálculo vive en services/asistencia/; aquí solo hay consultas acotadas.
const { grupo } = require("../../../portal/backend/config/database");
const { clasificarMarcas } = require("../services/asistencia/motor");

const ESTATUS = [
  "puntual", "retardo", "falta", "salida_anticipada", "incompleta", "vacaciones", "permiso", "descanso", "festivo",
  "justificada", "sin_turno", "pendiente",
];
const ESTATUS_JUSTIFICABLES = ["falta", "retardo", "salida_anticipada", "incompleta"];

// COUNT(*) OVER() trae el total en cada fila: se separa de los datos
const sinTotal = (fila) => {
  const copia = { ...fila };
  delete copia.total;
  return copia;
};

const LIMITE_MARCAS_DIA = 100;
const NOMBRE_EMPLEADO = `e.nombre, e.apellido_paterno, e.apellido_materno, e.numero_nomina`;

const AsistenciaResultados = {
  ESTATUS,
  ESTATUS_JUSTIFICABLES,

  /**
   * Empleado propio y sus subordinados DIRECTOS (jefe inmediato vigente): ids visibles para quien no es RH.
   * Un subordinado dado de baja solo se lista si su baja no es anterior al rango consultado.
   */
  async idsVisibles(empleadoPropioId, desde, cliente = grupo) {
    const r = await cliente.query(
      `SELECT id FROM empleados
       WHERE jefe_inmediato_id = $1 AND id <> $1
         AND (estatus IS DISTINCT FROM 'baja' OR (fecha_baja IS NOT NULL AND fecha_baja >= $2::date))
       ORDER BY id`,
      [empleadoPropioId, desde],
    );
    return [empleadoPropioId, ...r.rows.map((f) => f.id)];
  },

  /** ids: null = todos (RH). Devuelve { filas, total }. */
  async listarResultados({ ids, desde, hasta, limite, offset }, cliente = grupo) {
    const r = await cliente.query(
      `SELECT d.id, d.empleado_id, ${NOMBRE_EMPLEADO}, to_char(d.fecha, 'YYYY-MM-DD') AS fecha, d.estatus,
              d.minutos_retardo, d.minutos_salida_anticipada, d.primera_marca, d.ultima_marca,
              d.turno_id, d.turno_nombre, d.origen_turno, d.departamento_id,
              to_char(d.entrada_programada, 'HH24:MI') AS entrada_programada,
              to_char(d.salida_programada, 'HH24:MI') AS salida_programada,
              d.periodo_id, p.estado AS periodo_estado, d.marcas_usadas, d.detalle, d.version_calculo, d.calculado_en,
              COUNT(*) OVER() AS total
       FROM asistencia_diaria d
       JOIN empleados e ON e.id = d.empleado_id
       LEFT JOIN asistencia_periodos p ON p.id = d.periodo_id
       WHERE d.fecha BETWEEN $2::date AND $3::date AND ($1::int[] IS NULL OR d.empleado_id = ANY($1::int[]))
       ORDER BY d.fecha, e.apellido_paterno, e.nombre, d.empleado_id
       LIMIT $4 OFFSET $5`,
      [ids, desde, hasta, limite, offset],
    );
    return { filas: r.rows.map(sinTotal), total: r.rows[0] ? Number(r.rows[0].total) : 0 };
  },

  /**
   * Días de un conjunto de empleados para exportar, paginados POR CLAVE (id ascendente): sin OFFSET, estables aunque el
   * motor recalcule durante la exportación. `total` solo se calcula en la primera página (sin `despuesId`).
   */
  async listarDiasPorClave({ ids, desde, hasta, despuesId, limite }, cliente = grupo) {
    const r = await cliente.query(
      `SELECT d.id, d.empleado_id, ${NOMBRE_EMPLEADO}, to_char(d.fecha, 'YYYY-MM-DD') AS fecha, d.estatus,
              d.minutos_retardo, d.minutos_salida_anticipada, d.primera_marca, d.ultima_marca, d.turno_nombre, d.periodo_id,
              p.estado AS periodo_estado, d.detalle
       FROM asistencia_diaria d
       JOIN empleados e ON e.id = d.empleado_id
       LEFT JOIN asistencia_periodos p ON p.id = d.periodo_id
       WHERE d.fecha BETWEEN $2::date AND $3::date AND d.empleado_id = ANY($1::int[]) AND d.id > $4::int
       ORDER BY d.id LIMIT $5`,
      [ids, desde, hasta, despuesId || 0, limite],
    );
    let total = null;
    if (!despuesId) {
      const c = await cliente.query(
        `SELECT COUNT(*)::int AS total FROM asistencia_diaria d WHERE d.fecha BETWEEN $2::date AND $3::date AND d.empleado_id = ANY($1::int[])`,
        [ids, desde, hasta],
      );
      total = c.rows[0] ? c.rows[0].total : 0;
    }
    return { filas: r.rows, total, siguiente: r.rows.length === limite ? r.rows[r.rows.length - 1].id : null };
  },

  /** Conteos por empleado y estatus */
  async resumen({ ids, departamentoId, desde, hasta, limite, offset }, cliente = grupo) {
    const conteos = ESTATUS.map((s) => `COUNT(*) FILTER (WHERE d.estatus = '${s}')::int AS ${s}`).join(", ");
    const r = await cliente.query(
      `SELECT d.empleado_id, ${NOMBRE_EMPLEADO}, e.departamento_id, dep.nombre AS departamento, ${conteos},
              COUNT(*) FILTER (WHERE d.primera_marca IS NOT NULL)::int AS dias_con_marcas,
              COUNT(*) FILTER (WHERE d.estatus = 'falta' AND d.primera_marca IS NOT NULL)::int AS faltas_con_marcas,
              COUNT(*) FILTER (WHERE d.estatus = 'incompleta' AND d.detalle->'banderas' @> '"ultima_marca_en_comida"'::jsonb)::int AS incompletas_comida,
              COUNT(*)::int AS dias, COALESCE(SUM(d.minutos_retardo) FILTER (WHERE d.estatus IN ('retardo', 'justificada')), 0)::int AS minutos_retardo,
              COALESCE(SUM(d.minutos_salida_anticipada), 0)::int AS minutos_salida_anticipada,
              COUNT(*) OVER() AS total
       FROM asistencia_diaria d
       JOIN empleados e ON e.id = d.empleado_id
       LEFT JOIN departamentos dep ON dep.id = e.departamento_id
       WHERE d.fecha BETWEEN $2::date AND $3::date
         AND ($1::int[] IS NULL OR d.empleado_id = ANY($1::int[]))
         AND ($4::int IS NULL OR e.departamento_id = $4::int)
       GROUP BY d.empleado_id, e.id, dep.id
       ORDER BY e.apellido_paterno, e.nombre, d.empleado_id
       LIMIT $5 OFFSET $6`,
      [ids, desde, hasta, departamentoId || null, limite, offset],
    );
    return { filas: r.rows.map(sinTotal), total: r.rows[0] ? Number(r.rows[0].total) : 0 };
  },

  /** esRH = false oculta quién reabrió y por qué (datos de gestión) */
  async listarPeriodos({ estado, limite, offset, esRH = false }, cliente = grupo) {
    const r = await cliente.query(
      `SELECT p.id, to_char(p.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(p.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
              p.estado, p.cerrado_en, p.cerrado_por, p.tipo_cierre, p.reabierto_en, p.reabierto_por, p.reabierto_motivo,
              p.veces_reabierto, p.no_cerrar_automatico,
              NULLIF(concat_ws(' ', uc.nombre, uc.apellido), '') AS cerrado_por_nombre,
              NULLIF(concat_ws(' ', ur.nombre, ur.apellido), '') AS reabierto_por_nombre,
              (SELECT COUNT(*)::int FROM asistencia_diaria x WHERE x.periodo_id = p.id AND x.estatus = 'pendiente') AS dias_pendientes,
              (SELECT COUNT(*)::int FROM asistencia_ajustes_pendientes a WHERE a.periodo_id = p.id AND a.resuelto_en IS NULL) AS ajustes_pendientes,
              COUNT(*) OVER() AS total
       FROM asistencia_periodos p
       LEFT JOIN usuarios uc ON uc.id = p.cerrado_por
       LEFT JOIN usuarios ur ON ur.id = p.reabierto_por
       WHERE ($1::text IS NULL OR p.estado = $1::text)
       ORDER BY p.fecha_inicio DESC LIMIT $2 OFFSET $3`,
      [estado || null, limite, offset],
    );
    const filas = r.rows.map(sinTotal).map((f) => {
      if (esRH) return f;
      const publica = { ...f };
      delete publica.reabierto_motivo;
      delete publica.reabierto_por;
      delete publica.reabierto_por_nombre;
      delete publica.cerrado_por_nombre;
      delete publica.cerrado_por;
      return publica;
    });
    return { filas, total: r.rows[0] ? Number(r.rows[0].total) : 0 };
  },

  /** Empleados que el motor NO analiza: sin número de nómina o con una nómina compartida en el mismo periodo */
  async sinIdentificador({ analisisDesde, limite, offset }, cliente = grupo) {
    const r = await cliente.query(
      `SELECT e.id, ${NOMBRE_EMPLEADO}, e.estatus, e.departamento_id,
              to_char(e.fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso, to_char(e.fecha_baja, 'YYYY-MM-DD') AS fecha_baja,
              CASE WHEN e.numero_nomina IS NULL OR btrim(e.numero_nomina) = '' THEN 'sin_numero_nomina' ELSE 'nomina_duplicada' END AS motivo,
              COUNT(*) OVER() AS total
       FROM empleados e
       WHERE (e.fecha_baja IS NULL OR e.fecha_baja >= $1::date)
         AND (e.estatus IS DISTINCT FROM 'baja' OR e.fecha_baja IS NOT NULL)
         AND (e.numero_nomina IS NULL OR btrim(e.numero_nomina) = '' OR EXISTS (
               SELECT 1 FROM empleados o
               WHERE o.id <> e.id AND o.numero_nomina = e.numero_nomina
                 AND daterange(COALESCE(o.fecha_ingreso, '-infinity'::date), COALESCE(o.fecha_baja, 'infinity'::date), '[]')
                  && daterange(COALESCE(e.fecha_ingreso, '-infinity'::date), COALESCE(e.fecha_baja, 'infinity'::date), '[]')))
       ORDER BY e.apellido_paterno, e.nombre, e.id LIMIT $2 OFFSET $3`,
      [analisisDesde, limite, offset],
    );
    return { filas: r.rows.map(sinTotal), total: r.rows[0] ? Number(r.rows[0].total) : 0 };
  },

  async listarAjustes({ resueltos, limite, offset }, cliente = grupo) {
    const r = await cliente.query(
      `SELECT a.id, a.empleado_id, ${NOMBRE_EMPLEADO}, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, a.periodo_id, a.marca_id,
              a.motivo, a.detectado_en, a.resuelto_en, a.resuelto_por, a.nota_resolucion, COUNT(*) OVER() AS total
       FROM asistencia_ajustes_pendientes a JOIN empleados e ON e.id = a.empleado_id
       WHERE ($1::boolean IS TRUE AND a.resuelto_en IS NOT NULL) OR ($1::boolean IS NOT TRUE AND a.resuelto_en IS NULL)
       ORDER BY a.detectado_en DESC, a.id DESC LIMIT $2 OFFSET $3`,
      [resueltos === true, limite, offset],
    );
    return { filas: r.rows.map(sinTotal), total: r.rows[0] ? Number(r.rows[0].total) : 0 };
  },

  async obtenerAjuste(id, cliente = grupo) {
    const r = await cliente.query(
      `SELECT id, empleado_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, periodo_id, marca_id, motivo, resuelto_en FROM asistencia_ajustes_pendientes WHERE id = $1`,
      [id],
    );
    return r.rows[0] || null;
  },

  /** null si ya estaba resuelto o no existe */
  async resolverAjuste(id, usuarioId, nota, cliente = grupo) {
    const r = await cliente.query(
      `UPDATE asistencia_ajustes_pendientes SET resuelto_en = NOW(), resuelto_por = $2, nota_resolucion = $3
       WHERE id = $1 AND resuelto_en IS NULL
       RETURNING id, empleado_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, periodo_id, marca_id, motivo, resuelto_en, resuelto_por, nota_resolucion`,
      [id, usuarioId || null, nota || null],
    );
    return r.rows[0] || null;
  },

  /**
   * Justificación de RH sobre un día calculado. Todo en una transacción con el periodo bloqueado FOR SHARE: no se
   * puede cerrar mientras se inserta. Devuelve { codigo } si no procede.
   */
  async justificarDia({ empleadoId, fecha, motivo, usuarioId }) {
    const cliente = await grupo.connect();
    let errorRollback;
    try {
      await cliente.query("BEGIN");
      const dia = await cliente.query(
        `SELECT d.id, d.estatus, d.periodo_id FROM asistencia_diaria d WHERE d.empleado_id = $1 AND d.fecha = $2::date`,
        [empleadoId, fecha],
      );
      if (!dia.rows[0]) {
        await cliente.query("ROLLBACK");
        return { codigo: "sin_resultado" };
      }
      const periodo = await cliente.query("SELECT id, estado FROM asistencia_periodos WHERE id = $1 FOR SHARE", [dia.rows[0].periodo_id]);
      if (!periodo.rows[0] || periodo.rows[0].estado !== "abierto") {
        await cliente.query("ROLLBACK");
        return { codigo: "periodo_cerrado", periodo_id: dia.rows[0].periodo_id };
      }
      if (dia.rows[0].estatus === "justificada") {
        await cliente.query("ROLLBACK");
        return { codigo: "ya_justificada" };
      }
      if (!ESTATUS_JUSTIFICABLES.includes(dia.rows[0].estatus)) {
        await cliente.query("ROLLBACK");
        return { codigo: "no_justificable", estatus: dia.rows[0].estatus };
      }
      const previa = await cliente.query(
        `SELECT id FROM asistencia_incidencias WHERE empleado_id = $1 AND fecha = $2::date AND activa AND tipo = 'justificacion'`,
        [empleadoId, fecha],
      );
      if (previa.rows[0]) {
        await cliente.query("ROLLBACK");
        return { codigo: "ya_justificada" };
      }
      const r = await cliente.query(
        `INSERT INTO asistencia_incidencias (empleado_id, fecha, tipo, motivo, creado_por)
         VALUES ($1, $2::date, 'justificacion', $3, $4)
         RETURNING id, empleado_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, tipo, motivo, activa, creado_por, fecha_creacion`,
        [empleadoId, fecha, motivo, usuarioId || null],
      );
      await cliente.query("COMMIT");
      return { codigo: "ok", incidencia: r.rows[0], estatus_previo: dia.rows[0].estatus };
    } catch (error) {
      await cliente.query("ROLLBACK").catch((e) => {
        errorRollback = e;
      });
      // dos justificaciones simultáneas del mismo día: gana una (índice único parcial)
      if (error && error.code === "23505") return { codigo: "ya_justificada" };
      throw error;
    } finally {
      cliente.release(errorRollback);
    }
  },

  /** Anula (activa=false) una justificación; solo si el día pertenece a un periodo abierto */
  async anularIncidencia({ id }) {
    const cliente = await grupo.connect();
    let errorRollback;
    try {
      await cliente.query("BEGIN");
      const inc = await cliente.query(
        `SELECT i.id, i.empleado_id, to_char(i.fecha, 'YYYY-MM-DD') AS fecha, i.tipo, i.activa FROM asistencia_incidencias i WHERE i.id = $1 FOR UPDATE`,
        [id],
      );
      if (!inc.rows[0]) {
        await cliente.query("ROLLBACK");
        return { codigo: "no_existe" };
      }
      if (!inc.rows[0].activa) {
        await cliente.query("ROLLBACK");
        return { codigo: "ya_anulada" };
      }
      const periodo = await cliente.query(
        `SELECT id, estado FROM asistencia_periodos WHERE $1::date BETWEEN fecha_inicio AND fecha_fin FOR SHARE`,
        [inc.rows[0].fecha],
      );
      if (periodo.rows[0] && periodo.rows[0].estado !== "abierto") {
        await cliente.query("ROLLBACK");
        return { codigo: "periodo_cerrado", periodo_id: periodo.rows[0].id };
      }
      await cliente.query("UPDATE asistencia_incidencias SET activa = false, fecha_actualizacion = NOW() WHERE id = $1", [id]);
      await cliente.query("COMMIT");
      return { codigo: "ok", incidencia: inc.rows[0] };
    } catch (error) {
      await cliente.query("ROLLBACK").catch((e) => {
        errorRollback = e;
      });
      throw error;
    } finally {
      cliente.release(errorRollback);
    }
  },

  async obtenerDia(empleadoId, fecha, cliente = grupo) {
    const r = await cliente.query(
      `SELECT d.empleado_id, to_char(d.fecha, 'YYYY-MM-DD') AS fecha, d.estatus, d.minutos_retardo, d.minutos_salida_anticipada,
              d.periodo_id, d.incidencia_id, d.detalle
       FROM asistencia_diaria d WHERE d.empleado_id = $1 AND d.fecha = $2::date`,
      [empleadoId, fecha],
    );
    return r.rows[0] || null;
  },

  /**
   * Detalle de UN día: fila calculada con el snapshot del turno, las marcas del día local de México (más el día
   * siguiente si el turno cruza la medianoche), los cruces (vacaciones, permiso, festivo, justificación) y el estado
   * del periodo. null si el día no tiene resultado. `esRH` = false oculta quién justificó.
   */
  async detalleDia({ empleadoId, fecha, esRH = false }, cliente = grupo) {
    const d = await cliente.query(
      `SELECT d.id, d.empleado_id, to_char(d.fecha, 'YYYY-MM-DD') AS fecha, d.estatus, d.minutos_retardo, d.minutos_salida_anticipada,
              d.primera_marca, d.ultima_marca, d.turno_id, d.turno_nombre, d.origen_turno, d.departamento_id,
              to_char(d.entrada_programada, 'HH24:MI') AS entrada_programada, to_char(d.salida_programada, 'HH24:MI') AS salida_programada,
              d.cruza_medianoche, d.tolerancia_retardo_min, d.tolerancia_salida_min, d.umbral_falta_min,
              d.ventana_entrada_antes_min, d.ventana_entrada_despues_min, d.ventana_salida_antes_min, d.ventana_salida_despues_min,
              to_char(d.descanso_inicio, 'HH24:MI') AS descanso_inicio, d.descanso_min,
              d.periodo_id, d.marcas_usadas, d.detalle, d.version_calculo, d.calculado_en,
              d.solicitud_vacaciones_id, d.permiso_id, d.calendario_id, d.incidencia_id,
              p.estado AS periodo_estado, to_char(p.fecha_inicio, 'YYYY-MM-DD') AS periodo_inicio, to_char(p.fecha_fin, 'YYYY-MM-DD') AS periodo_fin,
              ${NOMBRE_EMPLEADO}, e.departamento_id AS departamento_actual_id, dep.nombre AS departamento
       FROM asistencia_diaria d
       JOIN empleados e ON e.id = d.empleado_id
       LEFT JOIN departamentos dep ON dep.id = e.departamento_id
       LEFT JOIN asistencia_periodos p ON p.id = d.periodo_id
       WHERE d.empleado_id = $1 AND d.fecha = $2::date`,
      [empleadoId, fecha],
    );
    const dia = d.rows[0];
    if (!dia) return null;
    const dias = dia.cruza_medianoche ? 2 : 1;
    const [marcas, vac, per, fes, inc] = await Promise.all([
      cliente.query(
        `SELECT m.id, m.marca_ts, m.terminal_alias${esRH ? ", m.terminal_sn" : ""}
         FROM asistencia_marcas m
         WHERE m.empleado_id = $1
           AND m.marca_ts >= ($2::date::timestamp AT TIME ZONE 'America/Mexico_City')
           AND m.marca_ts < (($2::date + $3::int)::timestamp AT TIME ZONE 'America/Mexico_City')
         ORDER BY m.marca_ts, m.id LIMIT ${LIMITE_MARCAS_DIA + 1}`,
        [empleadoId, fecha, dias],
      ),
      dia.solicitud_vacaciones_id
        ? cliente.query(
            `SELECT id, to_char(fecha_inicial, 'YYYY-MM-DD') AS fecha_inicial, to_char(fecha_final, 'YYYY-MM-DD') AS fecha_final, estatus
             FROM solicitudes_vacaciones WHERE id = $1`,
            [dia.solicitud_vacaciones_id],
          )
        : { rows: [] },
      dia.permiso_id
        ? cliente.query(
            `SELECT id, tipo, to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin, estatus
             FROM permisos_ausencia WHERE id = $1`,
            [dia.permiso_id],
          )
        : { rows: [] },
      dia.calendario_id
        ? cliente.query(`SELECT id, nombre, tipo FROM calendario_laboral WHERE id = $1`, [dia.calendario_id])
        : { rows: [] },
      cliente.query(
        `SELECT i.id, i.motivo, i.activa, i.fecha_creacion, ${esRH ? "NULLIF(concat_ws(' ', u.nombre, u.apellido), '')" : "NULL::text"} AS creado_por_nombre
         FROM asistencia_incidencias i LEFT JOIN usuarios u ON u.id = i.creado_por
         WHERE i.empleado_id = $1 AND i.fecha = $2::date AND i.tipo = 'justificacion' AND i.activa
         ORDER BY i.id DESC LIMIT 1`,
        [empleadoId, fecha],
      ),
    ]);
    const truncadas = marcas.rows.length > LIMITE_MARCAS_DIA;
    const lista = marcas.rows.slice(0, LIMITE_MARCAS_DIA);
    // El rol de cada marca lo calcula el MISMO código del motor (duplicados y ventana de comida guardada en el día)
    const roles = clasificarMarcas({
      fecha: dia.fecha,
      marcas: lista.map((m) => ({ id: m.id, ts: m.marca_ts })),
      marcasUsadas: dia.marcas_usadas,
      banderas: (dia.detalle && dia.detalle.banderas) || [],
      comida: (dia.detalle && dia.detalle.comida) || null,
      cruza: Boolean(dia.cruza_medianoche),
    });
    const fila = { ...dia };
    for (const interno of ["solicitud_vacaciones_id", "permiso_id", "calendario_id", "incidencia_id", "departamento_actual_id"]) delete fila[interno];
    return {
      dia: fila,
      marcas: lista.map((m) => ({ ...m, rol: roles[String(m.id)] || "otra" })),
      marcas_truncadas: truncadas,
      cruces: {
        vacaciones: vac.rows[0] || null,
        permiso: per.rows[0] || null,
        festivo: fes.rows[0] || null,
        justificacion: inc.rows[0] || null,
      },
    };
  },

  /** Bitácora de las últimas ejecuciones del motor (sin datos personales; el error ya es genérico: código o tipo) */
  async listarEjecuciones({ limite }, cliente = grupo) {
    const r = await cliente.query(
      `SELECT id, tipo, origen, estado, inicio, fin, to_char(desde, 'YYYY-MM-DD') AS desde, to_char(hasta, 'YYYY-MM-DD') AS hasta,
              empleados_evaluados, dias_evaluados, dias_modificados, marcas_vinculadas, periodos_cerrados, ajustes_nuevos,
              LEFT(error, 120) AS error
       FROM asistencia_ejecuciones ORDER BY inicio DESC, id DESC LIMIT $1`,
      [limite],
    );
    return r.rows;
  },

  /**
   * Contadores FRESCOS que se muestran al cerrar una quincena y que el servidor vuelve a comparar al cerrar:
   * días pendientes de calificar, ajustes sin resolver y empleados sin identificador. null si el periodo no existe.
   */
  async contadoresCierre(periodoId, analisisDesde, cliente = grupo) {
    const p = await cliente.query(
      `SELECT p.estado,
              (SELECT COUNT(*)::int FROM asistencia_diaria d WHERE d.periodo_id = p.id AND d.estatus = 'pendiente') AS dias_pendientes,
              (SELECT COUNT(*)::int FROM asistencia_ajustes_pendientes a WHERE a.periodo_id = p.id AND a.resuelto_en IS NULL) AS ajustes_pendientes
       FROM asistencia_periodos p WHERE p.id = $1`,
      [periodoId],
    );
    if (!p.rows[0]) return null;
    const sin = await AsistenciaResultados.sinIdentificador({ analisisDesde, limite: 1, offset: 0 }, cliente);
    return { estado: p.rows[0].estado, dias_pendientes: p.rows[0].dias_pendientes, ajustes_pendientes: p.rows[0].ajustes_pendientes, sin_identificador: sin.total };
  },

  async empleadoExiste(id, cliente = grupo) {
    const r = await cliente.query("SELECT id FROM empleados WHERE id = $1", [id]);
    return Boolean(r.rows[0]);
  },
};

module.exports = AsistenciaResultados;
