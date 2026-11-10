const {
  normalizarNombre, sugerirCoincidencias, validarParesVinculacion, normalizarPaginacion, normalizarBusqueda, enteroPositivo,
  MAX_PARES_VINCULAR, MAX_LIMITE_PAGINA,
} = require("../backend/utils/vincularCuentas");

const emp = (id, nombre, paterno, materno) => ({ id, nombre, apellido_paterno: paterno, apellido_materno: materno || null });
const cta = (id, nombre, apellido) => ({ id, nombre, apellido });

describe("normalizarNombre", () => {
  it("quita acentos, mayúsculas, signos y espacios dobles", () => {
    expect(normalizarNombre("  José   Ángel ")).toBe("jose angel");
    expect(normalizarNombre("Peña-Núñez")).toBe("peña nuñez");
    expect(normalizarNombre(null)).toBe("");
  });
});

describe("la ñ es una letra distinta", () => {
  it("quita acentos pero conserva la ñ (también con ñ descompuesta)", () => {
    expect(normalizarNombre("Peña")).toBe("peña");
    expect(normalizarNombre("PEÑA")).toBe("peña");
    expect(normalizarNombre("Pen\u0303a")).toBe("peña");
    expect(normalizarNombre("Pena")).toBe("pena");
    expect(normalizarNombre("Peña")).not.toBe(normalizarNombre("Pena"));
  });
  it("Peña no coincide con Pena en las sugerencias", () => {
    const s = sugerirCoincidencias([{ id: 1, nombre: "Luis", apellido: "Pena" }], [{ id: 9, nombre: "Luis", apellido_paterno: "Peña", apellido_materno: null }]);
    expect(s.get(1).estado).toBe("sin_coincidencia");
  });
});

describe("sugerirCoincidencias", () => {
  const empleados = [
    emp(1, "María", "Pérez", "Gómez"),
    emp(2, "Juan", "López", "Ruiz"),
    emp(3, "Juan", "López", "Soto"),
    emp(4, "Ana", "de la Cruz"),
    emp(5, "Luis", "Mora"),
  ];
  it("coincidencia exacta única ignorando acentos y mayúsculas, con uno o dos apellidos en la cuenta", () => {
    expect(sugerirCoincidencias([cta(10, "MARIA", "perez")], empleados).get(10)).toEqual({ estado: "exacta", candidatos: [1] });
    expect(sugerirCoincidencias([cta(11, "María", "Pérez Gómez")], empleados).get(11)).toEqual({ estado: "exacta", candidatos: [1] });
  });
  it("homónimos: varias posibles; el apellido materno desempata", () => {
    const s = sugerirCoincidencias([cta(10, "Juan", "López"), cta(11, "Juan", "López Soto")], empleados);
    expect(s.get(10)).toEqual({ estado: "varias", candidatos: [2, 3] });
    expect(s.get(11)).toEqual({ estado: "exacta", candidatos: [3] });
  });
  it("sin coincidencia: otro nombre, otro apellido o sin apellido", () => {
    const s = sugerirCoincidencias([cta(10, "Pedro", "Pérez"), cta(11, "María", "Ramos"), cta(12, "María", "")], empleados);
    for (const id of [10, 11, 12]) expect(s.get(id)).toEqual({ estado: "sin_coincidencia", candidatos: [] });
  });
  it("apellido compuesto", () => {
    expect(sugerirCoincidencias([cta(10, "Ana", "De la Cruz")], empleados).get(10).estado).toBe("exacta");
  });
  it("el apellido de la cuenta debe EMPEZAR por el paterno entero (Mora no es Morales)", () => {
    expect(sugerirCoincidencias([cta(10, "Luis", "Morales")], empleados).get(10).estado).toBe("sin_coincidencia");
  });
  it("dos cuentas que reclaman al mismo empleado quedan ambas en 'varias'", () => {
    const s = sugerirCoincidencias([cta(10, "Luis", "Mora"), cta(11, "Luis", "Mora")], empleados);
    expect(s.get(10).estado).toBe("varias");
    expect(s.get(11).estado).toBe("varias");
  });
  it("sin empleados o sin cuentas no falla", () => {
    expect(sugerirCoincidencias([], empleados).size).toBe(0);
    expect(sugerirCoincidencias([cta(1, "A", "B")], []).get(1).estado).toBe("sin_coincidencia");
  });
});

describe("validarParesVinculacion", () => {
  it("acepta pares válidos (cadenas de dígitos incluidas)", () => {
    expect(validarParesVinculacion([{ usuario_id: "3", empleado_id: 4 }]).pares).toEqual([{ usuario_id: 3, empleado_id: 4 }]);
  });
  it.each([
    [undefined], [[]], ["x"], [[null]], [[[1, 2]]], [[{ usuario_id: 0, empleado_id: 1 }]], [[{ usuario_id: 1 }]],
    [[{ usuario_id: -1, empleado_id: 1 }]], [[{ usuario_id: 1.5, empleado_id: 1 }]], [[{ usuario_id: [1], empleado_id: 1 }]],
    [[{ usuario_id: 2147483648, empleado_id: 1 }]], [[{ usuario_id: "1e3", empleado_id: 1 }]],
  ])("rechaza %j", (pares) => {
    expect(validarParesVinculacion(pares).error).toBeTruthy();
  });
  it("rechaza una cuenta o un empleado repetidos en el lote", () => {
    expect(validarParesVinculacion([{ usuario_id: 1, empleado_id: 1 }, { usuario_id: 1, empleado_id: 2 }]).error).toMatch(/cuenta/);
    expect(validarParesVinculacion([{ usuario_id: 1, empleado_id: 1 }, { usuario_id: 2, empleado_id: 1 }]).error).toMatch(/empleado/);
  });
  it(`tope de ${MAX_PARES_VINCULAR} por lote`, () => {
    const lote = (n) => Array.from({ length: n }, (_, i) => ({ usuario_id: i + 1, empleado_id: i + 1 }));
    expect(validarParesVinculacion(lote(MAX_PARES_VINCULAR)).pares).toHaveLength(MAX_PARES_VINCULAR);
    expect(validarParesVinculacion(lote(MAX_PARES_VINCULAR + 1)).error).toMatch(/Máximo/);
  });
});

describe("paginación y búsqueda", () => {
  it("topes de página y valores por omisión", () => {
    expect(normalizarPaginacion(undefined, undefined)).toEqual({ pagina: 1, limite: 25 });
    expect(normalizarPaginacion("3", "10")).toEqual({ pagina: 3, limite: 10 });
    expect(normalizarPaginacion("0", "100000").limite).toBe(MAX_LIMITE_PAGINA);
    expect(normalizarPaginacion("-5", "abc")).toEqual({ pagina: 1, limite: 25 });
    expect(normalizarPaginacion("99999999999", "5").pagina).toBe(1);
  });
  it("la búsqueda se recorta, se limpia de NUL y rechaza no-cadenas", () => {
    expect(normalizarBusqueda(`  ana\u0000 `)).toBe("ana");
    expect(normalizarBusqueda("x".repeat(500))).toHaveLength(100);
    expect(normalizarBusqueda(["a"])).toBe("");
  });
  it("enteroPositivo", () => {
    expect(enteroPositivo("12")).toBe(12);
    expect(enteroPositivo("0")).toBeNull();
    expect(enteroPositivo(true)).toBeNull();
  });
});
