/* eslint-disable */
// Verificación en Chromium de la pantalla "Importar usuarios" (portal real + supabase simulado + backend, Postgres y GoTrue reales).
// playwright y axe-core NO son dependencias del repo: indica PLAYWRIGHT_PATH y AXE_PATH. Ver README.md.
const path = require("path");
const os = require("os");
const fs = require("fs");
const { execSync } = require("child_process");
const WT = path.resolve(__dirname, "../..");
const SC = process.env.VERIF_SALIDA || path.join(os.tmpdir(), "importar-usuarios-verif");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const AXE = fs.readFileSync(process.env.AXE_PATH || require.resolve("axe-core/axe.min.js"), "utf8");
const { Pool } = require(`${WT}/node_modules/pg`);
const pg = new Pool({ connectionString: `postgres://postgres:pw@127.0.0.1:${process.env.VERIF_PG_PORT || 55430}/postgres`, max: 2 });
const q = (s, p) => pg.query(s, p);
const URL = `http://127.0.0.1:${process.env.VERIF_WEB_PORT || 5198}/admin/usuarios`;
const estado = () => JSON.parse(fs.readFileSync(`${SC}/estado.json`, "utf8"));
const sembrar = () => execSync("node prep.js", { cwd: __dirname, env: process.env });
let pasan = 0; const fallan = [];
const ok = (n, c, d = "") => { if (c) { pasan++; console.log("  PASS " + n); } else { fallan.push(n); console.log("  FAIL " + n + " " + d); } };
const nUsuarios = async () => (await q("SELECT count(*)::int n FROM usuarios")).rows[0].n;
async function abrir(rol, ancho = 1280, alto = 900) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, locale: "es-MX", acceptDownloads: true });
  await ctx.addInitScript((t) => localStorage.setItem("harness_token", t), estado().tokens[rol]);
  const page = await ctx.newPage();
  const consola = [];
  page.on("console", (m) => { if (m.type() === "error") consola.push(m.text()); });
  page.on("pageerror", (e) => consola.push("PAGEERROR " + e.message));
  return { browser, page, consola };
}
async function axe(page, sel) {
  await page.evaluate(AXE);
  return page.evaluate(async (s) => (await window.axe.run(s ? document.querySelector(s) : document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, destino: v.nodes.slice(0, 2).map((n) => n.target.join(" ")) })), sel);
}
const csv = (nombre, filas) => { const p = `${SC}/${nombre}`; fs.writeFileSync(p, "﻿" + filas.join("\r\n") + "\r\n"); return p; };
const CAB = "Correo corporativo,Nombre,Apellido,Número de nómina,CURP";

(async () => {
  sembrar();
  const E = estado();
  const archivo = csv("usuarios-mix.csv", [CAB,
    "n1@rayhsa.com.mx,Nom1,Pat1 Mat1,N1001,",
    `n2@rayhsa.com.mx,Nom2,Pat2 Mat2,,${E.curps[2]}`,
    "existe@rayhsa.com.mx,Existe,Previo,N1003,",
    "x@gmail.com,X,Y,N1004,",
    "dup@rayhsa.com.mx,Dora,Duplicada,DUP-1,",
    "sinid@rayhsa.com.mx,Sin,Id,,",
    "otro@rayhsa.com.mx,Otro,Nombre,N1005,"]);

  console.log("\n== A. Permisos de la acción");
  {
    const { browser, page } = await abrir("portal_admin");
    await page.goto(URL);
    await page.getByRole("heading", { name: "Administración de Usuarios" }).waitFor();
    ok("portal_admin ve la página pero NO el botón 'Importar usuarios'", (await page.getByRole("button", { name: "Importar usuarios" }).count()) === 0);
    await browser.close();
  }
  const { browser, page, consola } = await abrir("super_admin");
  await page.goto(URL);
  await page.getByRole("heading", { name: "Administración de Usuarios" }).waitFor();
  const boton = page.getByRole("button", { name: "Importar usuarios" });
  ok("super_admin ve 'Importar usuarios'", (await boton.count()) === 1);

  console.log("\n== B. Diálogo y plantilla");
  await boton.click();
  const dlg = page.getByRole("dialog", { name: "Importar usuarios" });
  await dlg.waitFor();
  const t0 = await dlg.innerText();
  ok("el aviso dice rol rh_empleado, Microsoft sin contraseña, alcance del vínculo y dominio", /rh_empleado/.test(t0) && /Microsoft \(sin contraseña\)/.test(t0) && /asistencia, expediente, recibos de nómina/.test(t0) && /@rayhsa\.com\.mx/.test(t0));
  ok("columnas esperadas: correo, nombre, apellido, nómina, CURP; sin columna de rol", /Correo corporativo \*/.test(t0) && /Número de nómina/.test(t0) && /CURP/.test(t0) && !/\bRol\b/.test(t0));
  ok("no hay selector de modo 'actualizar' ni de rol", (await dlg.getByRole("radio").count()) === 0 && (await dlg.locator("select").count()) === 0);
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Descargar plantilla de ejemplo/ }).click()]);
  const plantilla = fs.readFileSync(await descarga.path(), "utf8");
  ok("plantilla CSV: encabezados correctos, filas ficticias @rayhsa.com.mx y sin columna de rol", /"Correo corporativo","Nombre","Apellido","Número de nómina","CURP"/.test(plantilla) && /ana\.prueba@rayhsa\.com\.mx/.test(plantilla) && !/rol/i.test(plantilla), plantilla);
  ok("el nombre del archivo descargado es plantilla_usuarios.csv", descarga.suggestedFilename() === "plantilla_usuarios.csv");

  console.log("\n== C. Topes del archivo (200 filas / 1 MB)");
  const filas201 = csv("201.csv", [CAB, ...Array.from({ length: 201 }, (_, i) => `u${i}@rayhsa.com.mx,Nom,Ape,N${i}`)]);
  await dlg.locator('input[type="file"]').setInputFiles(filas201);
  await dlg.getByText(/201 filas; el máximo es 200/).waitFor();
  ok("201 filas: mensaje claro y no pasa a la vista previa", (await dlg.getByRole("button", { name: /Verificar filas/ }).count()) === 0);
  const pesado = `${SC}/pesado.csv`; fs.writeFileSync(pesado, `${CAB}\r\nu@rayhsa.com.mx,Nom,${"x".repeat(1.2 * 1024 * 1024)},N1\r\n`);
  await dlg.locator('input[type="file"]').setInputFiles(pesado);
  await dlg.getByText(/pesa más de 1 MB/).waitFor();
  ok("archivo de más de 1 MB: mensaje claro y no pasa a la vista previa", (await dlg.getByRole("button", { name: /Verificar filas/ }).count()) === 0);
  const filas200 = csv("200.csv", [CAB, ...Array.from({ length: 200 }, (_, i) => `u${i}@rayhsa.com.mx,Nom,Ape,N${i}`)]);
  await dlg.locator('input[type="file"]').setInputFiles(filas200);
  await dlg.getByText("200 filas detectadas").waitFor();
  ok("exactamente 200 filas sí pasa", true);
  await dlg.getByRole("button", { name: /Seleccionar otro/ }).click();

  console.log("\n== D. Vista previa obligatoria del servidor y aplicar");
  const antes = await nUsuarios();
  await dlg.locator('input[type="file"]').setInputFiles(archivo);
  await dlg.getByText("7 filas detectadas").waitFor();
  ok("tras cargar el archivo NO existe un botón para crear: solo 'Verificar filas (no se crea nada)'", (await dlg.getByRole("button", { name: /^Crear / }).count()) === 0 && (await dlg.getByRole("button", { name: /Verificar filas/ }).count()) === 1);
  await dlg.getByRole("button", { name: /Verificar filas/ }).click();
  await dlg.getByText(/Vista previa del servidor: todavía no se creó nada/).waitFor();
  const tv = await dlg.innerText();
  ok("resumen del servidor: 3 por crear, 1 se omitirá, 3 con error", /3 por crear/.test(tv) && /1 se omitirán/.test(tv) && /3 con error/.test(tv), tv.slice(0, 400));
  ok("la tabla dice a quién se vinculará cada cuenta y marca el aviso de nombre distinto", /Se vinculará con Nom1 Pat1 Mat1/.test(tv) && /Aviso: El nombre del archivo no coincide/.test(tv));
  ok("errores legibles: dominio, nómina ambigua, sin identificador", /Solo se permiten correos @rayhsa\.com\.mx/.test(tv) && /Número de nómina ambiguo/.test(tv) && /nómina o CURP/.test(tv));
  ok("verificar NO escribió nada en la BD", (await nUsuarios()) === antes);
  ok("ahora sí aparece 'Crear 3 cuentas'", (await dlg.getByRole("button", { name: "Crear 3 cuentas" }).count()) === 1);
  let v = await axe(page, '[role="dialog"]');
  ok("axe en la vista previa del servidor: 0 violaciones", v.length === 0, JSON.stringify(v));
  await page.screenshot({ path: `${SC}/cap-iu-vista-previa.png` });
  await dlg.getByRole("button", { name: "Crear 3 cuentas" }).click();
  await dlg.getByRole("heading", { name: "Resultado de la importación" }).waitFor();
  const tr = await dlg.innerText();
  ok("resultado: 3 cuentas creadas, 1 omitida (ya existe), 3 errores, con el número de fila", /3\s*Cuentas creadas/.test(tr) && /1\s*Omitidas \(ya existen\)/.test(tr) && /3\s*Errores/.test(tr) && /Ya existe una cuenta con ese correo/.test(tr), tr.slice(0, 500));
  ok("el resultado repite el aviso del nombre distinto como advertencia", /Advertencias \(1\)/.test(tr));
  ok("BD: 3 cuentas nuevas ms365 con rol rh_empleado y vínculo", (await nUsuarios()) === antes + 3 && (await q("SELECT count(*)::int n FROM usuarios u JOIN usuario_rol ur ON ur.usuario_id=u.id JOIN roles r ON r.id=ur.rol_id JOIN empleados e ON e.usuario_id=u.id WHERE u.correo IN ('n1@rayhsa.com.mx','n2@rayhsa.com.mx','otro@rayhsa.com.mx') AND u.auth_tipo='ms365' AND r.nombre='rh_empleado' AND u.activo")).rows[0].n === 3);
  v = await axe(page, '[role="dialog"]');
  ok("axe en el resultado: 0 violaciones", v.length === 0, JSON.stringify(v));
  const [csvErr] = await Promise.all([page.waitForEvent("download"), dlg.getByRole("button", { name: /Descargar errores/ }).click()]);
  const contenido = fs.readFileSync(await csvErr.path(), "utf8");
  ok("el CSV de errores lista las filas con error y la omitida", /Error/.test(contenido) && /Duplicado/.test(contenido) && /nómina o CURP/.test(contenido));
  await page.screenshot({ path: `${SC}/cap-iu-resultado.png` });
  await dlg.getByRole("button", { name: "Cerrar", exact: true }).last().click();
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  ok("al cerrar, el foco vuelve al botón 'Importar usuarios'", await page.evaluate(() => document.activeElement && /Importar usuarios/.test(document.activeElement.textContent)));
  ok("la lista de usuarios se recargó y muestra las cuentas nuevas como ms365", (await page.locator(".usuarios-tabla tr:has-text('n1@rayhsa.com.mx')").count()) === 1 && /ms365/.test(await page.locator(".usuarios-tabla tr:has-text('n1@rayhsa.com.mx')").innerText()));
  ok("una cuenta ms365 no ofrece 'Resetear Clave'", (await page.locator(".usuarios-tabla tr:has-text('n1@rayhsa.com.mx')").getByRole("button", { name: "Resetear Clave" }).count()) === 0);
  await page.locator(".usuarios-tabla tr:has-text('n1@rayhsa.com.mx')").getByRole("button", { name: "Editar" }).click();
  ok("al editar una cuenta ms365 no hay campo de contraseña", (await page.getByLabel(/contraseña/i).count()) === 0);

  console.log("\n== E. Repetir el archivo: todo se omite y no hay nada que crear");
  await page.reload();
  await page.getByRole("button", { name: "Importar usuarios" }).click();
  await dlg.waitFor();
  await dlg.locator('input[type="file"]').setInputFiles(archivo);
  await dlg.getByRole("button", { name: /Verificar filas/ }).click();
  await dlg.getByText(/Vista previa del servidor/).waitFor();
  const te = await dlg.innerText();
  ok("0 por crear, 4 se omitirán (ya existen) y botón 'No hay cuentas por crear' deshabilitado", /0 por crear/.test(te) && /4 se omitirán/.test(te) && (await dlg.getByRole("button", { name: "No hay cuentas por crear" }).isDisabled()));

  console.log("\n== F. Teclado, Escape y responsive");
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  ok("Escape cierra el diálogo", true);
  await browser.close();
  {
    sembrar();
    const { browser: b2, page: p2 } = await abrir("super_admin", 360, 740);
    await p2.goto(URL);
    await p2.getByRole("heading", { name: "Administración de Usuarios" }).waitFor();
    const baseSinDialogo = await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    await p2.getByRole("button", { name: "Importar usuarios" }).click();
    const d2 = p2.getByRole("dialog", { name: "Importar usuarios" });
    await d2.waitFor();
    await d2.locator('input[type="file"]').setInputFiles(archivo);
    await d2.getByRole("button", { name: /Verificar filas/ }).click();
    await d2.getByText(/Vista previa del servidor/).waitFor();
    const sinOverflowDialogo = await p2.evaluate(() => { const m = document.querySelector('[role="dialog"]'); const r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1 && m.scrollWidth <= m.clientWidth + 1; });
    ok("360 px: el diálogo cabe en la pantalla y no se desborda (la tabla desplaza dentro de su región)", sinOverflowDialogo);
    ok(`(referencia) la página de usuarios por sí sola ${baseSinDialogo ? "no se desborda" : "ya se desborda a 360 px sin el diálogo (preexistente)"}`, true);
    ok("360 px: el botón de aplicar es alcanzable", (await d2.getByRole("button", { name: /^Crear \d+ cuentas?$/ }).isVisible()));
    const v2 = await axe(p2, '[role="dialog"]');
    ok("axe a 360 px: 0 violaciones", v2.length === 0, JSON.stringify(v2));
    await p2.screenshot({ path: `${SC}/cap-iu-360.png` });
    await b2.close();
  }
  ok("sin errores de consola ni excepciones en la sesión principal", consola.length === 0, consola.join(" | ").slice(0, 400));
  await pg.end();
  console.log(`\n${pasan} PASS, ${fallan.length} FAIL ${fallan.join(" | ")}`);
  process.exit(fallan.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
