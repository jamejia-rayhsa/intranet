// Cargador de utils ESM planos del frontend para jest (corre sin transpilar). Transforma el fuente con esbuild
// (dependencia de Vite, la misma herramienta que compila el frontend) a CommonJS y lo evalúa: así se prueba el módulo real
// y no un texto con `export` quitado por regex. Los utils no deben tener imports (son lógica pura).
const fs = require("fs");
const path = require("path");
const { transformSync } = require("esbuild");

function cargarUtilEsm(nombreArchivo, carpeta = path.join(__dirname, "../frontend/utils")) {
  const ruta = path.join(carpeta, nombreArchivo);
  const fuente = fs.readFileSync(ruta, "utf8");
  if (/^\s*import\s/m.test(fuente)) throw new Error(`${nombreArchivo} no debe tener imports (lógica pura, sin dependencias)`);
  const { code } = transformSync(fuente, { format: "cjs", target: "node18", loader: "js", sourcefile: ruta });
  const modulo = { exports: {} };
  new Function("module", "exports", code)(modulo, modulo.exports);
  return modulo.exports;
}

module.exports = { cargarUtilEsm };
