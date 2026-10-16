const { grupo } = require("../config/database");

// Las fechas salen SIEMPRE como texto 'YYYY-MM-DD' (to_char en SQL): pg convertiría un DATE
// a medianoche local y el JSON podría salir un día antes según la zona del proceso.
const COLUMNAS = `id, to_char(fecha, 'YYYY-MM-DD') AS fecha, tipo, nombre, descripcion, activo,
  creado_por, fecha_creacion, fecha_actualizacion`;

const TIPOS_CALENDARIO = ["oficial", "otorgado", "evento"];
// Tipos que no cuentan como día hábil ni se descuentan del saldo
const TIPOS_NO_HABILES = ["oficial", "otorgado"];

const CalendarioLaboral = {
  async listar({ desde, hasta, tipo, soloActivos } = {}) {
    const condiciones = [];
    const valores = [];
    if (desde) {
      valores.push(desde);
      condiciones.push(`fecha >= $${valores.length}::date`);
    }
    if (hasta) {
      valores.push(hasta);
      condiciones.push(`fecha <= $${valores.length}::date`);
    }
    if (tipo) {
      valores.push(tipo);
      condiciones.push(`tipo = $${valores.length}`);
    }
    if (soloActivos) condiciones.push("activo = TRUE");
    const donde = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
    const resultado = await grupo.query(
      `SELECT ${COLUMNAS} FROM calendario_laboral ${donde} ORDER BY fecha, tipo, id`,
      valores,
    );
    return resultado.rows;
  },

  async obtenerPorId(id) {
    const resultado = await grupo.query(
      `SELECT ${COLUMNAS} FROM calendario_laboral WHERE id = $1`,
      [id],
    );
    return resultado.rows[0] || null;
  },

  async crear({ fecha, tipo, nombre, descripcion, activo, creado_por }) {
    const resultado = await grupo.query(
      `INSERT INTO calendario_laboral (fecha, tipo, nombre, descripcion, activo, creado_por)
       VALUES ($1::date, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNAS}`,
      [fecha, tipo, nombre, descripcion || null, activo === undefined ? true : activo, creado_por || null],
    );
    return resultado.rows[0];
  },

  // Solo actualiza los campos presentes; devuelve undefined si no existe
  async actualizar(id, datos) {
    const sets = [];
    const valores = [];
    const agregar = (columna, valor, conversion = "") => {
      valores.push(valor);
      sets.push(`${columna} = $${valores.length}${conversion}`);
    };
    if (datos.fecha !== undefined) agregar("fecha", datos.fecha, "::date");
    if (datos.tipo !== undefined) agregar("tipo", datos.tipo);
    if (datos.nombre !== undefined) agregar("nombre", datos.nombre);
    if (datos.descripcion !== undefined) agregar("descripcion", datos.descripcion || null);
    if (datos.activo !== undefined) agregar("activo", datos.activo);
    sets.push("fecha_actualizacion = NOW()");
    valores.push(id);
    const resultado = await grupo.query(
      `UPDATE calendario_laboral SET ${sets.join(", ")} WHERE id = $${valores.length}
       RETURNING ${COLUMNAS}`,
      valores,
    );
    return resultado.rows[0];
  },

  async eliminar(id) {
    const resultado = await grupo.query(
      `DELETE FROM calendario_laboral WHERE id = $1 RETURNING ${COLUMNAS}`,
      [id],
    );
    return resultado.rows[0];
  },

  /**
   * Fechas (texto 'YYYY-MM-DD', ordenadas, sin repetir) de días oficiales y otorgados activos
   * entre desde y hasta (ambos incluidos). Reutilizable por el cálculo de días hábiles (Fase 4).
   * @param {string} desde 'YYYY-MM-DD'
   * @param {string} hasta 'YYYY-MM-DD'
   * @param {{query: Function}} [cliente] cliente de transacción; por defecto el pool
   * @returns {Promise<string[]>}
   */
  async obtenerFechasNoHabiles(desde, hasta, cliente = grupo) {
    const resultado = await cliente.query(
      `SELECT DISTINCT to_char(fecha, 'YYYY-MM-DD') AS fecha
       FROM calendario_laboral
       WHERE activo = true
         AND tipo = ANY($1::text[])
         AND fecha BETWEEN $2::date AND $3::date
       ORDER BY 1`,
      [TIPOS_NO_HABILES, desde, hasta],
    );
    return resultado.rows.map((fila) => fila.fecha);
  },
};

module.exports = CalendarioLaboral;
module.exports.TIPOS_CALENDARIO = TIPOS_CALENDARIO;
module.exports.TIPOS_NO_HABILES = TIPOS_NO_HABILES;
