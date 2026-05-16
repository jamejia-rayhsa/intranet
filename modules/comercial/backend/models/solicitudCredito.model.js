const { grupo } = require('../../../portal/backend/config/database');

const SolicitudCredito = {
  async listar(filtros = {}) {
    let where = [];
    let params = [];
    let idx = 1;

    if (filtros.estado) {
      where.push(`sc.estado = $${idx++}`);
      params.push(filtros.estado);
    }
    if (filtros.tipo_cliente) {
      where.push(`sc.tipo_cliente = $${idx++}`);
      params.push(filtros.tipo_cliente);
    }
    if (filtros.buscar) {
      where.push(`(sc.razon_social ILIKE $${idx} OR sc.rfc ILIKE $${idx} OR sc.numero_solicitud ILIKE $${idx})`);
      params.push(`%${filtros.buscar}%`);
      idx++;
    }
    if (filtros.usuario_creador_id) {
      where.push(`sc.usuario_creador_id = $${idx++}`);
      params.push(filtros.usuario_creador_id);
    }

    const condicion = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const pagina = parseInt(filtros.pagina) || 1;
    const limite = parseInt(filtros.limite) || 50;
    const offset = (pagina - 1) * limite;

    const res = await grupo.query(`
      SELECT sc.id, sc.numero_solicitud, sc.razon_social, sc.rfc,
             sc.tipo_cliente, sc.sucursal, sc.estado, sc.moneda,
             sc.sincronizado_mba3, sc.fecha_creacion, sc.fecha_ultimo_cambio,
             u.nombre AS creador_nombre, u.correo AS creador_correo
      FROM solicitudes_credito sc
      LEFT JOIN usuarios u ON u.id = sc.usuario_creador_id
      ${condicion}
      ORDER BY sc.fecha_creacion DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limite, offset]);

    const total = await grupo.query(`
      SELECT COUNT(*) FROM solicitudes_credito sc ${condicion}
    `, params);

    return { registros: res.rows, total: parseInt(total.rows[0].count) };
  },

  async obtener(id) {
    const res = await grupo.query(`
      SELECT sc.*,
             uc.nombre AS creador_nombre, uc.correo AS creador_correo,
             uu.nombre AS editor_nombre
      FROM solicitudes_credito sc
      LEFT JOIN usuarios uc ON uc.id = sc.usuario_creador_id
      LEFT JOIN usuarios uu ON uu.id = sc.usuario_ultimo_cambio_id
      WHERE sc.id = $1
    `, [id]);
    return res.rows[0] || null;
  },

  async crear(datos) {
    const {
      razon_social, rfc, tipo_cliente, sucursal, regimen_fiscal, moneda,
      giro_negocio, metodo_pago, uso_cfdi, forma_pago,
      domicilio_fiscal, domicilio_entrega,
      datos_bancarios_nacionales, datos_bancarios_extranjeros,
      condiciones_comerciales, contactos, referencias_comerciales,
      datos_proporcionados_nombre, datos_proporcionados_puesto,
      estado, usuario_creador_id
    } = datos;

    const res = await grupo.query(`
      INSERT INTO solicitudes_credito (
        razon_social, rfc, tipo_cliente, sucursal, regimen_fiscal, moneda,
        giro_negocio, metodo_pago, uso_cfdi, forma_pago,
        domicilio_fiscal, domicilio_entrega,
        datos_bancarios_nacionales, datos_bancarios_extranjeros,
        condiciones_comerciales, contactos, referencias_comerciales,
        datos_proporcionados_nombre, datos_proporcionados_puesto,
        estado, usuario_creador_id, usuario_ultimo_cambio_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,
        $13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,
        $18,$19,$20,$21,$21
      ) RETURNING *
    `, [
      razon_social, rfc, tipo_cliente, sucursal, regimen_fiscal, moneda,
      giro_negocio, metodo_pago, uso_cfdi,
      JSON.stringify(forma_pago || []),
      JSON.stringify(domicilio_fiscal || {}),
      JSON.stringify(domicilio_entrega || {}),
      JSON.stringify(datos_bancarios_nacionales || []),
      JSON.stringify(datos_bancarios_extranjeros || []),
      JSON.stringify(condiciones_comerciales || {}),
      JSON.stringify(contactos || []),
      JSON.stringify(referencias_comerciales || []),
      datos_proporcionados_nombre, datos_proporcionados_puesto,
      estado || 'borrador', usuario_creador_id
    ]);
    return res.rows[0];
  },

  async actualizar(id, datos, usuario_id) {
    const campos = [
      'razon_social', 'rfc', 'tipo_cliente', 'sucursal', 'regimen_fiscal', 'moneda',
      'giro_negocio', 'metodo_pago', 'uso_cfdi', 'estado',
      'sincronizado_mba3', 'referencia_mba3',
      'datos_proporcionados_nombre', 'datos_proporcionados_puesto',
    ];
    const camposJSON = [
      'forma_pago', 'domicilio_fiscal', 'domicilio_entrega',
      'datos_bancarios_nacionales', 'datos_bancarios_extranjeros',
      'condiciones_comerciales', 'contactos', 'referencias_comerciales'
    ];

    let sets = [];
    let params = [];
    let idx = 1;

    for (const c of campos) {
      if (datos[c] !== undefined) {
        sets.push(`${c} = $${idx++}`);
        params.push(datos[c]);
      }
    }
    for (const c of camposJSON) {
      if (datos[c] !== undefined) {
        sets.push(`${c} = $${idx++}::jsonb`);
        params.push(JSON.stringify(datos[c]));
      }
    }

    sets.push(`usuario_ultimo_cambio_id = $${idx++}`);
    params.push(usuario_id);
    sets.push(`fecha_ultimo_cambio = NOW()`);
    params.push(id);

    const res = await grupo.query(`
      UPDATE solicitudes_credito SET ${sets.join(', ')}
      WHERE id = $${idx} RETURNING *
    `, params);
    return res.rows[0];
  },

  async estadisticas() {
    const res = await grupo.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE estado = 'borrador') AS borradores,
        COUNT(*) FILTER (WHERE estado = 'guardada') AS guardadas,
        COUNT(*) FILTER (WHERE estado = 'aprobada') AS aprobadas,
        COUNT(*) FILTER (WHERE tipo_cliente = 'INDUSTRIA') AS industria,
        COUNT(*) FILTER (WHERE tipo_cliente = 'DISTRIBUCION') AS distribucion
      FROM solicitudes_credito
    `);
    return res.rows[0];
  }
};

module.exports = SolicitudCredito;
