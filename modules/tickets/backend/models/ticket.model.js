const { grupo } = require("../config/database");

const Ticket = {
  async crear(datos) {
    const { usuario_id, titulo, descripcion, nivel_atencion, categoria } =
      datos;
    const consulta = `
      INSERT INTO tickets (solicitante_id, titulo, descripcion, nivel_atencion, categoria)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `;
    const valores = [
      usuario_id,
      titulo,
      descripcion || null,
      nivel_atencion,
      categoria || null,
    ];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerPorId(id) {
    const consulta = `
      SELECT t.*,
        u.nombre as usuario_nombre, u.apellido as usuario_apellido, u.correo as usuario_correo,
        tec.nombre as tecnico_nombre, tec.apellido as tecnico_apellido,
        tc.icono as categoria_icono,
        CASE
          WHEN t.fecha_cierre IS NOT NULL AND t.fecha_creacion IS NOT NULL
          THEN EXTRACT(EPOCH FROM (t.fecha_cierre - t.fecha_creacion))
          ELSE NULL
        END as tiempo_resolucion_segundos
      FROM tickets t
      LEFT JOIN usuarios u ON t.solicitante_id = u.id
      LEFT JOIN usuarios tec ON t.tecnico_id = tec.id
      LEFT JOIN ticket_categorias tc ON tc.nombre = t.categoria
      WHERE t.id = $1
    `;
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async listar(filtros = {}) {
    let consulta = `
      SELECT t.*,
        u.nombre as usuario_nombre, u.apellido as usuario_apellido,
        tec.nombre as tecnico_nombre, tec.apellido as tecnico_apellido,
        tc.icono as categoria_icono,
        CASE
          WHEN t.fecha_cierre IS NOT NULL AND t.fecha_creacion IS NOT NULL
          THEN EXTRACT(EPOCH FROM (t.fecha_cierre - t.fecha_creacion))
          ELSE NULL
        END as tiempo_resolucion_segundos,
        (SELECT COUNT(*) FROM ticket_adjuntos ta WHERE ta.ticket_id = t.id) as adjuntos_count
      FROM tickets t
      LEFT JOIN usuarios u ON t.solicitante_id = u.id
      LEFT JOIN usuarios tec ON t.tecnico_id = tec.id
      LEFT JOIN ticket_categorias tc ON tc.nombre = t.categoria
      WHERE 1=1
    `;
    const valores = [];
    let contador = 1;

    if (filtros.estado) {
      consulta += ` AND t.estado = $${contador}`;
      valores.push(filtros.estado);
      contador++;
    }

    if (filtros.nivel_atencion) {
      consulta += ` AND t.nivel_atencion = $${contador}`;
      valores.push(filtros.nivel_atencion);
      contador++;
    }

    if (filtros.usuario_id) {
      consulta += ` AND t.solicitante_id = $${contador}`;
      valores.push(filtros.usuario_id);
      contador++;
    }

    if (filtros.tecnico_id) {
      consulta += ` AND t.tecnico_id = $${contador}`;
      valores.push(filtros.tecnico_id);
      contador++;
    }

    if (filtros.categoria) {
      consulta += ` AND t.categoria = $${contador}`;
      valores.push(filtros.categoria);
      contador++;
    }

    consulta += " ORDER BY t.id ASC";

    if (filtros.limite) {
      const desplazamiento = ((filtros.pagina || 1) - 1) * filtros.limite;
      consulta += ` LIMIT $${contador} OFFSET $${contador + 1}`;
      valores.push(filtros.limite, desplazamiento);
    }

    const resultado = await grupo.query(consulta, valores);
    return resultado.rows;
  },

  async contar(filtros = {}) {
    let consulta = "SELECT COUNT(*) FROM tickets WHERE 1=1";
    const valores = [];
    let contador = 1;

    if (filtros.estado) {
      consulta += ` AND estado = $${contador}`;
      valores.push(filtros.estado);
      contador++;
    }

    if (filtros.usuario_id) {
      consulta += ` AND solicitante_id = $${contador}`;
      valores.push(filtros.usuario_id);
      contador++;
    }

    const resultado = await grupo.query(consulta, valores);
    return parseInt(resultado.rows[0].count);
  },

  async actualizarEstado(id, estado, tecnicoId = null) {
    const campos = ["estado = $1", "fecha_actualizacion = NOW()"];
    const valores = [estado];

    if (tecnicoId) {
      campos.push(`tecnico_id = $${valores.length + 1}`);
      valores.push(tecnicoId);
    }

    if (estado === "resuelto" || estado === "cerrado") {
      campos.push(`fecha_cierre = NOW()`);
    }

    valores.push(id);

    const consulta = `UPDATE tickets SET ${campos.join(", ")} WHERE id = $${valores.length} RETURNING *`;
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async asignarTecnico(ticketId, tecnicoId) {
    const consulta = `
      UPDATE tickets SET tecnico_id = $1, estado = 'en_progreso', fecha_actualizacion = NOW()
      WHERE id = $2 RETURNING *
    `;
    const resultado = await grupo.query(consulta, [tecnicoId, ticketId]);
    return resultado.rows[0];
  },

  async eliminar(id) {
    const consulta = "DELETE FROM tickets WHERE id = $1 RETURNING *";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },
};

module.exports = Ticket;
