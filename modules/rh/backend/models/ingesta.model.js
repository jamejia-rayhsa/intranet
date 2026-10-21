const { grupo } = require("../../../portal/backend/config/database");

const MENSAJE_ERROR_LOTE = "Error interno al procesar el envío";

const Ingesta = {
  /**
   * Procesa un envío YA validado dentro de UNA transacción y UN solo cliente del pool (sin consultas por el
   * pool mientras la transacción está abierta):
   *   lote 'en_curso' -> vinculación de empleados -> INSERT por lotes ON CONFLICT DO NOTHING -> lote 'ok' -> cursor.
   * Si algo falla se revierte TODO y, ya fuera de la transacción, se deja constancia del fallo (lote 'error' con
   * mensaje genérico y ultimo_error del cursor) antes de relanzar el error.
   * `validas`: marcas únicas ya normalizadas por validarMarca (ordenadas por id ascendente).
   */
  async procesarEnvio({ llaveId, origen, ip, hashCuerpo, recibidas, rechazadas, duplicadasEnEnvio, validas }) {
    const cliente = await grupo.connect();
    let errorRollback;
    try {
      await cliente.query("BEGIN");
      try {
        const lote = await cliente.query(
          `INSERT INTO asistencia_sync_lotes (origen, ip, recibidas, rechazadas, hash_cuerpo, llave_id, estatus)
           VALUES ($1, $2, $3, $4, $5, $6, 'en_curso') RETURNING id`,
          [origen, ip, recibidas, rechazadas, hashCuerpo, llaveId],
        );
        const loteId = lote.rows[0].id;

        // empleado_id: solo con UNA coincidencia exacta de numero_nomina (texto exacto, sin normalizar ceros)
        const vinculos = new Map();
        if (validas.length > 0) {
          const codigos = [...new Set(validas.map((m) => m.codigo_empleado))];
          const empleados = await cliente.query(
            `SELECT numero_nomina, MIN(id) AS id, COUNT(*)::int AS coincidencias
             FROM empleados WHERE numero_nomina = ANY($1::text[]) GROUP BY numero_nomina`,
            [codigos],
          );
          for (const e of empleados.rows) if (e.coincidencias === 1) vinculos.set(e.numero_nomina, e.id);
        }

        let insertadas = 0;
        let sinEmpleado = 0;
        if (validas.length > 0) {
          const col = (campo) => validas.map((m) => m[campo]);
          const guardadas = await cliente.query(
            `INSERT INTO asistencia_marcas (origen, id_externo, codigo_empleado, empleado_id, marca_ts, subida_ts,
                estado_marca, tipo_verificacion, terminal_sn, terminal_alias, area_externa, crudo, lote_id)
             SELECT $1, t.id_externo, t.codigo_empleado, t.empleado_id, t.marca_ts::timestamptz, t.subida_ts::timestamptz,
                t.estado_marca, t.tipo_verificacion, t.terminal_sn, t.terminal_alias, t.area_externa, t.crudo::jsonb, $2
             FROM unnest($3::text[], $4::text[], $5::int[], $6::text[], $7::text[], $8::text[], $9::text[],
                         $10::text[], $11::text[], $12::text[], $13::text[])
               WITH ORDINALITY AS t(id_externo, codigo_empleado, empleado_id, marca_ts, subida_ts, estado_marca,
                                    tipo_verificacion, terminal_sn, terminal_alias, area_externa, crudo, orden)
             ORDER BY t.orden
             ON CONFLICT (origen, id_externo) DO NOTHING
             RETURNING id_externo, empleado_id`,
            [
              origen,
              loteId,
              col("id_externo"),
              col("codigo_empleado"),
              validas.map((m) => vinculos.get(m.codigo_empleado) ?? null),
              col("marca_ts"),
              col("subida_ts"),
              col("estado_marca"),
              col("tipo_verificacion"),
              col("terminal_sn"),
              col("terminal_alias"),
              col("area_externa"),
              col("crudo"),
            ],
          );
          insertadas = guardadas.rowCount;
          sinEmpleado = guardadas.rows.filter((f) => f.empleado_id === null).length;
        }
        const duplicadas = validas.length - insertadas + duplicadasEnEnvio;

        await cliente.query(
          `UPDATE asistencia_sync_lotes SET estatus = 'ok', insertadas = $2, duplicadas = $3, sin_empleado = $4 WHERE id = $1`,
          [loteId, insertadas, duplicadas, sinEmpleado],
        );

        // Cursor: todas las válidas ya están guardadas (ahora o antes), así que el mayor id/instante del envío
        // cuenta aunque fueran duplicadas. GREATEST ignora NULL; el UPSERT es atómico y va AL FINAL (el
        // candado de la fila del origen se retiene el menor tiempo posible).
        const mayor = validas.reduce((acc, m) => {
          const id = BigInt(m.id_externo);
          return acc === null || id > acc ? id : acc;
        }, null);
        const mayorMarca = validas.reduce((acc, m) => (acc === null || m.marca_ts > acc ? m.marca_ts : acc), null);
        const mayorSubida = validas.reduce((acc, m) => (m.subida_ts && (acc === null || m.subida_ts > acc) ? m.subida_ts : acc), null);
        const estado = await cliente.query(
          `INSERT INTO asistencia_sync_estado (origen, ultima_marca_ts, ultimo_id_externo, ultima_subida_ts,
              ultimo_lote_id, ultima_sincronizacion, ultimo_error, fecha_actualizacion)
           VALUES ($1, $2::timestamptz, $3::bigint, $4::timestamptz, $5, NOW(), NULL, NOW())
           ON CONFLICT (origen) DO UPDATE SET
             ultima_marca_ts = GREATEST(asistencia_sync_estado.ultima_marca_ts, EXCLUDED.ultima_marca_ts),
             ultimo_id_externo = GREATEST(asistencia_sync_estado.ultimo_id_externo, EXCLUDED.ultimo_id_externo),
             ultima_subida_ts = GREATEST(asistencia_sync_estado.ultima_subida_ts, EXCLUDED.ultima_subida_ts),
             ultimo_lote_id = EXCLUDED.ultimo_lote_id, ultima_sincronizacion = NOW(), ultimo_error = NULL,
             fecha_actualizacion = NOW()
           RETURNING ultimo_id_externo`,
          [origen, mayorMarca, mayor === null ? null : mayor.toString(), mayorSubida, loteId],
        );

        await cliente.query("COMMIT");
        return {
          lote_id: Number(loteId),
          insertadas,
          duplicadas,
          sin_empleado: sinEmpleado,
          ultimo_id_externo: estado.rows[0].ultimo_id_externo === null ? null : String(estado.rows[0].ultimo_id_externo),
        };
      } catch (error) {
        await cliente.query("ROLLBACK").catch((e) => {
          errorRollback = e;
        });
        await Ingesta._registrarFallo(cliente, { llaveId, origen, ip, hashCuerpo, recibidas, rechazadas });
        throw error;
      }
    } finally {
      cliente.release(errorRollback);
    }
  },

  // Fuera de la transacción revertida: el lote 'error' y el ultimo_error NO llevan el mensaje de la BD.
  async _registrarFallo(cliente, { llaveId, origen, ip, hashCuerpo, recibidas, rechazadas }) {
    try {
      await cliente.query(
        `INSERT INTO asistencia_sync_lotes (origen, ip, recibidas, rechazadas, hash_cuerpo, llave_id, estatus, error)
         VALUES ($1, $2, $3, $4, $5, $6, 'error', $7)`,
        [origen, ip, recibidas, rechazadas, hashCuerpo, llaveId, MENSAJE_ERROR_LOTE],
      );
      await cliente.query(
        `INSERT INTO asistencia_sync_estado (origen, ultimo_error, fecha_actualizacion) VALUES ($1, $2, NOW())
         ON CONFLICT (origen) DO UPDATE SET ultimo_error = EXCLUDED.ultimo_error, fecha_actualizacion = NOW()`,
        [origen, MENSAJE_ERROR_LOTE],
      );
    } catch (error) {
      console.error("[Ingesta] No se pudo registrar el fallo del lote:", error.message);
    }
  },

  async estado(origen, cliente = grupo) {
    const fila = await cliente.query(
      `SELECT ultimo_id_externo, ultima_marca_ts, ultima_subida_ts, ultima_sincronizacion AS ultimo_exito, ultimo_error
       FROM asistencia_sync_estado WHERE origen = $1`,
      [origen],
    );
    const total = await cliente.query("SELECT COUNT(*) AS total FROM asistencia_marcas WHERE origen = $1", [origen]);
    return { ...(fila.rows[0] || {}), total_marcas: Number(total.rows[0].total) };
  },

  async lotes({ limite = 50, origen } = {}, cliente = grupo) {
    const r = await cliente.query(
      `SELECT l.id, l.origen, l.estatus, l.recibidas, l.insertadas, l.duplicadas, l.rechazadas, l.sin_empleado,
              l.error, l.ip, l.llave_id, k.prefijo AS llave_prefijo, l.fecha_recepcion
       FROM asistencia_sync_lotes l LEFT JOIN asistencia_llaves k ON k.id = l.llave_id
       WHERE ($2::text IS NULL OR l.origen = $2)
       ORDER BY l.id DESC LIMIT $1`,
      [limite, origen || null],
    );
    return r.rows;
  },

  /**
   * Re-vinculación de marcas huérfanas (empleado_id NULL) cuyo codigo_empleado coincide con UN SOLO
   * numero_nomina (texto exacto). Lotes de `limite` filas con SKIP LOCKED; el trigger de inmutabilidad
   * permite el cambio porque solo toca empleado_id. La Fase 4 la ejecutará periódicamente.
   * Devuelve { vinculadas, pendientes } (pendientes = huérfanas que siguen sin empleado).
   */
  async vincularHuerfanas({ limite = 5000 } = {}, cliente = grupo) {
    const r = await cliente.query(
      `WITH unicos AS (
         SELECT numero_nomina, MIN(id) AS id FROM empleados
         WHERE numero_nomina IS NOT NULL GROUP BY numero_nomina HAVING COUNT(*) = 1
       ), candidatas AS (
         SELECT m.id, u.id AS empleado_id
         FROM asistencia_marcas m JOIN unicos u ON u.numero_nomina = m.codigo_empleado
         WHERE m.empleado_id IS NULL
         ORDER BY m.id LIMIT $1
         FOR UPDATE OF m SKIP LOCKED
       )
       UPDATE asistencia_marcas m SET empleado_id = c.empleado_id
       FROM candidatas c WHERE m.id = c.id
       RETURNING m.id`,
      [limite],
    );
    const pendientes = await cliente.query("SELECT COUNT(*) AS total FROM asistencia_marcas WHERE empleado_id IS NULL");
    return { vinculadas: r.rowCount, pendientes: Number(pendientes.rows[0].total) };
  },
};

module.exports = Ingesta;
