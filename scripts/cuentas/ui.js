/* eslint-disable */
const L = require("./lib");
const { execSync } = require("child_process");
const fs = require("fs");
const WT = require("path").resolve(__dirname, "../..");
const { Pool } = require(`${WT}/node_modules/pg`);
const pg = new Pool({ connectionString: `postgres://postgres:pw@127.0.0.1:${process.env.VERIF_PG_PORT || 55420}/postgres`, max: 2 });
const q = (s, p) => pg.query(s, p);
const URL = `http://127.0.0.1:${L.PUERTO_WEB}/rh/empleados`;
const sembrar = () => execSync("node prep.js", { cwd: __dirname, env: process.env });
const nVinc = async () => (await q("SELECT count(*)::int n FROM empleados WHERE usuario_id IS NOT NULL")).rows[0].n;
const sinOverflow = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? el.scrollWidth <= el.clientWidth + 1 : null; }, sel);

async function irAEmpleados(page) {
  await page.goto(URL);
  await page.waitForSelector(".empleados-tabla, .mensaje-info", { timeout: 15000 });
}
const buscarEmpleado = async (page, texto) => {
  await page.getByPlaceholder(/Buscar por nombre/).fill(texto);
  await page.waitForSelector(`.empleados-tabla tr:has-text("${texto}")`, { timeout: 10000 });
};

(async () => {
  sembrar();
  let E = L.estado();
  console.log("\n== A. Permisos de la acción y vista previa (1280)");
  {
    const { browser, page, consola } = await L.abrir("rh_consulta");
    await irAEmpleados(page);
    L.ok("Empleados:consulta NO ve 'Vincular cuentas'", (await page.getByRole("button", { name: "Vincular cuentas" }).count()) === 0);
    await buscarEmpleado(page, "Nom50");
    await page.getByRole("button", { name: "Ver Expediente" }).first().click();
    await page.getByRole("button", { name: "Info Laboral" }).click();
    await page.waitForSelector("text=Cuenta de usuario (acceso a la intranet)");
    L.ok("Empleados:consulta ve el estado de la cuenta pero sin selector ni botones", (await page.getByText("Sin cuenta vinculada").count()) === 1 && (await page.getByLabel(/Buscar cuenta/).count()) === 0);
    await browser.close();
  }
  const { browser, page, consola } = await L.abrir("rh_admin");
  await irAEmpleados(page);
  L.ok("rh_admin ve 'Vincular cuentas'", (await page.getByRole("button", { name: "Vincular cuentas" }).count()) === 1);
  await page.getByRole("button", { name: "Vincular cuentas" }).click();
  const dlg = page.getByRole("dialog", { name: "Vincular cuentas con empleados" });
  await dlg.waitFor();
  await page.waitForSelector(".asi__tabla tbody tr");
  const txt = await dlg.innerText();
  L.ok("contadores: 8 cuentas, 62 empleados activos sin cuenta, 6 exactas, 1 varias, 1 sin coincidencia", /Cuentas sin empleado\s*8/.test(txt) && /Empleados activos sin cuenta\s*62/.test(txt) && /Coincidencia exacta única\s*6/.test(txt) && /Varias posibles\s*1/.test(txt) && /Sin coincidencia\s*1/.test(txt), txt.slice(0, 600));
  L.ok("tabla con 8 filas: cuenta, sugerencia y empleado con nómina y departamento lado a lado", (await page.locator(".asi__tabla tbody tr").count()) === 8 && /nómina N1020 · Depto/.test(txt));
  L.ok("el diálogo dice el alcance real (asistencia, expediente, recibos de nómina, jefe/vacaciones) y que solo se vinculan activos", /su asistencia, su expediente, sus recibos de nómina y, si es jefe, aprobar vacaciones de su equipo/.test(txt) && /estatus activo/.test(txt));
  L.ok("el empleado 20 se muestra como 'jefe de 2'", /Nom20 Pat20 Mat20 · nómina N1020 · Depto [AB] · jefe de 2/.test(txt));
  L.ok("avisos: rol privilegiado y sin rol con acceso a Asistencia", /Rol privilegiado/.test(txt) && /Sin rol con acceso a Asistencia/.test(txt));
  L.ok("nada marcado todavía: 0 vínculos marcados y 'Vincular las marcadas' deshabilitado", /0 vínculos marcados/.test(txt) && (await page.getByRole("button", { name: /Vincular las marcadas/ }).isDisabled()));
  L.ok("la vista previa no cambió la BD (7 vínculos)", (await nVinc()) === 7);
  let v = await L.axe(page, '[role="dialog"]');
  L.ok("axe en el diálogo de vista previa: 0 violaciones", v.length === 0, JSON.stringify(v));
  await page.screenshot({ path: `${L.SC}/cap-vista-1280.png` });

  console.log("\n== B. Marcar, bloquear repetidos, confirmar y 409");
  await page.getByRole("button", { name: /Marcar las coincidencias exactas/ }).click();
  L.ok("el atajo marca 5 exactas seguras y deja fuera la privilegiada (c6), con aviso", /5 vínculos marcados/.test(await dlg.innerText()) && /Se dejaron fuera, para marcarlas a mano: 1 con rol privilegiado/.test(await dlg.innerText()));
  await page.getByRole("checkbox", { name: /Vincular c6@ejemplo.test/ }).check();
  L.ok("la privilegiada se marca a mano: 6 vínculos marcados", /6 vínculos marcados/.test(await dlg.innerText()));
  const sel4 = page.getByLabel(/Elige el empleado de c4@ejemplo.test/);
  const opciones = await sel4.locator("option").allInnerTexts();
  L.ok("homónimos: el selector ofrece los 2 candidatos con nómina y departamento", opciones.length === 3 && /Juan Repetido Uno · nómina N1030/.test(opciones[1]) && /Juan Repetido Dos · nómina N1031/.test(opciones[2]), JSON.stringify(opciones));
  await sel4.selectOption({ label: opciones[2] });
  L.ok("el mismo empleado elegido para 2 cuentas: alerta y 'Vincular' deshabilitado", (await page.getByText(/empleado elegido para más de una cuenta/).count()) === 1 && (await page.getByRole("button", { name: /Vincular las marcadas/ }).isDisabled()));
  await sel4.selectOption({ label: opciones[1] });
  L.ok("corregido: 7 marcados y habilitado", /7 vínculos marcados/.test(await dlg.innerText()) && !(await page.getByRole("button", { name: /Vincular las marcadas/ }).isDisabled()));
  await page.getByRole("button", { name: /Vincular las marcadas/ }).click();
  const conf = page.getByRole("alertdialog", { name: "Confirmar la vinculación" });
  await conf.waitFor();
  const ct = await conf.innerText();
  L.ok("la confirmación dice los contadores, quién verá qué y avisa de las sin acceso", /vincular 7 cuentas a 7 empleados/.test(ct) && /su asistencia, su expediente, sus recibos de nómina y, si es jefe/.test(ct) && /1 de esos empleados es jefe/.test(ct) && /1 sin un rol con acceso a Asistencia/.test(ct), ct);
  L.ok("casilla aparte para la cuenta con rol privilegiado", (await conf.getByRole("checkbox").count()) === 1);
  v = await L.axe(page, '[role="alertdialog"]');
  L.ok("axe en la confirmación: 0 violaciones", v.length === 0, JSON.stringify(v));
  await page.getByRole("button", { name: "Vincular 7" }).click();
  await conf.getByRole("alert").waitFor();
  L.ok("sin marcar la casilla de privilegiadas: error en el diálogo y BD intacta", /casilla de confirmación aparte/.test(await conf.innerText()) && (await nVinc()) === 7);
  // 409: otro usuario cambió un dato mientras tanto
  await q("UPDATE empleados SET usuario_id=$1 WHERE id=$2", [E.cuentas.c8, E.emp[21]]);
  await conf.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Vincular 7" }).click();
  await page.waitForFunction(() => /Los datos cambiaron/.test(document.querySelector('[role="alertdialog"]')?.innerText || ""));
  L.ok("409: 'Los datos cambiaron...', NADA aplicado (8 vínculos: 7 + el cambio externo) y se avisa que la vista previa se actualizó", (await nVinc()) === 8 && /Se actualizó la vista previa/.test(await conf.innerText()));
  await q("UPDATE empleados SET usuario_id=NULL WHERE id=$1", [E.emp[21]]);
  await page.getByRole("button", { name: "Cancelar" }).click();
  L.ok("tras el 409 el par en conflicto salió de la selección (6 marcados)", /6 vínculos marcados/.test(await dlg.innerText()));
  await page.getByRole("button", { name: "Actualizar vista previa" }).click();
  await page.waitForFunction(() => /Cuentas sin empleado\s*8/.test(document.querySelector('[role="dialog"]')?.innerText || ""));
  await page.getByRole("button", { name: /Marcar las coincidencias exactas/ }).click();
  L.ok("revertido el cambio y actualizada la vista: de nuevo 7 marcados", /7 vínculos marcados/.test(await dlg.innerText()));
  await page.getByRole("button", { name: /Vincular las marcadas/ }).click();
  await conf.waitFor();
  await conf.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Vincular 7" }).click();
  await page.getByRole("status").filter({ hasText: "Vinculadas:" }).waitFor();
  const res = await dlg.innerText();
  L.ok("resultado: 7 vinculadas, 0 omitidas, avisos de Asistencia y privilegiada", /Vinculadas:\s*7/.test(res) && /Omitidas[^:]*:\s*0/.test(res) && /1 sin un rol con acceso a Asistencia/.test(res) && /1 con rol privilegiado/.test(res), res.slice(0, 500));
  L.ok("BD: 14 vínculos (7 + 7)", (await nVinc()) === 14);
  L.ok("quedan solo c8 en la vista previa (sin coincidencia)", /Cuentas sin empleado\s*1/.test(res));
  v = await L.axe(page, '[role="dialog"]');
  L.ok("axe tras el resultado: 0 violaciones", v.length === 0, JSON.stringify(v));
  await page.getByRole("button", { name: "Cerrar" }).last().click();
  L.ok("sin errores de consola (salvo el 409 esperado)", consola.filter((c) => !/409|Conflict|403|Forbidden|cargar roles|cargar catálogos/.test(c)).length === 0, JSON.stringify(consola));

  console.log("\n== C. Perfil del empleado: selector, vincular y desvincular");
  await buscarEmpleado(page, "Nom50");
  await page.getByRole("button", { name: "Ver Expediente" }).first().click();
  await page.getByRole("button", { name: "Info Laboral" }).click();
  await page.waitForSelector("text=Cuenta de usuario (acceso a la intranet)");
  const caja = page.getByRole("group", { name: "Cuenta de usuario del empleado" });
  L.ok("sin cuenta: muestra el selector buscable", /Sin cuenta vinculada/.test(await caja.innerText()) && (await page.getByLabel(/Buscar cuenta sin empleado/).count()) === 1);
  L.ok("sin escribir: el selector no lista cuentas y pide 2 caracteres", (await caja.getByRole("radio").count()) === 0 && /al menos 2 caracteres/.test(await caja.innerText()));
  await page.getByLabel(/Buscar cuenta sin empleado/).fill("z");
  await page.waitForTimeout(600);
  L.ok("con 1 carácter sigue sin listar", (await caja.getByRole("radio").count()) === 0);
  await page.getByLabel(/Buscar cuenta sin empleado/).fill("zoe");
  await page.waitForFunction(() => /1 cuenta\(s\) sin empleado/.test(document.body.innerText));
  L.ok("buscar 'zoe' deja solo la cuenta c8", (await caja.getByRole("radio").count()) === 1 && /c8@ejemplo.test/.test(await caja.innerText()));
  v = await L.axe(page, '[role="group"][aria-label="Cuenta de usuario del empleado"]');
  L.ok("axe en el bloque de cuenta: 0 violaciones", v.length === 0, JSON.stringify(v));
  await caja.getByRole("radio").check();
  await caja.getByRole("button", { name: /Vincular cuenta seleccionada/ }).click();
  const c2 = page.getByRole("alertdialog", { name: "Vincular cuenta" });
  await c2.waitFor();
  L.ok("la confirmación nombra la cuenta, el correo y el empleado", /Zoe Nadie/.test(await c2.innerText()) && /c8@ejemplo.test/.test(await c2.innerText()) && /Nom50 Pat50/.test(await c2.innerText()) && /su expediente, sus recibos de nómina y, si es jefe, aprobar vacaciones de su equipo/.test(await c2.innerText()));
  await c2.getByRole("button", { name: "Vincular", exact: true }).click();
  await page.waitForFunction(() => /Vinculada a:/.test(document.body.innerText));
  L.ok("vinculada: aviso de que no tiene rol de Asistencia, y la BD guarda el vínculo", /no tiene un rol con acceso a Asistencia/i.test(await caja.innerText()) && (await q("SELECT usuario_id FROM empleados WHERE id=$1", [E.emp[50]])).rows[0].usuario_id === E.cuentas.c8);
  L.ok("el aviso de resultado NO se perdió al recargar (carga silenciosa)", /Cuenta vinculada\./.test(await caja.innerText()));
  await caja.getByRole("button", { name: "Desvincular cuenta" }).click();
  const c3 = page.getByRole("alertdialog", { name: "Desvincular cuenta" });
  await c3.waitFor();
  L.ok("desvincular pide confirmación y dice que la cuenta no se borra", /la cuenta no se borra/.test(await c3.innerText()) && (await q("SELECT usuario_id FROM empleados WHERE id=$1", [E.emp[50]])).rows[0].usuario_id === E.cuentas.c8);
  await c3.getByRole("button", { name: "Cancelar" }).click();
  await caja.getByRole("button", { name: "Desvincular cuenta" }).click();
  await c3.waitFor();
  await c3.getByRole("button", { name: "Desvincular", exact: true }).click();
  await page.waitForFunction(() => /Sin cuenta vinculada/.test(document.body.innerText));
  L.ok("desvinculada: usuario_id NULL y la cuenta sigue existiendo", (await q("SELECT usuario_id FROM empleados WHERE id=$1", [E.emp[50]])).rows[0].usuario_id === null && (await q("SELECT 1 FROM usuarios WHERE id=$1", [E.cuentas.c8])).rows.length === 1);
  await browser.close();

  console.log("\n== D. Plantilla de carga: columna y vinculación (1280)");
  sembrar(); E = L.estado();
  {
    const { browser, page, ctx } = await L.abrir("rh_admin");
    await irAEmpleados(page);
    await page.getByRole("button", { name: /Importar/ }).first().click();
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Descargar plantilla \(\.xlsx\)/ }).click()]);
    const ruta = `${L.SC}/plantilla.xlsx`;
    await descarga.saveAs(ruta);
    const XLSX = require(`${WT}/node_modules/xlsx`);
    const libro = XLSX.readFile(ruta);
    const hoja = XLSX.utils.sheet_to_json(libro.Sheets["Empleados"], { header: 1 });
    L.ok("la plantilla .xlsx trae la columna 'Correo de la cuenta'", hoja[0].includes("Correo de la cuenta"), JSON.stringify(hoja[0]));
    const instr = XLSX.utils.sheet_to_json(libro.Sheets["Instrucciones"], { header: 1 }).flat().join("\n");
    L.ok("la hoja Instrucciones explica la columna y sus errores", /Correo de la cuenta/.test(instr) && /OTRO empleado/.test(instr));
    const csv = "Nombre,Apellido Paterno,Número de Nómina,Correo corporativo\nNom23,Pat23,N1023,C8@Ejemplo.TEST\nNom24,Pat24,N1024,nadie@ejemplo.test\nNom25,Pat25,N1025,\n";
    fs.writeFileSync(`${L.SC}/carga.csv`, csv);
    await page.locator('input[type="file"]').setInputFiles(`${L.SC}/carga.csv`);
    await page.getByText("Actualizarlos con los datos del archivo").waitFor();
    L.ok("vista previa: el alias 'Correo corporativo' se reconoce (no aparece como columna ignorada)", (await page.getByText("Columnas ignoradas").count()) === 0);
    await page.getByLabel(/Actualizarlos con los datos del archivo/).check();
    await page.getByRole("button", { name: /Importar \d+ registros/ }).click();
    await page.getByText("Resultado de la importación").waitFor();
    const t = await page.locator("body").innerText();
    L.ok("resultado: tarjeta 'Cuentas vinculadas' = 1 y el error 'No existe una cuenta con ese correo'", /Cuentas vinculadas/.test(t) && /No existe una cuenta de usuario con ese correo/.test(t), t.slice(t.indexOf("Resultado"), t.indexOf("Resultado") + 700));
    L.ok("BD: la cuenta c8 quedó en el empleado 23; el empleado 24 sin cuenta", (await q("SELECT usuario_id FROM empleados WHERE id=$1", [E.emp[23]])).rows[0].usuario_id === E.cuentas.c8 && (await q("SELECT usuario_id FROM empleados WHERE id=$1", [E.emp[24]])).rows[0].usuario_id === null);
    await browser.close();
  }

  console.log("\n== E. Responsive y axe del diálogo (320 / 360 / 768)");
  for (const ancho of [320, 360, 768]) {
    sembrar(); E = L.estado();
    const { browser, page } = await L.abrir("rh_admin", ancho, 700);
    await irAEmpleados(page);
    await page.getByRole("button", { name: "Vincular cuentas" }).click();
    await page.waitForSelector(".asi__tabla tbody tr");
    L.ok(`${ancho}px: el diálogo no se desborda y la tabla desplaza dentro de su región`, (await sinOverflow(page, '[role="dialog"]')) === true);
    L.ok(`${ancho}px: la región de la tabla es enfocable (teclado)`, (await page.locator('.asi__tabla-caja[tabindex="0"]').count()) === 1);
    L.ok(`${ancho}px: axe 0 violaciones en el diálogo`, (await L.axe(page, '[role="dialog"]')).length === 0);
    await page.getByRole("button", { name: /Marcar las coincidencias exactas/ }).click();
    await page.getByRole("button", { name: /Vincular las marcadas/ }).click();
    await page.getByRole("alertdialog").waitFor();
    L.ok(`${ancho}px: la confirmación no se desborda`, (await sinOverflow(page, '[role="alertdialog"]')) === true);
    { await page.waitForTimeout(600); const vv = await L.axe(page, '[role="alertdialog"]'); L.ok(`${ancho}px: axe 0 violaciones en la confirmación`, vv.length === 0, JSON.stringify(vv)); }
    await page.screenshot({ path: `${L.SC}/cap-confirmar-${ancho}.png` });
    await page.keyboard.press("Escape");
    L.ok(`${ancho}px: Escape cierra la confirmación y el foco vuelve al diálogo`, (await page.getByRole("alertdialog").count()) === 0 && (await page.getByRole("dialog").count()) === 1);
    await page.getByRole("button", { name: "Cerrar" }).last().click();
    await page.getByRole("button", { name: "Ver Expediente" }).first().click();
    await page.getByRole("button", { name: "Info Laboral" }).click();
    await page.waitForSelector("text=Cuenta de usuario (acceso a la intranet)");
    L.ok(`${ancho}px: el bloque de cuenta del perfil cabe en pantalla`, (await sinOverflow(page, '[role="group"][aria-label="Cuenta de usuario del empleado"]')) === true);
    { const vv = await L.axe(page, '[role="group"][aria-label="Cuenta de usuario del empleado"]'); L.ok(`${ancho}px: axe 0 violaciones en el bloque de cuenta`, vv.length === 0, JSON.stringify(vv)); }
    await browser.close();
  }
  await pg.end();
  process.exit(L.resumen() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
