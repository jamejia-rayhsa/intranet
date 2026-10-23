// Cargador de utils ESM planos del frontend para jest (corre sin transpilar): evalúa el fuente sin `export`.
// Rechaza las formas que no sabe tratar, con un error claro (imports, export default, export { }).
const fs = require("fs");
const path = require("path");

function cargarUtilEsm(nombreArchivo) {
  const ruta = path.join(__dirname, "../frontend/utils", nombreArchivo);
  const fuente = fs.readFileSync(ruta, "utf8");
  if (/^\s*import\s/m.test(fuente)) throw new Error(`${nombreArchivo} no debe tener imports (el test lo evalúa como script)`);
  if (/^export\s+default\b/m.test(fuente)) throw new Error(`${nombreArchivo} no admite export default`);
  if (/^export\s*\{/m.test(fuente)) throw new Error(`${nombreArchivo} no admite export { }: usa export en la declaración`);
  const nombres = [...fuente.matchAll(/^export\s+(?:async\s+)?(?:const|let|function\*?|class)\s+(\w+)/gm)].map((m) => m[1]);
  const total = (fuente.match(/^export\s/gm) || []).length;
  if (total !== nombres.length) throw new Error(`${nombreArchivo}: ${total} exports pero el cargador reconoció ${nombres.length}`);
  return new Function(`${fuente.replace(/^export\s+/gm, "")}\nreturn { ${nombres.join(", ")} };`)();
}

module.exports = { cargarUtilEsm };
