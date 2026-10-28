// Utils puros de la pantalla "Vincular cuentas" (ESM sin imports: se evalúa el fuente) y estructura de las pantallas.
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const leer = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const fuente = leer("frontend", "utils", "cuentasEmpleado.js");
const nombres = [...fuente.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map((m) => m[1]);
const U = new Function(`${fuente.replace(/^export\s+/gm, "")}\nreturn { ${nombres.join(", ")} };`)();

const cuenta = (id, extra = {}) => ({ id, activo: true, con_acceso_asistencia: true, privilegiada: false, ...extra });

describe("dividirLotes", () => {
  it("parte en lotes de 50", () => {
    const lista = Array.from({ length: 120 }, (_, i) => i);
    expect(U.dividirLotes(lista).map((l) => l.length)).toEqual([50, 50, 20]);
    expect(U.dividirLotes([])).toEqual([]);
  });
});

describe("resumirSeleccion", () => {
  it("arma los pares y cuenta los avisos", () => {
    const sel = new Map([
      [1, { cuenta: cuenta(1), candidato: { id: 11 } }],
      [2, { cuenta: cuenta(2, { con_acceso_asistencia: false, activo: false }), candidato: { id: 12 } }],
      [3, { cuenta: cuenta(3, { privilegiada: true }), candidato: { id: 13 } }],
    ]);
    expect(U.resumirSeleccion(sel)).toEqual({
      pares: [{ usuario_id: 1, empleado_id: 11 }, { usuario_id: 2, empleado_id: 12 }, { usuario_id: 3, empleado_id: 13 }],
      total: 3, sinAcceso: 1, privilegiadas: 1, inactivas: 1, jefes: 0, repetidos: [],
    });
  });
  it("detecta un empleado elegido para dos cuentas", () => {
    const sel = new Map([[1, { cuenta: cuenta(1), candidato: { id: 11 } }], [2, { cuenta: cuenta(2), candidato: { id: 11 } }]]);
    expect(U.resumirSeleccion(sel).repetidos).toEqual([11]);
  });
  it("vacío", () => { expect(U.resumirSeleccion(new Map()).total).toBe(0); });
});

describe("seleccionarExactasSeguras (atajo 'marcar exactas')", () => {
  const exacta = (id, extra = {}) => ({ id, activo: true, privilegiada: false, correo_duplicado: false, sugerencia: { estado: "exacta", candidatos: [{ id: id + 100 }] }, ...extra });
  it("marca solo las exactas únicas seguras y cuenta lo que deja fuera", () => {
    const r = U.seleccionarExactasSeguras([
      exacta(1), exacta(2, { privilegiada: true }), exacta(3, { correo_duplicado: true }), exacta(4, { activo: false }),
      { id: 5, sugerencia: { estado: "varias", candidatos: [{ id: 1 }, { id: 2 }] } },
      { id: 6, sugerencia: { estado: "sin_coincidencia", candidatos: [] } },
      { id: 7, sugerencia: { estado: "exacta", candidatos: [{ id: 1 }, { id: 2 }] } },
      exacta(8),
    ]);
    expect(r.marcadas.map((m) => m.cuenta.id)).toEqual([1, 8]);
    expect(r.omitidas).toEqual({ privilegiadas: 1, duplicadas: 1, inactivas: 1 });
  });
  it("sin cuentas no falla", () => { expect(U.seleccionarExactasSeguras(undefined).marcadas).toEqual([]); });
});

describe("textos de alcance (V-1)", () => {
  it("el aviso dice asistencia, expediente, recibos de nómina, jefe/vacaciones y 'misma persona'", () => {
    for (const palabra of ["asistencia", "expediente", "recibos de nómina", "si es jefe", "aprobar vacaciones de su equipo", "misma persona"]) expect(U.AVISO_ALCANCE).toContain(palabra);
  });
  it("la confirmación lo repite y avisa de los jefes", () => {
    const t = U.textoConfirmacion({ total: 2, sinAcceso: 0, jefes: 1 });
    expect(t).toContain(U.AVISO_ALCANCE);
    expect(t).toMatch(/1 de esos empleados es jefe/);
  });
  it("los jefes se cuentan por subordinados del candidato", () => {
    const sel = new Map([[1, { cuenta: { id: 1, activo: true }, candidato: { id: 11, subordinados: 3 } }], [2, { cuenta: { id: 2, activo: true }, candidato: { id: 12 } }]]);
    expect(U.resumirSeleccion(sel).jefes).toBe(1);
  });
  it("todas las pantallas y docs usan el mismo alcance (no solo 'asistencia')", () => {
    const dlg = leer("frontend", "components", "VincularCuentasDialogo.jsx");
    const cta = leer("frontend", "components", "CuentaEmpleado.jsx");
    expect(dlg).toContain("AVISO_ALCANCE");
    expect(cta).toContain("AVISO_ALCANCE");
    expect(cta).toMatch(/recibos de nómina/);
    const doc = fs.readFileSync(path.join(__dirname, "../../../docs/rh/cuentas-microsoft.md"), "utf8");
    expect(doc).toContain("su expediente, sus recibos de nómina y, si es jefe, aprobar vacaciones de su equipo");
    expect(leer("frontend", "constants", "importacionEmpleados.js")).toContain("sus recibos de nómina y, si es jefe, aprobar vacaciones de su equipo");
  });
  it("solo empleados activos se vinculan: el mensaje está en el selector, el diálogo y la doc", () => {
    expect(U.MENSAJE_SOLO_ACTIVOS).toMatch(/activo/);
    expect(leer("frontend", "components", "CuentaEmpleado.jsx")).toContain("MENSAJE_SOLO_ACTIVOS");
    expect(leer("frontend", "components", "VincularCuentasDialogo.jsx")).toContain("MENSAJE_SOLO_ACTIVOS");
  });
});

describe("textoConfirmacion", () => {
  it("incluye los contadores, el aviso de quién ve qué y el de cuentas sin acceso", () => {
    const t = U.textoConfirmacion({ total: 3, sinAcceso: 2 });
    expect(t).toMatch(/vincular 3 cuentas a 3 empleados/);
    expect(t).toMatch(/verá y podrá gestionar/);
    expect(t).toMatch(/2 sin un rol con acceso a Asistencia/);
    expect(U.textoConfirmacion({ total: 1, sinAcceso: 0 })).toMatch(/1 cuenta a 1 empleado\./);
  });
});

describe("estructura de las pantallas", () => {
  const pagina = leer("frontend", "pages", "EmpleadoPage.jsx");
  const dialogo = leer("frontend", "components", "VincularCuentasDialogo.jsx");
  const cuentaComp = leer("frontend", "components", "CuentaEmpleado.jsx");
  it("la acción 'Vincular cuentas' solo se muestra con Empleados:edicion", () => {
    expect(pagina).toMatch(/puedeVincularCuentas && \(/);
    expect(pagina).toMatch(/useAccesoAsistencia\("Empleados"\) === "edicion"/);
  });
  it("el diálogo no aplica nada solo y confirma antes de enviar", () => {
    expect(dialogo).toMatch(/Vincular las marcadas/);
    expect(dialogo).not.toMatch(/useEffect\([^)]*vincularCuentas/);
    expect(dialogo).toMatch(/ConfirmarDialogo/);
  });
  it("el perfil ofrece vincular y desvincular con confirmación y la recarga es silenciosa", () => {
    expect(cuentaComp).toMatch(/Desvincular cuenta/);
    expect(cuentaComp).toMatch(/ConfirmarDialogo/);
    expect(leer("frontend", "components", "EmpleadoProfileCard.jsx")).toMatch(/cargarEmpleado\(\{ silencioso: true \}\)/);
  });
  it("las claves de la plantilla coinciden con el backend (correo_cuenta)", () => {
    const columnas = leer("frontend", "constants", "importacionEmpleados.js");
    expect(columnas).toMatch(/'correo_cuenta', 'Correo de la cuenta'/);
    for (const alias of ["Correo corporativo", "Correo microsoft", "Correo institucional", "Cuenta", "Usuario"]) expect(columnas).toContain(`'${alias}'`);
    const back = require("../backend/utils/importarEmpleados");
    expect(back.CAMPOS_REFERENCIA.map((c) => c[0])).toContain("correo_cuenta");
  });
});
