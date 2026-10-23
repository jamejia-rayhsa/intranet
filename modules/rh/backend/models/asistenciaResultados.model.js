// Lecturas y escrituras de la API del motor de asistencia (resultados por día, resumen, periodos, ajustes
// pendientes, incidencias de RH). El cálculo vive en services/asistencia/; aquí solo hay consultas acotadas.
const { grupo } = require("../../../portal/backend/config/database");

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

  /** Conteos por empleado y estatus */
  async resumen({ ids, departamentoId, desde, hasta, limite, offset }, cliente = grupo) {
    const conteos = ESTATUS.map((s) => `COUNT(*) FILTER (WHERE d.estatus = '${s}')::int AS ${s}`).join(", ");
    const r = await cliente.query(
      `SELECT d.empleado_id, ${NOMBRE_EMPLEADO}, e.departamento_id, ${conteos},
              COUNT(*)::int AS dias, COALESCE(SUM(d.minutos_retardo) FILTER (WHERE d.estatus IN ('retardo', 'justificada')), 0)::int AS minutos_retardo,
              COALESCE(SUM(d.minutos_salida_anticipada), 0)::int AS minutos_salida_anticipada,
              COUNT(*) OVER() AS total
       FROM asistencia_diaria d
       JOIN empleados e ON e.id = d.empleado_id
       WHERE d.fecha BETWEEN $2::date AND $3::date
         AND ($1::int[] IS NULL OR d.empleado_id = ANY($1::int[]))
         AND ($4::int IS NULL OR e.departamento_id = $4::int)
       GROUP BY d.empleado_id, e.id
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
              (SELECT COUNT(*)::int FROM asistencia_ajustes_pendientes a WHERE a.periodo_id = p.id AND a.resuelto_en IS NULL) AS ajustes_pendientes,
              COUNT(*) OVER() AS total
       FROM asistencia_periodos p
       WHERE ($1::text IS NULL OR p.estado = $1::text)
       ORDER BY p.fecha_inicio DESC LIMIT $2 OFFSET $3`,
      [estado || null, limite, offset],
    );
    const filas = r.rows.map(sinTotal).map((f) => {
      if (esRH) return f;
      const publica = { ...f };
      delete publica.reabierto_motivo;
      delete publica.reabierto_por;
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

  async empleadoExiste(id, cliente = grupo) {
    const r = await cliente.query("SELECT id FROM empleados WHERE id = $1", [id]);
    return Boolean(r.rows[0]);
  },
};

module.exports = AsistenciaResultados;
