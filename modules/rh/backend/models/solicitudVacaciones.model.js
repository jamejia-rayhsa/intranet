const { grupo } = require("../config/database");
const { anioDeFecha } = require("../utils/diasHabiles");

// pg devuelve DATE como Date a medianoche LOCAL (getFullYear local es correcto); un texto
// 'YYYY-MM-DD' se lee tal cual, sin pasar por new Date(texto) (que es UTC y puede dar el año anterior).
function anioDeIngreso(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor.getFullYear();
  return anioDeFecha(String(valor).slice(0, 10));
}

// Espacio de claves de los candados de aplicación por empleado (pg_advisory_xact_lock(int, int))
const ESPACIO_BLOQUEO_EMPLEADO = 4217;

const SolicitudVacaciones = {
  // Ejecuta fn(cliente) dentro de BEGIN/COMMIT; ante cualquier error hace ROLLBACK y lo relanza.
  async enTransaccion(fn) {
    const cliente = await grupo.connect();
    // Si el ROLLBACK falla la conexión puede estar rota: se entrega a release(error) para que el
    // pool la destruya en vez de reutilizarla.
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

  // Candado de la transacción por empleado (se libera solo en COMMIT/ROLLBACK). Serializa crear y
  // aprobar del MISMO empleado aunque no tenga departamento. Orden de bloqueos de todo el módulo:
  // empleado (este) -> solicitud (FOR UPDATE) -> departamento (FOR UPDATE); nunca al revés.
  async bloquearEmpleado(empleadoId, cliente) {
    await cliente.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [
      ESPACIO_BLOQUEO_EMPLEADO,
      empleadoId,
    ]);
  },

  // Lectura SIN bloqueo del empleado dueño de la solicitud (para tomar su candado antes que el de la fila)
  async empleadoIdDeSolicitud(id, cliente = grupo) {
    const resultado = await cliente.query(
      "SELECT empleado_id FROM solicitudes_vacaciones WHERE id = $1",
      [id],
    );
    return resultado.rows[0] ? resultado.rows[0].empleado_id : null;
  },

  // Jefe inmediato VIGENTE del empleado (empleados.jefe_inmediato_id hoy), o null. Lectura sin bloqueo:
  // quien autoriza es el jefe vigente al momento de responder, no el guardado en la solicitud.
  async jefeVigenteDeEmpleado(empleadoId, cliente = grupo) {
    if (empleadoId === null || empleadoId === undefined) return null;
    const resultado = await cliente.query(
      "SELECT jefe_inmediato_id FROM empleados WHERE id = $1",
      [empleadoId],
    );
    return resultado.rows[0] ? resultado.rows[0].jefe_inmediato_id : null;
  },

  // Bloquea la fila del departamento (serializa crear/aprobar por departamento).
  // Devuelve { id, cupo_vacaciones } o null si no existe.
  async bloquearDepartamento(departamentoId, cliente = grupo) {
    const resultado = await cliente.query(
      "SELECT id, cupo_vacaciones FROM departamentos WHERE id = $1 FOR UPDATE",
      [departamentoId],
    );
    return resultado.rows[0] || null;
  },

  async obtenerCupoDepartamento(departamentoId, cliente = grupo) {
    const resultado = await cliente.query(
      "SELECT cupo_vacaciones FROM departamentos WHERE id = $1",
      [departamentoId],
    );
    return resultado.rows[0] ? resultado.rows[0].cupo_vacaciones : null;
  },

  // Solicitud con la fila bloqueada y las fechas como texto (fecha_inicial_txt / fecha_final_txt)
  async obtenerParaResponder(id, cliente = grupo) {
    const resultado = await cliente.query(
      `SELECT *, to_char(fecha_inicial, 'YYYY-MM-DD') AS fecha_inicial_txt,
              to_char(fecha_final, 'YYYY-MM-DD') AS fecha_final_txt
       FROM solicitudes_vacaciones WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return resultado.rows[0];
  },

  /**
   * Aprobadas del departamento que cubren cada día del rango [desde, hasta]: Map 'YYYY-MM-DD' -> n.
   * Solo cuenta, nunca devuelve quién. excluirId deja fuera la propia solicitud.
   */
  async ocupacionPorDia(departamentoId, desde, hasta, excluirId = null, cliente = grupo) {
    const valores = [departamentoId, desde, hasta];
    let exclusion = "";
    if (excluirId) {
      valores.push(excluirId);
      exclusion = "AND s.id <> $4";
    }
    const resultado = await cliente.query(
      `SELECT to_char(d.dia, 'YYYY-MM-DD') AS fecha, COUNT(*)::int AS ocupados
       FROM solicitudes_vacaciones s
       CROSS JOIN LATERAL generate_series(
         GREATEST(s.fecha_inicial, $2::date)::timestamp,
         LEAST(s.fecha_final, $3::date)::timestamp,
         interval '1 day'
       ) AS d(dia)
       WHERE s.departamento_id = $1
         AND s.estatus = 'aprobado'
         AND s.fecha_inicial <= $3::date
         AND s.fecha_final >= $2::date
         ${exclusion}
       GROUP BY 1`,
      valores,
    );
    return new Map(resultado.rows.map((fila) => [fila.fecha, fila.ocupados]));
  },

  async calcularDiasPeriodo(antiguedad, cliente = grupo) {
    const consulta = `
      SELECT dias_vacaciones FROM tabla_calculo_vacaciones
      WHERE anios_inicio <= $1 AND anios_fin >= $1
      LIMIT 1
    `;
    const resultado = await cliente.query(consulta, [antiguedad]);
    if (resultado.rows.length === 0) return 0;
    return resultado.rows[0].dias_vacaciones;
  },

  async calcularDisfrutados(empleadoId, periodo, cliente = grupo) {
    const consulta = `
      SELECT COALESCE(SUM(dias_a_disfrutar), 0) AS total
      FROM solicitudes_vacaciones
      WHERE empleado_id = $1 AND periodo = $2 AND estatus = 'aprobado'
    `;
    const resultado = await cliente.query(consulta, [empleadoId, periodo]);
    return parseInt(resultado.rows[0].total);
  },

  async calcularSaldo(empleadoId, periodo, cliente = grupo) {
    const Empleado = require("./empleado.model");
    const empleado = await Empleado.obtenerPorId(empleadoId, cliente);
    if (!empleado) return null;

    const anioIngreso = anioDeIngreso(empleado.fecha_ingreso);

    let antiguedad = 0;
    if (anioIngreso !== null) {
      const anioReferencia = parseInt(periodo) || new Date().getFullYear();
      antiguedad = anioReferencia - anioIngreso;
      if (antiguedad < 1) antiguedad = 1;
    }

    const dias_periodo = await this.calcularDiasPeriodo(antiguedad, cliente);
    const dias_disfrutados = await this.calcularDisfrutados(empleadoId, periodo, cliente);
    const dias_pendientes = dias_periodo - dias_disfrutados;

    return { dias_periodo, dias_disfrutados, dias_pendientes, antiguedad };
  },

  async crear(datos, cliente = grupo) {
    const {
      empleado_id,
      numero_nomina,
      nombre,
      apellido_paterno,
      apellido_materno,
      fecha_imss,
      antiguedad,
      ubicacion,
      departamento,
      departamento_id,
      jefe_inmediato_id,
      jefe_nombre,
      fecha_inicial,
      fecha_final,
      fecha_regreso,
      periodo,
      dias_periodo,
      dias_disfrutados,
      dias_pendientes_inicial,
      dias_a_disfrutar,
      dias_pendientes_final,
      observaciones,
    } = datos;

    const consulta = `
      INSERT INTO solicitudes_vacaciones (
        empleado_id, numero_nomina, nombre, apellido_paterno, apellido_materno,
        fecha_imss, antiguedad, ubicacion, departamento,
        jefe_inmediato_id, jefe_nombre,
        fecha_inicial, fecha_final, fecha_regreso,
        periodo, dias_periodo, dias_disfrutados, dias_pendientes_inicial,
        dias_a_disfrutar, dias_pendientes_final, observaciones, departamento_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      ) RETURNING *
    `;
    const valores = [
      empleado_id,
      numero_nomina || null,
      nombre,
      apellido_paterno,
      apellido_materno || null,
      fecha_imss || null,
      antiguedad,
      ubicacion || null,
      departamento || null,
      jefe_inmediato_id || null,
      jefe_nombre || null,
      fecha_inicial,
      fecha_final,
      fecha_regreso || null,
      periodo,
      dias_periodo,
      dias_disfrutados,
      dias_pendientes_inicial,
      dias_a_disfrutar,
      dias_pendientes_final,
      observaciones || null,
      departamento_id || null,
    ];
    const resultado = await cliente.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerPorId(id) {
    // jefe_vigente_id = jefe inmediato ACTUAL del empleado (quien autoriza); jefe_inmediato_id sigue
    // siendo el dato histórico guardado al crear
    const consulta = `
      SELECT s.*, e.jefe_inmediato_id AS jefe_vigente_id
      FROM solicitudes_vacaciones s
      LEFT JOIN empleados e ON e.id = s.empleado_id
      WHERE s.id = $1`;
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async listar(filtros = {}) {
    let consulta = `SELECT s.*, e.jefe_inmediato_id AS jefe_vigente_id
      FROM solicitudes_vacaciones s
      LEFT JOIN empleados e ON e.id = s.empleado_id
      WHERE 1=1`;
    const valores = [];
    let contador = 1;

    if (!filtros.ver_todo) {
      if (filtros.empleado_o_jefe_id) {
        consulta += ` AND (s.empleado_id = $${contador} OR e.jefe_inmediato_id = $${contador})`;
        valores.push(filtros.empleado_o_jefe_id);
        contador++;
      } else if (filtros.empleado_id) {
        consulta += ` AND s.empleado_id = $${contador}`;
        valores.push(filtros.empleado_id);
        contador++;
      }
    }

    if (filtros.estatus) {
      consulta += ` AND s.estatus = $${contador}`;
      valores.push(filtros.estatus);
      contador++;
    }

    if (filtros.periodo) {
      consulta += ` AND s.periodo = $${contador}`;
      valores.push(filtros.periodo);
      contador++;
    }

    if (filtros.busqueda) {
      consulta += ` AND (s.nombre ILIKE $${contador} OR s.apellido_paterno ILIKE $${contador} OR s.numero_nomina ILIKE $${contador})`;
      valores.push(`%${filtros.busqueda}%`);
      contador++;
    }

    consulta += " ORDER BY s.fecha_solicitud DESC";

    if (filtros.limite) {
      const desplazamiento = ((filtros.pagina || 1) - 1) * filtros.limite;
      consulta += ` LIMIT $${contador} OFFSET $${contador + 1}`;
      valores.push(filtros.limite, desplazamiento);
    }

    const resultado = await grupo.query(consulta, valores);
    return resultado.rows;
  },

  async contar(filtros = {}) {
    let consulta = `SELECT COUNT(*) FROM solicitudes_vacaciones s
      LEFT JOIN empleados e ON e.id = s.empleado_id
      WHERE 1=1`;
    const valores = [];
    let contador = 1;

    if (!filtros.ver_todo) {
      if (filtros.empleado_o_jefe_id) {
        consulta += ` AND (s.empleado_id = $${contador} OR e.jefe_inmediato_id = $${contador})`;
        valores.push(filtros.empleado_o_jefe_id);
        contador++;
      } else if (filtros.empleado_id) {
        consulta += ` AND s.empleado_id = $${contador}`;
        valores.push(filtros.empleado_id);
        contador++;
      }
    }

    if (filtros.estatus) {
      consulta += ` AND s.estatus = $${contador}`;
      valores.push(filtros.estatus);
      contador++;
    }

    if (filtros.periodo) {
      consulta += ` AND s.periodo = $${contador}`;
      valores.push(filtros.periodo);
      contador++;
    }

    if (filtros.busqueda) {
      consulta += ` AND (s.nombre ILIKE $${contador} OR s.apellido_paterno ILIKE $${contador} OR s.numero_nomina ILIKE $${contador})`;
      valores.push(`%${filtros.busqueda}%`);
      contador++;
    }

    const resultado = await grupo.query(consulta, valores);
    return parseInt(resultado.rows[0].count);
  },

  // Guardia de estado en SQL: solo cambia solicitudes aún pendientes (undefined si ya no lo está)
  async responder(id, estatus, autorizaId, autorizaNombre, motivoRechazo, cliente = grupo) {
    const consulta = `
      UPDATE solicitudes_vacaciones
      SET estatus = $1, autoriza_id = $2, autoriza_nombre = $3,
          motivo_rechazo = $4, fecha_autoriza = NOW()
      WHERE id = $5 AND estatus = 'pendiente'
      RETURNING *
    `;
    const resultado = await cliente.query(consulta, [
      estatus,
      autorizaId || null,
      autorizaNombre || null,
      motivoRechazo || null,
      id,
    ]);
    return resultado.rows[0];
  },

  async tieneTraslape(empleadoId, fechaInicial, fechaFinal, excluirId = null, cliente = grupo) {
    let consulta = `
      SELECT COUNT(*) FROM solicitudes_vacaciones
      WHERE empleado_id = $1
        AND estatus IN ('pendiente', 'aprobado')
        AND fecha_inicial <= $2::date
        AND fecha_final >= $3::date
    `;
    const valores = [empleadoId, fechaFinal, fechaInicial];

    if (excluirId) {
      consulta += " AND id != $4";
      valores.push(excluirId);
    }

    const resultado = await cliente.query(consulta, valores);
    return parseInt(resultado.rows[0].count) > 0;
  },
};

module.exports = SolicitudVacaciones;
