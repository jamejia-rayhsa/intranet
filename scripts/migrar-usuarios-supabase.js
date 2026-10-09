#!/usr/bin/env node
/**
 * Migra los usuarios locales (tabla `usuarios`) a Supabase Auth (GoTrue).
 *
 * Uso:
 *   npm run db:migrar-usuarios-supabase -- [--dry-run] [--only=<correo>] [--limit=N]
 *   node scripts/migrar-usuarios-supabase.js --dry-run
 *
 * Variables: POSTGRES_HOST/PORT/DB/USER/PASSWORD (BD) y las que exija
 * modules/portal/backend/services/supabaseAdmin.service.js (URL y service role key).
 *
 * Comportamiento:
 *  - Toma usuarios con `activo = true AND auth_uid IS NULL`.
 *  - Si el correo ya existe en GoTrue, solo vincula `auth_uid`.
 *  - Si no, lo crea importando el hash bcrypt tal cual (GoTrue acepta $2a/$2b/$2y).
 *    Usuarios `auth_tipo = 'ms365'` se crean sin contrasena y ya vinculados (en su
 *    primer login con Microsoft, GoTrue asocia la identidad azure por correo; el
 *    backend autoriza solo por auth_uid). Usuarios locales sin hash se omiten.
 *  - Idempotente: re-ejecutar no duplica (el UPDATE exige auth_uid IS NULL).
 *  - Continua ante errores por usuario; codigo de salida 1 si hubo errores.
 *  - --dry-run no escribe en BD ni en GoTrue (solo consulta por correo).
 *  - Nunca imprime hashes ni contrasenas.
 */
const { Pool } = require("pg");

function parsearArgs(argv) {
  const opts = { dryRun: false, only: null, limit: null };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--only=")) opts.only = arg.slice(7).trim();
    else if (arg.startsWith("--limit=")) {
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

async function leerPendientes(pool, { only, limit }) {
  const valores = [];
  let sql =
    "SELECT id, correo, nombre, apellido, auth_tipo, hash_password FROM usuarios WHERE activo = true AND auth_uid IS NULL";
  if (only) {
    valores.push(only.toLowerCase());
    sql += ` AND lower(correo) = $${valores.length}`;
  }
  sql += " ORDER BY id";
  if (limit) {
    valores.push(limit);
    sql += ` LIMIT $${valores.length}`;
  }
  const { rows } = await pool.query(sql, valores);
  return rows;
}

function correoGoTrue(usuario) {
  return String(usuario.correo || "").trim().toLowerCase();
}

/** Decide la accion sin escribir nada. Devuelve [{ usuario, accion, motivo?, existente? }] */
async function planificar(usuarios, servicio) {
  const plan = [];
  for (const usuario of usuarios) {
    const correo = correoGoTrue(usuario);
    if (!correo) {
      plan.push({ usuario, accion: "omitir", motivo: "sin correo" });
      continue;
    }
    try {
      const existente = await servicio.buscarPorCorreo(correo);
      if (existente) {
        plan.push({ usuario, accion: "vincular", existente });
      } else if (usuario.auth_tipo !== "ms365" && !usuario.hash_password) {
        plan.push({ usuario, accion: "omitir", motivo: "usuario local sin hash" });
      } else {
        plan.push({ usuario, accion: "crear" });
      }
    } catch (e) {
      plan.push({ usuario, accion: "error", motivo: e.message });
    }
  }
  return plan;
}

async function vincular(pool, usuarioId, authUid) {
  const r = await pool.query(
    "UPDATE usuarios SET auth_uid = $1 WHERE id = $2 AND auth_uid IS NULL",
    [authUid, usuarioId],
  );
  return r.rowCount > 0;
}

/**
 * Migra un usuario. Retorna { estado: 'creado'|'vinculado'|'omitido', motivo? }.
 * Lanza si falla (el llamador decide continuar).
 */
async function migrarUno(usuario, { pool, servicio, dryRun = false }) {
  const correo = correoGoTrue(usuario);
  if (!correo) return { estado: "omitido", motivo: "sin correo" };

  let existente = await servicio.buscarPorCorreo(correo);
  let creado = false;

  if (!existente) {
    if (usuario.auth_tipo !== "ms365" && !usuario.hash_password) {
      return { estado: "omitido", motivo: "usuario local sin hash" };
    }
    if (dryRun) return { estado: "creado", motivo: "dry-run" };

    const datos = {
      correo,
      metadata: {
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
      },
    };
    if (usuario.auth_tipo !== "ms365") datos.passwordHash = usuario.hash_password;

    try {
      existente = await servicio.crearUsuario(datos);
      creado = true;
    } catch (e) {
      // Carrera/idempotencia: si ya existe, vincular en lugar de fallar
      if (e && (e.status === 422 || e.status === 409)) {
        existente = await servicio.buscarPorCorreo(correo);
      }
      if (!existente) throw e;
    }
  } else if (dryRun) {
    return { estado: "vinculado", motivo: "dry-run" };
  }

  const ok = await vincular(pool, usuario.id, existente.id);
  if (!ok) {
    // Alguien vinculo al usuario entre la lectura y el UPDATE: no dejar huerfanos
    if (creado) await servicio.eliminarUsuario(existente.id).catch(() => {});
    return { estado: "omitido", motivo: "ya vinculado por otro proceso" };
  }
  return { estado: creado ? "creado" : "vinculado" };
}

async function ejecutar(opts, { pool, servicio, log = console.log }) {
  const usuarios = await leerPendientes(pool, opts);
  log(
    `Usuarios pendientes: ${usuarios.length}${opts.dryRun ? " (dry-run: no se escribe nada)" : ""}`,
  );

  const resumen = { creados: 0, vinculados: 0, omitidos: 0, errores: 0 };

  if (opts.dryRun) {
    const plan = await planificar(usuarios, servicio);
    for (const p of plan) {
      const extra = p.motivo ? ` (${p.motivo})` : "";
      log(`  [${p.accion}] id=${p.usuario.id} ${p.usuario.correo} tipo=${p.usuario.auth_tipo}${extra}`);
      if (p.accion === "crear") resumen.creados++;
      else if (p.accion === "vincular") resumen.vinculados++;
      else if (p.accion === "omitir") resumen.omitidos++;
      else resumen.errores++;
    }
    return resumen;
  }

  for (const usuario of usuarios) {
    try {
      const r = await migrarUno(usuario, { pool, servicio, dryRun: false });
      if (r.estado === "creado") resumen.creados++;
      else if (r.estado === "vinculado") resumen.vinculados++;
      else resumen.omitidos++;
      log(`  [${r.estado}] id=${usuario.id} ${usuario.correo}${r.motivo ? ` (${r.motivo})` : ""}`);
    } catch (e) {
      resumen.errores++;
      log(`  [error] id=${usuario.id} ${usuario.correo}: ${e.message}`);
    }
  }
  return resumen;
}

async function main() {
  const opts = parsearArgs(process.argv.slice(2));
  const servicio = require("../modules/portal/backend/services/supabaseAdmin.service");
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB || "postgres",
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "dev_password_123",
  });
  try {
    const r = await ejecutar(opts, { pool, servicio });
    console.log(
      `Resumen: creados=${r.creados} vinculados=${r.vinculados} omitidos=${r.omitidos} errores=${r.errores}`,
    );
    return r.errores > 0 ? 1 : 0;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main()
    .then((codigo) => process.exit(codigo))
    .catch((e) => {
      // Solo el mensaje: nunca credenciales ni objetos de configuracion
      console.error("Error en migracion de usuarios:", e.code || "", e.message);
      process.exit(1);
    });
}

module.exports = { parsearArgs, leerPendientes, planificar, migrarUno, ejecutar };
