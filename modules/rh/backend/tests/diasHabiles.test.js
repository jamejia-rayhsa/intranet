const {
  MAX_DIAS_RANGO,
  esFechaValida,
  anioDeFecha,
  diaSemana,
  validarRango,
  listarDias,
  listarDiasHabiles,
  contarDiasHabiles,
  primeraFechaLlena,
  fechasLlenas,
} = require("../utils/diasHabiles");

describe("diasHabiles - fechas", () => {
  it("valida solo fechas reales con formato AAAA-MM-DD", () => {
    expect(esFechaValida("2026-10-19")).toBe(true);
    expect(esFechaValida("2028-02-29")).toBe(true);
    expect(esFechaValida("2027-02-29")).toBe(false);
    expect(esFechaValida("2100-02-29")).toBe(false);
    expect(esFechaValida("2026-13-01")).toBe(false);
    expect(esFechaValida("2026-10-19T00:00:00Z")).toBe(false);
    expect(esFechaValida("19/10/2026")).toBe(false);
    expect(esFechaValida(undefined)).toBe(false);
    expect(esFechaValida(20261019)).toBe(false);
  });

  it("lee el año del texto sin pasar por la zona horaria", () => {
    expect(anioDeFecha("2027-01-01")).toBe(2027);
    expect(anioDeFecha("2026-12-31")).toBe(2026);
    expect(anioDeFecha("basura")).toBeNull();
  });

  it("calcula el día de la semana en UTC", () => {
    expect(diaSemana("2026-10-17")).toBe(6); // sábado
    expect(diaSemana("2026-10-19")).toBe(1); // lunes
    expect(diaSemana("2028-02-29")).toBe(2); // martes (bisiesto)
  });
});

describe("diasHabiles - validarRango", () => {
  it("acepta un día y el tope exacto", () => {
    expect(validarRango("2026-10-19", "2026-10-19")).toEqual({ ok: true, total: 1 });
    expect(validarRango("2026-01-01", "2026-12-31").total).toBe(365);
    expect(validarRango("2028-01-01", "2028-12-31").total).toBe(MAX_DIAS_RANGO);
  });
  it("rechaza fin anterior, formato inválido y rangos mayores al tope", () => {
    expect(validarRango("2026-10-20", "2026-10-19").ok).toBe(false);
    expect(validarRango("2026-10-19", "2026-02-30").ok).toBe(false);
    expect(validarRango("2026-10-19", undefined).ok).toBe(false);
    const largo = validarRango("2026-01-01", "2027-01-02");
    expect(largo.ok).toBe(false);
    expect(largo.mensaje).toMatch(/366/);
  });
});

describe("diasHabiles - conteo lunes a viernes", () => {
  it("una semana completa cuenta 5 y excluye fin de semana", () => {
    expect(contarDiasHabiles("2026-10-19", "2026-10-25", [])).toBe(5);
  });
  it("un rango solo de fin de semana cuenta 0", () => {
    expect(contarDiasHabiles("2026-10-17", "2026-10-18", [])).toBe(0);
  });
  it("borde en sábado: de sábado a lunes cuenta 1", () => {
    expect(listarDiasHabiles("2026-10-17", "2026-10-19", [])).toEqual(["2026-10-19"]);
  });
  it("un día oficial en medio no cuenta (Set o arreglo)", () => {
    expect(contarDiasHabiles("2026-10-19", "2026-10-23", ["2026-10-21"])).toBe(4);
    expect(contarDiasHabiles("2026-10-19", "2026-10-23", new Set(["2026-10-21"]))).toBe(4);
  });
  it("oficial en fin de semana no resta dos veces", () => {
    expect(contarDiasHabiles("2026-10-19", "2026-10-25", ["2026-10-24"])).toBe(5);
  });
  it("cruce de año: 28-dic-2026 a 4-ene-2027", () => {
    expect(listarDiasHabiles("2026-12-28", "2027-01-04", [])).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-04",
    ]);
    expect(contarDiasHabiles("2026-12-28", "2027-01-04", ["2027-01-01"])).toBe(5);
  });
  it("año bisiesto: incluye el 29 de febrero de 2028", () => {
    expect(listarDias("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(contarDiasHabiles("2028-02-28", "2028-03-01", [])).toBe(3);
    // 2027 no es bisiesto: el 28-feb (domingo) va seguido de marzo
    expect(listarDias("2027-02-28", "2027-03-01")).toEqual(["2027-02-28", "2027-03-01"]);
  });
  it.each(["America/Mexico_City", "Pacific/Auckland", "Europe/Madrid"])(
    "no depende de la zona horaria del proceso (TZ=%s)",
    (zona) => {
      const { execFileSync } = require("child_process");
      const salida = execFileSync(
        process.execPath,
        [
          "-e",
          `const m=require(${JSON.stringify(require.resolve("../utils/diasHabiles"))});
           console.log(JSON.stringify([m.anioDeFecha("2027-01-01"), m.contarDiasHabiles("2026-12-28","2027-01-04",[]), m.diaSemana("2027-01-01")]))`,
        ],
        { env: { ...process.env, TZ: zona }, encoding: "utf8" },
      );
      expect(JSON.parse(salida)).toEqual([2027, 6, 5]);
    },
  );
});

describe("diasHabiles - cupo", () => {
  const dias = ["2026-10-19", "2026-10-20", "2026-10-21"];
  it("sin cupo (null) nunca bloquea", () => {
    expect(primeraFechaLlena(dias, new Map([["2026-10-19", 9]]), null)).toBeNull();
  });
  it("lleno cuando ocupados >= cupo y justo (cupo-1) cabe", () => {
    const ocupacion = new Map([["2026-10-20", 1], ["2026-10-21", 2]]);
    expect(primeraFechaLlena(dias, ocupacion, 1)).toBe("2026-10-20");
    expect(fechasLlenas(dias, ocupacion, 2)).toEqual(["2026-10-21"]);
    expect(primeraFechaLlena(dias, ocupacion, 3)).toBeNull();
  });
  it("acepta un objeto plano como ocupación", () => {
    expect(fechasLlenas(dias, { "2026-10-19": 1 }, 1)).toEqual(["2026-10-19"]);
  });
});
