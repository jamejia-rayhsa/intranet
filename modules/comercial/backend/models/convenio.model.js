const { grupo } = require('../../../portal/backend/config/database');

// Vigencia vencida: NO se guarda como estatus (serían 5 estados a mantener sincronizados); se
// calcula comparando vigente_hasta con "hoy" en México, igual que departamento.model.js /
// turno.model.js (`(now() AT TIME ZONE 'America/Mexico_City')::date`). Null = abierta = nunca vencida.
const SQL_HOY_MX = `(now() AT TIME ZONE 'America/Mexico_City')::date`;
const SQL_VENCIDO = `(vigente_hasta IS NOT NULL AND vigente_hasta < ${SQL_HOY_MX})`;

// ILIKE sin esto trata %, _ y \ del usuario como comodines/escape propios (R-8 de la revisión).
// El carácter de escape por defecto de LIKE/ILIKE en Postgres ya es la barra invertida, así que
// basta con escaparla junto con % y _ antes de envolver el texto en %...%.
function escaparIlike(texto) {
  return String(texto).replace(/[\\%_]/g, '\\$&');
}

const Convenio = {
  // Ejecuta fn(cliente) dentro de BEGIN/COMMIT; ante cualquier error hace ROLLBACK y lo relanza.
  // Mismo patrón que solicitudVacaciones.model.js / llaveIngesta.model.js.
  async enTransaccion(fn) {
    const cliente = await grupo.connect();
    let errorRollback;
    try {
      await cliente.query('BEGIN');
      const resultado = await fn(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK').catch((e) => {
        errorRollback = e;
      });
      throw error;
    } finally {
      cliente.release(errorRollback);
    }
  },

  async listar(filtros = {}) {
    const where = [];
    const params = [];
    let idx = 1;

    if (filtros.estatus) {
      where.push(`c.estatus = $${idx++}`);
      params.push(filtros.estatus);
    }
    if (filtros.cliente_codigo) {
      where.push(`c.cliente_codigo = $${idx++}`);
      params.push(filtros.cliente_codigo);
    }
    if (filtros.cliente_nombre) {
      where.push(`c.cliente_nombre ILIKE $${idx++}`);
      params.push(`%${escaparIlike(filtros.cliente_nombre)}%`);
    }
    if (filtros.vendedor_codigo) {
      where.push(`c.vendedor_codigo = $${idx++}`);
      params.push(filtros.vendedor_codigo);
    }
    if (filtros.vendedor_nombre) {
      where.push(`c.vendedor_nombre ILIKE $${idx++}`);
      params.push(`%${escaparIlike(filtros.vendedor_nombre)}%`);
    }

    const condicion = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const res = await grupo.query(
      `
      SELECT c.*, ${SQL_VENCIDO} AS vencido,
             uc.nombre AS creado_por_nombre, uc.apellido AS creado_por_apellido,
             (SELECT COUNT(*) FROM comercial_convenio_productos p WHERE p.convenio_id = c.id) AS total_productos
      FROM comercial_convenios c
      LEFT JOIN usuarios uc ON uc.id = c.creado_por_id
      ${condicion}
      ORDER BY c.fecha_creacion DESC
    `,
      params,
    );
    return res.rows;
  },

  // Fase 5 — dashboard: un convenio puede tener varias líneas de producto, cada una con su propia
  // compra_inicial/consumo (tabla comercial_convenio_movimientos); esto agrega esas líneas por
  // convenio en una sola consulta (sin N+1) para los KPIs globales y el semáforo por fila.
  // dias_para_vencer/dias_sin_movimiento se calculan en SQL (no en JS) para usar la misma fecha
  // "hoy en México" que SQL_VENCIDO, evitando que un desfase de zona horaria los contradiga.
  async listarConResumenConsumo() {
    const res = await grupo.query(`
      SELECT c.*, ${SQL_VENCIDO} AS vencido,
             (vigente_hasta - ${SQL_HOY_MX}) AS dias_para_vencer,
             uc.nombre AS creado_por_nombre, uc.apellido AS creado_por_apellido,
             (SELECT COUNT(*) FROM comercial_convenio_productos p WHERE p.convenio_id = c.id) AS total_productos,
             COALESCE(rc.stock_comprado, 0) AS stock_comprado,
             COALESCE(rc.stock_consumido, 0) AS stock_consumido,
             rc.fecha_ultimo_movimiento,
             CASE WHEN rc.fecha_ultimo_movimiento IS NOT NULL
                  THEN (${SQL_HOY_MX} - rc.fecha_ultimo_movimiento)
                  ELSE NULL END AS dias_sin_movimiento
      FROM comercial_convenios c
      LEFT JOIN usuarios uc ON uc.id = c.creado_por_id
      LEFT JOIN (
        SELECT p.convenio_id,
               SUM(m.cantidad) FILTER (WHERE m.tipo = 'compra_inicial') AS stock_comprado,
               COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo = 'consumo'), 0)
                 - COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo = 'devolucion'), 0) AS stock_consumido,
               MAX(m.fecha_movimiento) AS fecha_ultimo_movimiento
        FROM comercial_convenio_productos p
        JOIN comercial_convenio_movimientos m ON m.convenio_producto_id = p.id
        GROUP BY p.convenio_id
      ) rc ON rc.convenio_id = c.id
      ORDER BY c.fecha_creacion DESC
    `);
    return res.rows;
  },

  async obtener(id, cliente = grupo) {
    const res = await cliente.query(
      `
      SELECT c.*, ${SQL_VENCIDO} AS vencido,
             uc.nombre AS creado_por_nombre, uc.apellido AS creado_por_apellido
      FROM comercial_convenios c
      LEFT JOIN usuarios uc ON uc.id = c.creado_por_id
      WHERE c.id = $1
    `,
      [id],
    );
    if (!res.rows[0]) return null;
    const convenio = res.rows[0];
    convenio.productos = await Convenio.listarProductos(id, cliente);
    return convenio;
  },

  async listarProductos(convenioId, cliente = grupo) {
    const res = await cliente.query(
      `SELECT * FROM comercial_convenio_productos WHERE convenio_id = $1 ORDER BY id`,
      [convenioId],
    );
    return res.rows;
  },

  // Bloquea la fila de la cabecera (para editar/autorizar/rechazar/cancelar bajo una misma fila).
  async obtenerParaEscritura(id, cliente) {
    const res = await cliente.query(
      `SELECT * FROM comercial_convenios WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return res.rows[0] || null;
  },

  async insertarProducto(convenioId, producto, cliente) {
    const res = await cliente.query(
      `
      INSERT INTO comercial_convenio_productos (
        convenio_id, producto_codigo, producto_descripcion, empaque, unidad_medida,
        cantidad_periodica, periodo, precio_compra, precio_venta, factor
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `,
      [
        convenioId,
        producto.producto_codigo || null,
        producto.producto_descripcion,
        producto.empaque ?? null,
        producto.unidad_medida || null,
        producto.cantidad_periodica,
        producto.periodo,
        producto.precio_compra ?? null,
        producto.precio_venta ?? null,
        producto.factor ?? null,
      ],
    );
    return res.rows[0];
  },

  async crear(datos, productos, creadoPorId) {
    return Convenio.enTransaccion(async (cliente) => {
      const res = await cliente.query(
        `
        INSERT INTO comercial_convenios (
          folio_origen, cliente_codigo, cliente_nombre, vendedor_codigo, vendedor_nombre,
          fecha_inicio, vigente_hasta, observaciones, creado_por_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
      `,
        [
          datos.folio_origen || null,
          datos.cliente_codigo || null,
          datos.cliente_nombre,
          datos.vendedor_codigo || null,
          datos.vendedor_nombre,
          datos.fecha_inicio,
          datos.vigente_hasta || null,
          datos.observaciones || null,
          creadoPorId,
        ],
      );
      const convenio = res.rows[0];
      for (const producto of productos) {
        await Convenio.insertarProducto(convenio.id, producto, cliente);
      }
      convenio.productos = await Convenio.listarProductos(convenio.id, cliente);
      return convenio;
    });
  },

  // Solo cabecera + líneas; el estatus se cambia por las acciones dedicadas (autorizar/rechazar/cancelar).
  // Guarda de estado en SQL: solo actualiza si sigue 'pendiente_autorizacion' (undefined si ya no lo está).
  async actualizar(id, datos, productos) {
    return Convenio.enTransaccion(async (cliente) => {
      const previo = await Convenio.obtenerParaEscritura(id, cliente);
      if (!previo) return { previo: null, convenio: null };
      if (previo.estatus !== 'pendiente_autorizacion') {
        return { previo, convenio: undefined };
      }

      const res = await cliente.query(
        `
        UPDATE comercial_convenios SET
          folio_origen = $1, cliente_codigo = $2, cliente_nombre = $3,
          vendedor_codigo = $4, vendedor_nombre = $5,
          fecha_inicio = $6, vigente_hasta = $7, observaciones = $8
        WHERE id = $9 AND estatus = 'pendiente_autorizacion'
        RETURNING *
      `,
        [
          datos.folio_origen || null,
          datos.cliente_codigo || null,
          datos.cliente_nombre,
          datos.vendedor_codigo || null,
          datos.vendedor_nombre,
          datos.fecha_inicio,
          datos.vigente_hasta || null,
          datos.observaciones || null,
          id,
        ],
      );
      const convenio = res.rows[0];
      if (!convenio) return { previo, convenio: undefined };

      await cliente.query(`DELETE FROM comercial_convenio_productos WHERE convenio_id = $1`, [id]);
      for (const producto of productos) {
        await Convenio.insertarProducto(id, producto, cliente);
      }
      convenio.productos = await Convenio.listarProductos(id, cliente);
      return { previo, convenio };
    });
  },

  // Guarda de estado en SQL: solo autoriza si sigue 'pendiente_autorizacion'. "Nunca lo propio"
  // (R-1 de la revisión) ya no depende solo de la lectura previa del controlador: el propio UPDATE
  // excluye creado_por_id = autorizaId, así que es atómico ante una futura carrera o un cambio de
  // código que reordene los chequeos.
  async autorizar(id, autorizaId, autorizaNombre) {
    const res = await grupo.query(
      `
      UPDATE comercial_convenios
      SET estatus = 'autorizado', autoriza_id = $1, autoriza_nombre = $2, fecha_autoriza = NOW()
      WHERE id = $3 AND estatus = 'pendiente_autorizacion' AND creado_por_id != $1
      RETURNING *
    `,
      [autorizaId, autorizaNombre, id],
    );
    return res.rows[0];
  },

  // Mismo patrón atómico que autorizar(): el propio creador nunca puede rechazar su convenio.
  async rechazar(id, autorizaId, autorizaNombre, motivoRechazo) {
    const res = await grupo.query(
      `
      UPDATE comercial_convenios
      SET estatus = 'rechazado', autoriza_id = $1, autoriza_nombre = $2, fecha_autoriza = NOW(),
          motivo_rechazo = $3
      WHERE id = $4 AND estatus = 'pendiente_autorizacion' AND creado_por_id != $1
      RETURNING *
    `,
      [autorizaId, autorizaNombre, motivoRechazo, id],
    );
    return res.rows[0];
  },

  // Fase 3 (carga histórica del CSV): a diferencia de crear(), aquí el convenio YA tiene un
  // estatus final conocido (autorizado/cancelado) y su snapshot de autorización desde el Excel —
  // no pasa por el flujo de pendiente_autorizacion ni por autorizar()/cancelar(). `autoriza_id`
  // siempre NULL (no hay un usuario real detrás de iniciales como "AMJ"/"SIA"; ver code-notes.md
  // Fase 3), `motivo_rechazo` siempre NULL (ese campo es solo del flujo nuevo de rechazo).
  // `origen_historico = true` siempre (migración 004, R-P3-2): distingue este convenio de uno
  // creado desde la UI, para que existeHistorico() nunca colisione con un folio/cliente de texto
  // libre capturado a mano.
  async crearHistorico(datos, productos) {
    return Convenio.enTransaccion(async (cliente) => {
      const res = await cliente.query(
        `
        INSERT INTO comercial_convenios (
          folio_origen, cliente_codigo, cliente_nombre, vendedor_codigo, vendedor_nombre,
          fecha_inicio, vigente_hasta, estatus, autoriza_id, autoriza_nombre, fecha_autoriza,
          observaciones, creado_por_id, origen_historico
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *
      `,
        [
          datos.folio_origen || null,
          datos.cliente_codigo || null,
          datos.cliente_nombre,
          datos.vendedor_codigo || null,
          datos.vendedor_nombre,
          datos.fecha_inicio,
          datos.vigente_hasta || null,
          datos.estatus,
          null,
          datos.autoriza_nombre || null,
          datos.fecha_autoriza || null,
          datos.observaciones || null,
          datos.creado_por_id,
          true,
        ],
      );
      const convenio = res.rows[0];
      for (const producto of productos) {
        await Convenio.insertarProducto(convenio.id, producto, cliente);
      }
      convenio.productos = await Convenio.listarProductos(convenio.id, cliente);
      return convenio;
    });
  },

  // Idempotencia de la carga histórica: clave = folio_origen + cliente_nombre normalizado (lo
  // decide el script, aquí solo se devuelven los candidatos con ese folio_origen). R-P3-2:
  // `origen_historico = true` en el WHERE para no confundir un convenio creado desde la UI con uno
  // importado del CSV, aunque compartan folio_origen + cliente_nombre como texto libre. R-P3-4:
  // incluye `total_lineas` para que el script pueda avisar si una re-ejecución trae más/menos líneas
  // que las ya importadas, en vez de omitir en silencio.
  async existeHistorico(folioOrigen) {
    const res = await grupo.query(
      `
      SELECT c.id, c.cliente_nombre,
             (SELECT COUNT(*) FROM comercial_convenio_productos p WHERE p.convenio_id = c.id) AS total_lineas
      FROM comercial_convenios c
      WHERE c.folio_origen = $1 AND c.origen_historico = true
    `,
      [folioOrigen],
    );
    return res.rows;
  },

  // Cancelar: cualquier estatus salvo ya cancelado (pendiente, autorizado o rechazado). Decisión del
  // humano [2026-10-23]: cancelar un convenio YA autorizado exige estar en la lista de autorizadores
  // activos o ser super_admin (mismo criterio que autorizar/rechazar, incluyendo "nunca lo propio");
  // cancelar uno pendiente o rechazado sigue abierto a cualquiera con permiso de edición, sin cambios.
  // `puedeCancelarAutorizado` lo calcula el controlador (mismo chequeo que motivoSinAutoridad) y se
  // vuelve a evaluar aquí, en el propio WHERE, para que sea atómico contra el estatus real de la fila
  // en el momento del UPDATE (no el leído segundos antes) — mismo patrón que autorizar/rechazar.
  async cancelar(id, puedeCancelarAutorizado) {
    const res = await grupo.query(
      `
      UPDATE comercial_convenios
      SET estatus = 'cancelado'
      WHERE id = $1 AND estatus != 'cancelado' AND (estatus != 'autorizado' OR $2)
      RETURNING *
    `,
      [id, puedeCancelarAutorizado],
    );
    return res.rows[0];
  },
};

module.exports = Convenio;
