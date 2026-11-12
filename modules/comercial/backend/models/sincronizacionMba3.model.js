const { grupo } = require('../../../portal/backend/config/database');

// Candado consultivo propio (el motor de asistencia usa 4501): una sola sincronización a la vez en
// toda la flota. Se toma con una conexión dedicada que vive mientras dura la vuelta.
const CANDADO_SYNC_CONVENIOS = 4601;

const SincronizacionMba3 = {
  CANDADO_SYNC_CONVENIOS,

  // Líneas que se pueden sincronizar: convenio autorizado, con código de cliente y de producto, y
  // con compra inicial registrada (sin stock base no hay contra qué restar consumo).
  async lineasElegibles() {
    const res = await grupo.query(`
      SELECT p.id AS convenio_producto_id, p.convenio_id,
             btrim(c.cliente_codigo) AS cliente_codigo, btrim(p.producto_codigo) AS producto_codigo,
             ci.fecha_movimiento AS fecha_base
      FROM comercial_convenio_productos p
      JOIN comercial_convenios c ON c.id = p.convenio_id
      JOIN comercial_convenio_movimientos ci ON ci.convenio_producto_id = p.id AND ci.tipo = 'compra_inicial'
      WHERE c.estatus = 'autorizado'
        AND NULLIF(btrim(c.cliente_codigo), '') IS NOT NULL
        AND NULLIF(btrim(p.producto_codigo), '') IS NOT NULL
    `);
    return res.rows;
  },

  // Cuántas líneas de convenios autorizados NO se pueden enlazar y por qué (para el reporte).
  async contarLineasOmitidas() {
    const res = await grupo.query(`
      SELECT
        COUNT(*) FILTER (WHERE NULLIF(btrim(c.cliente_codigo), '') IS NULL
                            OR NULLIF(btrim(p.producto_codigo), '') IS NULL) AS sin_codigo,
        COUNT(*) FILTER (WHERE NULLIF(btrim(c.cliente_codigo), '') IS NOT NULL
                           AND NULLIF(btrim(p.producto_codigo), '') IS NOT NULL
                           AND NOT EXISTS (SELECT 1 FROM comercial_convenio_movimientos ci
                                           WHERE ci.convenio_producto_id = p.id AND ci.tipo = 'compra_inicial')) AS sin_compra_inicial
      FROM comercial_convenio_productos p
      JOIN comercial_convenios c ON c.id = p.convenio_id
      WHERE c.estatus = 'autorizado'
    `);
    const fila = res.rows[0] || {};
    return { sin_codigo: Number(fila.sin_codigo || 0), sin_compra_inicial: Number(fila.sin_compra_inicial || 0) };
  },

  async obtenerEstado() {
    const res = await grupo.query(
      `SELECT ultima_fecha_cubierta::text AS ultima_fecha_cubierta, ultima_ejecucion, ultima_ejecucion_ok, ultimo_resultado,
              (now() AT TIME ZONE 'America/Mexico_City')::date::text AS hoy_mx,
              EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Mexico_City'))::int AS hora_mx,
              (ultima_ejecucion_ok AT TIME ZONE 'America/Mexico_City')::date::text AS fecha_ok_mx
       FROM comercial_convenio_sync_mba3 WHERE id = 1`,
    );
    return res.rows[0] || null;
  },

  // `fechaCubierta` solo se pasa cuando TODO el rango se cubrió completo (si no, se conserva la
  // anterior para que la siguiente vuelta reintente desde ahí).
  async guardarResultado({ ok, fechaCubierta, resultado }) {
    await grupo.query(
      `INSERT INTO comercial_convenio_sync_mba3 (id, ultima_fecha_cubierta, ultima_ejecucion, ultima_ejecucion_ok, ultimo_resultado)
       VALUES (1, $1, now(), CASE WHEN $2 THEN now() END, $3)
       ON CONFLICT (id) DO UPDATE SET
         ultima_fecha_cubierta = COALESCE($1, comercial_convenio_sync_mba3.ultima_fecha_cubierta),
         ultima_ejecucion = now(),
         ultima_ejecucion_ok = CASE WHEN $2 THEN now() ELSE comercial_convenio_sync_mba3.ultima_ejecucion_ok END,
         ultimo_resultado = $3`,
      [fechaCubierta || null, Boolean(ok), JSON.stringify(resultado)],
    );
  },
};

module.exports = SincronizacionMba3;
