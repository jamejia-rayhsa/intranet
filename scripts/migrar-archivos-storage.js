#!/usr/bin/env node
/**
 * Migra los archivos legados (volumen `uploads`) a Supabase Storage.
 *
 * Uso:
 *   npm run db:migrar-archivos-storage -- [--dry-run] [--limit=N] [--tabla=<nombre>]
 *   node scripts/migrar-archivos-storage.js --dry-run
 *
 * Variables: POSTGRES_HOST/PORT/DB/USER/PASSWORD, UPLOADS_DIR (default ./uploads) y las que
 * exija modules/portal/backend/services/storage.service.js (SUPABASE_STORAGE_URL, service key).
 *
 * Por cada fila con `ruta_archivo LIKE '/uploads/%'`:
 *  - Si el archivo no esta en disco: se registra como "faltante" y la fila NO se toca.
 *  - Si existe: se sube a Storage y SOLO entonces se hace
 *    UPDATE ... SET ruta_archivo = <clave> WHERE id = $id AND ruta_archivo = <ruta vieja>
 *    (idempotente y a prueba de carreras).
 *  - NUNCA se borra el archivo de origen.
 * --dry-run no sube ni escribe. Salida con codigo 1 si hubo errores o faltantes.
 * No imprime contenidos de archivos ni credenciales.
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const TABLAS = [
  { tabla: "ticket_adjuntos", bucket: "TICKETS", carpeta: "tickets", prefijo: "ticket_id", tipo: true },
  { tabla: "expediente_documentos", bucket: "EXPEDIENTES", carpeta: "expedientes", prefijo: "empleado_id", tipo: false },
  { tabla: "recibos_nomina", bucket: "RECIBOS", carpeta: "recibos", prefijo: "empleado_id", tipo: false },
  { tabla: "noticia_imagenes", bucket: "NOTICIAS", carpeta: "noticias", prefijo: null, tipo: false },
];

const MIME_POR_EXTENSION = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".zip": "application/zip",
};

function parsearArgs(argv) {
  const opts = { dryRun: false, limit: null, tabla: null };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--tabla=")) {
      opts.tabla = arg.slice(8).trim();
      if (!TABLAS.some((t) => t.tabla === opts.tabla)) {
        throw new Error(`--tabla invalida. Opciones: ${TABLAS.map((t) => t.tabla).join(", ")}`);
      }
    } else if (arg.startsWith("--limit=")) {
      const n = parseInt(arg.slice(8), 10);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit debe ser un entero positivo");
      }
      opts.limit = n;
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }
  return opts;
}

function inferirMime(fila, cfg) {
  if (cfg.tipo && fila.tipo_archivo) return fila.tipo_archivo;
  const ext = path.extname(fila.ruta_archivo).toLowerCase();
  return MIME_POR_EXTENSION[ext] || "application/octet-stream";
}

function directorioOrigen(cfg, uploadsDir) {
  return path.join(uploadsDir, cfg.carpeta);
}

// Ruta absoluta del archivo legado, o null si la ruta de la fila no es del formato esperado
function rutaEnDisco(fila, cfg, uploadsDir) {
  const prefijo = `/uploads/${cfg.carpeta}/`;
  if (!fila.ruta_archivo.startsWith(prefijo)) return null;
  const nombre = path.basename(fila.ruta_archivo);
  if (!nombre || fila.ruta_archivo.slice(prefijo.length) !== nombre) return null;
  return path.join(directorioOrigen(cfg, uploadsDir), nombre);
}

function existeArchivo(ruta, fsLib) {
  return fsLib.promises
    .stat(ruta)
    .then((s) => s.isFile())
    .catch(() => false);
}

/**
 * Lee filas pendientes y las clasifica. Devuelve conteos y la lista de filas migrables.
 * { yaMigrados, pendientes: [{fila, ruta, existe}], huerfanos }
 */
async function planificarTabla(cfg, { pool, uploadsDir, limit = null, fs: fsLib = fs }) {
  const columnas = ["id", "ruta_archivo", "nombre_archivo"];
  if (cfg.prefijo) columnas.push(cfg.prefijo);
  if (cfg.tipo) columnas.push("tipo_archivo");

  const migrados = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ${cfg.tabla} WHERE ruta_archivo NOT LIKE '/uploads/%'`,
  );
  const sql =
    `SELECT ${columnas.join(", ")} FROM ${cfg.tabla} ` +
    `WHERE ruta_archivo LIKE '/uploads/%' ORDER BY id` +
    (limit ? " LIMIT $1" : "");
  const filas = (await pool.query(sql, limit ? [limit] : [])).rows;

  const pendientes = [];
  const referenciados = new Set();
  for (const fila of filas) {
    const ruta = rutaEnDisco(fila, cfg, uploadsDir);
    if (ruta) referenciados.add(path.basename(ruta));
    pendientes.push({ fila, ruta, existe: ruta ? await existeArchivo(ruta, fsLib) : false });
  }

  // Huerfanos: archivos de la carpeta sin fila legada pendiente (incluye los ya migrados
  // en corridas previas, cuyo archivo origen se conserva a proposito). Solo es exacto sin --limit.
  let huerfanos = 0;
  try {
    const todos = (await pool.query(
      `SELECT ruta_archivo FROM ${cfg.tabla} WHERE ruta_archivo LIKE '/uploads/%'`,
    )).rows.map((r) => path.basename(r.ruta_archivo));
    const conFila = new Set(todos);
    const enDisco = await fsLib.promises.readdir(directorioOrigen(cfg, uploadsDir), { withFileTypes: true });
    huerfanos = enDisco.filter((e) => e.isFile() && !conFila.has(e.name)).length;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  return { yaMigrados: migrados.rows[0].n, pendientes, huerfanos };
}

/** Migra una fila. Estados: migrado | dry-run | faltante | ya-migrado | error */
async function migrarFila(item, cfg, { pool, storage, uploadsDir, dryRun = false, fs: fsLib = fs }) {
  const { fila, ruta } = item;
  const existe = item.existe !== undefined ? item.existe : ruta ? await existeArchivo(ruta, fsLib) : false;
  if (!ruta || !existe) return { estado: "faltante" };

  const nombreOriginal = fila.nombre_archivo || path.basename(ruta);
  const prefijo = cfg.prefijo ? `${fila[cfg.prefijo]}/` : "";
  const bucket = storage.BUCKETS[cfg.bucket];
  const clave = `${prefijo}${storage.claveSegura(nombreOriginal)}`;
  if (dryRun) return { estado: "dry-run", clave };

  try {
    const buffer = await fsLib.promises.readFile(ruta);
    await storage.subir(bucket, clave, buffer, inferirMime(fila, cfg));
  } catch (e) {
    return { estado: "error", motivo: e.message };
  }

  try {
    const r = await pool.query(
      `UPDATE ${cfg.tabla} SET ruta_archivo = $1 WHERE id = $2 AND ruta_archivo = $3`,
      [clave, fila.id, fila.ruta_archivo],
    );
    if (r.rowCount === 0) {
      // Otra ejecucion migro la fila entre medias: limpiar nuestro objeto sobrante
      await storage.eliminar(bucket, clave).catch(() => {});
      return { estado: "ya-migrado" };
    }
  } catch (e) {
    // La fila sigue apuntando al archivo legado; el objeto subido queda sobrante
    await storage.eliminar(bucket, clave).catch(() => {});
    return { estado: "error", motivo: e.message };
  }
  return { estado: "migrado", clave };
}

async function ejecutar(opts, { pool, storage, uploadsDir, fs: fsLib = fs, log = console.log }) {
  const tablas = TABLAS.filter((t) => !opts.tabla || t.tabla === opts.tabla);
  const resumen = {};
  if (!opts.dryRun) await storage.asegurarBuckets();

  for (const cfg of tablas) {
    const r = { migrados: 0, yaMigrados: 0, faltantes: 0, errores: 0, simulados: 0, huerfanos: 0 };
    const plan = await planificarTabla(cfg, { pool, uploadsDir, limit: opts.limit, fs: fsLib });
    r.yaMigrados = plan.yaMigrados;
    r.huerfanos = plan.huerfanos;
    log(`[${cfg.tabla}] pendientes=${plan.pendientes.length}`);
    for (const item of plan.pendientes) {
      const res = await migrarFila(item, cfg, { pool, storage, uploadsDir, dryRun: opts.dryRun, fs: fsLib });
      if (res.estado === "migrado") r.migrados++;
      else if (res.estado === "dry-run") r.simulados++;
      else if (res.estado === "ya-migrado") r.yaMigrados++;
      else if (res.estado === "faltante") {
        r.faltantes++;
        log(`  [faltante] ${cfg.tabla} id=${item.fila.id}`);
      } else {
        r.errores++;
        log(`  [error] ${cfg.tabla} id=${item.fila.id}: ${res.motivo}`);
      }
    }
    resumen[cfg.tabla] = r;
  }

  log(opts.dryRun ? "Resumen (DRY-RUN, no se subio ni escribio nada):" : "Resumen:");
  for (const [tabla, r] of Object.entries(resumen)) {
    log(
      `  ${tabla}: migrados=${r.migrados}${opts.dryRun ? ` (migrables=${r.simulados})` : ""} ` +
        `ya_migrados=${r.yaMigrados} faltantes=${r.faltantes} errores=${r.errores} ` +
        `huerfanos_en_disco=${r.huerfanos}`,
    );
  }
  return resumen;
}

function hayProblemas(resumen) {
  return Object.values(resumen).some((r) => r.errores > 0 || r.faltantes > 0);
}

async function main() {
  const opts = parsearArgs(process.argv.slice(2));
  const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB || "postgres",
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "dev_password_123",
  });
  try {
    const storage = require("../modules/portal/backend/services/storage.service");
    const resumen = await ejecutar(opts, { pool, storage, uploadsDir });
    return hayProblemas(resumen) ? 1 : 0;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main()
    .then((codigo) => process.exit(codigo))
    .catch((e) => {
      // Solo codigo y mensaje: nunca credenciales ni objetos de configuracion
      console.error("Error en migracion de archivos:", e.code || "", e.message);
      process.exit(1);
    });
}

module.exports = {
  TABLAS,
  parsearArgs,
  inferirMime,
  planificarTabla,
  migrarFila,
  ejecutar,
  hayProblemas,
};
