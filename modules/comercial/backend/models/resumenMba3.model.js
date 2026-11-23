const { grupo } = require('../../../portal/backend/config/database');

// Foto del resumen MBA3 por línea de convenio + estado de la última corrida (fila única de
// comercial_convenio_sync_mba3). Ver migración 007.
const ResumenMba3 = {
  // Líneas de convenios AUTORIZADOS: son las que se calculan contra MBA3.
  async lineasAutorizadas() {
    const res = await grupo.query(`
      SELECT p.id AS linea_id, p.producto_codigo, p.cantidad_periodica, p.periodo,
             c.id AS convenio_id, c.cliente_codigo, c.fecha_inicio::text AS fecha_inicio
      FROM comercial_convenio_productos p
      JOIN comercial_convenios c ON c.id = p.convenio_id
      WHERE c.estatus = 'autorizado'
      ORDER BY c.id, p.id
    `);
    return res.rows;
  },

  async guardar(lineaId, d) {
    await grupo.query(
      `
      INSERT INTO comercial_convenio_resumen_mba3 (
        convenio_producto_id, comprado, vendido, existencia, ordenes_compra, facturas,
        ultima_oc, ultima_factura, error, calculado_en
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (convenio_producto_id) DO UPDATE SET
        comprado = EXCLUDED.comprado, vendido = EXCLUDED.vendido, existencia = EXCLUDED.existencia,
        ordenes_compra = EXCLUDED.ordenes_compra, facturas = EXCLUDED.facturas,
        ultima_oc = EXCLUDED.ultima_oc, ultima_factura = EXCLUDED.ultima_factura,
        error = EXCLUDED.error, calculado_en = NOW()
    `,
      [
        lineaId, d.comprado || 0, d.vendido || 0, d.existencia || 0, d.ordenes_compra || 0, d.facturas || 0,
        d.ultima_oc || null, d.ultima_factura || null, d.error || null,
      ],
    );
  },

  async marcarInicio() {
    await grupo.query(`UPDATE comercial_convenio_sync_mba3 SET ultima_ejecucion = NOW() WHERE id = 1`);
  },

  async marcarFin({ ok, resultado }) {
    await grupo.query(
      `UPDATE comercial_convenio_sync_mba3
       SET ultima_ejecucion_ok = CASE WHEN $1 THEN NOW() ELSE ultima_ejecucion_ok END, ultimo_resultado = $2
       WHERE id = 1`,
      [ok, JSON.stringify(resultado)],
    );
  },

  async obtenerEstado() {
    const res = await grupo.query(
      `SELECT ultima_ejecucion, ultima_ejecucion_ok, ultimo_resultado FROM comercial_convenio_sync_mba3 WHERE id = 1`,
    );
    return res.rows[0] || { ultima_ejecucion: null, ultima_ejecucion_ok: null, ultimo_resultado: null };
  },
};

module.exports = ResumenMba3;
