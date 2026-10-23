/* eslint-env jest */
const { quincenaDe, quincenasEntre, ultimoDiaDelMes } = require("../services/asistencia/periodos");
const { validarParametro, validarVentanaComida, interpretarParametros, DEFINICION, CLAVES } = require("../services/asistencia/parametros");

describe("periodos: quincenas", () => {
  it.each([
    ["2026-09-01", "2026-09-01", "2026-09-15"],
    ["2026-09-15", "2026-09-01", "2026-09-15"],
    ["2026-09-16", "2026-09-16", "2026-09-30"],
    ["2026-10-31", "2026-10-16", "2026-10-31"],
    ["2026-12-31", "2026-12-16", "2026-12-31"],
    ["2027-02-16", "2027-02-16", "2027-02-28"],
    ["2028-02-29", "2028-02-16", "2028-02-29"],
  ])("la quincena de %s es %s a %s", (fecha, inicio, fin) => {
    expect(quincenaDe(fecha)).toEqual({ inicio, fin });
  });

  it("ultimoDiaDelMes respeta bisiestos y diciembre", () => {
    expect(ultimoDiaDelMes(2028, 2)).toBe("2028-02-29");
    expect(ultimoDiaDelMes(2027, 2)).toBe("2027-02-28");
    expect(ultimoDiaDelMes(2026, 12)).toBe("2026-12-31");
  });

  it("quincenasEntre cubre el rango sin huecos ni traslapes", () => {
    const q = quincenasEntre("2026-09-01", "2026-10-20");
    expect(q.map((x) => x.inicio)).toEqual(["2026-09-01", "2026-09-16", "2026-10-01", "2026-10-16"]);
    for (let i = 1; i < q.length; i++) expect(q[i].inicio > q[i - 1].fin).toBe(true);
    expect(quincenasEntre("2026-10-15", "2026-10-16")).toHaveLength(2);
    expect(quincenasEntre("2026-10-16", "2026-10-16")).toHaveLength(1);
    expect(quincenasEntre("2026-12-20", "2027-01-02").map((x) => x.inicio)).toEqual(["2026-12-16", "2027-01-01"]);
    expect(quincenasEntre("2026-10-20", "2026-10-01")).toEqual([]);
  });

  it("rechaza fechas inválidas", () => {
    expect(() => quincenaDe("2026-02-30")).toThrow();
    expect(() => quincenaDe("hoy")).toThrow();
  });
});

describe("parámetros: validación de rangos", () => {
  it("define los 7 parámetros con los valores iniciales de la decisión del humano", () => {
    expect(interpretarParametros([])).toEqual({
      analisis_desde: "2026-09-01", cierre_automatico_desde: "2026-10-16", dias_cierre: 3, margen_dia_completo_min: 120,
      version_motor: 1, ventana_seguridad_dias: 7, barrido_completo_horas: 24, comida_desde: "13:00", comida_hasta: "16:00",
    });
    expect(CLAVES).toHaveLength(9);
  });

  it.each([
    ["dias_cierre", 0, true], ["dias_cierre", 30, true], ["dias_cierre", 31, false], ["dias_cierre", -1, false],
    ["dias_cierre", "5", true], ["dias_cierre", "1e1", false], ["dias_cierre", "3.0", false], ["dias_cierre", 3.5, false],
    ["dias_cierre", "", false], ["dias_cierre", null, false], ["dias_cierre", [3], false], ["dias_cierre", { a: 1 }, false],
    ["margen_dia_completo_min", 0, true], ["margen_dia_completo_min", 720, true], ["margen_dia_completo_min", 721, false],
    ["ventana_seguridad_dias", 0, true], ["ventana_seguridad_dias", 31, true], ["ventana_seguridad_dias", 32, false],
    ["barrido_completo_horas", 0, false], ["barrido_completo_horas", 1, true], ["barrido_completo_horas", 168, true], ["barrido_completo_horas", 169, false],
    ["analisis_desde", "2026-09-01", true], ["analisis_desde", "2019-12-31", false], ["analisis_desde", "2026-02-30", false],
    ["analisis_desde", "01/09/2026", false], ["analisis_desde", 20260901, false], ["analisis_desde", "2101-01-01", false],
    ["cierre_automatico_desde", "2026-10-16", true], ["cierre_automatico_desde", "mañana", false],
  ])("%s = %p -> válido: %s", (clave, valor, ok) => {
    expect(validarParametro(clave, valor).ok).toBe(ok);
  });

  it.each([
    ["comida_desde", "13:00", true], ["comida_desde", "00:00", true], ["comida_hasta", "23:59", true], ["comida_hasta", "24:00", false],
    ["comida_desde", "7:00", false], ["comida_desde", "13:60", false], ["comida_desde", "13:00:00", false], ["comida_hasta", 1600, false],
    ["comida_desde", "", false], ["comida_hasta", ["16:00"], false], ["comida_desde", "1pm", false],
  ])("%s = %p -> válido: %s (formato HH:MM)", (clave, valor, ok) => {
    expect(validarParametro(clave, valor).ok).toBe(ok);
  });

  it("la ventana de comida exige desde < hasta con los valores resultantes (enviados + vigentes)", () => {
    const actuales = { comida_desde: "13:00", comida_hasta: "16:00" };
    expect(validarVentanaComida({ comida_desde: "12:00" }, actuales)).toBeNull();
    expect(validarVentanaComida({ comida_desde: "16:00" }, actuales)).toMatch(/anterior/); // igual a hasta
    expect(validarVentanaComida({ comida_hasta: "12:59" }, actuales)).toMatch(/anterior/);
    expect(validarVentanaComida({ comida_desde: "14:00", comida_hasta: "15:00" }, actuales)).toBeNull();
    expect(validarVentanaComida({ comida_desde: "15:00", comida_hasta: "14:00" }, actuales)).toMatch(/anterior/);
    expect(validarVentanaComida({ dias_cierre: 4 }, { comida_desde: "17:00", comida_hasta: "10:00" })).toBeNull(); // no la toca
  });

  it("una ventana corrupta en la BD (desde >= hasta o formato) vuelve a 13:00-16:00", () => {
    expect(interpretarParametros([{ clave: "comida_desde", valor: "17:00" }, { clave: "comida_hasta", valor: "10:00" }])).toMatchObject({ comida_desde: "13:00", comida_hasta: "16:00" });
    expect(interpretarParametros([{ clave: "comida_desde", valor: "x" }])).toMatchObject({ comida_desde: "13:00" });
    expect(interpretarParametros([{ clave: "comida_desde", valor: "12:00" }, { clave: "comida_hasta", valor: "14:30" }])).toMatchObject({ comida_desde: "12:00", comida_hasta: "14:30" });
  });

  it("devuelve el valor tipado (entero o fecha)", () => {
    expect(validarParametro("dias_cierre", "5")).toEqual({ ok: true, valor: 5 });
    expect(validarParametro("analisis_desde", "2026-09-01")).toEqual({ ok: true, valor: "2026-09-01" });
  });

  it("version_motor no se edita y las claves desconocidas se rechazan", () => {
    expect(validarParametro("version_motor", 2)).toMatchObject({ ok: false });
    expect(validarParametro("inventada", 1)).toMatchObject({ ok: false });
    expect(validarParametro("__proto__", 1)).toMatchObject({ ok: false });
    expect(DEFINICION.version_motor.editable).toBe(false);
  });

  it("interpretarParametros ignora claves ajenas y valores corruptos (toma el defecto)", () => {
    const r = interpretarParametros([
      { clave: "dias_cierre", valor: "7" }, { clave: "analisis_desde", valor: "no" }, { clave: "margen_dia_completo_min", valor: "99999" },
      { clave: "otra", valor: "x" },
    ]);
    expect(r.dias_cierre).toBe(7);
    expect(r.analisis_desde).toBe("2026-09-01");
    expect(r.margen_dia_completo_min).toBe(120);
    expect(r.otra).toBeUndefined();
  });
});
