const { grupo } = require("../../../portal/backend/config/database");
const { generarLlave } = require("../utils/llaveIngesta");

// Nunca se selecciona hash_llave fuera de buscarPorPrefijo (la autenticación). El listado y las respuestas
// de administración solo exponen el prefijo.
const COLUMNAS_PUBLICAS = `id, nombre, origen, prefijo, estado, vigente_desde, vigente_hasta, ips_permitidas,
  ultimo_uso, ultima_ip, reemplaza_a, creado_por, fecha_creacion, fecha_actualizacion, revocada_por, fecha_revocacion,
  CASE WHEN estado = 'revocada' THEN 'revocada'
       WHEN vigente_desde > NOW() THEN 'pendiente'
       WHEN vigente_hasta IS NOT NULL AND vigente_hasta <= NOW() THEN 'vencida'
       ELSE 'activa' END AS estado_efectivo`;

const MAX_REINTENTOS_PREFIJO = 5;

const LlaveIngesta = {
  COLUMNAS_PUBLICAS,

  // Ejecuta fn(cliente) dentro de BEGIN/COMMIT; ante cualquier error hace ROLLBACK y lo relanza.
  async enTransaccion(fn) {
    const cliente = await grupo.connect();
    let errorRollback;
    try {
      await cliente.query("BEGIN");
      const resultado = await fn(cliente);
      await cliente.query("COMMIT");
      return resultado;
    } catch (error) {
      await cliente.query("ROLLBACK").catch((e) => {
        errorRollback = e;
      });
      throw error;
    } finally {
      cliente.release(errorRollback);
    }
  },

  // Autenticación: la vigencia se evalúa con el reloj de la BD (una sola fuente de tiempo).
  async buscarPorPrefijo(prefijo, cliente = grupo) {
    const r = await cliente.query(
      `SELECT id, nombre, origen, prefijo, hash_llave, estado, ips_permitidas,
              (vigente_desde <= NOW() AND (vigente_hasta IS NULL OR vigente_hasta > NOW())) AS vigente_ahora
       FROM asistencia_llaves WHERE prefijo = $1`,
      [prefijo],
    );
    return r.rows[0] || null;
  },

  // Se llama sin esperar su resultado: nunca debe frenar ni tumbar la petición de ingesta.
  async tocarUso(id, ip, cliente = grupo) {
    await cliente.query("UPDATE asistencia_llaves SET ultimo_uso = NOW(), ultima_ip = $2 WHERE id = $1", [
      id,
      ip ? String(ip).slice(0, 45) : null,
    ]);
  },

  async listar(cliente = grupo) {
    const r = await cliente.query(`SELECT ${COLUMNAS_PUBLICAS} FROM asistencia_llaves ORDER BY id DESC`);
    return r.rows;
  },

  async obtenerPorId(id, cliente = grupo, bloquear = false) {
    const r = await cliente.query(
      `SELECT ${COLUMNAS_PUBLICAS} FROM asistencia_llaves WHERE id = $1${bloquear ? " FOR UPDATE" : ""}`,
      [id],
    );
    return r.rows[0] || null;
  },

  // Inserta la llave con un prefijo nuevo (si el prefijo de 32 bits ya existe, genera otra). `cliente` debe
  // estar DENTRO de una transacción (usa SAVEPOINT). Devuelve
  // { fila, llave }: la llave en claro SOLO existe aquí y en la respuesta del alta; no se guarda ni se registra.
  async insertar(
    { nombre, origen, ips_permitidas, vigente_hasta, creado_por, reemplaza_a = null },
    cliente,
  ) {
    for (let intento = 0; intento < MAX_REINTENTOS_PREFIJO; intento += 1) {
      const { llave, prefijo, hash } = generarLlave();
      // SAVEPOINT: un choque de prefijo no debe abortar la transacción de quien llama (rotación)
      await cliente.query("SAVEPOINT alta_llave");
      try {
        const r = await cliente.query(
          `INSERT INTO asistencia_llaves (nombre, origen, prefijo, hash_llave, ips_permitidas, vigente_hasta, creado_por, reemplaza_a)
           VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8)
           RETURNING ${COLUMNAS_PUBLICAS}`,
          [nombre, origen, prefijo, hash, ips_permitidas, vigente_hasta, creado_por, reemplaza_a],
        );
        await cliente.query("RELEASE SAVEPOINT alta_llave");
        return { fila: r.rows[0], llave };
      } catch (error) {
        await cliente.query("ROLLBACK TO SAVEPOINT alta_llave");
        if (error.code !== "23505" || intento === MAX_REINTENTOS_PREFIJO - 1) throw error;
      }
    }
    throw new Error("No se pudo generar una llave única");
  },

  // Fija el fin de vigencia de la llave anterior: nunca amplía uno ya existente más corto.
  async acotarVigencia(id, segundos, cliente = grupo) {
    const r = await cliente.query(
      `UPDATE asistencia_llaves
       SET vigente_hasta = LEAST(COALESCE(vigente_hasta, 'infinity'::timestamptz), GREATEST(NOW() + make_interval(secs => $2), vigente_desde)),
           fecha_actualizacion = NOW()
       WHERE id = $1
       RETURNING ${COLUMNAS_PUBLICAS}`,
      [id, segundos],
    );
    return r.rows[0] || null;
  },

  async revocar(id, usuarioId, cliente = grupo) {
    const r = await cliente.query(
      `UPDATE asistencia_llaves
       SET estado = 'revocada', fecha_revocacion = NOW(), revocada_por = $2, fecha_actualizacion = NOW()
       WHERE id = $1 AND estado = 'activa'
       RETURNING ${COLUMNAS_PUBLICAS}`,
      [id, usuarioId],
    );
    return r.rows[0] || null;
  },

  async actualizarIps(id, ips, cliente = grupo) {
    const r = await cliente.query(
      `UPDATE asistencia_llaves SET ips_permitidas = $2::text[], fecha_actualizacion = NOW()
       WHERE id = $1 AND estado = 'activa'
       RETURNING ${COLUMNAS_PUBLICAS}`,
      [id, ips],
    );
    return r.rows[0] || null;
  },

  // Auditoría acotada de accesos rechazados: una fila por (hora, IP, motivo) con contador.
  async registrarRechazo({ hora, ip, motivo, prefijo, llaveId, intentos }, cliente = grupo) {
    await cliente.query(
      `INSERT INTO asistencia_llaves_rechazos (hora, ip, motivo, prefijo, llave_id, intentos)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (hora, ip, motivo) DO UPDATE
         SET intentos = asistencia_llaves_rechazos.intentos + EXCLUDED.intentos, ultima = NOW(),
             prefijo = COALESCE(EXCLUDED.prefijo, asistencia_llaves_rechazos.prefijo),
             llave_id = COALESCE(EXCLUDED.llave_id, asistencia_llaves_rechazos.llave_id)`,
      [hora, ip, motivo, prefijo, llaveId, intentos],
    );
  },

  async podarRechazos(dias, cliente = grupo) {
    await cliente.query("DELETE FROM asistencia_llaves_rechazos WHERE ultima < NOW() - make_interval(days => $1)", [dias]);
  },
};

module.exports = LlaveIngesta;
