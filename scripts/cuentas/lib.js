/* eslint-env browser */
const path = require("path");
const os = require("os");
const WT = path.resolve(__dirname, "../..");
// playwright y axe-core NO son dependencias del repo: indica su ubicación con PLAYWRIGHT_PATH y AXE_PATH
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const fs = require("fs");
const SC = process.env.VERIF_SALIDA || path.join(os.tmpdir(), "cuentas-verif");
const PUERTO_WEB = process.env.VERIF_WEB_PORT || 5197;
const AXE = fs.readFileSync(process.env.AXE_PATH || require.resolve("axe-core/axe.min.js"), "utf8");
const estado = () => JSON.parse(fs.readFileSync(`${SC}/estado.json`, "utf8"));
let pasan = 0; const fallan = [];
function ok(nombre, cond, det = "") { if (cond) { pasan++; console.log("  PASS " + nombre); } else { fallan.push(nombre); console.log("  FAIL " + nombre + " " + det); } }
async function abrir(rol = "rh_admin", ancho = 1280, alto = 900) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, locale: "es-MX", timezoneId: "America/Mexico_City", acceptDownloads: true });
  await ctx.addInitScript((t) => localStorage.setItem("harness_token", t), estado().tokens[rol]);
  const page = await ctx.newPage();
  const consola = [];
  page.on("console", (m) => { if (m.type() === "error") consola.push(m.text()); });
  page.on("pageerror", (e) => consola.push("PAGEERROR " + e.message));
  return { browser, ctx, page, consola };
}
async function axe(page, selector) {
  await page.evaluate(AXE);
  return page.evaluate(async (sel) => (await window.axe.run(sel ? document.querySelector(sel) : document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, destino: v.nodes.slice(0, 2).map((n) => n.target.join(" ")) })), selector);
}
module.exports = { PUERTO_WEB, chromium, estado, ok, abrir, axe, SC, resumen: () => { console.log(`\n${pasan} PASS, ${fallan.length} FAIL ${fallan.join(" | ")}`); return fallan.length; } };
