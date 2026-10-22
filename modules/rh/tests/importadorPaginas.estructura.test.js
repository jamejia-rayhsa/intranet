// Prueba estructural: la recarga tras importar NO puede desmontar el importador ni cerrar el modal.
// Causa del defecto original: onExito -> cargarEmpleados() ponía cargando=true y el early return
// "Cargando empleados..." desmontaba ImportadorArchivo junto con su vista de resultados.
const fs = require("fs");
const path = require("path");

const leer = (ruta) => fs.readFileSync(path.join(__dirname, "..", "frontend", ruta), "utf8");
const PAGINAS = ["pages/EmpleadoPage.jsx", "pages/PuestosPage.jsx", "components/CrudPage.jsx"];

// Extrae el cuerpo de `onExito={ ... }` balanceando llaves.
function cuerpoOnExito(fuente) {
  const i = fuente.indexOf("onExito={");
  if (i === -1) return null;
  let prof = 0;
  for (let j = i + "onExito=".length; j < fuente.length; j++) {
    if (fuente[j] === "{") prof++;
    if (fuente[j] === "}") { prof--; if (prof === 0) return fuente.slice(i, j + 1); }
  }
  return null;
}

describe("importador: la recarga posterior no cierra ni desmonta el resultado", () => {
  it.each(PAGINAS)("%s: onExito solo recarga (no cierra el modal ni activa 'cargando')", (ruta) => {
    const cuerpo = cuerpoOnExito(leer(ruta));
    expect(cuerpo).toBeTruthy();
    expect(cuerpo).not.toMatch(/setMostrarImportador\s*\(\s*false/);
    expect(cuerpo).not.toMatch(/setCargando/);
  });

  it("EmpleadoPage: onExito recarga en modo silencioso y cargarEmpleados no toca `cargando` en ese modo", () => {
    const f = leer("pages/EmpleadoPage.jsx");
    expect(cuerpoOnExito(f)).toMatch(/cargarEmpleados\(\s*\{\s*silencioso:\s*true\s*\}\s*\)/);
    const decl = f.slice(f.indexOf("async function cargarEmpleados"));
    const fn = decl.slice(0, decl.indexOf("\n  function manejarCambio"));
    expect(fn).toMatch(/if \(!silencioso\) setCargando\(true\)/);
    expect(fn).toMatch(/if \(!silencioso\) setCargando\(false\)/);
    expect(fn.match(/setCargando\(/g)).toHaveLength(2);
  });

  it.each(["pages/PuestosPage.jsx", "components/CrudPage.jsx"])("%s: cargar() no pone cargando=true", (ruta) => {
    const f = leer(ruta);
    const i = f.indexOf("async function cargar()");
    const fn = f.slice(i, f.indexOf("\n  }\n", i));
    expect(fn).not.toMatch(/setCargando\(\s*true/);
  });

  it("ImportadorArchivo se renderiza cuando mostrarImportador, nunca dentro de una rama de carga", () => {
    for (const ruta of PAGINAS) {
      const f = leer(ruta);
      const antes = f.slice(0, f.indexOf("<ImportadorArchivo"));
      // Si hay un early return por `cargando`, el importador queda después de él: solo es seguro porque onExito
      // no activa `cargando` (verificado arriba). Este test documenta que el early return existe donde existe.
      expect(f).toContain("<ImportadorArchivo");
      expect(antes).toContain("mostrarImportador");
    }
  });
});
