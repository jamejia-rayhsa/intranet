#!/usr/bin/env node
/* eslint-disable no-console */
// Verificación del motor de análisis de asistencia contra un PostgreSQL REAL y desechable (datos 100 % ficticios).
//
//   node scripts/asistencia/verificar-motor.js --pg postgres://postgres:CLAVE@127.0.0.1:55432/postgres [--semilla 7] [--puerto 4650]
//
// Requisitos: la base ya tiene el esquema (init.sql o las migraciones 009-014) y NO tiene datos de empleados.
// Qué hace (cada comprobación se imprime como PASS/FAIL y el proceso sale con código 1 si algo falla):
//   1. Siembra 71 empleados ficticios con casos especiales (sin nómina, sin departamento, nómina repetida, bajas e ingresos
//      a mitad de periodo, turnos individuales, vacaciones, permisos, festivos) y arranca el BACKEND REAL (app.js).
//   2. Carga marcas realistas con el simulador (modo jornadas) por el endpoint REAL de ingesta con llave.
//   3. Calcula con el motor y compara CADA día con un ORÁCULO independiente (escrito aquí abajo, con la hora local calculada
//      por PostgreSQL y no por Intl): idempotencia, periodos cerrados intactos tras editar un turno o transferir a alguien,
//      reapertura, marcas tardías y re-vinculadas (ajustes pendientes), rendimiento, concurrencia, planificador con dos
//      réplicas y la API real con tokens HS256 del contrato del middleware (permisos por rol e IDOR).
const { spawn } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const { generarJornadas } = require("./simulador-marcas");

// ------------------------------------------------------------------ argumentos y utilidades
function argumentos() {
  const r = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 2) r[a[i].replace(/^--/, "")] = a[i + 1];
  return r;
}
const ARG = argumentos();
if (!ARG.pg) {
  console.error("Uso: node scripts/asistencia/verificar-motor.js --pg postgres://usuario:clave@host:puerto/base [--semilla N] [--puerto N]");
  process.exit(2);
}
const URL_PG = new URL(ARG.pg);
const SEMILLA = Number(ARG.semilla || 7);
const PUERTO = Number(ARG.puerto || 4650);
const SECRETO_JWT = crypto.randomBytes(32).toString("hex");
// Debe fijarse ANTES de cargar los módulos del backend (leen su pool del entorno al importarse)
Object.assign(process.env, {
  POSTGRES_HOST: URL_PG.hostname, POSTGRES_PORT: URL_PG.port || "5432", POSTGRES_DB: URL_PG.pathname.slice(1) || "postgres",
  POSTGRES_USER: decodeURIComponent(URL_PG.username), POSTGRES_PASSWORD: decodeURIComponent(URL_PG.password),
  SUPABASE_JWT_SECRET: SECRETO_JWT,
});

const pg = new Pool({ connectionString: ARG.pg, max: 4 });
const q = (sql, params) => pg.query(sql, params);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let pasaron = 0;
const fallos = [];
function comprobar(nombre, condicion, detalle = "") {
  if (condicion) {
    pasaron++;
    console.log(`  PASS ${nombre}`);
  } else {
    fallos.push(nombre);
    console.log(`  FAIL ${nombre} ${detalle}`);
  }
}
const seccion = (t) => console.log(`\n== ${t}`);

// ------------------------------------------------------------------ fechas (texto) y azar
const MS_DIA = 86400000;
const num = (f) => Math.round(Date.parse(`${f}T00:00:00Z`) / MS_DIA);
const fechaDe = (n) => new Date(n * MS_DIA).toISOString().slice(0, 10);
const dow = (f) => new Date(`${f}T12:00:00Z`).getUTCDay(); // 0 domingo
const rango = (a, b) => Array.from({ length: num(b) - num(a) + 1 }, (_, i) => fechaDe(num(a) + i));

// ------------------------------------------------------------------ siembra
const ANALISIS_DESDE = "2026-09-01";
const HOY = "2026-10-23";
const AHORA = new Date("2026-10-23T18:00:00Z"); // 12:00 en México: los días de hoy aún no terminan
const N_EMPLEADOS = 71;
const NOMINA_SIN = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

async function sembrar() {
  seccion("Siembra de datos ficticios");
  await q("INSERT INTO areas (nombre) VALUES ('Area ficticia') ON CONFLICT DO NOTHING");
  const deptos = [];
  for (const n of ["Depto A", "Depto B", "Depto C", "Depto D"]) {
    const r = await q("INSERT INTO departamentos (nombre) VALUES ($1) ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id", [n]);
    deptos.push(r.rows[0].id);
  }
  const turnos = await q("SELECT id, nombre FROM turnos ORDER BY id");
  const rayhsa = turnos.rows.find((t) => t.nombre === "Rayhsa").id;
  const logistica = turnos.rows.find((t) => t.nombre === "Logística").id;
  // turno nocturno propio (22:00 a 06:00, cruza la medianoche)
  const noche = (await q(
    `INSERT INTO turnos (nombre, tolerancia_retardo_min, umbral_falta_min, tolerancia_salida_min, ventana_entrada_antes_min, ventana_entrada_despues_min,
       ventana_salida_antes_min, ventana_salida_despues_min, descanso_min) VALUES ('Noche ficticio', 10, 30, 3, 60, 150, 5, 359, 0) RETURNING id`,
  )).rows[0].id;
  await q(
    `INSERT INTO turno_dias (turno_id, dia_semana, laborable, hora_entrada, hora_salida, cruza_medianoche)
     SELECT $1, d, d <= 5, CASE WHEN d <= 5 THEN TIME '22:00' END, CASE WHEN d <= 5 THEN TIME '06:00' END, d <= 5 FROM generate_series(1, 7) d`,
    [noche],
  );
  for (const d of deptos) {
    await q("INSERT INTO turno_departamento (departamento_id, turno_id, vigente_desde) VALUES ($1, $2, '2026-01-01')", [d, rayhsa]);
  }
  const empleados = [];
  for (let i = 1; i <= N_EMPLEADOS; i++) {
    let nomina = NOMINA_SIN.has(i) ? null : String(9000 + i);
    if (i === 11) nomina = "9010"; // nómina repetida con el 10: ninguno de los dos se analiza
    const depto = i === 9 ? null : deptos[i % 4];
    let ingreso = "2020-01-01";
    let baja = null;
    let estatus = "activo";
    if (i === 12) { baja = "2026-10-07"; estatus = "baja"; }
    if (i === 13) { baja = "2026-09-24"; estatus = "baja"; }
    if (i === 14) { baja = "2026-10-20"; estatus = "baja"; }
    if (i === 15) { estatus = "baja"; } // baja sin fecha: no se analiza
    if (i === 70) { baja = "2026-08-20"; estatus = "baja"; } // baja anterior al análisis
    if (i === 16) ingreso = "2026-09-21";
    if (i === 17) ingreso = "2026-10-12";
    const r = await q(
      `INSERT INTO empleados (nombre, apellido_paterno, numero_nomina, estatus, fecha_ingreso, fecha_baja, departamento_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [`Empleado${i}`, `Ficticio${i}`, nomina, estatus, ingreso, baja, depto],
    );
    empleados.push({ i, id: r.rows[0].id, nomina, depto, ingreso, baja, estatus });
  }
  // 5 empleados extra para los casos de borde de las reglas de entrada y salida (nóminas 9201-9205)
  for (let k = 1; k <= 5; k++) {
    const r = await q(
      `INSERT INTO empleados (nombre, apellido_paterno, numero_nomina, estatus, fecha_ingreso, departamento_id) VALUES ($1, $2, $3, 'activo', '2020-01-01', $4) RETURNING id`,
      [`Borde${k}`, `Ficticio${k}`, String(9200 + k), deptos[0]],
    );
    empleados.push({ i: 100 + k, id: r.rows[0].id, nomina: String(9200 + k), depto: deptos[0], ingreso: "2020-01-01", baja: null, estatus: "activo" });
  }
  const porI = (i) => empleados.find((e) => e.i === i);
  // jefes: 21 manda a 22-24 y 25 manda a 26
  for (const [sub, jefe] of [[22, 21], [23, 21], [24, 21], [26, 25]]) {
    await q("UPDATE empleados SET jefe_inmediato_id = $1 WHERE id = $2", [porI(jefe).id, porI(sub).id]);
  }
  // turnos individuales: 18 en Logística desde octubre, 19 nocturno todo el periodo
  await q("INSERT INTO turno_empleado (empleado_id, turno_id, vigente_desde) VALUES ($1, $2, '2026-10-01')", [porI(18).id, logistica]);
  await q("INSERT INTO turno_empleado (empleado_id, turno_id, vigente_desde) VALUES ($1, $2, '2026-01-01')", [porI(19).id, noche]);
  // calendario: oficial 16-sep, otorgado 12-oct; el resto NO debe cambiar el día
  for (const [f, t, a] of [["2026-09-16", "oficial", true], ["2026-10-12", "otorgado", true], ["2026-09-22", "evento", true], ["2026-10-14", "actividad", true], ["2026-09-30", "oficial", false]]) {
    await q("INSERT INTO calendario_laboral (fecha, tipo, nombre, activo) VALUES ($1, $2, $3, $4) ON CONFLICT (fecha, tipo) DO NOTHING", [f, t, `Fecha ficticia ${f}`, a]);
  }
  const vac = async (i, ini, fin, est) =>
    q(
      `INSERT INTO solicitudes_vacaciones (empleado_id, fecha_inicial, fecha_final, periodo, dias_periodo, dias_pendientes_inicial, dias_a_disfrutar, dias_pendientes_final, estatus)
       VALUES ($1, $2, $3, 2026, 12, 12, 5, 7, $4)`,
      [porI(i).id, ini, fin, est],
    );
  await vac(30, "2026-09-14", "2026-09-18", "aprobado"); // cruza el festivo del 16
  await vac(31, "2026-10-05", "2026-10-09", "aprobado");
  await vac(32, "2026-10-10", "2026-10-13", "aprobado"); // sábado, domingo, otorgado del 12 y martes 13
  await vac(33, "2026-10-19", "2026-10-21", "pendiente");
  await vac(34, "2026-10-19", "2026-10-21", "rechazado");
  await vac(35, "2026-10-22", "2026-10-30", "aprobado"); // en curso
  const perm = async (i, ini, fin, est, tipo = "asunto_personal") =>
    q("INSERT INTO permisos_ausencia (empleado_id, tipo, fecha_inicio, fecha_fin, estatus) VALUES ($1, $2, $3, $4, $5)", [porI(i).id, tipo, ini, fin, est]);
  await perm(36, "2026-10-14", "2026-10-14", "aprobado");
  await perm(37, "2026-09-28", "2026-09-29", "aprobado");
  await perm(38, "2026-10-06", "2026-10-06", "pendiente");
  await perm(39, "2026-10-19", "2026-10-21", "aprobado", "incapacidad");
  console.log(`  ${empleados.length} empleados, ${deptos.length} departamentos, turnos: Rayhsa=${rayhsa} Logística=${logistica} Noche=${noche}`);
  return { empleados, porI, deptos, rayhsa, logistica, noche };
}

// ------------------------------------------------------------------ usuarios, roles y tokens HS256 (contrato del middleware)
async function sembrarUsuarios(S) {
  const rol = async (nombre, opciones) => {
    let r = await q("SELECT id FROM roles WHERE nombre = $1", [nombre]);
    if (!r.rows[0]) r = await q("INSERT INTO roles (nombre) VALUES ($1) RETURNING id", [nombre]);
    for (const [opcion, tipos] of Object.entries(opciones)) {
      for (const tipo of tipos) {
        await q(
          `INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
           SELECT $1, mo.id, $3 FROM modulo_opciones mo JOIN modulos m ON m.id = mo.modulo_id WHERE m.nombre = 'rh' AND mo.nombre = $2
           ON CONFLICT DO NOTHING`,
          [r.rows[0].id, opcion, tipo],
        );
      }
    }
    return r.rows[0].id;
  };
  const rolEmpleado = await rol("empleado_ficticio", { Asistencia: ["consulta"] });
  const idRol = { empleado: rolEmpleado };
  for (const n of ["rh_admin", "rh_empleado", "super_admin", "portal_admin"]) idRol[n] = (await q("SELECT id FROM roles WHERE nombre = $1", [n])).rows[0].id;
  const usuarios = {};
  const crear = async (clave, rolNombre, empleadoI) => {
    const uid = crypto.randomUUID();
    const u = await q(
      "INSERT INTO usuarios (correo, nombre, apellido, auth_uid) VALUES ($1, $2, $3, $4) RETURNING id",
      [`${clave}@ejemplo.invalid`, clave, "Ficticio", uid],
    );
    await q("INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2)", [u.rows[0].id, idRol[rolNombre]]);
    if (empleadoI) await q("UPDATE empleados SET usuario_id = $1 WHERE id = $2", [u.rows[0].id, S.porI(empleadoI).id]);
    const token = jwt.sign({ sub: uid, aud: "authenticated", role: "authenticated" }, SECRETO_JWT, { algorithm: "HS256", expiresIn: "2h" });
    usuarios[clave] = { id: u.rows[0].id, token, empleadoI };
  };
  await crear("empleado", "empleado", 22); // subordinado del jefe 21
  await crear("jefe", "empleado", 21);
  await crear("otro_jefe", "empleado", 25);
  await crear("empleado_ajeno", "empleado", 40);
  await crear("rh_admin", "rh_admin", null);
  idRol.rh_lectura = await rol("rh_lectura_ficticio", { Asistencia: ["consulta"], Empleados: ["consulta", "edicion"] });
  await crear("rh_empleado", "rh_empleado", 45);
  await crear("rh_lectura", "rh_lectura", null);
  await crear("super_admin", "super_admin", null);
  await crear("portal_admin", "portal_admin", null);
  return usuarios;
}

// ------------------------------------------------------------------ backend real (proceso hijo)
function lanzarBackend(puerto, extra = {}) {
  const proc = spawn(process.execPath, [path.join(__dirname, "../../modules/portal/backend/app.js")], {
    env: {
      ...process.env, PORT: String(puerto), NODE_ENV: "test", INGESTA_PORT: "", ASISTENCIA_MOTOR_ACTIVO: "false",
      PG_POOL_MAX: "6", SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_SERVICE_ROLE_KEY: "x", ...extra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const salida = [];
  proc.stdout.on("data", (d) => salida.push(String(d)));
  proc.stderr.on("data", (d) => salida.push(String(d)));
  return { proc, salida, puerto };
}
async function esperarBackend(b) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${b.puerto}/api/salud`);
      if (r.ok) return;
    } catch { /* aún no escucha */ }
    await dormir(200);
  }
  throw new Error(`El backend no arrancó: ${b.salida.join("").slice(-500)}`);
}
async function detenerBackend(b) {
  if (b.proc.exitCode !== null) return b.proc.exitCode;
  b.proc.kill("SIGTERM");
  for (let i = 0; i < 100 && b.proc.exitCode === null; i++) await dormir(100);
  if (b.proc.exitCode === null) b.proc.kill("SIGKILL");
  return b.proc.exitCode;
}
async function http(b, metodo, ruta, token, cuerpo) {
  const r = await fetch(`http://127.0.0.1:${b.puerto}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  let json = null;
  try { json = await r.json(); } catch { json = null; }
  return { estado: r.status, json };
}

// ------------------------------------------------------------------ ingesta real de marcas (simulador, modo jornadas)
async function cargarMarcas(b, U, { codigos, desde, hasta, idInicial, semilla }) {
  const llave = await http(b, "POST", "/api/asistencia/llaves", U.rh_admin.token, { nombre: `llave ficticia ${idInicial}`, origen: "biotime" });
  const clave = llave.json && llave.json.datos && (llave.json.datos.llave || llave.json.datos.clave);
  if (!clave) throw new Error(`No se pudo crear la llave: ${llave.estado}`);
  const marcas = generarJornadas({ semilla, codigos, desde, hasta, idInicial, finesDeSemana: true });
  let insertadas = 0;
  for (let i = 0; i < marcas.length; i += 500) {
    const r = await fetch(`http://127.0.0.1:${b.puerto}/api/asistencia/ingesta/marcas`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Api-Key": clave }, body: JSON.stringify({ origen: "biotime", marcas: marcas.slice(i, i + 500) }),
    });
    const j = await r.json();
    if (r.status === 429) { i -= 500; await dormir(1500); continue; }
    if (r.status !== 200) throw new Error(`ingesta ${r.status}`);
    insertadas += j.datos.insertadas;
  }
  return { total: marcas.length, insertadas };
}

// ------------------------------------------------------------------ ORÁCULO independiente
// Reglas del humano reescritas desde cero. La hora local la calcula PostgreSQL (AT TIME ZONE), no Intl; los minutos
// se truncan (segundos ignorados); no importa nada de services/asistencia/motor.js.
async function cargarMundoOraculo(parametros) {
  const emp = (await q(
    `SELECT id, numero_nomina, estatus, departamento_id, to_char(fecha_ingreso,'YYYY-MM-DD') AS ing, to_char(fecha_baja,'YYYY-MM-DD') AS baja FROM empleados ORDER BY id`,
  )).rows;
  const turnos = new Map();
  for (const t of (await q("SELECT * FROM turnos")).rows) turnos.set(t.id, { ...t, dias: {} });
  for (const d of (await q(`SELECT turno_id, dia_semana, laborable, to_char(hora_entrada,'HH24:MI') AS e, to_char(hora_salida,'HH24:MI') AS s FROM turno_dias`)).rows) {
    turnos.get(d.turno_id).dias[d.dia_semana] = d;
  }
  const asigInd = (await q(`SELECT empleado_id, turno_id, to_char(vigente_desde,'YYYY-MM-DD') AS d, to_char(vigente_hasta,'YYYY-MM-DD') AS h FROM turno_empleado`)).rows;
  const asigDep = (await q(`SELECT departamento_id, turno_id, to_char(vigente_desde,'YYYY-MM-DD') AS d, to_char(vigente_hasta,'YYYY-MM-DD') AS h FROM turno_departamento`)).rows;
  const marcas = new Map();
  for (const m of (await q(
    `SELECT id, empleado_id, to_char(marca_ts AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD HH24:MI:SS') AS local, floor(extract(epoch FROM marca_ts))::bigint AS seg
     FROM asistencia_marcas WHERE empleado_id IS NOT NULL ORDER BY empleado_id, marca_ts, id`,
  )).rows) {
    if (!marcas.has(m.empleado_id)) marcas.set(m.empleado_id, []);
    const [f, h] = m.local.split(" ");
    const [hh, mm] = h.split(":").map(Number);
    marcas.get(m.empleado_id).push({ id: m.id, seg: Number(m.seg), dia: num(f), min: hh * 60 + mm });
  }
  const cal = new Map();
  for (const c of (await q(`SELECT to_char(fecha,'YYYY-MM-DD') AS f, tipo FROM calendario_laboral WHERE activo AND tipo IN ('oficial','otorgado')`)).rows) cal.set(c.f, true);
  const vac = (await q(`SELECT empleado_id, to_char(fecha_inicial,'YYYY-MM-DD') AS d, to_char(fecha_final,'YYYY-MM-DD') AS h FROM solicitudes_vacaciones WHERE estatus='aprobado'`)).rows;
  const per = (await q(`SELECT empleado_id, to_char(fecha_inicio,'YYYY-MM-DD') AS d, to_char(fecha_fin,'YYYY-MM-DD') AS h FROM permisos_ausencia WHERE estatus='aprobado'`)).rows;
  const inc = new Set((await q(`SELECT empleado_id || '|' || to_char(fecha,'YYYY-MM-DD') AS k FROM asistencia_incidencias WHERE activa AND tipo='justificacion'`)).rows.map((r) => r.k));
  return { emp, turnos, asigInd, asigDep, marcas, cal, vac, per, inc, parametros };
}

function oraculo(W, e, fecha) {
  const P = W.parametros;
  const enRango = (r) => r.empleado_id === e.id && r.d <= fecha && r.h >= fecha;
  if (e.estatus === "baja" && !e.baja) return { estatus: "no_aplica" }; // baja sin fecha: fuera del alcance
  if (fecha < P.analisis_desde || (e.ing && fecha < e.ing) || (e.baja && fecha > e.baja)) return { estatus: "no_aplica" };
  if (!e.numero_nomina || e.numero_nomina.trim() === "") return { estatus: "sin_identificador" };
  const repetida = W.emp.some((o) => o.id !== e.id && o.numero_nomina === e.numero_nomina &&
    (o.ing || "0000-00-00") <= (e.baja || "9999-99-99") && (e.ing || "0000-00-00") <= (o.baja || "9999-99-99"));
  if (repetida) return { estatus: "sin_identificador" };
  // turno efectivo: individual > departamento
  let asig = W.asigInd.find((a) => a.empleado_id === e.id && a.d <= fecha && (!a.h || a.h >= fecha));
  let origen = "empleado";
  if (!asig && e.departamento_id != null) {
    asig = W.asigDep.find((a) => a.departamento_id === e.departamento_id && a.d <= fecha && (!a.h || a.h >= fecha));
    origen = "departamento";
  }
  if (!asig) return { estatus: "sin_turno" };
  const turno = W.turnos.get(asig.turno_id);
  const iso = dow(fecha) === 0 ? 7 : dow(fecha);
  const dia = turno.dias[iso];
  const comoRes = (estatus, extra = {}) => ({ estatus, origen, turno: turno.nombre, ...extra });
  // marcas cercanas (día anterior a siguiente), sin duplicados (<= 60 s respecto de la última conservada)
  const base = num(fecha);
  const unicas = [];
  for (const m of (W.marcas.get(e.id) || []).filter((x) => x.dia >= base - 1 && x.dia <= base + 1)) {
    if (unicas.length && m.seg - unicas[unicas.length - 1].seg <= 60) continue;
    unicas.push({ ...m, rel: (m.dia - base) * 1440 + m.min });
  }
  const delCalendario = unicas.filter((m) => m.rel >= 0 && m.rel < 1440);
  const extremos = { primera: delCalendario.length ? delCalendario[0].seg : null, ultima: delCalendario.length ? delCalendario[delCalendario.length - 1].seg : null };
  if (!dia || !dia.laborable) return comoRes("descanso", extremos);
  if (W.cal.has(fecha)) return comoRes("festivo", extremos);
  const finde = dow(fecha) === 0 || dow(fecha) === 6;
  if (!finde && W.vac.some(enRango)) return comoRes("vacaciones", extremos);
  if (W.per.some(enRango)) return comoRes("permiso", extremos);

  const hm = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const E = hm(dia.e);
  let S = hm(dia.s);
  if (S < E) S += 1440;
  // Entrada: primera marca del día local (desde las 00:00, llegar temprano nunca penaliza) hasta entrada + ventana
  // posterior; en un turno que cruza la medianoche el límite inferior sigue siendo entrada - ventana anterior.
  const cruza = S > 1440;
  const inferior = cruza ? E - turno.ventana_entrada_antes_min : Math.min(0, E - turno.ventana_entrada_antes_min);
  let entrada = null;
  for (const m of unicas) if (m.rel >= inferior && m.rel <= E + turno.ventana_entrada_despues_min) { entrada = m; break; }
  // Salida: la última marca POSTERIOR al fin del descanso (o a entrada + ventana si no hay descanso) y a la entrada
  let corte = E + turno.ventana_entrada_despues_min;
  if (turno.descanso_min > 0 && turno.descanso_inicio) {
    let ini = hm(String(turno.descanso_inicio).slice(0, 5));
    if (cruza && ini < E) ini += 1440;
    corte = ini + turno.descanso_min;
  }
  let salida = null;
  for (const m of unicas) {
    if (entrada && m.seg <= entrada.seg) continue;
    if (m.rel > corte && m.rel <= S + turno.ventana_salida_despues_min) salida = m; // la última
  }
  const delDia = unicas.filter((m) => m.rel >= inferior && m.rel <= S + turno.ventana_salida_despues_min);
  const primera = delDia.length ? delDia[0].seg : null;
  const ultima = delDia.length ? delDia[delDia.length - 1].seg : null;
  const tarde = entrada ? entrada.rel - E : 0;
  const antes = salida ? S - salida.rel : 0;
  let est;
  if (!entrada) est = "falta";
  else if (tarde > turno.umbral_falta_min) est = "falta";
  else if (!salida) est = "incompleta";
  else if (tarde > turno.tolerancia_retardo_min) est = "retardo";
  else if (antes > turno.tolerancia_salida_min) est = "salida_anticipada";
  else est = "puntual";
  let retardo = 0;
  if (est === "retardo") retardo = tarde;
  if (est === "falta" || est === "incompleta") retardo = tarde > 0 && entrada ? (est === "incompleta" && tarde <= turno.tolerancia_retardo_min ? 0 : tarde) : 0;
  const anticipada = salida && antes > turno.tolerancia_salida_min ? antes : 0;
  // ¿terminó el día? (hora actual de México respecto de la medianoche local de `fecha`)
  const ahoraRel = (AHORA_LOCAL.dia - base) * 1440 + AHORA_LOCAL.min;
  if (ahoraRel < S + P.margen_dia_completo_min) return comoRes("pendiente", { primera, ultima, retardo, anticipada });
  if (W.inc.has(`${e.id}|${fecha}`) && ["falta", "retardo", "salida_anticipada", "incompleta"].includes(est)) est = "justificada";
  return comoRes(est, { primera, ultima, retardo, anticipada, usadas: [entrada, salida].filter(Boolean).map((m) => String(m.id)) });
}

// La hora local de "ahora" también la resuelve PostgreSQL
let AHORA_LOCAL = null;
async function fijarAhoraLocal(ahora) {
  const r = await q(`SELECT to_char($1::timestamptz AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD HH24:MI') AS l`, [ahora.toISOString()]);
  const [f, h] = r.rows[0].l.split(" ");
  AHORA_LOCAL = { dia: num(f), min: Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) };
}

async function compararConOraculo(etiqueta, ahora, { desde = ANALISIS_DESDE, hasta = HOY, soloPeriodosAbiertos = false } = {}) {
  await fijarAhoraLocal(ahora);
  const P = Object.fromEntries((await q("SELECT clave, valor FROM asistencia_parametros")).rows.map((r) => [r.clave, /^\d+$/.test(r.valor) ? Number(r.valor) : r.valor]));
  const W = await cargarMundoOraculo(P);
  const filas = new Map();
  for (const f of (await q(
    `SELECT d.empleado_id, to_char(d.fecha,'YYYY-MM-DD') AS fecha, d.estatus, d.minutos_retardo, d.minutos_salida_anticipada, d.turno_nombre, d.origen_turno,
            floor(extract(epoch FROM d.primera_marca))::bigint AS pm, floor(extract(epoch FROM d.ultima_marca))::bigint AS um, d.marcas_usadas::text[] AS usadas,
            p.estado AS periodo_estado
     FROM asistencia_diaria d LEFT JOIN asistencia_periodos p ON p.id = d.periodo_id`,
  )).rows) filas.set(`${f.empleado_id}|${f.fecha}`, f);
  const periodos = (await q(`SELECT to_char(fecha_inicio,'YYYY-MM-DD') AS i, to_char(fecha_fin,'YYYY-MM-DD') AS f, estado FROM asistencia_periodos`)).rows;
  let evaluados = 0;
  const malos = [];
  const cuenta = {};
  for (const e of W.emp) {
    for (const fecha of rango(desde, hasta)) {
      if (soloPeriodosAbiertos) {
        const p = periodos.find((x) => x.i <= fecha && x.f >= fecha);
        if (p && p.estado !== "abierto") continue;
      }
      const esp = oraculo(W, e, fecha);
      const f = filas.get(`${e.id}|${fecha}`);
      evaluados++;
      cuenta[esp.estatus] = (cuenta[esp.estatus] || 0) + 1;
      if (esp.estatus === "no_aplica" || esp.estatus === "sin_identificador") {
        if (f) malos.push(`${e.id} ${fecha}: no debía existir fila (${esp.estatus}) y hay ${f.estatus}`);
        continue;
      }
      if (!f) { malos.push(`${e.id} ${fecha}: falta la fila (esperado ${esp.estatus})`); continue; }
      const dif = [];
      if (f.estatus !== esp.estatus) dif.push(`estatus ${f.estatus} != ${esp.estatus}`);
      if (esp.retardo !== undefined && f.minutos_retardo !== esp.retardo) dif.push(`retardo ${f.minutos_retardo} != ${esp.retardo}`);
      if (esp.anticipada !== undefined && f.minutos_salida_anticipada !== esp.anticipada) dif.push(`anticipada ${f.minutos_salida_anticipada} != ${esp.anticipada}`);
      if (esp.estatus !== "sin_turno") {
        if (f.turno_nombre !== esp.turno) dif.push(`turno ${f.turno_nombre} != ${esp.turno}`);
        if (f.origen_turno !== esp.origen) dif.push(`origen ${f.origen_turno} != ${esp.origen}`);
      }
      if (esp.primera !== undefined && String(f.pm === null ? null : Number(f.pm)) !== String(esp.primera === undefined ? null : esp.primera)) dif.push(`primera ${f.pm} != ${esp.primera}`);
      if (esp.ultima !== undefined && String(f.um === null ? null : Number(f.um)) !== String(esp.ultima === undefined ? null : esp.ultima)) dif.push(`ultima ${f.um} != ${esp.ultima}`);
      if (esp.usadas && JSON.stringify(f.usadas) !== JSON.stringify(esp.usadas)) dif.push(`usadas ${f.usadas} != ${esp.usadas}`);
      if (dif.length) malos.push(`${e.id} ${fecha}: ${dif.join("; ")}`);
    }
  }
  comprobar(`${etiqueta}: ${evaluados} días (empleado x fecha) = oráculo`, malos.length === 0, `\n    ${malos.slice(0, 8).join("\n    ")}\n    (${malos.length} diferencias)`);
  return { evaluados, malos: malos.length, cuenta };
}

const hashDias = async () =>
  (await q(
    `SELECT md5(COALESCE(string_agg(to_jsonb(d)::text, '|' ORDER BY d.empleado_id, d.fecha), '')) AS h, COUNT(*)::int AS n
     FROM (SELECT * FROM asistencia_diaria) d0, LATERAL (SELECT to_jsonb(d0) - 'id' - 'calculado_en' AS j) x, LATERAL (SELECT d0.empleado_id, d0.fecha, x.j AS j) d
     WHERE true`,
  )).rows[0];

// ------------------------------------------------------------------ programa
async function principal() {
  const t0 = process.hrtime.bigint();
  const Motor = require("../../modules/rh/backend/services/asistencia/motorAsistencia");
  const opciones = { ahora: () => AHORA };
  const S = await sembrar();
  const U = await sembrarUsuarios(S);
  let backend = lanzarBackend(PUERTO);
  await esperarBackend(backend);

  seccion("Ingesta REAL de marcas con el simulador (jornadas) y vinculación");
  const carga = await cargarMarcas(backend, U, { codigos: Array.from({ length: 71 }, (_, i) => 9001 + i).concat([9100, 9101]), desde: ANALISIS_DESDE, hasta: "2026-10-22", idInicial: 5_000_000, semilla: SEMILLA });
  console.log(`  ${carga.total} marcas, ${carga.insertadas} insertadas`);
  comprobar("todas las marcas generadas se aceptaron", carga.total === carga.insertadas);
  // empleado 19 (turno nocturno): jornadas nocturnas explícitas (entrada 21:5x, salida 06:0x del día siguiente), con una falta tardía
  const noches = [];
  let idN = 9_000_000;
  for (const f of rango("2026-09-07", "2026-10-15")) {
    if (dow(f) === 0 || dow(f) === 6) continue;
    const sig = fechaDe(num(f) + 1);
    const utc = (fecha, h, m) => new Date(Date.parse(`${fecha}T00:00:00Z`) + (h + 6) * 3600000 + m * 60000).toISOString();
    const tarde = f === "2026-09-21";
    noches.push([utc(f, tarde ? 23 : 21, tarde ? 20 : 55), utc(sig, 6, 3)]);
  }
  for (const [e, s] of noches) {
    for (const ts of [e, s]) {
      await q(
        `INSERT INTO asistencia_marcas (origen, id_externo, codigo_empleado, empleado_id, marca_ts) VALUES ('biotime', $1, '9019', $2, $3)`,
        [String(idN++), S.porI(19).id, ts],
      );
    }
  }
  // casos de borde de las reglas nuevas (martes 6 y miércoles 7 de octubre; hora de México = UTC-6)
  const bordes = [
    [101, "2026-10-06", ["06:50", "18:00"]], // llegó temprano, antes de la ventana: puntual
    [102, "2026-10-06", ["08:00", "15:00"]], // salida a las 15:00: anticipada de 180 min
    [103, "2026-10-06", ["08:00", "17:50"]], // 17:50 con tolerancia 3: anticipada de 10 min
    [104, "2026-10-06", ["08:00"]], // una sola marca: incompleta
    [105, "2026-10-06", ["08:00", "13:30"]], // marca durante el descanso: incompleta
    [101, "2026-10-07", ["06:50"]], // solo la entrada temprana: incompleta
    [102, "2026-10-07", ["08:20", "15:00"]], // retardo y salida temprana: ambos minutos
  ];
  let idB = 9_500_000;
  for (const [i, fecha, horas] of bordes) {
    for (const h of horas) {
      const [hh, mm] = h.split(":").map(Number);
      await q(`INSERT INTO asistencia_marcas (origen, id_externo, codigo_empleado, empleado_id, marca_ts) VALUES ('biotime', $1, $2, $3, $4)`,
        [String(idB++), String(9200 + (i - 100)), S.porI(i).id, new Date(Date.parse(`${fecha}T00:00:00Z`) + ((hh + 6) * 60 + mm) * 60000).toISOString()]);
    }
  }
  const vinculo = (await q("SELECT COUNT(*) FILTER (WHERE empleado_id IS NULL)::int AS huerfanas, COUNT(*)::int AS total FROM asistencia_marcas")).rows[0];
  console.log(`  marcas totales ${vinculo.total}, huérfanas ${vinculo.huerfanas}`);
  comprobar("hay marcas huérfanas (sin nómina, nómina repetida, ex empleados, fuera de empleo)", vinculo.huerfanas > 0);

  seccion("1. Primera corrida (completa) contra el oráculo");
  const ciclo1 = await Motor.ejecutarCiclo(opciones);
  console.log(`  ciclo: ${JSON.stringify(ciclo1)}`);
  comprobar("la primera corrida es completa y termina ok", ciclo1.tipo === "completa" && ciclo1.estado === "ok" && !ciclo1.omitida);
  const cmp1 = await compararConOraculo("corrida completa", AHORA);
  console.log(`  distribución esperada: ${JSON.stringify(cmp1.cuenta)}`);
  for (const est of ["puntual", "retardo", "falta", "salida_anticipada", "incompleta", "vacaciones", "permiso", "descanso", "festivo", "sin_turno", "pendiente"]) {
    comprobar(`el conjunto sintético cubre el estatus ${est}`, (cmp1.cuenta[est] || 0) > 0);
  }
  comprobar("hay días no_aplica y sin_identificador que no se guardan", cmp1.cuenta.no_aplica > 0 && cmp1.cuenta.sin_identificador > 0);
  const dia = async (i, f) => (await q("SELECT estatus, minutos_retardo, minutos_salida_anticipada, detalle->'banderas' AS b FROM asistencia_diaria WHERE empleado_id = $1 AND fecha = $2", [S.porI(i).id, f])).rows[0];
  const d1 = await dia(101, "2026-10-06"); const d2 = await dia(102, "2026-10-06"); const d3 = await dia(103, "2026-10-06");
  const d4 = await dia(104, "2026-10-06"); const d5 = await dia(105, "2026-10-06"); const d6 = await dia(101, "2026-10-07"); const d7 = await dia(102, "2026-10-07");
  comprobar("entrada a las 06:50 (antes de la ventana) con salida 18:00 -> puntual, NO falta", d1.estatus === "puntual" && !d1.b.includes("salida_sin_entrada"), JSON.stringify(d1));
  comprobar("salida a las 15:00 -> salida_anticipada de 180 min", d2.estatus === "salida_anticipada" && d2.minutos_salida_anticipada === 180, JSON.stringify(d2));
  comprobar("salida a las 17:50 con tolerancia 3 -> salida_anticipada de 10 min", d3.estatus === "salida_anticipada" && d3.minutos_salida_anticipada === 10, JSON.stringify(d3));
  comprobar("una sola marca -> incompleta (no salida anticipada)", d4.estatus === "incompleta" && d4.minutos_salida_anticipada === 0, JSON.stringify(d4));
  comprobar("marca durante el descanso (13:30) -> incompleta con marca_intermedia_sin_salida", d5.estatus === "incompleta" && d5.b.includes("marca_intermedia_sin_salida"), JSON.stringify(d5));
  comprobar("solo la entrada temprana 06:50 -> incompleta; retardo 08:20 + salida 15:00 -> retardo con ambos minutos", d6.estatus === "incompleta" && d7.estatus === "retardo" && d7.minutos_retardo === 20 && d7.minutos_salida_anticipada === 180, JSON.stringify([d6, d7]));
  const sinFila = (await q(
    `SELECT COUNT(*)::int AS n FROM asistencia_diaria d JOIN empleados e ON e.id = d.empleado_id WHERE e.numero_nomina IS NULL OR e.id IN ($1, $2)`,
    [S.porI(10).id, S.porI(11).id],
  )).rows[0].n;
  comprobar("los empleados sin nómina (8) y con nómina repetida (2) NO tienen ningún día calculado", sinFila === 0);
  const baja70 = (await q("SELECT COUNT(*)::int AS n FROM asistencia_diaria WHERE empleado_id IN ($1, $2)", [S.porI(70).id, S.porI(15).id])).rows[0].n;
  comprobar("la baja anterior al análisis y la baja sin fecha no generan días", baja70 === 0);
  const periodos1 = (await q("SELECT to_char(fecha_inicio,'YYYY-MM-DD') AS i, to_char(fecha_fin,'YYYY-MM-DD') AS f, estado FROM asistencia_periodos ORDER BY fecha_inicio")).rows;
  console.log(`  periodos: ${periodos1.map((p) => `${p.i}/${p.f}=${p.estado}`).join(" ")}`);
  comprobar("las 5 quincenas de sep-oct existen y TODAS siguen abiertas (el cierre automático es desde 16-31 oct)", periodos1.length === 4 && periodos1.every((p) => p.estado === "abierto"));
  const estatus19 = (await q("SELECT fecha::text, estatus, minutos_retardo FROM asistencia_diaria WHERE empleado_id = $1 AND fecha BETWEEN '2026-09-07' AND '2026-09-25' ORDER BY fecha", [S.porI(19).id])).rows;
  comprobar("turno nocturno: la jornada pertenece al día de la entrada y la entrada tardía (23:20 vs 22:00) es falta", estatus19.find((r) => r.fecha === "2026-09-07").estatus === "puntual" && estatus19.find((r) => r.fecha === "2026-09-21").estatus === "falta");

  if (process.env.PARAR_TRAS_ORACULO === "1") {
    // modo rápido (p. ej. para comprobar que el oráculo detecta un motor mutado)
    console.log(`\n${pasaron} PASS, ${fallos.length} FAIL`);
    await pg.end();
    process.exit(fallos.length ? 1 : 0);
  }
  seccion("2. Idempotencia");
  const h1 = await hashDias();
  // la siembra acaba de crear los turnos: se envejecen para que no cuenten como "editados desde la última vuelta"
  await q("UPDATE turnos SET fecha_actualizacion = TIMESTAMP '2000-01-01'");
  const ciclo2 = await Motor.ejecutarCiclo(opciones);
  comprobar("la segunda corrida es incremental y no modifica ningún día", ciclo2.tipo === "incremental" && ciclo2.dias_modificados === 0, JSON.stringify(ciclo2));
  const rc = await Motor.recalcular({ desde: ANALISIS_DESDE, hasta: HOY, ...opciones });
  comprobar("un recálculo manual de todo el rango tampoco modifica nada (dos corridas = mismo resultado)", rc.dias_modificados === 0 && rc.dias_evaluados > 0, JSON.stringify(rc));
  const h2 = await hashDias();
  comprobar(`el contenido de asistencia_diaria es idéntico (${h1.n} filas, hash ${h1.h.slice(0, 8)})`, h1.h === h2.h && h1.n === h2.n);

  seccion("3. Rendimiento");
  await q("DELETE FROM asistencia_diaria");
  const tPerf = process.hrtime.bigint();
  const perf = await Motor.recalcular({ desde: "2026-08-25", hasta: HOY, ...opciones });
  const msPerf = Number(process.hrtime.bigint() - tPerf) / 1e6;
  console.log(`  recalcular ${perf.empleados} empleados, ${perf.dias_evaluados} días en ${msPerf.toFixed(0)} ms (${perf.dias_modificados} filas escritas)`);
  comprobar("recalcular 71 empleados x ~54 días tarda pocos segundos (< 8 s)", msPerf < 8000);
  const hPerf = await hashDias();
  comprobar("tras borrar y recalcular se obtiene exactamente el mismo contenido", hPerf.h === h1.h);

  seccion("4. Concurrencia");
  const [a, b2] = await Promise.all([
    Motor.recalcular({ desde: ANALISIS_DESDE, hasta: HOY, esperaMs: 0, ...opciones }),
    Motor.recalcular({ desde: ANALISIS_DESDE, hasta: HOY, esperaMs: 0, ...opciones }),
  ]);
  comprobar("dos recálculos simultáneos sin espera: uno corre y el otro recibe 'ocupado' (candado 4501)", [a.ocupado, b2.ocupado].filter(Boolean).length === 1, JSON.stringify([a.ocupado, b2.ocupado]));
  const [c, d] = await Promise.all([
    Motor.recalcular({ desde: ANALISIS_DESDE, hasta: HOY, esperaMs: 60000, ...opciones }),
    Motor.recalcular({ desde: ANALISIS_DESDE, hasta: HOY, esperaMs: 60000, ...opciones }),
  ]);
  comprobar("con espera ambos terminan, uno tras otro", !c.ocupado && !d.ocupado);
  const [x, y] = await Promise.all([Motor.ejecutarCiclo(opciones), Motor.ejecutarCiclo(opciones)]);
  comprobar("dos vueltas del planificador a la vez: una corre y la otra se omite", [x.omitida, y.omitida].filter(Boolean).length === 1);
  const lockLibre = (await q("SELECT COUNT(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND classid = 4501")).rows[0].n;
  comprobar("el candado queda liberado al terminar", lockLibre === 0);
  comprobar("la bitácora no deja ejecuciones 'en_curso'", (await q("SELECT COUNT(*)::int AS n FROM asistencia_ejecuciones WHERE estado = 'en_curso'")).rows[0].n === 0);
  await compararConOraculo("tras la concurrencia", AHORA);

  seccion("5. Justificaciones de RH (API real)");
  const faltas = (await q(`SELECT empleado_id, fecha::text, estatus FROM asistencia_diaria WHERE estatus IN ('falta','retardo','incompleta') AND fecha < '2026-10-01' ORDER BY fecha, empleado_id LIMIT 3`)).rows;
  for (const f of faltas) {
    const r = await http(backend, "POST", "/api/asistencia/incidencias", U.rh_admin.token, { empleado_id: f.empleado_id, fecha: f.fecha, motivo: "Justificación ficticia de prueba" });
    comprobar(`justificar ${f.estatus} del empleado ${f.empleado_id} el ${f.fecha}: 201 y queda 'justificada'`, r.estado === 201 && r.json.datos.dia && r.json.datos.dia.estatus === "justificada", JSON.stringify(r));
  }
  const unaJust = faltas[faltas.length - 1];
  const otra = await http(backend, "POST", "/api/asistencia/incidencias", U.rh_admin.token, { empleado_id: unaJust.empleado_id, fecha: unaJust.fecha, motivo: "Segunda justificación del mismo día" });
  comprobar("una segunda justificación del mismo día -> 409 (a lo más una activa)", otra.estado === 409, JSON.stringify(otra));
  comprobar("la BD impide dos justificaciones activas del mismo día (índice único parcial)", await (async () => {
    try { await q("INSERT INTO asistencia_incidencias (empleado_id, fecha, tipo, motivo) VALUES ($1, $2, 'justificacion', 'duplicada a mano')", [unaJust.empleado_id, unaJust.fecha]); return false; } catch (e) { return e.code === "23505"; }
  })());
  const idInc = (await q("SELECT id FROM asistencia_incidencias WHERE empleado_id = $1 AND fecha = $2 AND activa", [unaJust.empleado_id, unaJust.fecha])).rows[0].id;
  const anul = await http(backend, "POST", `/api/asistencia/incidencias/${idInc}/anular`, U.rh_admin.token);
  const trasAnular = (await q("SELECT estatus FROM asistencia_diaria WHERE empleado_id = $1 AND fecha = $2", [unaJust.empleado_id, unaJust.fecha])).rows[0].estatus;
  comprobar(`anular la justificación recalcula el día y vuelve a su resultado original (${unaJust.estatus})`, anul.estado === 200 && trasAnular === unaJust.estatus, `${anul.estado} ${trasAnular}`);
  const noJust = (await q(`SELECT empleado_id, fecha::text FROM asistencia_diaria WHERE estatus = 'puntual' LIMIT 1`)).rows[0];
  comprobar("justificar un día puntual -> 409", (await http(backend, "POST", "/api/asistencia/incidencias", U.rh_admin.token, { empleado_id: noJust.empleado_id, fecha: noJust.fecha, motivo: "No procede" })).estado === 409);
  comprobar("un empleado no puede justificar (403)", (await http(backend, "POST", "/api/asistencia/incidencias", U.empleado.token, { empleado_id: noJust.empleado_id, fecha: noJust.fecha, motivo: "No procede" })).estado === 403);
  const marcasAntes = (await q("SELECT md5(string_agg(id::text || marca_ts::text || codigo_empleado, ',' ORDER BY id)) AS h FROM asistencia_marcas")).rows[0].h;
  await compararConOraculo("con justificaciones", AHORA);
  const orig = (await q(`SELECT detalle->'calculo_original'->>'estatus' AS o FROM asistencia_diaria WHERE estatus = 'justificada' LIMIT 1`)).rows[0];
  comprobar("la justificación conserva el cálculo original en detalle y las marcas no se modificaron", Boolean(orig && orig.o) &&
    marcasAntes === (await q("SELECT md5(string_agg(id::text || marca_ts::text || codigo_empleado, ',' ORDER BY id)) AS h FROM asistencia_marcas")).rows[0].h);

  seccion("6. Cierre automático desde 16-31 oct y periodos cerrados intactos");
  // marcas para el 24-31 oct directamente en la BD (simulan lo que llegaría hasta el 3-nov); luego el reloj avanza
  const AHORA_NOV = new Date("2026-11-03T18:00:00Z");
  const extra = generarJornadas({ semilla: SEMILLA + 1, codigos: Array.from({ length: 71 }, (_, i) => 9001 + i), desde: "2026-10-23", hasta: "2026-11-02", idInicial: 7_000_000 });
  for (let i = 0; i < extra.length; i += 400) {
    const lote = extra.slice(i, i + 400);
    await q(
      `INSERT INTO asistencia_marcas (origen, id_externo, codigo_empleado, empleado_id, marca_ts, fecha_importacion)
       SELECT 'biotime', t.id, t.cod, (SELECT MIN(e.id) FROM empleados e WHERE e.numero_nomina = t.cod AND (e.fecha_baja IS NULL OR e.fecha_baja >= (t.ts AT TIME ZONE 'America/Mexico_City')::date)
          AND (e.fecha_ingreso IS NULL OR e.fecha_ingreso <= (t.ts AT TIME ZONE 'America/Mexico_City')::date) HAVING COUNT(*) = 1), t.ts,
          TIMESTAMPTZ '2026-10-01 00:00+00' -- llegaron "antes del cierre" (fecha fija: el reloj de este entorno da saltos)
       FROM unnest($1::text[], $2::text[], $3::timestamptz[]) AS t(id, cod, ts)`,
      [lote.map((m) => m.id_externo), lote.map((m) => m.codigo_empleado), lote.map((m) => m.marca_ts)],
    );
  }
  const prevAntes = await q("SELECT estado FROM asistencia_periodos WHERE fecha_inicio = '2026-10-16'");
  console.log(`  periodo 16-31 oct antes: ${prevAntes.rows[0].estado}`);
  const cicloCierre = await Motor.ejecutarCiclo({ ahora: () => AHORA_NOV });
  console.log(`  ciclo al 3-nov: ${JSON.stringify(cicloCierre)}`);
  const per2 = (await q("SELECT to_char(fecha_inicio,'YYYY-MM-DD') AS i, estado, tipo_cierre FROM asistencia_periodos ORDER BY fecha_inicio")).rows;
  const p1631 = per2.find((p) => p.i === "2026-10-16");
  comprobar("la quincena 16-31 oct se cerró sola (tipo auto) porque fin + 3 días <= hoy", p1631.estado === "cerrado" && p1631.tipo_cierre === "auto");
  comprobar("1-15 sep, 16-30 sep y 1-15 oct siguen ABIERTAS hasta el cierre manual de RH", per2.filter((p) => p.i < "2026-10-16").every((p) => p.estado === "abierto"));
  await compararConOraculo("al 3-nov (todos los periodos)", AHORA_NOV, { desde: ANALISIS_DESDE, hasta: "2026-11-03" });
  const hashCerrado = async () => (await q(
    `SELECT md5(COALESCE(string_agg(to_jsonb(d)::text, '|' ORDER BY d.empleado_id, d.fecha), '')) AS h, COUNT(*)::int AS n
     FROM asistencia_diaria d JOIN asistencia_periodos p ON p.id = d.periodo_id WHERE p.estado = 'cerrado'`)).rows[0];
  const hc1 = await hashCerrado();
  console.log(`  filas en periodos cerrados: ${hc1.n}`);

  // El motor no cierra antes de tiempo: con ahora = 2 nov (fin 31 oct + 3 = 3 nov) no se cierra
  seccion("6b. Regla fin + días de cierre");
  await q("UPDATE asistencia_periodos SET estado = 'abierto', cerrado_en = NULL, tipo_cierre = NULL WHERE fecha_inicio = '2026-10-16'");
  await q("DELETE FROM asistencia_diaria WHERE periodo_id IN (SELECT id FROM asistencia_periodos WHERE fecha_inicio = '2026-10-16')");
  await Motor.ejecutarCiclo({ ahora: () => new Date("2026-11-02T23:59:00Z") });
  comprobar("con hoy = 2-nov (fin + 3 = 3-nov) NO se cierra", (await q("SELECT estado FROM asistencia_periodos WHERE fecha_inicio = '2026-10-16'")).rows[0].estado === "abierto");
  await Motor.ejecutarCiclo({ ahora: () => AHORA_NOV });
  comprobar("con hoy = 3-nov SÍ se cierra", (await q("SELECT estado FROM asistencia_periodos WHERE fecha_inicio = '2026-10-16'")).rows[0].estado === "cerrado");
  const hc1b = await hashCerrado();

  seccion("7. Editar un turno / transferir a alguien: lo cerrado NO cambia, lo abierto sí");
  await q("UPDATE turnos SET tolerancia_retardo_min = 0, umbral_falta_min = 15, fecha_actualizacion = NOW() WHERE id = $1", [S.rayhsa]);
  await q("UPDATE empleados SET departamento_id = $1 WHERE id = $2", [S.deptos[0], S.porI(40).id]); // traslado
  await q("INSERT INTO turno_empleado (empleado_id, turno_id, vigente_desde) VALUES ($1, $2, '2026-10-20')", [S.porI(41).id, S.logistica]);
  const abiertoAntes = (await q("SELECT md5(string_agg(to_jsonb(d)::text, '|' ORDER BY empleado_id, fecha)) AS h FROM asistencia_diaria d JOIN asistencia_periodos p ON p.id = d.periodo_id WHERE p.estado = 'abierto'")).rows[0].h;
  const cicloEdit = await Motor.ejecutarCiclo({ ahora: () => AHORA_NOV });
  console.log(`  ciclo tras editar: ${cicloEdit.tipo} modificados=${cicloEdit.dias_modificados}`);
  comprobar("editar un turno fuerza el barrido completo", cicloEdit.tipo === "completa");
  const rec = await Motor.recalcular({ desde: ANALISIS_DESDE, hasta: "2026-11-03", ahora: () => AHORA_NOV });
  comprobar("un recálculo manual omite el periodo cerrado (dias_omitidos_cerrados > 0)", rec.dias_omitidos_cerrados > 0, JSON.stringify(rec));
  const hc2 = await hashCerrado();
  comprobar(`el periodo CERRADO quedó byte a byte igual (${hc2.n} filas) tras editar el turno y transferir/reasignar`, hc2.h === hc1b.h && hc2.n === hc1b.n);
  const abiertoDespues = (await q("SELECT md5(string_agg(to_jsonb(d)::text, '|' ORDER BY empleado_id, fecha)) AS h FROM asistencia_diaria d JOIN asistencia_periodos p ON p.id = d.periodo_id WHERE p.estado = 'abierto'")).rows[0].h;
  comprobar("los periodos abiertos SÍ se recalcularon con el turno nuevo", abiertoAntes !== abiertoDespues);
  const snapCerrado = (await q(
    `SELECT DISTINCT d.tolerancia_retardo_min FROM asistencia_diaria d JOIN asistencia_periodos p ON p.id = d.periodo_id WHERE p.estado = 'cerrado' AND d.turno_nombre = 'Rayhsa'`,
  )).rows.map((r) => r.tolerancia_retardo_min);
  const snapAbierto = (await q(
    `SELECT DISTINCT d.tolerancia_retardo_min FROM asistencia_diaria d JOIN asistencia_periodos p ON p.id = d.periodo_id WHERE p.estado = 'abierto' AND d.turno_nombre = 'Rayhsa' AND d.fecha >= '2026-09-01'`,
  )).rows.map((r) => r.tolerancia_retardo_min);
  comprobar("el snapshot del turno: el cerrado conserva tolerancia 10 y el abierto ya usa 0", JSON.stringify(snapCerrado) === "[10]" && JSON.stringify(snapAbierto) === "[0]", `${snapCerrado} / ${snapAbierto}`);
  comprobar("el trigger de la BD impide recalcular a mano un día de un periodo cerrado", await (async () => {
    try {
      await q("UPDATE asistencia_diaria d SET estatus = 'falta', calculado_en = NOW() FROM asistencia_periodos p WHERE p.id = d.periodo_id AND p.estado = 'cerrado' AND d.id = (SELECT MIN(d2.id) FROM asistencia_diaria d2 JOIN asistencia_periodos p2 ON p2.id = d2.periodo_id WHERE p2.estado = 'cerrado')");
      return false;
    } catch (error) { return error.code === "23000"; }
  })());
  await compararConOraculo("tras editar el turno (periodos abiertos)", AHORA_NOV, { desde: ANALISIS_DESDE, hasta: "2026-11-03", soloPeriodosAbiertos: true });

  seccion("8. Marcas tardías y re-vinculadas después del cierre");
  const emp5 = S.porI(5); // sin nómina: sus marcas son huérfanas
  const huerfanasEmp5 = (await q("SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE marca_ts >= '2026-10-16T06:00:00Z' AND marca_ts < '2026-11-01T06:00:00Z')::int AS en_cerrado FROM asistencia_marcas WHERE codigo_empleado = '9005' AND empleado_id IS NULL")).rows[0];
  console.log(`  marcas huérfanas del código 9005: ${huerfanasEmp5.n} (en el periodo cerrado: ${huerfanasEmp5.en_cerrado})`);
  await q(`INSERT INTO asistencia_marcas (origen, id_externo, codigo_empleado, empleado_id, marca_ts, fecha_importacion) VALUES ('biotime', '8000001', '9030', $1, '2026-10-21T14:00:00Z', NOW() + INTERVAL '1 hour')`, [S.porI(30).id]);
  await q("UPDATE empleados SET numero_nomina = '9005', fecha_actualizacion = NOW() WHERE id = $1", [emp5.id]); // RH completa la nómina
  const cicloTarde = await Motor.ejecutarCiclo({ ahora: () => AHORA_NOV });
  console.log(`  ciclo: ${JSON.stringify(cicloTarde)}`);
  const aj = (await q("SELECT motivo, COUNT(*)::int AS n FROM asistencia_ajustes_pendientes GROUP BY motivo")).rows;
  console.log(`  ajustes: ${JSON.stringify(aj)}`);
  comprobar("las marcas re-vinculadas que caen en el periodo cerrado generan ajustes pendientes", (aj.find((x) => x.motivo === "marca_vinculada_posterior_cierre") || { n: 0 }).n === huerfanasEmp5.en_cerrado && huerfanasEmp5.en_cerrado > 0);
  comprobar("la marca insertada DESPUÉS del cierre dentro del periodo cerrado es un ajuste 'marca_posterior_cierre'", (aj.find((x) => x.motivo === "marca_posterior_cierre") || { n: 0 }).n >= 1);
  comprobar("el periodo cerrado sigue intacto tras las marcas tardías", (await hashCerrado()).h === hc1b.h);
  const dias5 = (await q("SELECT COUNT(*)::int AS n FROM asistencia_diaria WHERE empleado_id = $1", [emp5.id])).rows[0].n;
  comprobar("el empleado al que se le completó la nómina ya tiene días calculados en los periodos abiertos", dias5 > 0);
  const cicloTarde2 = await Motor.ejecutarCiclo({ ahora: () => AHORA_NOV });
  comprobar("repetir la vuelta no duplica los ajustes", (await q("SELECT COUNT(*)::int AS n FROM asistencia_ajustes_pendientes")).rows[0].n === aj.reduce((s, x) => s + x.n, 0), JSON.stringify(cicloTarde2));
  await compararConOraculo("tras vincular nómina", AHORA_NOV, { desde: ANALISIS_DESDE, hasta: "2026-11-03", soloPeriodosAbiertos: true });

  seccion("9. Reapertura");
  const idCerrado = (await q("SELECT id FROM asistencia_periodos WHERE estado = 'cerrado' ORDER BY id LIMIT 1")).rows[0].id;
  comprobar("reabrir sin motivo -> 400", (await http(backend, "POST", `/api/asistencia/periodos/${idCerrado}/reabrir`, U.rh_admin.token, {})).estado === 400);
  for (const rolNombre of ["empleado", "jefe", "rh_empleado", "portal_admin"]) {
    comprobar(`reabrir como ${rolNombre} -> 403`, (await http(backend, "POST", `/api/asistencia/periodos/${idCerrado}/reabrir`, U[rolNombre].token, { motivo: "no debería poder" })).estado === 403);
  }
  const reab = await http(backend, "POST", `/api/asistencia/periodos/${idCerrado}/reabrir`, U.rh_admin.token, { motivo: "Se recibieron marcas tardías del checador" });
  comprobar("rh_admin reabre con motivo (200)", reab.estado === 200, JSON.stringify(reab));
  const pr = (await q("SELECT estado, no_cerrar_automatico, reabierto_motivo, veces_reabierto FROM asistencia_periodos WHERE id = $1", [idCerrado])).rows[0];
  comprobar("queda abierto, con motivo, sin cierre automático", pr.estado === "abierto" && pr.no_cerrar_automatico && pr.reabierto_motivo.length > 5 && pr.veces_reabierto === 1);
  await Motor.ejecutarCiclo({ ahora: () => new Date("2026-11-10T18:00:00Z") });
  comprobar("una vuelta posterior NO lo vuelve a cerrar sola", (await q("SELECT estado FROM asistencia_periodos WHERE id = $1", [idCerrado])).rows[0].estado === "abierto");
  const audit = (await q("SELECT accion FROM auditoria WHERE tabla = 'asistencia_periodos' ORDER BY id")).rows.map((r) => r.accion);
  comprobar("la reapertura quedó en la auditoría", audit.includes("REABRIR_PERIODO"));
  // cierre manual de RH sobre una quincena ya vencida de verdad (1-15 oct): recalcula y congela
  const idOct = (await q("SELECT id FROM asistencia_periodos WHERE fecha_inicio = '2026-10-01'")).rows[0].id;
  const cerr = await http(backend, "POST", `/api/asistencia/periodos/${idOct}/cerrar`, U.rh_admin.token);
  comprobar("RH cierra a mano 1-15 oct (200, tipo manual, con usuario)", cerr.estado === 200 &&
    (await q("SELECT tipo_cierre, cerrado_por FROM asistencia_periodos WHERE id = $1", [idOct])).rows.every((r) => r.tipo_cierre === "manual" && r.cerrado_por === U.rh_admin.id), JSON.stringify(cerr));
  comprobar("cerrar de nuevo -> 409; cerrar una quincena que no terminó (16-31 oct reabierta) -> 409; sin permiso -> 403",
    (await http(backend, "POST", `/api/asistencia/periodos/${idOct}/cerrar`, U.rh_admin.token)).estado === 409 &&
    (await http(backend, "POST", `/api/asistencia/periodos/${idCerrado}/cerrar`, U.rh_admin.token)).estado === 409 &&
    (await http(backend, "POST", `/api/asistencia/periodos/${idOct}/cerrar`, U.jefe.token)).estado === 403);
  const hOct = (await q("SELECT md5(string_agg(to_jsonb(d)::text, '|' ORDER BY empleado_id, fecha)) AS h FROM asistencia_diaria d WHERE periodo_id = $1", [idOct])).rows[0].h;
  await Motor.recalcular({ desde: ANALISIS_DESDE, hasta: HOY, ...opciones });
  comprobar("lo cerrado a mano tampoco cambia con un recálculo posterior", (await q("SELECT md5(string_agg(to_jsonb(d)::text, '|' ORDER BY empleado_id, fecha)) AS h FROM asistencia_diaria d WHERE periodo_id = $1", [idOct])).rows[0].h === hOct);

  seccion("10. API real: permisos por rol, alcance (IDOR) y errores");
  const emp22 = S.porI(22).id;
  const rutas = (id) => `/api/asistencia/resultados?desde=2026-10-01&hasta=2026-10-15&empleado_id=${id}`;
  const e = (r) => r.estado;
  comprobar("empleado: lo propio 200", e(await http(backend, "GET", rutas(emp22), U.empleado.token)) === 200);
  comprobar("empleado: el de un compañero 403", e(await http(backend, "GET", rutas(S.porI(23).id), U.empleado.token)) === 403);
  comprobar("empleado: su jefe 403 y un id inexistente 403 (mismo mensaje)", e(await http(backend, "GET", rutas(S.porI(21).id), U.empleado.token)) === 403 && e(await http(backend, "GET", rutas(999999), U.empleado.token)) === 403);
  comprobar("jefe: su subordinado directo 200", e(await http(backend, "GET", rutas(emp22), U.jefe.token)) === 200);
  comprobar("jefe: un empleado ajeno 403", e(await http(backend, "GET", rutas(S.porI(26).id), U.jefe.token)) === 403);
  comprobar("otro jefe: NO ve al subordinado del primero", e(await http(backend, "GET", rutas(emp22), U.otro_jefe.token)) === 403);
  // rh_empleado del seed solo tiene Asistencia:consulta: se comporta como cualquier empleado (solo lo propio)
  const todos = { rh_admin: 200, rh_lectura: 200, rh_empleado: 403, super_admin: 200, portal_admin: 403 };
  for (const [rolNombre, esperado] of Object.entries(todos)) {
    comprobar(`${rolNombre}: resultados de cualquier empleado -> ${esperado}`, e(await http(backend, "GET", rutas(emp22), U[rolNombre].token)) === esperado);
  }
  const prop = await http(backend, "GET", "/api/asistencia/resultados?desde=2026-10-01&hasta=2026-10-15", U.empleado.token);
  comprobar("sin empleado_id un empleado recibe SOLO sus filas", prop.estado === 200 && prop.json.datos.length > 0 && prop.json.datos.every((f) => f.empleado_id === emp22));
  const jefeRes = await http(backend, "GET", "/api/asistencia/resultados?desde=2026-10-01&hasta=2026-10-15&limite=500", U.jefe.token);
  const idsJefe = new Set(jefeRes.json.datos.map((f) => f.empleado_id));
  comprobar("sin empleado_id el jefe recibe él y sus 3 subordinados, nadie más", [...idsJefe].every((id) => [21, 22, 23, 24].map((i) => S.porI(i).id).includes(id)) && idsJefe.size >= 3);
  const rhRes = await http(backend, "GET", "/api/asistencia/resultados?desde=2026-10-01&hasta=2026-10-15&limite=500", U.rh_admin.token);
  const enBd = (await q("SELECT COUNT(*)::int AS n FROM asistencia_diaria WHERE fecha BETWEEN '2026-10-01' AND '2026-10-15'")).rows[0].n;
  comprobar(`RH: el total paginado (${rhRes.json.paginacion.total}) = filas en la BD (${enBd})`, rhRes.json.paginacion.total === enBd);
  const resumen = await http(backend, "GET", "/api/asistencia/resumen?desde=2026-10-01&hasta=2026-10-15&limite=500", U.rh_admin.token);
  const sumas = resumen.json.datos.reduce((s, f) => s + f.dias, 0);
  comprobar("el resumen suma exactamente los días del rango", sumas === enBd, `${sumas} vs ${enBd}`);
  const resJefe = await http(backend, "GET", "/api/asistencia/resumen?desde=2026-10-01&hasta=2026-10-15&limite=500", U.jefe.token);
  comprobar("el resumen del jefe solo incluye a su gente", resJefe.json.datos.every((f) => [21, 22, 23, 24].map((i) => S.porI(i).id).includes(f.empleado_id)));
  const perEmp = await http(backend, "GET", "/api/asistencia/periodos", U.rh_empleado.token);
  const perRh = await http(backend, "GET", "/api/asistencia/periodos", U.rh_admin.token);
  comprobar("GET /periodos: rh_empleado no ve reabierto_motivo/reabierto_por; rh_admin sí", perEmp.estado === 200 && perEmp.json.datos.every((p) => !("reabierto_motivo" in p) && !("reabierto_por" in p)) && perRh.json.datos.every((p) => "reabierto_motivo" in p && "reabierto_por" in p));
  const sub1 = (await q("INSERT INTO empleados (nombre, apellido_paterno, estatus, fecha_baja, fecha_ingreso, jefe_inmediato_id) VALUES ('BajaA','Ficticio','baja','2026-09-10','2020-01-01',$1) RETURNING id", [S.porI(21).id])).rows[0].id;
  const sub2 = (await q("INSERT INTO empleados (nombre, apellido_paterno, estatus, fecha_baja, fecha_ingreso, jefe_inmediato_id) VALUES ('BajaB','Ficticio','baja','2026-10-10','2020-01-01',$1) RETURNING id", [S.porI(21).id])).rows[0].id;
  comprobar("subordinado dado de baja ANTES del rango -> 403; con baja dentro del rango -> 200", e(await http(backend, "GET", rutas(sub1), U.jefe.token)) === 403 && e(await http(backend, "GET", rutas(sub2), U.jefe.token)) === 200);
  comprobar("rango > 92 días -> 400", e(await http(backend, "GET", "/api/asistencia/resultados?desde=2026-01-01&hasta=2026-12-31", U.rh_admin.token)) === 400);
  comprobar("sin token 401 y token con firma ajena 401", e(await http(backend, "GET", rutas(emp22))) === 401 &&
    e(await http(backend, "GET", rutas(emp22), jwt.sign({ sub: crypto.randomUUID(), aud: "authenticated" }, "otro-secreto-de-prueba-largo-largo", { algorithm: "HS256" }))) === 401);
  comprobar("GET /sin-identificador lista a los 7 sin nómina que quedan (el 5 ya se completó) + el empleado preexistente, y a los 2 con nómina repetida", await (async () => {
    const r = await http(backend, "GET", "/api/asistencia/sin-identificador?limite=500", U.rh_admin.token);
    const motivos = Object.fromEntries(["sin_numero_nomina", "nomina_duplicada"].map((m) => [m, r.json.datos.filter((f) => f.motivo === m).length]));
    const preexistentes = (await q("SELECT COUNT(*)::int AS n FROM empleados WHERE nombre NOT LIKE 'Empleado%' AND numero_nomina IS NULL")).rows[0].n;
    return r.estado === 200 && motivos.sin_numero_nomina === 7 + preexistentes && motivos.nomina_duplicada === 2;
  })());
  comprobar("rh_lectura (Empleados:edicion) ve las listas de gestión pero NO puede escribir; rh_empleado no ve las listas", await (async () => {
    const lect = await Promise.all(["sin-identificador", "ajustes-pendientes", "parametros"].map((r) => http(backend, "GET", `/api/asistencia/${r}`, U.rh_lectura.token)));
    const escr = await Promise.all([
      http(backend, "POST", "/api/asistencia/recalcular", U.rh_lectura.token, { desde: "2026-10-01", hasta: "2026-10-02" }),
      http(backend, "PUT", "/api/asistencia/parametros", U.rh_lectura.token, { dias_cierre: 5 }),
      http(backend, "POST", `/api/asistencia/periodos/${idCerrado}/reabrir`, U.rh_lectura.token, { motivo: "no debería poder" }),
    ]);
    const emp = await Promise.all(["sin-identificador", "ajustes-pendientes", "parametros"].map((r) => http(backend, "GET", `/api/asistencia/${r}`, U.rh_empleado.token)));
    return lect.every((r) => r.estado === 200) && escr.every((r) => r.estado === 403) && emp.every((r) => r.estado === 403);
  })());
  comprobar("empleado y jefe no ven /sin-identificador, /ajustes-pendientes ni /parametros", (await Promise.all(["sin-identificador", "ajustes-pendientes", "parametros"].flatMap((r) => ["empleado", "jefe", "portal_admin"].map((u) => http(backend, "GET", `/api/asistencia/${r}`, U[u].token))))).every((r) => r.estado === 403));
  const ajPend = await http(backend, "GET", "/api/asistencia/ajustes-pendientes?limite=500", U.rh_admin.token);
  comprobar("GET /ajustes-pendientes devuelve los ajustes detectados", ajPend.estado === 200 && ajPend.json.paginacion.total > 0);
  const resuelto = await http(backend, "POST", `/api/asistencia/ajustes-pendientes/${ajPend.json.datos[0].id}/resolver`, U.rh_admin.token, { nota: "Revisado" });
  comprobar("resolver un ajuste (200) y repetirlo (409)", resuelto.estado === 200 && (await http(backend, "POST", `/api/asistencia/ajustes-pendientes/${ajPend.json.datos[0].id}/resolver`, U.rh_admin.token, {})).estado === 409);
  const par = await http(backend, "PUT", "/api/asistencia/parametros", U.rh_admin.token, { dias_cierre: 4 });
  comprobar("PUT /parametros valida rangos (400) y guarda (200)", (await http(backend, "PUT", "/api/asistencia/parametros", U.rh_admin.token, { dias_cierre: 99 })).estado === 400 && par.estado === 200 &&
    (await q("SELECT valor FROM asistencia_parametros WHERE clave = 'dias_cierre'")).rows[0].valor === "4");
  await q("UPDATE asistencia_parametros SET valor = '3' WHERE clave = 'dias_cierre'");
  const rcApi = await http(backend, "POST", "/api/asistencia/recalcular", U.rh_admin.token, { desde: "2026-09-01", hasta: "2026-09-10" });
  comprobar("POST /recalcular (200) de un rango abierto", rcApi.estado === 200 && rcApi.json.datos.dias_evaluados > 0, JSON.stringify(rcApi));
  const cerradoActual = (await q("SELECT to_char(fecha_inicio,'YYYY-MM-DD') AS i, to_char(fecha_fin,'YYYY-MM-DD') AS f FROM asistencia_periodos WHERE estado = 'cerrado' ORDER BY id LIMIT 1")).rows[0];
  if (cerradoActual) {
    const rcCerr = await http(backend, "POST", "/api/asistencia/recalcular", U.rh_admin.token, { desde: cerradoActual.i, hasta: cerradoActual.f });
    comprobar("POST /recalcular sobre un periodo CERRADO -> 409 y no cambia nada", rcCerr.estado === 409);
  }
  const [r1, r2] = await Promise.all([
    http(backend, "POST", "/api/asistencia/recalcular", U.rh_admin.token, { desde: "2026-09-01", hasta: "2026-10-22" }),
    http(backend, "POST", "/api/asistencia/recalcular", U.super_admin.token, { desde: "2026-09-01", hasta: "2026-10-22" }),
  ]);
  comprobar("dos recálculos simultáneos por la API terminan sin 5xx (200 o 409)", [r1.estado, r2.estado].every((s) => s === 200 || s === 409) && [r1.estado, r2.estado].includes(200), `${r1.estado} ${r2.estado}`);
  const logs500 = backend.salida.join("");
  comprobar("el backend no registró errores 5xx ni texto SQL en sus logs durante la API", !/ECONN|syntax error|relation .* does not exist/.test(logs500));
  const sinPII = !/Empleado\d+|Ficticio\d+|@ejemplo/.test(logs500);
  comprobar("los logs del backend no contienen nombres ni correos de empleados", sinPII);

  seccion("11. Planificador real con dos réplicas");
  await detenerBackend(backend);
  await q("DELETE FROM asistencia_ejecuciones");
  await q("UPDATE turnos SET fecha_actualizacion = TIMESTAMP '2000-01-01'");
  const envPlan = { ASISTENCIA_MOTOR_ACTIVO: "true", ASISTENCIA_MOTOR_INTERVALO_MIN: "1", ASISTENCIA_MOTOR_RETRASO_INICIAL_S: "1" };
  // (a) con el candado retenido por otro proceso, las dos réplicas omiten su vuelta
  const retenedor = await pg.connect();
  await retenedor.query("SELECT pg_advisory_lock(4501, 1)");
  const rep1 = lanzarBackend(PUERTO, envPlan);
  const rep2 = lanzarBackend(PUERTO + 1, envPlan);
  await Promise.all([esperarBackend(rep1), esperarBackend(rep2)]);
  await dormir(3500);
  const omitidas = (rep1.salida.join("") + rep2.salida.join("")).match(/vuelta omitida/g) || [];
  comprobar("con el candado retenido las dos réplicas omiten la vuelta y no ejecutan nada", omitidas.length >= 2 && (await q("SELECT COUNT(*)::int AS n FROM asistencia_ejecuciones")).rows[0].n === 0, `omitidas=${omitidas.length}`);
  await retenedor.query("SELECT pg_advisory_unlock(4501, 1)");
  retenedor.release();
  // (b) liberado el candado, cada vuelta se ejecuta SIN empalmarse con la de la otra réplica
  console.log("  esperando las vueltas de un minuto de las dos réplicas (~70 s)...");
  for (let i = 0; i < 150; i++) {
    if ((await q("SELECT COUNT(*)::int AS n FROM asistencia_ejecuciones WHERE estado <> 'en_curso'")).rows[0].n >= 2) break;
    await dormir(1000);
  }
  const ej = (await q("SELECT tipo, estado, origen, inicio, fin FROM asistencia_ejecuciones WHERE estado <> 'en_curso' ORDER BY inicio")).rows;
  console.log(`  ejecuciones: ${JSON.stringify(ej.map((x) => [x.tipo, x.estado]))}`);
  comprobar("ambas réplicas ejecutaron su vuelta (origen planificador) con éxito", ej.length >= 2 && ej.every((x) => x.estado === "ok" && x.origen === "planificador"));
  comprobar("ninguna vuelta se empalmó con otra (el candado serializa a las réplicas)", ej.every((x, i) => i === 0 || new Date(x.inicio) >= new Date(ej[i - 1].fin) - 3000));
  comprobar("la primera fue completa y la siguiente incremental", ej[0].tipo === "completa" && ej[1].tipo === "incremental");
  const logsPlan = rep1.salida.join("") + rep2.salida.join("");
  comprobar("los logs registran las vueltas sin ningún dato personal", /vuelta (completa|incremental) ok/.test(logsPlan) && !/Empleado\d+|Ficticio\d+/.test(logsPlan), logsPlan.slice(-300));
  await q("DELETE FROM asistencia_ejecuciones");
  const salidaLimpia = await Promise.all([detenerBackend(rep1), detenerBackend(rep2)]);
  comprobar("SIGTERM: ambas réplicas se cierran ordenadamente (código 0)", salidaLimpia.every((c) => c === 0), JSON.stringify(salidaLimpia));
  // un error del motor no tumba el portal: se rompe una tabla y el planificador debe seguir vivo
  await q("ALTER TABLE asistencia_parametros RENAME TO asistencia_parametros_x");
  const rep3 = lanzarBackend(PUERTO + 2, envPlan);
  await esperarBackend(rep3);
  await dormir(3500);
  const vivo = await fetch(`http://127.0.0.1:${PUERTO + 2}/api/salud`).then((r) => r.ok).catch(() => false);
  comprobar("si el motor falla (tabla de parámetros ausente) el portal sigue respondiendo", vivo);
  comprobar("el fallo se registra sin texto de PostgreSQL ni datos", /la vuelta del motor falló \(codigo 42P01\)/.test(rep3.salida.join("")) && !/does not exist/.test(rep3.salida.join("")), rep3.salida.join("").slice(-300));
  await q("ALTER TABLE asistencia_parametros_x RENAME TO asistencia_parametros");
  await detenerBackend(rep3);
  const apagado = lanzarBackend(PUERTO + 3, { ASISTENCIA_MOTOR_ACTIVO: "false" });
  await esperarBackend(apagado);
  await dormir(2500);
  comprobar("con ASISTENCIA_MOTOR_ACTIVO=false no corre ninguna vuelta", (await q("SELECT COUNT(*)::int AS n FROM asistencia_ejecuciones WHERE origen = 'planificador'")).rows[0].n === 0);
  await detenerBackend(apagado);

  seccion("12. Tope duro del planificador (vuelta colgada) con PostgreSQL real");
  const { crearPlanificador } = require("../../modules/rh/backend/services/asistencia/planificador");
  await q("DELETE FROM asistencia_ejecuciones");
  const bloqueo = await pg.connect();
  await bloqueo.query("BEGIN");
  await bloqueo.query("LOCK TABLE asistencia_parametros IN ACCESS EXCLUSIVE MODE"); // la vuelta se queda esperando esta tabla
  const registro = [];
  const logPlan = { info: (m) => registro.push(m), warn: (m) => registro.push(m), error: (m) => registro.push(m) };
  // statement_timeout largo a propósito: así actúa el VIGILANTE (destruir conexión), no el timeout de sentencia
  const plan = crearPlanificador({
    ejecutar: (o) => Motor.ejecutarCiclo({ ...o, timeoutMs: 120000, ahora: () => AHORA }),
    abortar: Motor.abortarVuelta, intervaloMs: 60000, tiempoMaxMs: 60000, timeoutMs: 3000, retrasoInicialMs: 3600000, log: logPlan,
  });
  plan.iniciar();
  const tHang = process.hrtime.bigint();
  await plan.vuelta();
  const msHang = Number(process.hrtime.bigint() - tHang) / 1e6;
  console.log(`  la vuelta colgada se abortó a los ${msHang.toFixed(0)} ms`);
  comprobar("el vigilante abortó la vuelta al vencer el tope duro (~3 s) y liberó enCurso", msHang >= 2800 && msHang < 6000 && plan.estado().enCurso === false && plan.estado().errores === 1, JSON.stringify(plan.estado()));
  comprobar("el candado de sesión murió con la conexión", (await q("SELECT COUNT(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND classid = 4501")).rows[0].n === 0);
  const colg = (await q("SELECT estado, error FROM asistencia_ejecuciones ORDER BY id")).rows;
  comprobar("la bitácora registra el error 'tiempo_excedido' sin datos personales", colg.length >= 1 && colg.every((x) => x.estado === "error" && x.error === "tiempo_excedido"), JSON.stringify(colg));
  comprobar("ninguna sesión de la vuelta abortada sigue viva en PostgreSQL", (await q("SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE '%asistencia_parametros%'")).rows[0].n === 0);
  await bloqueo.query("ROLLBACK");
  bloqueo.release();
  await q("DELETE FROM asistencia_ejecuciones");
  await plan.vuelta();
  const sig = (await q("SELECT estado FROM asistencia_ejecuciones ORDER BY id")).rows;
  comprobar("la SIGUIENTE vuelta corre normalmente (ok) y el planificador sigue vivo", sig.length === 1 && sig[0].estado === "ok" && plan.estado().vueltas === 1, JSON.stringify(sig));
  comprobar("el log del tope duro no lleva datos personales", registro.length > 0 && !registro.join(" ").match(/Empleado\d+|Ficticio\d+|rhk_/));
  await plan.detener();

  seccion("Resumen");
  console.log(`  ${pasaron} comprobaciones PASS, ${fallos.length} FAIL, ${(Number(process.hrtime.bigint() - t0) / 1e9).toFixed(0)} s`);
  if (fallos.length) console.log(`  FALLAS:\n   - ${fallos.join("\n   - ")}`);
  await pg.end();
  process.exit(fallos.length ? 1 : 0);
}

principal().catch(async (error) => {
  console.error("Error en la verificación:", error);
  await pg.end().catch(() => {});
  process.exit(1);
});
