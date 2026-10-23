// Pruebas puras (sin BD) de los validadores de entrada compartidos por los controladores de
// Convenios/Autorizadores (R-2, R-3 y R-7 de la revisión: ids, fechas y montos sin validar
// terminaban en un 500 de Postgres en vez de un 400 con mensaje claro).
const { idValido, fechaValida, numeroValido, ID_MAX } = require("../utils/validacion");

describe("idValido", () => {
  it.each(["1", "42", 1, 42, String(ID_MAX)])("acepta %p", (valor) => {
    expect(idValido(valor)).toBe(true);
  });

  it.each(["abc", "1.5", "-1", "0", "1e3", "", null, undefined, {}, [], "1 ", " 1", String(ID_MAX + 1)])(
    "rechaza %p",
    (valor) => {
      expect(idValido(valor)).toBe(false);
    },
  );
});

describe("fechaValida", () => {
  it.each(["2026-10-23", "2024-02-29", "2000-01-01"])("acepta %p", (valor) => {
    expect(fechaValida(valor)).toBe(true);
  });

  it.each([
    "23/10/2026",
    "2026-13-01",
    "2026-02-30", // Date normaliza a marzo; se rechaza por no ser la misma fecha
    "2023-02-29", // 2023 no es bisiesto
    "2026-10-23T00:00:00Z",
    "",
    null,
    undefined,
    20261023,
  ])("rechaza %p", (valor) => {
    expect(fechaValida(valor)).toBe(false);
  });
});

describe("numeroValido", () => {
  it.each([null, undefined, ""])("permite %p por defecto (campo opcional)", (valor) => {
    expect(numeroValido(valor)).toBe(true);
  });

  it("rechaza null si permitirNulo=false", () => {
    expect(numeroValido(null, { permitirNulo: false })).toBe(false);
  });

  it.each([0, 1, 10.5, "3.14", "0"])("acepta %p (número finito >= mínimo)", (valor) => {
    expect(numeroValido(valor)).toBe(true);
  });

  it.each(["abc", "1,5", NaN, Infinity, -Infinity, {}, [], true])("rechaza %p", (valor) => {
    expect(numeroValido(valor)).toBe(false);
  });

  it("rechaza negativos cuando el mínimo es 0", () => {
    expect(numeroValido(-1)).toBe(false);
  });

  it("respeta un mínimo distinto de 0", () => {
    expect(numeroValido(5, { minimo: 10 })).toBe(false);
    expect(numeroValido(15, { minimo: 10 })).toBe(true);
  });
});
