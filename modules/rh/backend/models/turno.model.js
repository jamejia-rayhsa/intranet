const { grupo } = require("../config/database");

// Las horas salen como 'HH24:MI' y las fechas como 'YYYY-MM-DD' (texto): sin Date de por medio, sin
// desfase de zona. Las horas son locales America/Mexico_City (TIME sin zona).
const COLUMNAS_TURNO = `t.id, t.nombre, t.descripcion, t.activo, t.tolerancia_retardo_min,
  t.umbral_falta_min, t.tolerancia_salida_min, t.ventana_entrada_antes_min, t.ventana_entrada_despues_min,
  t.ventana_salida_antes_min, t.ventana_salida_despues_min, to_char(t.descanso_inicio, 'HH24:MI') AS descanso_inicio,
  t.descanso_min, t.creado_por, t.fecha_creacion, t.fecha_actualizacion`;
// nocturno se DERIVA del detalle: algún día laborable cruza la medianoche
const NOCTURNO = `COALESCE((SELECT bool_or(d.cruza_medianoche) FROM turno_dias d WHERE d.turno_id = t.id), false) AS nocturno`;
const COLUMNAS_DIA = `dia_semana, laborable, to_char(hora_entrada, 'HH24:MI') AS hora_entrada,
  to_char(hora_salida, 'HH24:MI') AS hora_salida, cruza_medianoche,
  CASE WHEN laborable THEN (EXTRACT(EPOCH FROM (hora_salida - hora_entrada)) / 60)::int
         + CASE WHEN cruza_medianoche THEN 1440 ELSE 0 END END AS duracion_min`;

const Turno = {
  // Ejecuta fn(cliente) dentro de BEGIN/COMMIT; ante cualquier error hace ROLLBACK y lo relanza.
  async enTransaccion(fn) {
    const cliente = await grupo.connect();
    let errorRollback;
    try {
      await cliente.query("BEGIN");
      const resultado = await fn(cliente);
      await cliente.query("COMMIT");
      return resultado;
    } catch (error) {
      await cliente.query("ROLLBACK").catch((e) => {
        errorRollback = e;
      });
      throw error;
    } finally {
      cliente.release(errorRollback);
    }
  },

  async listar({ activo } = {}, cliente = grupo) {
    const valores = [];
    let donde = "";
    if (activo !== undefined) {
      valores.push(activo);
      donde = "WHERE t.activo = $1";
    }
    const resultado = await cliente.query(
      `SELECT ${COLUMNAS_TURNO}, ${NOCTURNO},
              (SELECT COUNT(*)::int FROM turno_dias d WHERE d.turno_id = t.id AND d.laborable) AS dias_laborables
       FROM turnos t ${donde} ORDER BY t.nombre, t.id`,
      valores,
    );
    return resultado.rows;
  },

  // Turno con su detalle por día (7 filas, lunes a domingo); null si no existe
  async obtenerPorId(id, cliente = grupo) {
    const turno = await cliente.query(`SELECT ${COLUMNAS_TURNO}, ${NOCTURNO} FROM turnos t WHERE t.id = $1`, [id]);
    if (!turno.rows[0]) return null;
    const dias = await cliente.query(
      `SELECT ${COLUMNAS_DIA} FROM turno_dias WHERE turno_id = $1 ORDER BY dia_semana`,
      [id],
    );
    return { ...turno.rows[0], dias: dias.rows };
  },

  async _escribirDias(cliente, turnoId, dias) {
    await cliente.query("DELETE FROM turno_dias WHERE turno_id = $1", [turnoId]);
    await cliente.query(
      `INSERT INTO turno_dias (turno_id, dia_semana, laborable, hora_entrada, hora_salida, cruza_medianoche)
       SELECT $1, d.dia_semana, d.laborable, d.hora_entrada::time, d.hora_salida::time, d.cruza_medianoche
       FROM unnest($2::int[], $3::boolean[], $4::text[], $5::text[], $6::boolean[])
         AS d(dia_semana, laborable, hora_entrada, hora_salida, cruza_medianoche)`,
      [
        turnoId,
        dias.map((d) => d.dia_semana),
        dias.map((d) => d.laborable),
        dias.map((d) => d.hora_entrada),
        dias.map((d) => d.hora_salida),
        dias.map((d) => d.cruza_medianoche),
      ],
    );
  },

  async crear(datos) {
    const { nombre, descripcion, dias, creado_por } = datos;
    const n = (campo) => (datos[campo] === undefined ? null : datos[campo]);
    return Turno.enTransaccion(async (cliente) => {
      const insertado = await cliente.query(
        `INSERT INTO turnos (nombre, descripcion, activo, tolerancia_retardo_min, umbral_falta_min, tolerancia_salida_min,
           ventana_entrada_antes_min, ventana_entrada_despues_min, ventana_salida_antes_min, ventana_salida_despues_min,
           descanso_inicio, descanso_min, creado_por)
         VALUES ($1, $2, COALESCE($3, true), COALESCE($4, 10), COALESCE($5, 30), COALESCE($6, 0),
           COALESCE($7, 60), COALESCE($8, 150), COALESCE($9, 5), COALESCE($10, 359), $11::time, COALESCE($12, 0), $13)
         RETURNING id`,
        [
          nombre,
          descripcion || null,
          n("activo"),
          n("tolerancia_retardo_min"),
          n("umbral_falta_min"),
          n("tolerancia_salida_min"),
          n("ventana_entrada_antes_min"),
          n("ventana_entrada_despues_min"),
          n("ventana_salida_antes_min"),
          n("ventana_salida_despues_min"),
          datos.descanso_inicio || null,
          n("descanso_min"),
          creado_por || null,
        ],
      );
      const id = insertado.rows[0].id;
      await Turno._escribirDias(cliente, id, dias);
      return Turno.obtenerPorId(id, cliente);
    });
  },

  // Solo actualiza los campos presentes; si viene `dias` reemplaza el detalle completo. null si no existe.
  async actualizar(id, datos) {
    return Turno.enTransaccion(async (cliente) => {
      const bloqueado = await cliente.query("SELECT id FROM turnos WHERE id = $1 FOR UPDATE", [id]);
      if (!bloqueado.rows[0]) return null;
      const sets = [];
      const valores = [];
      for (const campo of [
        "nombre",
        "descripcion",
        "activo",
        "tolerancia_retardo_min",
        "umbral_falta_min",
        "tolerancia_salida_min",
        "ventana_entrada_antes_min",
        "ventana_entrada_despues_min",
        "ventana_salida_antes_min",
        "ventana_salida_despues_min",
        "descanso_inicio",
        "descanso_min",
      ]) {
        if (datos[campo] !== undefined) {
          valores.push(datos[campo]);
          sets.push(campo === "descanso_inicio" ? `${campo} = $${valores.length}::time` : `${campo} = $${valores.length}`);
        }
      }
      sets.push("fecha_actualizacion = NOW()");
      valores.push(id);
      await cliente.query(`UPDATE turnos SET ${sets.join(", ")} WHERE id = $${valores.length}`, valores);
      if (datos.dias) await Turno._escribirDias(cliente, id, datos.dias);
      return Turno.obtenerPorId(id, cliente);
    });
  },

  // Borra el turno (y su detalle por CASCADE). Con asignaciones o asistencia calculada la FK lo
  // impide (23503); en ese caso se desactiva. Devuelve el turno borrado o null si no existe.
  async eliminar(id) {
    return Turno.enTransaccion(async (cliente) => {
      const previo = await Turno.obtenerPorId(id, cliente);
      if (!previo) return null;
      await cliente.query("DELETE FROM turnos WHERE id = $1", [id]);
      return previo;
    });
  },

  /** Fecha de hoy (YYYY-MM-DD) en America/Mexico_City, calculada por la BD. */
  async hoyMexico(cliente = grupo) {
    const r = await cliente.query(
      `SELECT to_char((now() AT TIME ZONE 'America/Mexico_City')::date, 'YYYY-MM-DD') AS hoy`,
    );
    return r.rows[0].hoy;
  },

  /**
   * Turno efectivo de un empleado en una fecha: la asignación individual vigente; si no hay, la del
   * departamento ACTUAL del empleado vigente ese día (no existe historial de departamentos). Función
   * reutilizable por el motor de cálculo (Fase 4); `cliente` puede ser de una transacción.
   * @param {number|string} empleadoId
   * @param {string} fecha 'YYYY-MM-DD'
   * @returns {Promise<null|{origen:'empleado'|'departamento', asignacion_id:number,
   *   vigente_desde:string, vigente_hasta:string|null, turno:object}>} null si no tiene turno
   */
  async obtenerEfectivo(empleadoId, fecha, cliente = grupo) {
    const columnas = `a.id AS asignacion_id, a.turno_id,
      to_char(a.vigente_desde, 'YYYY-MM-DD') AS vigente_desde,
      to_char(a.vigente_hasta, 'YYYY-MM-DD') AS vigente_hasta`;
    const individual = await cliente.query(
      `SELECT ${columnas} FROM turno_empleado a
       WHERE a.empleado_id = $1
         AND $2::date BETWEEN a.vigente_desde AND COALESCE(a.vigente_hasta, 'infinity'::date)
       LIMIT 1`,
      [empleadoId, fecha],
    );
    let fila = individual.rows[0];
    let origen = "empleado";
    if (!fila) {
      const departamento = await cliente.query(
        `SELECT ${columnas}
         FROM empleados e
         JOIN turno_departamento a ON a.departamento_id = e.departamento_id
         WHERE e.id = $1
           AND $2::date BETWEEN a.vigente_desde AND COALESCE(a.vigente_hasta, 'infinity'::date)
         LIMIT 1`,
        [empleadoId, fecha],
      );
      fila = departamento.rows[0];
      origen = "departamento";
    }
    if (!fila) return null;
    const turno = await Turno.obtenerPorId(fila.turno_id, cliente);
    return {
      origen,
      asignacion_id: fila.asignacion_id,
      vigente_desde: fila.vigente_desde,
      vigente_hasta: fila.vigente_hasta,
      turno,
    };
  },
};

module.exports = Turno;
