// modules/comercial/backend/models/cacheMba3.model.js
// Caché local de catálogos MBA3 en BD (tabla `comercial_cache_mba3`, migración 003). Decisión de
// Fase 2: caché en tabla (no solo en memoria) para que sobreviva reinicios del backend y para que
// el futuro dashboard (Fase 5) pueda leer el último dato conocido sin depender de la disponibilidad
// de MBA3 en cada render. El TTL por tipo de dato vive en mba3Catalogo.service.js, no aquí: esta
// tabla solo guarda "lo último que se supo y cuándo".
const { grupo } = require('../../../portal/backend/config/database');

const CacheMba3 = {
  async obtener(tipo, codigo) {
    const res = await grupo.query(
      `SELECT datos, consultado_en FROM comercial_cache_mba3 WHERE tipo = $1 AND codigo = $2`,
      [tipo, codigo],
    );
    return res.rows[0] || null;
  },

  async guardar(tipo, codigo, datos) {
    await grupo.query(
      `
      INSERT INTO comercial_cache_mba3 (tipo, codigo, datos, consultado_en)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (tipo, codigo) DO UPDATE SET datos = $3, consultado_en = now()
    `,
      [tipo, codigo, JSON.stringify(datos)],
    );
  },
};

module.exports = CacheMba3;
