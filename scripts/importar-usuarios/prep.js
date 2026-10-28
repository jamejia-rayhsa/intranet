/* eslint-disable */
// Siembra de datos 100 % FICTICIOS (@rayhsa.com.mx de mentira, Nom1/Pat1...) y limpieza de GoTrue. Ver README.md.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const WT = path.resolve(__dirname, "../..");
const SALIDA = process.env.VERIF_SALIDA || path.join(os.tmpdir(), "importar-usuarios-verif");
fs.mkdirSync(SALIDA, { recursive: true });
const { Pool } = require(`${WT}/node_modules/pg`);
const jwt = require(`${WT}/node_modules/jsonwebtoken`);
const pg = new Pool({ connectionString: `postgres://postgres:pw@127.0.0.1:${process.env.VERIF_PG_PORT || 55430}/postgres`, max: 4 });
const q = (s, p) => pg.query(s, p);
const SECRETO = "secreto-de-prueba-harness-cuentas-0123456789abcdef";
const GOTRUE = process.env.VERIF_GOTRUE_REAL || "http://127.0.0.1:9998";
const CLAVE = jwt.sign({ role: "service_role", aud: "authenticated" }, "secreto-de-prueba-harness-gotrue-0123456789abcdef", { expiresIn: "6h" });
const gt = (metodo, ruta, cuerpo) => fetch(GOTRUE + ruta, { method: metodo, headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
const curp = (i) => `XEJE000101HDFXXX${i.toString(36).toUpperCase().padStart(2, "0")}`; // 18 caracteres, única por empleado

(async () => {
  // GoTrue: borra a todos los usuarios de prueba
  for (let pagina = 0; pagina < 10; pagina++) {
    const r = await (await gt("GET", "/admin/users?page=1&per_page=200")).json();
    if (!r.users || r.users.length === 0) break;
    for (const u of r.users) await gt("DELETE", `/admin/users/${u.id}`);
  }
  await q("DELETE FROM auditoria"); await q("DELETE FROM usuario_rol"); await q("UPDATE empleados SET usuario_id=NULL"); await q("DELETE FROM empleados"); await q("DELETE FROM usuarios");
  const rol = {}; for (const r of (await q("SELECT id, nombre FROM roles")).rows) rol[r.nombre] = r.id;
  const mkUser = async (correo, nombre, apellido, rolNombre) => {
    const uid = crypto.randomUUID();
    const u = (await q("INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, auth_uid) VALUES ($1,$2,$3,'ms365',$4) RETURNING id", [correo, nombre, apellido, uid])).rows[0].id;
    if (rolNombre) await q("INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1,$2)", [u, rol[rolNombre]]);
    return { id: u, uid, token: jwt.sign({ sub: uid, aud: "authenticated", role: "authenticated" }, SECRETO, { algorithm: "HS256", expiresIn: "3h" }) };
  };
  const actores = {};
  for (const r of ["super_admin", "portal_admin", "rh_admin", "rh_empleado"]) actores[r] = await mkUser(`${r}@actor.ejemplo.test`, `Nom${r}`, "Actor", r);
  // 200 empleados activos: Nom{i} Pat{i} Mat{i}, nómina N{1000+i}; CURP ficticia en los pares
  const emp = {};
  for (let i = 1; i <= 200; i++) {
    const r = await q("INSERT INTO empleados (nombre, apellido_paterno, apellido_materno, numero_nomina, curp, estatus, fecha_ingreso) VALUES ($1,$2,$3,$4,$5,'activo','2020-01-01') RETURNING id",
      [`Nom${i}`, `Pat${i}`, `Mat${i}`, `N${1000 + i}`, i % 2 === 0 ? curp(i) : null]);
    emp[i] = r.rows[0].id;
  }
  // casos especiales (ids 201+)
  const extra = async (clave, nombre, pat, nomina, estatus = "activo") => { emp[clave] = (await q("INSERT INTO empleados (nombre, apellido_paterno, numero_nomina, estatus, fecha_ingreso) VALUES ($1,$2,$3,$4,'2020-01-01') RETURNING id", [nombre, pat, nomina, estatus])).rows[0].id; };
  await extra("baja", "Beto", "Baja", "BAJA1", "baja");
  await extra("suspendido", "Susi", "Suspendida", "SUSP1", "suspendido");
  await extra("dup_a", "Dora", "Duplicada", "DUP-1");
  await extra("dup_b", "Dario", "Duplicado", "DUP-1");
  await extra("conCuenta", "Cata", "ConCuenta", "CCTA1");
  await extra("ceros", "Ceci", "Ceros", "00777");
  const ya = await mkUser("cata.concuenta@rayhsa.com.mx", "Cata", "ConCuenta", "rh_empleado");
  await q("UPDATE empleados SET usuario_id=$1 WHERE id=$2", [ya.id, emp.conCuenta]);
  // un usuario que ya existe (con rol distinto: no se debe tocar) y otro local con contraseña en GoTrue
  const existente = await mkUser("existe@rayhsa.com.mx", "Existe", "Previo", "rh_admin");
  // correo que ya está en GoTrue SIN fila local (no se adopta)
  await gt("POST", "/admin/users", { email: "fantasma@rayhsa.com.mx", email_confirm: true });
  fs.writeFileSync(`${SALIDA}/estado.json`, JSON.stringify({
    tokens: Object.fromEntries(Object.entries(actores).map(([k, v]) => [k, v.token])), actores: Object.fromEntries(Object.entries(actores).map(([k, v]) => [k, v.id])),
    emp, curps: Object.fromEntries(Array.from({ length: 100 }, (_, k) => [(k + 1) * 2, curp((k + 1) * 2)])), existente: existente.id, existenteUid: existente.uid, rol,
  }, null, 1));
  console.log("sembrado");
  await pg.end();
})().catch((e) => { console.error(e); process.exit(1); });
