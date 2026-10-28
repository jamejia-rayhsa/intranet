/* eslint-disable */
const path = require("path");
const os = require("os");
const WT = path.resolve(__dirname, "../..");
const SALIDA = process.env.VERIF_SALIDA || path.join(os.tmpdir(), "cuentas-verif");
const PUERTO_API = process.env.VERIF_API_PORT || 4660;
const { Pool } = require(`${WT}/node_modules/pg`);
const { execSync } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const pg = new Pool({ connectionString: `postgres://postgres:pw@127.0.0.1:${process.env.VERIF_PG_PORT || 55420}/postgres`, max: 4 });
const q = (s, p) => pg.query(s, p);
let pasan = 0; const fallan = [];
const ok = (n, c, d = "") => { if (c) { pasan++; console.log("  PASS " + n); } else { fallan.push(n); console.log("  FAIL " + n + " " + d); } };
const sembrar = () => execSync("node prep.js", { cwd: __dirname, env: process.env });
const estado = () => JSON.parse(fs.readFileSync(`${SALIDA}/estado.json`, "utf8"));
const api = async (rol, metodo, ruta, cuerpo, tokenCrudo) => {
  const e = estado();
  const h = { "Content-Type": "application/json" };
  if (rol) h.Authorization = `Bearer ${tokenCrudo || e.tokens[rol]}`;
  const r = await fetch(`http://127.0.0.1:${PUERTO_API}/api/empleados${ruta}`, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
const hash = async (sql) => crypto.createHash("md5").update(JSON.stringify((await q(sql)).rows)).digest("hex");
const snapUsuarios = async () => `${await hash("SELECT * FROM usuarios ORDER BY id")}|${await hash("SELECT * FROM usuario_rol ORDER BY usuario_id, rol_id")}|${await hash("SELECT * FROM roles ORDER BY id")}`;
const snapEmpleados = () => hash("SELECT id, usuario_id, nombre, apellido_paterno, calle, fecha_actualizacion FROM empleados ORDER BY id");
const vinculos = async () => Object.fromEntries((await q("SELECT id, usuario_id FROM empleados WHERE usuario_id IS NOT NULL ORDER BY id")).rows.map((r) => [r.id, r.usuario_id]));
const par = (u, e) => ({ usuario_id: u, empleado_id: e });

(async () => {
  console.log("\n== 1. Matriz de permisos con la BD real (seed de init.sql)");
  sembrar();
  const ENDP = [["GET", "/cuentas/vista-previa"], ["GET", "/cuentas/disponibles"], ["POST", "/cuentas/vincular", { pares: [par(estado().cuentas.c8, estado().emp[70])], confirmar: true }], ["POST", `/${estado().emp[70]}/cuenta`, { usuario_id: estado().cuentas.c8 }]];
  for (const [m, r, cuerpo] of ENDP) {
    ok(`${m} ${r.replace(/\d+/, "N")}: sin token 401`, (await api(null, m, r, cuerpo)).status === 401);
    ok(`${m} ${r.replace(/\d+/, "N")}: token inválido 401`, (await api("x", m, r, cuerpo, "token-falso")).status === 401);
    for (const rol of ["portal_admin", "rh_empleado", "jefe", "empleado"]) ok(`${m} ${r.replace(/\d+/, "N")}: ${rol} 403`, (await api(rol, m, r, cuerpo)).status === 403);
  }
  ok("ningún 403 escribió: 0 vínculos nuevos (solo los 7 de los actores)", Object.keys(await vinculos()).length === 7);
  for (const rol of ["rh_admin", "super_admin"]) {
    ok(`GET vista-previa: ${rol} 200`, (await api(rol, "GET", "/cuentas/vista-previa")).status === 200);
    ok(`GET disponibles: ${rol} 200`, (await api(rol, "GET", "/cuentas/disponibles")).status === 200);
  }

  console.log("\n== 2. Vista previa exacta");
  sembrar();
  let e = estado();
  const vp = (await api("rh_admin", "GET", "/cuentas/vista-previa?limite=100")).json.datos;
  ok("contadores exactos", JSON.stringify(vp.contadores) === JSON.stringify({ cuentas_sin_empleado: 8, empleados_activos_sin_cuenta: 62, coincidencia_exacta: 6, varias_posibles: 1, sin_coincidencia: 1, sin_acceso_asistencia: 2, privilegiadas: 1, inactivas: 0, correos_duplicados: 0 }), JSON.stringify(vp.contadores));
  const porCorreo = Object.fromEntries(vp.cuentas.map((c) => [c.correo, c]));
  ok("sin avisos de integridad (UNIQUE presente, sin duplicados ni vinculadas a no activos)", vp.avisos.falta_unique_usuario_id === false && vp.avisos.total_usuarios_con_varios_empleados === 0 && vp.avisos.total_vinculadas_a_no_activos === 0, JSON.stringify(vp.avisos));
  ok("c1 -> empleado 20 es jefe de 2 (se muestra en la vista previa)", porCorreo["c1@ejemplo.test"].sugerencia.candidatos[0].subordinados === 2);
  ok("c1 exacta -> empleado 20 con departamento", porCorreo["c1@ejemplo.test"].sugerencia.estado === "exacta" && porCorreo["c1@ejemplo.test"].sugerencia.candidatos[0].id === e.emp[20] && !!porCorreo["c1@ejemplo.test"].sugerencia.candidatos[0].departamento);
  ok("c2 (dos apellidos) y c3 (mayúsculas) exactas", porCorreo["c2@ejemplo.test"].sugerencia.candidatos[0].id === e.emp[21] && porCorreo["c3@ejemplo.test"].sugerencia.candidatos[0].id === e.emp[22]);
  ok("c4 homónimos: varias con 2 candidatos", porCorreo["c4@ejemplo.test"].sugerencia.estado === "varias" && porCorreo["c4@ejemplo.test"].sugerencia.candidatos.length === 2);
  ok("c5 desempata por materno", porCorreo["c5@ejemplo.test"].sugerencia.estado === "exacta" && porCorreo["c5@ejemplo.test"].sugerencia.candidatos[0].id === e.emp[31]);
  ok("c6 privilegiada marcada; c7 sin acceso a Asistencia; c8 sin coincidencia", porCorreo["c6@ejemplo.test"].privilegiada && !porCorreo["c7@ejemplo.test"].con_acceso_asistencia && porCorreo["c8@ejemplo.test"].sugerencia.estado === "sin_coincidencia");
  ok("la vista previa no escribió nada", Object.keys(await vinculos()).length === 7);
  ok("sin coincidencia: no aparece ninguna cuenta con empleado", !vp.cuentas.some((c) => ["rh_admin@ejemplo.test", "empleado@ejemplo.test"].includes(c.correo)));
  const pag = (await api("rh_admin", "GET", "/cuentas/vista-previa?limite=3&pagina=3")).json.datos;
  ok("paginación: página 3 de 3 con 2 cuentas", pag.cuentas.length === 2 && pag.paginas_totales === 3);
  ok("tope de página 100", (await api("rh_admin", "GET", "/cuentas/vista-previa?limite=99999")).json.datos.limite === 100);
  const disp = (await api("rh_admin", "GET", "/cuentas/disponibles?busqueda=c1@")).json.datos;
  ok("disponibles: búsqueda por correo", disp.total === 1);
  const corta = (await api("rh_admin", "GET", "/cuentas/disponibles?busqueda=a")).json.datos;
  ok("disponibles: con menos de 2 caracteres no devuelve cuentas y lo indica", corta.cuentas.length === 0 && corta.requiere_busqueda === true);
  ok("disponibles: el límite de página se acota a 25", (await api("rh_admin", "GET", "/cuentas/disponibles?busqueda=ejemplo&limite=500")).json.datos.limite === 25);
  ok("disponibles: búsqueda con % no es comodín", (await api("rh_admin", "GET", "/cuentas/disponibles?busqueda=%25")).json.datos.total === 0);
  ok("disponibles: búsqueda por nombre y apellido juntos", (await api("rh_admin", "GET", "/cuentas/disponibles?busqueda=Nom21%20Pat21")).json.datos.total === 1);

  console.log("\n== 3. Ejecución, privilegiadas e idempotencia");
  const u0 = await snapUsuarios();
  let r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c1, e.emp[20])] });
  ok("sin confirmar: 400", r.status === 400);
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c6, e.emp[40])], confirmar: true });
  ok("cuenta privilegiada sin confirmación aparte: 400 y nada aplicado", r.status === 400 && r.json.requiere_confirmacion_privilegiadas === true && Object.keys(await vinculos()).length === 7);
  const lote1 = [par(e.cuentas.c1, e.emp[20]), par(e.cuentas.c2, e.emp[21]), par(e.cuentas.c3, e.emp[22]), par(e.cuentas.c5, e.emp[31]), par(e.cuentas.c7, e.emp[41])];
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: lote1, confirmar: true });
  ok("lote de 5 exactas: 5 vinculadas", r.status === 200 && r.json.datos.vinculadas === 5 && r.json.datos.omitidas === 0, JSON.stringify(r.json));
  ok("advertencia: 1 sin acceso a Asistencia (c7)", r.json.datos.sin_acceso_asistencia === 1);
  ok("quedaron 12 vínculos", Object.keys(await vinculos()).length === 12);
  const sE = await snapEmpleados();
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: lote1, confirmar: true });
  ok("segunda corrida: 0 vinculadas y 5 omitidas", r.status === 200 && r.json.datos.vinculadas === 0 && r.json.datos.omitidas === 5);
  ok("segunda corrida sin ningún cambio en empleados (ni fecha_actualizacion)", (await snapEmpleados()) === sE);
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c6, e.emp[40])], confirmar: true, confirmar_privilegiadas: true });
  ok("privilegiada con confirmación aparte: vinculada y reportada", r.status === 200 && r.json.datos.vinculadas === 1 && r.json.datos.privilegiadas === 1);
  ok("usuarios, usuario_rol y roles intactos (solo se escribió empleados.usuario_id)", (await snapUsuarios()) === u0);
  const vp2 = (await api("rh_admin", "GET", "/cuentas/vista-previa")).json.datos;
  ok("vista previa después: quedan c4 y c8", vp2.contadores.cuentas_sin_empleado === 2 && vp2.contadores.empleados_activos_sin_cuenta === 56);

  console.log("\n== 4. Conflictos: 409 atómico (nada del lote se aplica)");
  const antes = await vinculos();
  const sinCambios = async (n) => JSON.stringify(await vinculos()) === JSON.stringify(antes) || (console.log("  vínculos cambiaron"), false);
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c8, e.emp[33]), par(e.cuentas.c1, e.emp[25])], confirmar: true });
  ok("cuenta ya vinculada a otro empleado: 409 y el par sano tampoco se aplicó", r.status === 409 && r.json.conflictos[0].motivo === "cuenta_ya_vinculada" && await sinCambios());
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c8, e.emp[33]), par(e.cuentas.c4, e.emp[20])], confirmar: true });
  ok("empleado ya vinculado con otra cuenta: 409", r.status === 409 && r.json.conflictos[0].motivo === "empleado_ya_vinculado" && await sinCambios());
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c4, e.emp[60])], confirmar: true });
  ok("empleado dado de baja: 409", r.status === 409 && r.json.conflictos[0].motivo === "empleado_no_activo");
  await q("UPDATE empleados SET estatus='suspendido' WHERE id=$1", [e.emp[62]]);
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c8, e.emp[62])], confirmar: true });
  ok("empleado suspendido: 409 (solo activos)", r.status === 409 && r.json.conflictos[0].motivo === "empleado_no_activo");
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.actores.portal_admin, e.emp[50])], confirmar: true });
  ok("cuenta de un actor ya vinculada (rol portal_admin): 409", r.status === 409);
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(999999, e.emp[33])], confirmar: true });
  ok("cuenta inexistente: 409", r.status === 409 && r.json.conflictos[0].motivo === "cuenta_no_existe");
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c8, 999999)], confirmar: true });
  ok("empleado inexistente: 409", r.status === 409);
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c4, 5), par(e.cuentas.c4, 6)], confirmar: true });
  ok("misma cuenta dos veces en el lote: 400", r.status === 400);
  ok("ningún conflicto cambió vínculos", await sinCambios());
  const rech = (await q("SELECT valores_nuevos FROM auditoria WHERE accion='VINCULAR_RECHAZADO'")).rows;
  ok("los rechazos quedan auditados como VINCULAR_RECHAZADO con conteos por motivo y sin correos", rech.length >= 5 && rech.every((x) => !/@/.test(JSON.stringify(x))) && rech.some((x) => x.valores_nuevos.motivos.empleado_no_activo === 1));
  ok("409 sin texto de PostgreSQL ni de GoTrue", !/duplicate|violates|postgres|gotrue|supabase/i.test(JSON.stringify((await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c1, 25)], confirmar: true })).json)));

  console.log("\n== 5. Concurrencia y candado");
  sembrar(); e = estado();
  const [a, b] = await Promise.all([
    api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c1, e.emp[20])], confirmar: true }),
    api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c1, e.emp[20])], confirmar: true }),
  ]);
  ok("mismo par simultáneo: una vincula y la otra omite (ninguna falla)", [a, b].every((x) => x.status === 200) && a.json.datos.vinculadas + b.json.datos.vinculadas === 1 && a.json.datos.omitidas + b.json.datos.omitidas === 1, JSON.stringify([a.json, b.json]));
  const [c, d] = await Promise.all([
    api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c2, e.emp[21])], confirmar: true }),
    api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c2, e.emp[22])], confirmar: true }),
  ]);
  ok("misma cuenta a dos empleados a la vez: una 200 y la otra 409; 1 solo vínculo", [c.status, d.status].sort().join() === "200,409" && (await q("SELECT count(*)::int n FROM empleados WHERE usuario_id=$1", [e.cuentas.c2])).rows[0].n === 1);
  // candado retenido por otro proceso: 409 amable tras lock_timeout (3 s)
  const ret = await pg.connect();
  await ret.query("SELECT pg_advisory_lock(4601, 1)");
  const t0 = Date.now();
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c3, e.emp[23])], confirmar: true });
  const ms = Date.now() - t0;
  ok("candado 4601 retenido: 409 amable a ~3 s", r.status === 409 && /otra vinculación en curso/.test(r.json.mensaje) && ms >= 2500 && ms < 12000, `${r.status} ${ms}ms ${JSON.stringify(r.json)}`);
  ok("el 409 por candado no aplicó nada", (await q("SELECT usuario_id FROM empleados WHERE id=$1", [e.emp[23]])).rows[0].usuario_id === null);
  const t1 = Date.now();
  const tres = await Promise.all([40, 41, 42].map((i) => api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c8, e.emp[i])], confirmar: true })));
  ok("con 3 solicitudes y candado retenido: al menos una recibe 409 inmediato (cupo de 2) y ninguna 500", tres.every((x) => x.status === 409) && tres.some((x) => /otra vinculación en curso/.test(x.json.mensaje)), JSON.stringify(tres.map((x) => x.status)));
  const rapida = await api("rh_admin", "GET", "/cuentas/vista-previa");
  ok("mientras tanto la intranet responde (la vista previa no usa el candado)", rapida.status === 200);
  const t2 = Date.now();
  r = await api("rh_admin", "POST", "/importar", { modo: "actualizar", filas: [{ _fila: 2, nombre: "Nom24", apellido_paterno: "Pat24", numero_nomina: "N1024", correo_cuenta: "c8@ejemplo.test" }] });
  ok("candado 4601 retenido: la importación CON correo_cuenta espera y responde 409 amable (se coordina con la vinculación)", r.status === 409 && Date.now() - t2 >= 2500, `${r.status} ${Date.now() - t2}ms`);
  r = await api("rh_admin", "POST", "/importar", { modo: "actualizar", filas: [{ _fila: 2, nombre: "Nom24", apellido_paterno: "Pat24", numero_nomina: "N1024", calle: "Sin cuenta" }] });
  ok("la importación SIN correo_cuenta no toma el candado 4601 y sigue funcionando", r.status === 200 && r.json.datos.actualizados === 1);
  await ret.query("SELECT pg_advisory_unlock(4601, 1)"); ret.release();
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c3, e.emp[23])], confirmar: true });
  ok("liberado el candado: vuelve a funcionar", r.status === 200 && r.json.datos.vinculadas === 1);
  ok("no quedan conexiones 'idle in transaction'", (await q("SELECT count(*)::int n FROM pg_stat_activity WHERE state LIKE 'idle in transaction%'")).rows[0].n === 0);

  console.log("\n== 6. Vincular/desvincular uno (POST /:id/cuenta)");
  sembrar(); e = estado();
  r = await api("rh_admin", "POST", `/${e.emp[20]}/cuenta`, { usuario_id: e.cuentas.c1 });
  ok("vincula", r.status === 200 && r.json.datos.accion === "vinculada" && r.json.datos.sin_acceso_asistencia === false);
  r = await api("rh_admin", "POST", `/${e.emp[20]}/cuenta`, { usuario_id: e.cuentas.c1 });
  ok("idempotente (omitida)", r.status === 200 && r.json.datos.accion === "omitida");
  r = await api("rh_admin", "POST", `/${e.emp[21]}/cuenta`, { usuario_id: e.cuentas.c1 });
  ok("la misma cuenta a otro empleado: 409", r.status === 409);
  r = await api("rh_admin", "POST", `/${e.emp[20]}/cuenta`, { usuario_id: e.cuentas.c2 });
  ok("empleado con otra cuenta: 409 (no se pisa)", r.status === 409 && (await q("SELECT usuario_id FROM empleados WHERE id=$1", [e.emp[20]])).rows[0].usuario_id === e.cuentas.c1);
  r = await api("rh_admin", "POST", `/${e.emp[41]}/cuenta`, { usuario_id: e.cuentas.c7 });
  ok("sin rol de asistencia: vincula con aviso", r.status === 200 && r.json.datos.sin_acceso_asistencia === true);
  r = await api("rh_admin", "POST", `/${e.emp[40]}/cuenta`, { usuario_id: e.cuentas.c6 });
  ok("privilegiada sin confirmar: 400", r.status === 400);
  r = await api("rh_admin", "POST", `/${e.emp[40]}/cuenta`, { usuario_id: e.cuentas.c6, confirmar_privilegiada: true });
  ok("privilegiada confirmada: 200", r.status === 200 && r.json.datos.privilegiada === true);
  r = await api("rh_admin", "POST", `/${e.emp[20]}/cuenta`, { usuario_id: null });
  ok("desvincular sin confirmar: 400", r.status === 400);
  const u1 = await snapUsuarios();
  r = await api("rh_admin", "POST", `/${e.emp[20]}/cuenta`, { usuario_id: null, confirmar: true });
  ok("desvincular: 200 y usuario_id NULL; la cuenta NO se borra", r.status === 200 && r.json.datos.accion === "desvinculada" && (await q("SELECT usuario_id FROM empleados WHERE id=$1", [e.emp[20]])).rows[0].usuario_id === null && (await q("SELECT 1 FROM usuarios WHERE id=$1", [e.cuentas.c1])).rows.length === 1);
  r = await api("rh_admin", "POST", `/${e.emp[20]}/cuenta`, { usuario_id: null, confirmar: true });
  ok("desvincular de nuevo: idempotente", r.status === 200 && r.json.datos.accion === "sin_cuenta");
  r = await api("rh_admin", "POST", `/999999/cuenta`, { usuario_id: null, confirmar: true });
  ok("empleado inexistente: 404", r.status === 404);
  r = await api("rh_admin", "POST", `/${e.emp[60]}/cuenta`, { usuario_id: e.cuentas.c8 });
  ok("empleado de baja: 409", r.status === 409);
  ok("usuarios y roles intactos", (await snapUsuarios()) === u1);

  console.log("\n== 7. Auditoría: solo ids y conteos, acciones <= 20 caracteres");
  const aud = (await q("SELECT accion, registro_id, valores_previos, valores_nuevos FROM auditoria WHERE accion LIKE '%CUENTA%' ORDER BY id")).rows;
  ok("hay filas VINCULAR_CUENTAS/VINCULAR_CUENTA/DESVINCULAR_CUENTA", ["VINCULAR_CUENTA", "DESVINCULAR_CUENTA"].every((a) => aud.some((x) => x.accion === a)));
  ok("ninguna fila de auditoría contiene correos ni '@'", !aud.some((x) => /@/.test(JSON.stringify(x))));
  ok("acciones <= 20 caracteres (el INSERT no falló)", aud.every((x) => x.accion.length <= 20));
  sembrar(); e = estado();
  await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c1, e.emp[20])], confirmar: true });
  const a2 = (await q("SELECT valores_nuevos FROM auditoria WHERE accion='VINCULAR_CUENTAS'")).rows;
  ok("VINCULAR_CUENTAS: conteos + pares de ids", a2.length >= 1 && a2[a2.length - 1].valores_nuevos.vinculadas === 1 && JSON.stringify(a2[a2.length - 1].valores_nuevos.pares) === JSON.stringify([[e.cuentas.c1, e.emp[20]]]));

  console.log("\n== 8. Plantilla de carga (columna 'Correo de la cuenta') por HTTP");
  sembrar(); e = estado();
  const uImp = await snapUsuarios();
  const fila = (i, extra) => ({ _fila: i, nombre: `Nom${i}`, apellido_paterno: `Pat${i}`, numero_nomina: `N${1000 + i}`, ...extra });
  r = await api("rh_admin", "POST", "/importar", { modo: "actualizar", filas: [
    fila(20, { correo_cuenta: "C1@Ejemplo.TEST" }), fila(21, { correo_cuenta: "noexiste@ejemplo.test" }), fila(22, { correo_cuenta: "c1@ejemplo.test" }),
    fila(23, { correo_cuenta: "rh_admin@ejemplo.test" }), fila(1, { correo_cuenta: "c2@ejemplo.test" }), fila(40, { correo_cuenta: "c6@ejemplo.test" }),
    fila(41, { correo_cuenta: "c7@ejemplo.test" }), fila(60, { correo_cuenta: "c8@ejemplo.test" }), fila(33, { correo_cuenta: "texto raro" }),
  ] });
  const errs = Object.fromEntries((r.json.datos.errores || []).map((x) => [x.fila, x.error]));
  ok("importar: 2 cuentas vinculadas (c1 -> 20, c7 -> 41)", r.status === 200 && r.json.datos.cuentas_vinculadas === 2, JSON.stringify(r.json.datos));
  ok("no existe una cuenta con ese correo", /No existe una cuenta/.test(errs[21] || ""));
  ok("cuenta ya vinculada a OTRO empleado (c1 a empleado 22)", /OTRO empleado/.test(errs[22] || ""));
  ok("cuenta de otro empleado (rh_admin@ejemplo.test ya es de empleado 1)", /OTRO empleado/.test(errs[23] || ""));
  ok("el empleado ya tiene otra cuenta (empleado 1 con c2)", /ya tiene otra cuenta/.test(errs[1] || ""));
  ok("cuenta privilegiada: error", /privilegiado/.test(errs[40] || ""));
  ok("empleado de baja: error", /baja/.test(errs[60] || ""));
  ok("formato inválido: advertencia por campo (no error)", (r.json.datos.advertencias || []).some((x) => x.fila === 33 && x.campo === "correo_cuenta") && !errs[33]);
  ok("el vínculo original del empleado 1 no se pisó", (await q("SELECT usuario_id FROM empleados WHERE id=$1", [e.emp[1]])).rows[0].usuario_id === e.actores.rh_admin);
  r = await api("rh_admin", "POST", "/importar", { modo: "actualizar", filas: [fila(20, { correo_cuenta: "c1@ejemplo.test" })] });
  ok("reimportar la misma fila: sin cambios, sin error", r.json.datos.errores.length === 0 && r.json.datos.sin_cambios === 1 && r.json.datos.cuentas_vinculadas === 0);
  r = await api("rh_admin", "POST", "/importar", { modo: "actualizar", filas: [fila(20, { correo_cuenta: "", calle: "Calle 1" })] });
  ok("celda vacía no desvincula", (await q("SELECT usuario_id FROM empleados WHERE id=$1", [e.emp[20]])).rows[0].usuario_id === e.cuentas.c1);
  r = await api("rh_admin", "POST", "/importar", { modo: "omitir", filas: [{ _fila: 1, nombre: "Nuevo", apellido_paterno: "Ficticio", numero_nomina: "N9999", correo_cuenta: "c3@ejemplo.test" }] });
  ok("modo omitir: vincula al crear", r.json.datos.insertados === 1 && r.json.datos.cuentas_vinculadas === 1);
  r = await api("rh_admin", "GET", "/exportar-importacion");
  ok("'empleados actuales' trae la columna correo_cuenta", r.json.datos.empleados.some((x) => x.correo_cuenta === "c1@ejemplo.test"));
  const rimp = (await q("SELECT accion, valores_nuevos FROM auditoria WHERE accion='IMPORTAR_EMPLEADOS' ORDER BY id DESC LIMIT 1")).rows[0];
  ok("auditoría de la importación con cuentas_vinculadas", rimp && rimp.valores_nuevos.cuentas_vinculadas !== undefined);
  ok("usuarios y roles intactos tras importar", (await snapUsuarios()) === uImp);

  console.log("\n== 9. Correos duplicados entre cuentas, empleado suspendido en la plantilla y SIN la UNIQUE");
  sembrar(); e = estado();
  await q("INSERT INTO usuarios (correo, nombre, apellido, auth_tipo) VALUES ('DUP@ejemplo.test','Nom30x','Pat30x','ms365'),('dup@ejemplo.test','Nom30x','Pat30x','ms365')");
  const dup = (await q("SELECT id FROM usuarios WHERE lower(correo)='dup@ejemplo.test' ORDER BY id")).rows.map((x) => x.id);
  const vpd = (await api("rh_admin", "GET", "/cuentas/vista-previa?limite=100")).json.datos;
  ok("vista previa: contador 'correos_duplicados' = 2 y sin sugerencia para esas cuentas", vpd.contadores.correos_duplicados === 2 && vpd.cuentas.filter((c) => c.correo_duplicado).every((c) => c.sugerencia.estado === "sin_coincidencia"));
  r = await api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(dup[0], e.emp[33])], confirmar: true });
  ok("vincular una cuenta de correo duplicado: 409", r.status === 409 && r.json.conflictos[0].motivo === "cuenta_correo_duplicado");
  r = await api("rh_admin", "POST", "/importar", { modo: "actualizar", filas: [{ _fila: 2, nombre: "Nom33", apellido_paterno: "Pat33", numero_nomina: "N1033", correo_cuenta: "Dup@Ejemplo.test" }] });
  ok("plantilla: 'Correo ambiguo' y no se vincula a ninguna", /Correo ambiguo/.test((r.json.datos.errores[0] || {}).error || "") && (await q("SELECT count(*)::int n FROM empleados WHERE usuario_id = ANY($1)", [dup])).rows[0].n === 0);
  await q("UPDATE empleados SET estatus='suspendido' WHERE id=$1", [e.emp[34]]);
  r = await api("rh_admin", "POST", "/importar", { modo: "actualizar", filas: [{ _fila: 2, nombre: "Nom34", apellido_paterno: "Pat34", numero_nomina: "N1034", correo_cuenta: "c8@ejemplo.test" }] });
  ok("plantilla: empleado suspendido = error 'no está activo'", /no está activo/.test((r.json.datos.errores[0] || {}).error || ""));
  r = await api("rh_admin", "POST", `/${e.emp[34]}/cuenta`, { usuario_id: e.cuentas.c8 });
  ok("POST /:id/cuenta a un suspendido: 409", r.status === 409);
  // vinculada a un empleado que luego se da de baja: aviso en la vista previa
  r = await api("rh_admin", "POST", `/${e.emp[35]}/cuenta`, { usuario_id: e.cuentas.c8 });
  await q("UPDATE empleados SET estatus='baja' WHERE id=$1", [e.emp[35]]);
  const av = (await api("rh_admin", "GET", "/cuentas/vista-previa")).json.datos.avisos;
  ok("aviso: cuenta vinculada a un empleado dado de baja", av.total_vinculadas_a_no_activos >= 1 && av.vinculadas_a_no_activos.some((x) => x.empleado_id === e.emp[35] && x.estatus === "baja"));
  // sin la UNIQUE
  const uq = (await q("SELECT conname FROM pg_constraint WHERE conrelid='empleados'::regclass AND contype='u' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='empleados'::regclass AND attname='usuario_id')]")).rows.map((x) => x.conname);
  for (const n of uq) await q(`ALTER TABLE empleados DROP CONSTRAINT ${n}`);
  await q("UPDATE empleados SET usuario_id=$1 WHERE id IN ($2,$3)", [e.cuentas.c1, e.emp[36], e.emp[37]]);
  const avu = (await api("rh_admin", "GET", "/cuentas/vista-previa")).json.datos.avisos;
  ok("sin la UNIQUE: aviso 'falta_unique_usuario_id' y la cuenta vinculada a 2 empleados listada", avu.falta_unique_usuario_id === true && avu.usuarios_con_varios_empleados.some((x) => x.usuario_id === e.cuentas.c1 && x.empleados.length === 2), JSON.stringify(avu));
  await q("UPDATE empleados SET usuario_id=NULL WHERE id IN ($1,$2)", [e.emp[36], e.emp[37]]);
  const [x1, x2] = await Promise.all([
    api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c2, e.emp[36])], confirmar: true }),
    api("rh_admin", "POST", "/cuentas/vincular", { pares: [par(e.cuentas.c2, e.emp[37])], confirmar: true }),
  ]);
  ok("sin la UNIQUE: la misma cuenta a 2 empleados a la vez sigue dando 1 vínculo (candado 4601 + comprobación en JS)", [x1.status, x2.status].sort().join() === "200,409" && (await q("SELECT count(*)::int n FROM empleados WHERE usuario_id=$1", [e.cuentas.c2])).rows[0].n === 1);
  await q("ALTER TABLE empleados ADD CONSTRAINT empleados_usuario_id_unique UNIQUE (usuario_id)");

  console.log(`\n${pasan} PASS, ${fallan.length} FAIL ${fallan.join(" | ")}`);
  await pg.end();
  process.exit(fallan.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
