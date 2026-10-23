const { grupo } = require('../../../portal/backend/config/database');

const Autorizador = {
  async listar() {
    const res = await grupo.query(`
      SELECT a.usuario_id, a.activo, a.agregado_por_id, a.fecha_agregado,
             u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, u.correo AS usuario_correo,
             ap.nombre AS agregado_por_nombre, ap.apellido AS agregado_por_apellido
      FROM comercial_autorizadores a
      JOIN usuarios u ON u.id = a.usuario_id
      LEFT JOIN usuarios ap ON ap.id = a.agregado_por_id
      ORDER BY a.fecha_agregado DESC
    `);
    return res.rows;
  },

  async obtener(usuarioId) {
    const res = await grupo.query(
      `SELECT * FROM comercial_autorizadores WHERE usuario_id = $1`,
      [usuarioId],
    );
    return res.rows[0] || null;
  },

  // Alta idempotente: si ya existía (activo o no) lo reactiva en vez de duplicar.
  async agregar(usuarioId, agregadoPorId) {
    const res = await grupo.query(
      `
      INSERT INTO comercial_autorizadores (usuario_id, activo, agregado_por_id)
      VALUES ($1, true, $2)
      ON CONFLICT (usuario_id) DO UPDATE SET activo = true, agregado_por_id = $2, fecha_agregado = NOW()
      RETURNING *
    `,
      [usuarioId, agregadoPorId],
    );
    return res.rows[0];
  },

  // Baja lógica (no se borra la fila: conserva quién fue autorizador alguna vez).
  async quitar(usuarioId) {
    const res = await grupo.query(
      `UPDATE comercial_autorizadores SET activo = false WHERE usuario_id = $1 AND activo = true RETURNING *`,
      [usuarioId],
    );
    return res.rows[0];
  },

  // Regla de autorización: activo en la lista, o super_admin (verificado por el llamador).
  async esActivo(usuarioId) {
    const res = await grupo.query(
      `SELECT 1 FROM comercial_autorizadores WHERE usuario_id = $1 AND activo = true`,
      [usuarioId],
    );
    return res.rows.length > 0;
  },
};

module.exports = Autorizador;
