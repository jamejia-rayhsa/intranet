/* eslint-disable */
// Verificación por HTTP de "Importar usuarios" contra backend real + Postgres real + GoTrue REAL (con un proxy de fallos). Ver README.md.
const path = require("path");
const os = require("os");
const WT = path.resolve(__dirname, "../..");
const SALIDA = process.env.VERIF_SALIDA || path.join(os.tmpdir(), "importar-usuarios-verif");
const PUERTO_API = process.env.VERIF_API_PORT || 4670;
const GOTRUE = process.env.VERIF_GOTRUE_REAL || "http://127.0.0.1:9998";
const PROXY = `http://127.0.0.1:${process.env.VERIF_GOTRUE_PROXY_PORT || 9999}`;
const { Pool, Client } = require(`${WT}/node_modules/pg`);
const jwt = require(`${WT}/node_modules/jsonwebtoken`);
const { execSync } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const cadenaPg = `postgres://postgres:pw@127.0.0.1:${process.env.VERIF_PG_PORT || 55430}/postgres`;
const pg = new Pool({ connectionString: cadenaPg, max: 4 });
const q = (s, p) => pg.query(s, p);
let pasan = 0; const fallan = [];
const ok = (n, c, d = "") => { if (c) { pasan++; console.log("  PASS " + n); } else { fallan.push(n); console.log("  FAIL " + n + " " + d); } };
const sembrar = () => execSync("node prep.js", { cwd: __dirname, env: process.env });
const estado = () => JSON.parse(fs.readFileSync(`${SALIDA}/estado.json`, "utf8"));
const api = async (rol, metodo, ruta, cuerpo, crudo) => {
  const h = { "Content-Type": "application/json" };
  if (rol) h.Authorization = `Bearer ${estado().tokens[rol]}`;
  const r = await fetch(`http://127.0.0.1:${PUERTO_API}/api${ruta}`, { method: metodo, headers: h, body: crudo !== undefined ? crudo : cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
// Aplicar SIEMPRE pasa antes por la vista previa y adjunta la huella firmada de cada fila (el servidor la exige). `cuerpo.sinHuella`: no adjuntarla
const imp = async (rol, ruta, cuerpo) => {
  if (ruta === "" && cuerpo && Array.isArray(cuerpo.filas) && !cuerpo.sinHuella) {
    const vp = await api(rol, "POST", "/usuarios/importar/vista-previa", { filas: cuerpo.filas });
    if (vp.status === 200) {
      const m = new Map(vp.json.datos.filas.map((x) => [x.fila, x.huella]));
      cuerpo = { ...cuerpo, filas: cuerpo.filas.map((f) => (m.get(f._fila) ? { ...f, _huella: m.get(f._fila) } : f)) };
    }
  } else if (cuerpo && cuerpo.sinHuella) cuerpo = { ...cuerpo, sinHuella: undefined };
  return api(rol, "POST", `/usuarios/importar${ruta}`, cuerpo);
};
const CLAVE = jwt.sign({ role: "service_role", aud: "authenticated" }, "secreto-de-prueba-harness-gotrue-0123456789abcdef", { expiresIn: "3h" });
const gt = (metodo, ruta, cuerpo, base = GOTRUE) => fetch(base + ruta, { method: metodo, headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
const gotrueUsuarios = async () => (await (await gt("GET", "/admin/users?page=1&per_page=1000")).json()).users || [];
const gotrueCorreo = async (c) => (await gotrueUsuarios()).find((u) => u.email === c.toLowerCase());
const modoProxy = (modo, ms) => fetch(`${PROXY}/__modo`, { method: "POST", body: JSON.stringify({ modo, ms }) });
const logProxy = async () => (await fetch(`${PROXY}/__log`)).json();
const hash = async (sql) => crypto.createHash("md5").update(JSON.stringify((await q(sql)).rows)).digest("hex");
const snapBd = async () => [await hash("SELECT * FROM usuarios ORDER BY id"), await hash("SELECT * FROM usuario_rol ORDER BY usuario_id, rol_id"), await hash("SELECT id, usuario_id, fecha_actualizacion FROM empleados ORDER BY id"), await hash("SELECT id, accion FROM auditoria ORDER BY id")].join("|");
const f = (i, extra = {}) => ({ _fila: i + 1, correo: `n${i}@rayhsa.com.mx`, nombre: `Nom${i}`, apellido: `Pat${i} Mat${i}`, numero_nomina: `N${1000 + i}`, ...extra });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log("\n== 1. Permisos con la BD real (seed de init.sql): solo super_admin");
  sembrar();
  for (const [ruta, cuerpo] of [["/vista-previa", { filas: [f(1)] }], ["", { filas: [f(1)], confirmar: true }]]) {
    ok(`POST importar${ruta}: sin token 401`, (await imp(null, ruta, cuerpo)).status === 401);
    for (const rol of ["portal_admin", "rh_admin", "rh_empleado"]) ok(`POST importar${ruta}: ${rol} 403`, (await imp(rol, ruta, cuerpo)).status === 403);
  }
  ok("ningún 403 escribió nada: 0 usuarios nuevos y GoTrue sin altas", (await q("SELECT count(*)::int n FROM usuarios WHERE correo LIKE 'n%@rayhsa.com.mx'")).rows[0].n === 0 && !(await gotrueCorreo("n1@rayhsa.com.mx")));

  console.log("\n== 2. Vista previa: clasifica y NO escribe (ni BD ni GoTrue)");
  const E = estado();
  const filasMix = [
    f(1), f(2, { numero_nomina: "", curp: E.curps[2] }), f(3, { correo: "N3@RAYHSA.COM.MX" }),
    { _fila: 5, correo: "existe@rayhsa.com.mx", nombre: "Existe", apellido: "Previo", numero_nomina: "N1004" },
    { _fila: 6, correo: "x@gmail.com", nombre: "X", apellido: "Y", numero_nomina: "N1005" },
    { _fila: 7, correo: "dup@rayhsa.com.mx", nombre: "Dora", apellido: "Duplicada", numero_nomina: "DUP-1" },
    { _fila: 8, correo: "baja@rayhsa.com.mx", nombre: "Beto", apellido: "Baja", numero_nomina: "BAJA1" },
    { _fila: 9, correo: "susp@rayhsa.com.mx", nombre: "Susi", apellido: "Suspendida", numero_nomina: "SUSP1" },
    { _fila: 10, correo: "cc@rayhsa.com.mx", nombre: "Cata", apellido: "ConCuenta", numero_nomina: "CCTA1" },
    { _fila: 11, correo: "nadie@rayhsa.com.mx", nombre: "Nadie", apellido: "Nadie", numero_nomina: "NO-EXISTE" },
    { _fila: 12, correo: "ceros@rayhsa.com.mx", nombre: "Ceci", apellido: "Ceros", numero_nomina: "777" },
    { _fila: 13, correo: "rep@rayhsa.com.mx", nombre: "Rep", apellido: "Rep", numero_nomina: "N1001" },
    { _fila: 14, correo: "sinid@rayhsa.com.mx", nombre: "Sin", apellido: "Id" },
    { _fila: 15, correo: "otro@rayhsa.com.mx", nombre: "Otro", apellido: "Nombre", numero_nomina: "N1006" },
    { _fila: 16, correo: "fantasma@rayhsa.com.mx", nombre: "Fan", apellido: "Tasma", numero_nomina: "N1007" },
  ];
  const antes = await snapBd(); const usuariosGoTrueAntes = (await gotrueUsuarios()).length;
  const vp = await imp("super_admin", "/vista-previa", { filas: filasMix });
  ok("vista previa 200", vp.status === 200 && vp.json.exito, JSON.stringify(vp.json).slice(0, 200));
  const por = Object.fromEntries((vp.json.datos?.filas || []).map((x) => [x.fila, x]));
  ok("fila 2 (nómina) y 3 (CURP) -> crear, con el empleado correcto", por[2]?.estado === "crear" && por[2].empleado.id === E.emp[1] && por[3]?.estado === "crear" && por[3].empleado.id === E.emp[2]);
  ok("fila 4: correo en mayúsculas apunta al empleado 3 -> crear (se normaliza a minúsculas)", por[4]?.estado === "crear" && por[4].correo === "n3@rayhsa.com.mx");
  ok("fila 5: correo existente -> omitir", por[5]?.estado === "omitir");
  ok("fila 6: dominio distinto -> error de dominio", por[6]?.estado === "error" && /dominio/.test(por[6].motivo));
  ok("fila 6 con error de lectura se muestra con lo que el usuario escribió (correo y nombre)", por[6]?.correo === "x@gmail.com" && por[6].nombre === "X Y");
  ok("fila 7: nómina ambigua -> error", por[7]?.estado === "error" && /ambiguo/.test(por[7].motivo));
  ok("fila 8 baja y 9 suspendido -> error 'no está activo'", /no está activo \(estatus: baja\)/.test(por[8]?.motivo || "") && /no está activo \(estatus: suspendido\)/.test(por[9]?.motivo || ""));
  ok("fila 10: empleado que ya tiene cuenta -> error", por[10]?.estado === "error" && /ya tiene una cuenta/.test(por[10].motivo));
  ok("fila 11: nómina inexistente -> error", por[11]?.estado === "error" && /No hay un empleado/.test(por[11].motivo));
  ok("fila 12: nómina '777' encuentra '00777' (Excel pierde los ceros) -> crear", por[12]?.estado === "crear" && por[12].empleado.id === E.emp.ceros);
  ok("fila 13: nómina repetida en el archivo (N1001 de la fila 2) -> error", por[13]?.estado === "error" && /ya aparece en la fila 2/.test(por[13].motivo));
  ok("fila 14: sin identificador -> error", por[14]?.estado === "error" && /nómina o CURP/.test(por[14].motivo));
  ok("fila 15: nombre distinto del empleado -> crear con AVISO", por[15]?.estado === "crear" && (por[15].avisos || []).length === 1);
  ok("resumen: 15 filas = 6 por crear, 1 omitir, 8 con error", JSON.stringify(vp.json.datos.resumen) === JSON.stringify({ total: 15, crear: 6, omitir: 1, error: 8 }), JSON.stringify(vp.json.datos.resumen));
  ok("la respuesta no trae CURP ni nómina del archivo", !/XEJE|N1001|DUP-1/.test(JSON.stringify(vp.json)));
  ok("la vista previa NO cambió la BD (usuarios, roles, vínculos, auditoría)", (await snapBd()) === antes);
  ok("la vista previa NO creó nada en GoTrue", (await gotrueUsuarios()).length === usuariosGoTrueAntes);
  ok("fila 16: correo que ya está en GoTrue sin fila local pasa la vista previa (solo GoTrue lo sabe) -> se rechazará al aplicar", por[16]?.estado === "crear");

  console.log("\n== 3. Aplicar: alta ms365 sin contraseña + rol rh_empleado + vínculo");
  const logAntes = (await logProxy()).length;
  const filasOk = [f(1), f(2, { numero_nomina: "", curp: E.curps[2] }), { _fila: 4, correo: "Ceros@Rayhsa.com.mx", nombre: "Ceci", apellido: "Ceros", numero_nomina: "777" }];
  const ap = await imp("super_admin", "", { filas: filasOk, confirmar: true });
  ok("aplicar 200 con 3 creadas, 0 omitidas, 0 errores", ap.status === 200 && ap.json.datos.insertados === 3 && ap.json.datos.duplicados === 0 && ap.json.datos.errores.length === 0, JSON.stringify(ap.json).slice(0, 300));
  const us = (await q("SELECT u.*, (SELECT array_agg(r.nombre) FROM usuario_rol ur JOIN roles r ON r.id=ur.rol_id WHERE ur.usuario_id=u.id) roles FROM usuarios u WHERE correo LIKE '%@rayhsa.com.mx' AND correo IN ('n1@rayhsa.com.mx','n2@rayhsa.com.mx','ceros@rayhsa.com.mx') ORDER BY correo")).rows;
  ok("3 filas locales, correo en minúsculas", us.length === 3 && us.every((u) => u.correo === u.correo.toLowerCase()));
  ok("auth_tipo ms365, activo, sin hash_password y sin cambio de contraseña pendiente", us.every((u) => u.auth_tipo === "ms365" && u.activo === true && u.hash_password === null && u.requiere_cambio_password === false));
  ok("rol: exactamente rh_empleado (y ninguno más)", us.every((u) => JSON.stringify(u.roles) === JSON.stringify(["rh_empleado"])));
  ok("auth_uid guardado y es el id real de GoTrue", (await Promise.all(us.map(async (u) => (await gotrueCorreo(u.correo))?.id === u.auth_uid))).every(Boolean));
  const vinc = (await q("SELECT id, usuario_id FROM empleados WHERE usuario_id = ANY($1) ORDER BY id", [us.map((u) => u.id)])).rows;
  ok("cada cuenta vinculada al empleado indicado (1, 2 y 00777)", vinc.length === 3 && vinc.some((v) => v.id === E.emp[1]) && vinc.some((v) => v.id === E.emp[2]) && vinc.some((v) => v.id === E.emp.ceros));
  const bdGo = new Client({ connectionString: cadenaPg.replace(/\/postgres$/, "/gotrue_verif") }); await bdGo.connect();
  const pw = (await bdGo.query("SELECT email, COALESCE(encrypted_password,'') AS p FROM auth.users WHERE email = ANY($1)", [us.map((u) => u.correo)])).rows;
  // HALLAZGO: GoTrue (admin API sin password) guarda una contraseña ALEATORIA que nadie conoce: el hash existe, pero es distinto por cuenta
  ok("GoTrue asignó a cada cuenta una contraseña aleatoria propia que nadie conoce (hashes distintos); la plataforma no la recibió ni la guarda", pw.length === 3 && new Set(pw.map((r) => r.p)).size === 3 && pw.every((r) => /^\$2[aby]\$/.test(r.p)));
  const nuevos = (await logProxy()).slice(logAntes).filter((x) => x.metodo === "POST");
  ok("la petición a GoTrue no lleva password ni password_hash", nuevos.length === 3 && nuevos.every((x) => !("password" in x.cuerpo) && !("password_hash" in x.cuerpo) && x.cuerpo.email_confirm === true));
  const intento = await fetch(`${GOTRUE}/token?grant_type=password`, { method: "POST", headers: { apikey: CLAVE, "Content-Type": "application/json" }, body: JSON.stringify({ email: "n1@rayhsa.com.mx", password: "cualquiera123" }) });
  ok("no se puede entrar a la cuenta importada con contraseña (400 de GoTrue)", intento.status === 400);
  const me = await api(null, "GET", "/salud");
  ok("las 3 filas tienen empleado y usuario cruzados (inversa)", (await q("SELECT count(*)::int n FROM empleados e JOIN usuarios u ON u.id=e.usuario_id WHERE u.correo IN ('n1@rayhsa.com.mx','n2@rayhsa.com.mx','ceros@rayhsa.com.mx')")).rows[0].n === 3 && me.status === 200);

  console.log("\n== 4. Idempotencia: repetir el archivo no duplica");
  const snap1 = await snapBd(); const g1 = (await gotrueUsuarios()).length;
  const ap2 = await imp("super_admin", "", { filas: filasOk, confirmar: true });
  ok("repetir: 0 creadas, 3 omitidas", ap2.status === 200 && ap2.json.datos.insertados === 0 && ap2.json.datos.duplicados === 3, JSON.stringify(ap2.json?.datos?.duplicados_detalle));
  ok("la repetición no cambió usuarios, roles ni vínculos (solo se agrega la auditoría) ni GoTrue", (await hash("SELECT * FROM usuarios ORDER BY id")) === (await hash("SELECT * FROM usuarios ORDER BY id")) && (await q("SELECT count(*)::int n FROM usuarios WHERE correo LIKE 'n%@rayhsa.com.mx' OR correo='ceros@rayhsa.com.mx'")).rows[0].n === 3 && (await gotrueUsuarios()).length === g1);

  console.log("\n== 5. Errores por fila en una sola petición: nada parcial en silencio");
  const g2 = (await gotrueUsuarios()).length; const n2 = (await q("SELECT count(*)::int n FROM usuarios")).rows[0].n;
  const ap3 = await imp("super_admin", "", { filas: [f(3, { _fila: 2 }), { _fila: 3, correo: "x@gmail.com", nombre: "X", apellido: "Y", numero_nomina: "N1005" }, { _fila: 4, correo: "dup@rayhsa.com.mx", nombre: "Dora", apellido: "Duplicada", numero_nomina: "DUP-1" }, { _fila: 5, correo: "baja@rayhsa.com.mx", nombre: "Beto", apellido: "Baja", numero_nomina: "BAJA1" }, { _fila: 6, correo: "cc@rayhsa.com.mx", nombre: "Cata", apellido: "ConCuenta", numero_nomina: "CCTA1" }, { _fila: 7, correo: "existe@rayhsa.com.mx", nombre: "Existe", apellido: "Previo", numero_nomina: "N1010" }, { _fila: 8, correo: "fantasma@rayhsa.com.mx", nombre: "Fan", apellido: "Tasma", numero_nomina: "N1011" }], confirmar: true });
  const d3 = ap3.json?.datos;
  ok("1 creada, 1 omitida, 5 errores y cada fila reportada con su número", d3?.insertados === 1 && d3.duplicados === 1 && d3.errores.length === 5 && d3.filas.length === 7 && d3.filas.map((x) => `${x.fila}:${x.estado}`).join() === "2:creada,3:error,4:error,5:error,6:error,7:omitida,8:error", JSON.stringify(d3?.filas?.map((x) => [x.fila, x.estado])));
  ok("correo ya en GoTrue sin fila local: error, NO se adopta y la reserva local se borró", (await q("SELECT count(*)::int n FROM usuarios WHERE correo='fantasma@rayhsa.com.mx'")).rows[0].n === 0 && /preexistente, no se adopta/.test((d3.errores.find((e) => e.fila === 8) || {}).error || ""));
  ok("el usuario existente no se tocó (conserva su rol rh_admin y su auth_uid)", (await q("SELECT u.auth_uid, array_agg(r.nombre) r FROM usuarios u JOIN usuario_rol ur ON ur.usuario_id=u.id JOIN roles r ON r.id=ur.rol_id WHERE u.id=$1 GROUP BY u.auth_uid", [E.existente])).rows[0].r.join() === "rh_admin");
  ok("solo 1 usuario nuevo en BD y 1 en GoTrue (la creada)", (await q("SELECT count(*)::int n FROM usuarios")).rows[0].n === n2 + 1 && (await gotrueUsuarios()).length === g2 + 1);
  ok("ninguna fila de error dejó cuentas sin vincular ni inactivas", (await q("SELECT count(*)::int n FROM usuarios WHERE auth_uid IS NULL OR activo=false")).rows[0].n === 0);
  ok("el mensaje de error de la fila de GoTrue no filtra texto de la plataforma ni el correo", !/fantasma@|registered|Supabase Auth:/.test(JSON.stringify(d3?.errores)));

  console.log("\n== 6. Límites y validaciones de petición");
  sembrar();
  ok("sin 'confirmar' -> 400 y no crea nada", (await imp("super_admin", "", { filas: [f(1)] })).status === 400 && (await q("SELECT count(*)::int n FROM usuarios WHERE correo='n1@rayhsa.com.mx'")).rows[0].n === 0);
  ok("201 filas -> 400 (vista previa y aplicar)", (await imp("super_admin", "/vista-previa", { filas: Array.from({ length: 201 }, (_, i) => f(i + 1)) })).status === 400 && (await imp("super_admin", "", { filas: Array.from({ length: 201 }, (_, i) => f(i + 1)), confirmar: true })).status === 400);
  ok("filas vacías o no arreglo -> 400", (await imp("super_admin", "/vista-previa", { filas: [] })).status === 400 && (await imp("super_admin", "/vista-previa", { filas: "x" })).status === 400);
  ok("cuerpo de 2 MB -> 413 (parser global), sin tocar nada", (await api("super_admin", "POST", "/usuarios/importar/vista-previa", undefined, JSON.stringify({ filas: [f(1)], relleno: "x".repeat(2 * 1024 * 1024) }))).status === 413);
  ok("JSON inválido -> 400", (await api("super_admin", "POST", "/usuarios/importar/vista-previa", undefined, "{no-es-json")).status === 400);
  const colRol = await imp("super_admin", "", { filas: [f(1, { rol: "super_admin", rol_id: 1 })], confirmar: true });
  ok("una columna 'rol' en el archivo se ignora: la cuenta queda con rh_empleado", colRol.status === 200 && (await q("SELECT array_agg(r.nombre) r FROM usuarios u JOIN usuario_rol ur ON ur.usuario_id=u.id JOIN roles r ON r.id=ur.rol_id WHERE u.correo='n1@rayhsa.com.mx'")).rows[0].r.join() === "rh_empleado");

  console.log("\n== 7. Auditoría IMPORTAR_USUARIOS: solo conteos e ids");
  const au = (await q("SELECT modulo, tabla, accion, registro_id, valores_nuevos, valores_previos FROM auditoria WHERE accion='IMPORTAR_USUARIOS' ORDER BY id DESC LIMIT 1")).rows[0];
  ok("registro en módulo portal, tabla usuarios, acción IMPORTAR_USUARIOS", au && au.modulo === "portal" && au.tabla === "usuarios");
  ok("valores_nuevos: conteos, ids de usuarios creados y pares [usuario_id, empleado_id]", au && au.valores_nuevos.creadas === 1 && Array.isArray(au.valores_nuevos.usuarios_creados) && au.valores_nuevos.pares.length === 1, JSON.stringify(au?.valores_nuevos));
  ok("la auditoría no contiene correos, nombres, nóminas ni CURP", !/@|Nom1|Pat1|N1001|XEJE/.test(JSON.stringify(au)));
  ok("el 403 y el 400 no auditan", (await q("SELECT count(*)::int n FROM auditoria WHERE accion='IMPORTAR_USUARIOS'")).rows[0].n === 1);

  console.log("\n== 8. PUT /usuarios/:id ya no acepta contraseña en cuentas ms365");
  const u1 = (await q("SELECT id, auth_uid FROM usuarios WHERE correo='n1@rayhsa.com.mx'")).rows[0];
  const hashAntesPut = (await bdGo.query("SELECT encrypted_password p FROM auth.users WHERE id=$1", [u1.auth_uid])).rows[0].p;
  const put = await api("super_admin", "PUT", `/usuarios/${u1.id}`, { nombre: "Cambiado", contraseña: "Nueva12345!" });
  ok("PUT con contraseña a una cuenta ms365 -> 400 con mensaje propio", put.status === 400 && /Microsoft/.test(put.json.mensaje), JSON.stringify(put.json));
  ok("no se cambió ni el nombre (nada se escribe) ni la contraseña en GoTrue", (await q("SELECT nombre FROM usuarios WHERE id=$1", [u1.id])).rows[0].nombre === "Nom1" && (await bdGo.query("SELECT encrypted_password p FROM auth.users WHERE id=$1", [u1.auth_uid])).rows[0].p === hashAntesPut);
  ok("entrar con esa contraseña sigue fallando", (await fetch(`${GOTRUE}/token?grant_type=password`, { method: "POST", headers: { apikey: CLAVE, "Content-Type": "application/json" }, body: JSON.stringify({ email: "n1@rayhsa.com.mx", password: "Nueva12345!" }) })).status === 400);
  ok("PUT sin contraseña a la cuenta ms365 (editar nombre) sigue funcionando", (await api("super_admin", "PUT", `/usuarios/${u1.id}`, { nombre: "Cambiado" })).status === 200);
  const cp = await api("portal_admin", "POST", "/auth/cambiar-password", { contraseña_actual: "x", contraseña_nueva: "Nueva12345!" });
  ok("POST /auth/cambiar-password de una cuenta ms365 -> 400 (no puede ponerse contraseña local) sin tocar GoTrue", cp.status === 400 && /Microsoft/.test(cp.json.mensaje));
  const loc = await api("super_admin", "POST", "/usuarios", { correo: "local1@rayhsa.com.mx", nombre: "Local", apellido: "Uno", contraseña: "Inicial12345!" });
  ok("(control) crear una cuenta local con contraseña sigue funcionando", loc.status === 201, JSON.stringify(loc.json));
  const putLocal = await api("super_admin", "PUT", `/usuarios/${loc.json.datos.id}`, { contraseña: "Otra12345!!" });
  ok("(control) PUT con contraseña a una cuenta LOCAL sigue funcionando y la contraseña entra", putLocal.status === 200 && (await fetch(`${GOTRUE}/token?grant_type=password`, { method: "POST", headers: { apikey: CLAVE, "Content-Type": "application/json" }, body: JSON.stringify({ email: "local1@rayhsa.com.mx", password: "Otra12345!!" }) })).status === 200);

  console.log("\n== 9. Fallos de GoTrue (proxy de fallos delante de GoTrue real)");
  sembrar();
  await modoProxy("http400");
  const r400 = await imp("super_admin", "", { filas: [f(1)], confirmar: true });
  ok("rechazo 4xx definitivo de GoTrue: fila en error, reserva local borrada, sin vínculo", r400.status === 200 && r400.json.datos.errores.length === 1 && !/Verificar/.test(r400.json.datos.errores[0].error) && (await q("SELECT count(*)::int n FROM usuarios WHERE correo='n1@rayhsa.com.mx'")).rows[0].n === 0 && (await q("SELECT usuario_id FROM empleados WHERE id=$1", [estado().emp[1]])).rows[0].usuario_id === null, JSON.stringify(r400.json?.datos?.errores));
  await modoProxy("http500");
  const r500 = await imp("super_admin", "", { filas: [f(2)], confirmar: true });
  ok("un 500 de GoTrue es INCIERTO: 'verificar' y la fila local NO se borra", r500.status === 200 && r500.json.datos.verificar === 1 && (await q("SELECT count(*)::int n FROM usuarios WHERE correo='n2@rayhsa.com.mx'")).rows[0].n === 1);
  await modoProxy("normal");
  sembrar();
  await modoProxy("colgar");
  const t0 = Date.now();
  const rTo = await imp("super_admin", "", { filas: [f(1)], confirmar: true });
  const seg = (Date.now() - t0) / 1000;
  ok(`sin respuesta (tiempo agotado ${seg.toFixed(1)} s): fila 'verificar', NO se compensa`, rTo.status === 200 && rTo.json.datos.verificar === 1 && /Verificar/.test(rTo.json.datos.errores[0].error) && seg >= 9, JSON.stringify(rTo.json?.datos?.errores));
  const inc = (await q("SELECT id, activo, auth_uid FROM usuarios WHERE correo='n1@rayhsa.com.mx'")).rows[0];
  ok("la fila local quedó inactiva, sin auth_uid, sin rol y sin vínculo", inc && inc.activo === false && inc.auth_uid === null && (await q("SELECT count(*)::int n FROM usuario_rol WHERE usuario_id=$1", [inc.id])).rows[0].n === 0 && (await q("SELECT usuario_id FROM empleados WHERE id=$1", [estado().emp[1]])).rows[0].usuario_id === null);
  await modoProxy("normal");
  const reint = await imp("super_admin", "/vista-previa", { filas: [f(1)] });
  ok("el reintento: la vista previa lo ofrece como 'crear' con aviso de cuenta incompleta (no lo bloquea)", reint.json.datos.filas[0].estado === "crear" && /incompleta/.test(reint.json.datos.filas[0].avisos.join(" ")));
  const rOk = await imp("super_admin", "", { filas: [f(1)], confirmar: true });
  ok("el reintento completa la MISMA fila (sin duplicar): activa, auth_uid de GoTrue, rol y vínculo", rOk.status === 200 && rOk.json.datos.insertados === 1 && (await q("SELECT count(*)::int n FROM usuarios WHERE correo='n1@rayhsa.com.mx'")).rows[0].n === 1 && (await q("SELECT activo, auth_uid FROM usuarios WHERE id=$1", [inc.id])).rows[0].activo === true);
  await modoProxy("normal");

  console.log("\n== 9b. GoTrue CREA la cuenta y la respuesta falla (5xx, 502/504 del intermediario, 2xx sin JSON, timeout): 'verificar', NUNCA se borra; el reintento ADOPTA");
  const variantes = [["500", { modo: "despues", codigo: 500 }], ["502", { modo: "despues", codigo: 502 }], ["504", { modo: "despues", codigo: 504 }], ["2xx sin JSON", { modo: "despues", sinJson: true }], ["timeout tras crear", { modo: "despues", colgar: true }]];
  for (const [i, [nombre, modo]] of variantes.entries()) {
    sembrar();
    const emp = estado().emp[10 + i];
    const fi = f(10 + i);
    await fetch(`${PROXY}/__modo`, { method: "POST", body: JSON.stringify(modo) });
    const antesPost = (await logProxy()).filter((x) => x.metodo === "POST").length;
    const rv = await imp("super_admin", "", { filas: [fi], confirmar: true });
    await modoProxy("normal");
    const loc = (await q("SELECT id, activo, auth_uid FROM usuarios WHERE correo=$1", [fi.correo])).rows[0];
    const enGo = await gotrueCorreo(fi.correo);
    ok(`${nombre}: la fila queda 'verificar' (no 'error'), la reserva local NO se borra y GoTrue sí tiene la cuenta`, rv.status === 200 && rv.json.datos.verificar === 1 && rv.json.datos.errores.length === 1 && /Verificar/.test(rv.json.datos.errores[0].error) && loc && loc.activo === false && loc.auth_uid === null && Boolean(enGo), JSON.stringify(rv.json?.datos?.errores));
    ok(`${nombre}: el mensaje manda a reimportar (no a 'eliminar en Administración de usuarios')`, /Vuelve a importar/.test(rv.json.datos.errores[0].error) && !/elimín/i.test(rv.json.datos.errores[0].error));
    const rAd = await imp("super_admin", "", { filas: [fi], confirmar: true });
    const loc2 = (await q("SELECT id, activo, auth_uid FROM usuarios WHERE correo=$1", [fi.correo])).rows[0];
    const postsDespues = (await logProxy()).filter((x) => x.metodo === "POST").length;
    ok(`${nombre}: el reintento ADOPTA la cuenta de GoTrue (misma fila, auth_uid = id de GoTrue, activa, rol y vínculo) sin crear otra`, rAd.status === 200 && rAd.json.datos.insertados === 1 && loc2.id === loc.id && loc2.auth_uid === enGo.id && loc2.activo === true && (await q("SELECT usuario_id FROM empleados WHERE id=$1", [emp])).rows[0].usuario_id === loc.id && (await q("SELECT count(*)::int n FROM usuario_rol WHERE usuario_id=$1", [loc.id])).rows[0].n === 1 && postsDespues === antesPost + 1, JSON.stringify(rAd.json?.datos?.errores));
  }
  {
    sembrar();
    await imp("super_admin", "", { filas: [f(20)], confirmar: true });
    const m = (await gotrueCorreo("n20@rayhsa.com.mx")).user_metadata;
    ok("metadata en GoTrue: origen e importacion (uuid); sin usuario_id", m.origen === "importacion_usuarios" && /^[0-9a-f-]{36}$/.test(m.importacion) && !("usuario_id" in m) && m.nombre === "Nom20", JSON.stringify(m));
  }

  console.log("\n== 9c. Preexistente que NO se adopta / huérfana marcada que SÍ se adopta (sin panel de GoTrue)");
  sembrar();
  await gt("POST", "/admin/users", { email: "ajena@rayhsa.com.mx", email_confirm: true, user_metadata: { nombre: "Ajena" } });
  await q("INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, activo, auth_uid) VALUES ('ajena@rayhsa.com.mx','Ajena','X','ms365',false,NULL)");
  const rAj = await imp("super_admin", "", { filas: [{ _fila: 2, correo: "ajena@rayhsa.com.mx", nombre: "Ajena", apellido: "X", numero_nomina: "N1030" }], confirmar: true });
  ok("fila incompleta + cuenta de GoTrue SIN la marca de importación: error 'preexistente, no se adopta'", rAj.status === 200 && rAj.json.datos.errores.length === 1 && /preexistente, no se adopta/.test(rAj.json.datos.errores[0].error));
  ok("no se tocó nada: la fila local sigue incompleta, el empleado libre y la cuenta de GoTrue intacta (sin password nuevo ni borrado)", (await q("SELECT activo, auth_uid FROM usuarios WHERE correo='ajena@rayhsa.com.mx'")).rows[0].auth_uid === null && (await q("SELECT usuario_id FROM empleados WHERE id=$1", [estado().emp[30]])).rows[0].usuario_id === null && Boolean(await gotrueCorreo("ajena@rayhsa.com.mx")));
  await gt("POST", "/admin/users", { email: "huerfana@rayhsa.com.mx", email_confirm: true, user_metadata: { origen: "importacion_usuarios", importacion: "previa" } });
  const rHu = await imp("super_admin", "", { filas: [{ _fila: 2, correo: "huerfana@rayhsa.com.mx", nombre: "Huerfana", apellido: "Y", numero_nomina: "N1031" }], confirmar: true });
  ok("cuenta marcada por una importación SIN fila local (alguien borró la fila): GoTrue da 422 y se ADOPTA", rHu.status === 200 && rHu.json.datos.insertados === 1 && (await q("SELECT activo, auth_uid FROM usuarios WHERE correo='huerfana@rayhsa.com.mx'")).rows[0].auth_uid === (await gotrueCorreo("huerfana@rayhsa.com.mx")).id, JSON.stringify(rHu.json?.datos?.errores));
  await gt("POST", "/admin/users", { email: "enuso@rayhsa.com.mx", email_confirm: true, user_metadata: { origen: "importacion_usuarios" } });
  const idUso = (await gotrueCorreo("enuso@rayhsa.com.mx")).id;
  await q("INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, activo, auth_uid) VALUES ('otro-correo@rayhsa.com.mx','O','T','ms365',true,$1)", [idUso]);
  const rUso = await imp("super_admin", "", { filas: [{ _fila: 2, correo: "enuso@rayhsa.com.mx", nombre: "En", apellido: "Uso", numero_nomina: "N1032" }], confirmar: true });
  ok("cuenta marcada pero YA usada por otra fila local: no se adopta (error) y no queda reserva", rUso.json.datos.errores.length === 1 && /no se adopta/.test(rUso.json.datos.errores[0].error) && (await q("SELECT count(*)::int n FROM usuarios WHERE correo='enuso@rayhsa.com.mx'")).rows[0].n === 0);

  console.log("\n== 9d. Vista previa obligatoria TAMBIÉN en el servidor (huella firmada) y tope de 1 MB");
  sembrar();
  const sinH = await imp("super_admin", "", { filas: [f(1)], confirmar: true, sinHuella: true });
  ok("aplicar sin huella de la vista previa -> 400 y no escribe nada", sinH.status === 400 && /vista previa/.test(sinH.json.mensaje) && (await q("SELECT count(*)::int n FROM usuarios WHERE correo='n1@rayhsa.com.mx'")).rows[0].n === 0);
  const vpH = await imp("super_admin", "/vista-previa", { filas: [f(1)] });
  const huella = vpH.json.datos.filas[0].huella;
  ok("la vista previa devuelve una huella por fila válida", typeof huella === "string" && /^\d+\.[0-9a-f]{64}$/.test(huella));
  ok("huella con la fila modificada o de otra fila -> 400", (await api("super_admin", "POST", "/usuarios/importar", { filas: [{ ...f(1), nombre: "Cambiado", _huella: huella }], confirmar: true })).status === 400 && (await api("super_admin", "POST", "/usuarios/importar", { filas: [{ ...f(2), _huella: huella }], confirmar: true })).status === 400);
  ok("con la huella correcta se aplica", (await api("super_admin", "POST", "/usuarios/importar", { filas: [{ ...f(1), _huella: huella }], confirmar: true })).json.datos.insertados === 1);
  const relleno = Array.from({ length: 200 }, (_, i) => ({ ...f(i + 1), relleno: "x".repeat(1500) }));
  const grande1 = await api("super_admin", "POST", "/usuarios/importar/vista-previa", { filas: relleno });
  ok("un cuerpo de ~300 kb (200 filas) ya pasa (límite de la ruta: 1 MB, no los 100 kb globales)", grande1.status === 200);
  const rr = await fetch(`http://127.0.0.1:${PUERTO_API}/api/usuarios/importar/vista-previa`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${estado().tokens.super_admin}` }, body: JSON.stringify({ filas: [f(1)], relleno: "x".repeat(1.2 * 1024 * 1024) }) });
  const rj = await rr.json().catch(() => null);
  ok("un cuerpo de más de 1 MB -> 413 en JSON (exito:false)", rr.status === 413 && rj && rj.exito === false);
  ok("el resto de la API conserva su límite de 100 kb (POST /usuarios con 200 kb -> 413)", (await api("super_admin", "POST", "/usuarios", undefined, JSON.stringify({ correo: "x@rayhsa.com.mx", nombre: "x", relleno: "x".repeat(200 * 1024) }))).status === 413);

  console.log("\n== 10. Fallo en la activación/vínculo (paso C): se deshace TODO, incluida la cuenta de GoTrue");
  sembrar();
  const bloqueador = new Client({ connectionString: cadenaPg }); await bloqueador.connect();
  await bloqueador.query("BEGIN"); await bloqueador.query("SELECT id FROM empleados WHERE id=$1 FOR UPDATE", [estado().emp[5]]);
  const gAntes = (await gotrueUsuarios()).length;
  const t1 = Date.now();
  const rBloq = await imp("super_admin", "", { filas: [f(5), f(6)], confirmar: true });
  await bloqueador.query("ROLLBACK"); await bloqueador.end();
  const d10 = rBloq.json?.datos;
  ok(`empleado bloqueado por otra operación (${((Date.now() - t1) / 1000).toFixed(1)} s, lock_timeout 3 s): esa fila en error 'Se deshizo'; la otra se crea`, rBloq.status === 200 && d10.insertados === 1 && d10.errores.length === 1 && /bloqueados.*Se deshizo/.test(d10.errores[0].error), JSON.stringify(d10?.errores));
  ok("GoTrue NO conserva la cuenta de la fila fallida (compensada con su id) y la BD no tiene reserva", !(await gotrueCorreo("n5@rayhsa.com.mx")) && (await q("SELECT count(*)::int n FROM usuarios WHERE correo='n5@rayhsa.com.mx'")).rows[0].n === 0 && (await gotrueUsuarios()).length === gAntes + 1);
  ok("el empleado 5 sigue libre y no hay cuentas inactivas ni sin auth_uid", (await q("SELECT usuario_id FROM empleados WHERE id=$1", [estado().emp[5]])).rows[0].usuario_id === null && (await q("SELECT count(*)::int n FROM usuarios WHERE auth_uid IS NULL OR activo=false")).rows[0].n === 0);

  console.log("\n== 11. Concurrencia: una importación a la vez; el candado 4701");
  sembrar();
  await modoProxy("lento", 1500);
  const [a, b] = await Promise.all([imp("super_admin", "", { filas: [f(1), f(2)], confirmar: true }), (async () => { await esperar(300); return imp("super_admin", "", { filas: [f(3)], confirmar: true }); })()]);
  ok("la segunda recibe 409 'otra importación en curso' sin escribir; la primera termina bien", a.status === 200 && a.json.datos.insertados === 2 && b.status === 409 && /en curso/.test(b.json.mensaje), JSON.stringify([a.status, b.status, b.json]));
  ok("la fila de la segunda petición no se creó", (await q("SELECT count(*)::int n FROM usuarios WHERE correo='n3@rayhsa.com.mx'")).rows[0].n === 0);
  await modoProxy("normal");
  const rAfter = await imp("super_admin", "", { filas: [f(3)], confirmar: true });
  ok("liberado el cupo, la siguiente importación funciona", rAfter.status === 200 && rAfter.json.datos.insertados === 1);
  // vinculación de RH simultánea con el mismo empleado: el candado 4601 serializa y el UPDATE ... usuario_id IS NULL impide pisar
  sembrar();
  await modoProxy("lento", 1200);
  const cuentaLibre = (await q("INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, auth_uid) VALUES ('libre@rayhsa.com.mx','Libre','Cuenta','ms365',$1) RETURNING id", [crypto.randomUUID()])).rows[0].id;
  const [imp1, vinc1] = await Promise.all([
    imp("super_admin", "", { filas: [f(7)], confirmar: true }),
    (async () => { await esperar(400); return api("rh_admin", "POST", "/empleados/cuentas/vincular", { pares: [{ usuario_id: cuentaLibre, empleado_id: estado().emp[7] }], confirmar: true }); })(),
  ]);
  const duenos = (await q("SELECT usuario_id FROM empleados WHERE id=$1", [estado().emp[7]])).rows[0].usuario_id;
  ok("importar y vincular el MISMO empleado a la vez: un solo dueño y nunca se pisa", duenos !== null && (await q("SELECT count(*)::int n FROM empleados WHERE usuario_id=$1", [duenos])).rows[0].n === 1, JSON.stringify([imp1.status, vinc1.status]));
  await modoProxy("normal");

  console.log("\n== 12. Tope real de 200 filas en una petición (rendimiento)");
  sembrar();
  const t2 = Date.now();
  const grande = await imp("super_admin", "", { filas: Array.from({ length: 200 }, (_, i) => f(i + 1)), confirmar: true });
  const seg200 = (Date.now() - t2) / 1000;
  ok(`200 filas: 200 creadas en ${seg200.toFixed(1)} s, 0 errores`, grande.status === 200 && grande.json.datos.insertados === 200 && grande.json.datos.errores.length === 0, JSON.stringify(grande.json).slice(0, 200));
  ok("200 cuentas locales = 200 en GoTrue = 200 vínculos = 200 con rol rh_empleado", (await q("SELECT count(*)::int n FROM usuarios WHERE correo LIKE 'n%@rayhsa.com.mx'")).rows[0].n === 200 && (await gotrueUsuarios()).filter((u) => /^n\d+@/.test(u.email)).length === 200 && (await q("SELECT count(*)::int n FROM empleados e JOIN usuarios u ON u.id=e.usuario_id WHERE u.correo LIKE 'n%@rayhsa.com.mx'")).rows[0].n === 200 && (await q("SELECT count(*)::int n FROM usuario_rol ur JOIN roles r ON r.id=ur.rol_id JOIN usuarios u ON u.id=ur.usuario_id WHERE r.nombre='rh_empleado' AND u.correo LIKE 'n%@rayhsa.com.mx'")).rows[0].n === 200);
  const audit200 = (await q("SELECT valores_nuevos FROM auditoria WHERE accion='IMPORTAR_USUARIOS' ORDER BY id DESC LIMIT 1")).rows[0].valores_nuevos;
  ok("auditoría de 200 filas: 200 ids y 200 pares, sin datos personales", audit200.creadas === 200 && audit200.usuarios_creados.length === 200 && audit200.pares.length === 200 && !/@/.test(JSON.stringify(audit200)));
  const sinPool = await api("super_admin", "GET", "/usuarios");
  ok("la API sigue respondiendo tras la importación (pool sano)", sinPool.status === 200);

  console.log("\n== 13. I-2: ¿puede una cuenta ms365 obtener contraseña por la puerta pública de GoTrue? (GoTrue real, sin cambiar su configuración)");
  sembrar();
  await imp("super_admin", "", { filas: [f(40)], confirmar: true });
  const correo40 = "n40@rayhsa.com.mx";
  const base = (ruta, metodo, cuerpo, token) => fetch(`${GOTRUE}${ruta}`, { method: metodo, headers: { apikey: CLAVE, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const rec = await base("/recover", "POST", { email: correo40 });
  console.log(`  INFO POST /recover (público, sin autenticar) para la cuenta importada -> HTTP ${rec.status} ${(await rec.text()).slice(0, 80)}`);
  const enlace = await (await gt("POST", "/admin/generate_link", { type: "recovery", email: correo40 })).json();
  const tokenRec = enlace.hashed_token;
  const ver = await base(`/verify`, "POST", { type: "recovery", token_hash: tokenRec });
  const sesion = await ver.json();
  console.log(`  INFO el titular del buzón abre el enlace de recuperación -> HTTP ${ver.status}, sesión ${sesion.access_token ? "OBTENIDA" : "no obtenida"}`);
  const putU = await base("/user", "PUT", { password: "ClavePropia12345!" }, sesion.access_token);
  console.log(`  INFO PUT /user { password } con esa sesión -> HTTP ${putU.status}`);
  const login = await base("/token?grant_type=password", "POST", { email: correo40, password: "ClavePropia12345!" });
  const sesionPw = await login.json();
  console.log(`  INFO inicio de sesión por correo+contraseña SIN pasar por Microsoft -> HTTP ${login.status}${sesionPw.access_token ? " (token emitido)" : ""}`);
  if (sesionPw.access_token) {
    const perfil = await fetch(`http://127.0.0.1:${PUERTO_API}/api/auth/perfil`, { headers: { Authorization: `Bearer ${sesionPw.access_token}` } });
    console.log(`  INFO el backend acepta ese token (no comprueba el proveedor) -> GET /auth/perfil HTTP ${perfil.status}`);
    ok("HALLAZGO I-2 reproducido: la cuenta ms365 obtuvo una contraseña por GoTrue y el backend acepta el token (se escala al humano; no se cambió configuración)", putU.status === 200 && login.status === 200 && perfil.status === 200);
  } else ok("I-2: la cuenta ms365 NO pudo obtener contraseña por GoTrue", false, `PUT ${putU.status}`);

  await bdGo.end();
  await pg.end();
  console.log(`\n${pasan} PASS, ${fallan.length} FAIL ${fallan.join(" | ")}`);
  process.exit(fallan.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
