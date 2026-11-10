// Siembra de datos 100 % FICTICIOS (@ejemplo.test) para verificar la vinculación cuenta <-> empleado. Ver README.md.
/* eslint-disable */
// Siembra de datos 100% ficticios para verificar la vinculación cuenta <-> empleado.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const WT = path.resolve(__dirname, "../..");
const SALIDA = process.env.VERIF_SALIDA || path.join(os.tmpdir(), "cuentas-verif");
require("fs").mkdirSync(SALIDA, { recursive: true });
const { Pool } = require(`${WT}/node_modules/pg`);
const jwt = require(`${WT}/node_modules/jsonwebtoken`);
const pg = new Pool({ connectionString: `postgres://postgres:pw@127.0.0.1:${process.env.VERIF_PG_PORT || 55420}/postgres`, max: 4 });
const q = (s, p) => pg.query(s, p);
const SECRETO = "secreto-de-prueba-harness-cuentas-0123456789abcdef";
(async () => {
  await q("DELETE FROM auditoria"); await q("DELETE FROM usuario_rol"); await q("UPDATE empleados SET usuario_id=NULL"); await q("DELETE FROM empleados"); await q("DELETE FROM usuarios");
  await q("INSERT INTO departamentos (nombre) VALUES ('Depto A'),('Depto B') ON CONFLICT DO NOTHING");
  const deptos = (await q("SELECT id FROM departamentos ORDER BY id LIMIT 2")).rows.map((r) => r.id);
  for (const n of ["jefe", "empleado"]) await q("INSERT INTO roles (nombre) VALUES ($1) ON CONFLICT DO NOTHING", [n]);
  const rol = {}; for (const r of (await q("SELECT id, nombre FROM roles")).rows) rol[r.nombre] = r.id;
  // 71 empleados ficticios
  const emp = {};
  for (let i = 1; i <= 71; i++) {
    let nombre = `Nom${i}`, pat = `Pat${i}`, mat = `Mat${i}`;
    if (i === 30) { nombre = "Juan"; pat = "Repetido"; mat = "Uno"; }
    if (i === 31) { nombre = "Juan"; pat = "Repetido"; mat = "Dos"; }
    const r = await q("INSERT INTO empleados (nombre, apellido_paterno, apellido_materno, numero_nomina, estatus, departamento_id, fecha_ingreso) VALUES ($1,$2,$3,$4,$5,$6,'2020-01-01') RETURNING id",
      [nombre, pat, mat, `N${1000 + i}`, i === 60 || i === 61 ? "baja" : "activo", deptos[i % 2]]);
    emp[i] = r.rows[0].id;
  }
  await q("UPDATE empleados SET jefe_inmediato_id=$1 WHERE id IN ($2,$3)", [emp[20], emp[55], emp[56]]); // el empleado 20 es jefe de 2
  const mkUser = async (correo, nombre, apellido, rolNombre, empleadoI) => {
    const uid = crypto.randomUUID();
    const u = (await q("INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, auth_uid) VALUES ($1,$2,$3,'ms365',$4) RETURNING id", [correo, nombre, apellido, uid])).rows[0].id;
    if (rolNombre) await q("INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1,$2)", [u, rol[rolNombre]]);
    if (empleadoI) await q("UPDATE empleados SET usuario_id=$1 WHERE id=$2", [u, emp[empleadoI]]);
    return { id: u, token: jwt.sign({ sub: uid, aud: "authenticated", role: "authenticated", amr: [{ method: "oauth", timestamp: Math.floor(Date.now() / 1000) }] }, SECRETO, { algorithm: "HS256", expiresIn: "3h" }) };
  };
  await q("INSERT INTO roles (nombre) VALUES ('rh_consulta') ON CONFLICT DO NOTHING");
  rol.rh_consulta = (await q("SELECT id FROM roles WHERE nombre='rh_consulta'")).rows[0].id;
  await q("INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo) SELECT $1, mo.id, 'consulta' FROM modulo_opciones mo JOIN modulos m ON m.id=mo.modulo_id WHERE m.nombre='rh' AND mo.nombre IN ('Empleados','Departamentos','Puestos','Ubicaciones') ON CONFLICT DO NOTHING", [rol.rh_consulta]);
  const actores = {};
  const lista = [["rh_admin", "rh_admin", 1], ["super_admin", "super_admin", 2], ["portal_admin", "portal_admin", 3], ["rh_empleado", "rh_empleado", 4], ["jefe", "jefe", 5], ["empleado", "empleado", 6], ["rh_consulta", "rh_consulta", 7]];
  for (const [clave, r, i] of lista) actores[clave] = await mkUser(`${clave}@ejemplo.test`, `Nom${i}`, `Pat${i}`, r, i);
  // 8 cuentas sin empleado
  const c = {};
  c.c1 = await mkUser("c1@ejemplo.test", "Nom20", "Pat20", "rh_empleado");
  c.c2 = await mkUser("c2@ejemplo.test", "Nom21", "Pat21 Mat21", "rh_empleado");
  c.c3 = await mkUser("c3@ejemplo.test", "NOM22", "pat22", "rh_empleado");
  c.c4 = await mkUser("c4@ejemplo.test", "Juan", "Repetido", "rh_empleado");
  c.c5 = await mkUser("c5@ejemplo.test", "Juan", "Repetido Dos", "rh_empleado");
  c.c6 = await mkUser("c6@ejemplo.test", "Nom40", "Pat40", "rh_admin");
  c.c7 = await mkUser("c7@ejemplo.test", "Nom41", "Pat41", null);
  c.c8 = await mkUser("c8@ejemplo.test", "Zoe", "Nadie", null);
  fs.writeFileSync(`${SALIDA}/estado.json`, JSON.stringify({
    tokens: Object.fromEntries(Object.entries(actores).map(([k, v]) => [k, v.token])), actores: Object.fromEntries(Object.entries(actores).map(([k, v]) => [k, v.id])),
    cuentas: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.id])), emp,
  }, null, 1));
  console.log("sembrado");
  await pg.end();
})().catch((e) => { console.error(e); process.exit(1); });
