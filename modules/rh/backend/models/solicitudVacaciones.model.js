const { grupo } = require("../config/database");

const SolicitudVacaciones = {
  async calcularDiasPeriodo(antiguedad) {
    const consulta = `
      SELECT dias_vacaciones FROM tabla_calculo_vacaciones
      WHERE anios_inicio <= $1 AND anios_fin >= $1
      LIMIT 1
    `;
    const resultado = await grupo.query(consulta, [antiguedad]);
    if (resultado.rows.length === 0) return 0;
    return resultado.rows[0].dias_vacaciones;
  },

  async calcularDisfrutados(empleadoId, periodo) {
    const consulta = `
      SELECT COALESCE(SUM(dias_a_disfrutar), 0) AS total
      FROM solicitudes_vacaciones
      WHERE empleado_id = $1 AND periodo = $2 AND estatus = 'aprobado'
    `;
    const resultado = await grupo.query(consulta, [empleadoId, periodo]);
    return parseInt(resultado.rows[0].total);
  },

  async calcularSaldo(empleadoId, periodo) {
    const Empleado = require("./empleado.model");
    const empleado = await Empleado.obtenerPorId(empleadoId);
    if (!empleado) return null;

    const fechaIngreso = empleado.fecha_ingreso
      ? new Date(empleado.fecha_ingreso)
      : null;

    let antiguedad = 0;
    if (fechaIngreso) {
      const anioReferencia = parseInt(periodo) || new Date().getFullYear();
      antiguedad = anioReferencia - fechaIngreso.getFullYear();
      if (antiguedad < 1) antiguedad = 1;
    }

    const dias_periodo = await this.calcularDiasPeriodo(antiguedad);
    const dias_disfrutados = await this.calcularDisfrutados(empleadoId, periodo);
    const dias_pendientes = dias_periodo - dias_disfrutados;

    return { dias_periodo, dias_disfrutados, dias_pendientes, antiguedad };
  },

  async crear(datos) {
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
        dias_a_disfrutar, dias_pendientes_final, observaciones
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
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
    ];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerPorId(id) {
    const consulta = "SELECT * FROM solicitudes_vacaciones WHERE id = $1";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async listar(filtros = {}) {
    let consulta = "SELECT * FROM solicitudes_vacaciones WHERE 1=1";
    const valores = [];
    let contador = 1;

    if (!filtros.ver_todo) {
      if (filtros.empleado_o_jefe_id) {
        consulta += ` AND (empleado_id = $${contador} OR jefe_inmediato_id = $${contador})`;
        valores.push(filtros.empleado_o_jefe_id);
        contador++;
      } else if (filtros.empleado_id) {
        consulta += ` AND empleado_id = $${contador}`;
        valores.push(filtros.empleado_id);
        contador++;
      }
    }

    if (filtros.estatus) {
      consulta += ` AND estatus = $${contador}`;
      valores.push(filtros.estatus);
      contador++;
    }

    if (filtros.periodo) {
      consulta += ` AND periodo = $${contador}`;
      valores.push(filtros.periodo);
      contador++;
    }

    if (filtros.busqueda) {
      consulta += ` AND (nombre ILIKE $${contador} OR apellido_paterno ILIKE $${contador} OR numero_nomina ILIKE $${contador})`;
      valores.push(`%${filtros.busqueda}%`);
      contador++;
    }

    consulta += " ORDER BY fecha_solicitud DESC";

    if (filtros.limite) {
      const desplazamiento = ((filtros.pagina || 1) - 1) * filtros.limite;
      consulta += ` LIMIT $${contador} OFFSET $${contador + 1}`;
      valores.push(filtros.limite, desplazamiento);
    }

    const resultado = await grupo.query(consulta, valores);
    return resultado.rows;
  },

  async contar(filtros = {}) {
    let consulta = "SELECT COUNT(*) FROM solicitudes_vacaciones WHERE 1=1";
    const valores = [];
    let contador = 1;

    if (!filtros.ver_todo) {
      if (filtros.empleado_o_jefe_id) {
        consulta += ` AND (empleado_id = $${contador} OR jefe_inmediato_id = $${contador})`;
        valores.push(filtros.empleado_o_jefe_id);
        contador++;
      } else if (filtros.empleado_id) {
        consulta += ` AND empleado_id = $${contador}`;
        valores.push(filtros.empleado_id);
        contador++;
      }
    }

    if (filtros.estatus) {
      consulta += ` AND estatus = $${contador}`;
      valores.push(filtros.estatus);
      contador++;
    }

    if (filtros.periodo) {
      consulta += ` AND periodo = $${contador}`;
      valores.push(filtros.periodo);
      contador++;
    }

    if (filtros.busqueda) {
      consulta += ` AND (nombre ILIKE $${contador} OR apellido_paterno ILIKE $${contador} OR numero_nomina ILIKE $${contador})`;
      valores.push(`%${filtros.busqueda}%`);
      contador++;
    }

    const resultado = await grupo.query(consulta, valores);
    return parseInt(resultado.rows[0].count);
  },

  async responder(id, estatus, autorizaId, autorizaNombre, motivoRechazo) {
    const consulta = `
      UPDATE solicitudes_vacaciones
      SET estatus = $1, autoriza_id = $2, autoriza_nombre = $3,
          motivo_rechazo = $4, fecha_autoriza = NOW()
      WHERE id = $5
      RETURNING *
    `;
    const resultado = await grupo.query(consulta, [
      estatus,
      autorizaId || null,
      autorizaNombre || null,
      motivoRechazo || null,
      id,
    ]);
    return resultado.rows[0];
  },

  async tieneTraslape(empleadoId, fechaInicial, fechaFinal, excluirId = null) {
    let consulta = `
      SELECT COUNT(*) FROM solicitudes_vacaciones
      WHERE empleado_id = $1
        AND estatus IN ('pendiente', 'aprobado')
        AND fecha_inicial <= $2
        AND fecha_final >= $3
    `;
    const valores = [empleadoId, fechaFinal, fechaInicial];

    if (excluirId) {
      consulta += " AND id != $4";
      valores.push(excluirId);
    }

    const resultado = await grupo.query(consulta, valores);
    return parseInt(resultado.rows[0].count) > 0;
  },
};

module.exports = SolicitudVacaciones;
