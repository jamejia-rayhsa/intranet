const { grupo } = require("../config/database");

const PermisoAusencia = {
  async crear(datos) {
    const { empleado_id, tipo, fecha_inicio, fecha_fin, motivo } = datos;
    const consulta = `
      INSERT INTO permisos_ausencia (empleado_id, tipo, fecha_inicio, fecha_fin, motivo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const valores = [
      empleado_id,
      tipo,
      fecha_inicio,
      fecha_fin,
      motivo || null,
    ];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerPorId(id) {
    const consulta = `
      SELECT p.*,
        e.nombre as empleado_nombre, e.apellido as empleado_apellido
      FROM permisos_ausencia p
      INNER JOIN empleados e ON p.empleado_id = e.id
      WHERE p.id = $1
    `;
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async listar(filtros = {}) {
    let consulta = `
      SELECT p.*,
        e.nombre as empleado_nombre, e.apellido as empleado_apellido
      FROM permisos_ausencia p
      INNER JOIN empleados e ON p.empleado_id = e.id
      WHERE 1=1
    `;
    const valores = [];
    let contador = 1;

    if (filtros.empleado_id) {
      consulta += ` AND p.empleado_id = $${contador}`;
      valores.push(filtros.empleado_id);
      contador++;
    }

    if (filtros.estatus) {
      consulta += ` AND p.estatus = $${contador}`;
      valores.push(filtros.estatus);
      contador++;
    }

    if (filtros.tipo) {
      consulta += ` AND p.tipo = $${contador}`;
      valores.push(filtros.tipo);
      contador++;
    }

    if (filtros.jefe_id) {
      consulta += ` AND e.jefe_inmediato_id = $${contador}`;
      valores.push(filtros.jefe_id);
      contador++;
    }

    consulta += " ORDER BY p.fecha_solicitud DESC";

    if (filtros.limite) {
      const desplazamiento = ((filtros.pagina || 1) - 1) * filtros.limite;
      consulta += ` LIMIT $${contador} OFFSET $${contador + 1}`;
      valores.push(filtros.limite, desplazamiento);
    }

    const resultado = await grupo.query(consulta, valores);
    return resultado.rows;
  },

  async contar(filtros = {}) {
    let consulta = "SELECT COUNT(*) FROM permisos_ausencia WHERE 1=1";
    const valores = [];
    let contador = 1;

    if (filtros.empleado_id) {
      consulta += ` AND empleado_id = $${contador}`;
      valores.push(filtros.empleado_id);
      contador++;
    }

    if (filtros.estatus) {
      consulta += ` AND estatus = $${contador}`;
      valores.push(filtros.estatus);
      contador++;
    }

    const resultado = await grupo.query(consulta, valores);
    return parseInt(resultado.rows[0].count);
  },

  async responder(id, estatus, aprobadorId) {
    const consulta = `
      UPDATE permisos_ausencia
      SET estatus = $1, respondedor_id = $2, fecha_respuesta = NOW()
      WHERE id = $3
      RETURNING *
    `;
    const resultado = await grupo.query(consulta, [estatus, aprobadorId, id]);
    return resultado.rows[0];
  },

  async tieneTraslape(empleadoId, fechaInicio, fechaFin, permisoId = null) {
    let consulta = `
      SELECT COUNT(*) FROM permisos_ausencia
      WHERE empleado_id = $1
        AND estatus IN ('pendiente', 'aprobado')
        AND fecha_inicio <= $2
        AND fecha_fin >= $3
    `;
    const valores = [empleadoId, fechaInicio, fechaFin];

    if (permisoId) {
      consulta += " AND id != $4";
      valores.push(permisoId);
    }

    const resultado = await grupo.query(consulta, valores);
    return parseInt(resultado.rows[0].count) > 0;
  },
};

module.exports = PermisoAusencia;
