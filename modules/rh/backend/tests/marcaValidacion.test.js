const { validarMarca, interpretarInstante, compararIds } = require("../utils/marcaValidacion");

const AHORA = Date.parse("2026-06-01T12:00:00Z");
const base = (extra = {}) => ({ id_externo: "1000123", codigo_empleado: "1234", marca_ts: "2026-01-15T14:00:00Z", ...extra });
const validar = (m, opciones = {}) => validarMarca(m, { origen: "biotime", ahora: AHORA, ...opciones });
const rechazo = (m, opciones) => {
  const r = validar(m, opciones);
  expect(r.ok).toBe(false);
  return r.motivo;
};

describe("validarMarca - marca mínima y ejemplo del contrato", () => {
  it("acepta la marca mínima y normaliza los campos", () => {
    const r = validar(base());
    expect(r).toEqual({
      ok: true,
      marca: {
        id_externo: "1000123",
        codigo_empleado: "1234",
        marca_ts: "2026-01-15T14:00:00.000Z",
        subida_ts: null,
        estado_marca: null,
        tipo_verificacion: null,
        terminal_sn: null,
        terminal_alias: null,
        area_externa: null,
        crudo: null,
      },
    });
  });

  it("acepta el ejemplo completo del contrato", () => {
    const r = validar({
      id_externo: "1000123",
      codigo_empleado: "1234",
      marca_ts: "2026-01-15T14:00:00Z",
      subida_ts: "2026-01-15T14:00:02Z",
      estado_marca: 0,
      tipo_verificacion: 15,
      terminal_sn: "SN-DE-EJEMPLO",
      terminal_alias: "SEDE-A",
      area_externa: "SEDE-A",
      crudo: { work_code: "0", source: 1, is_attendance: null },
    });
    expect(r.ok).toBe(true);
    expect(r.marca.subida_ts).toBe("2026-01-15T14:00:02.000Z");
    expect(JSON.parse(r.marca.crudo)).toEqual({ work_code: "0", source: 1, is_attendance: null });
  });

  it("ignora los campos que llena el servidor", () => {
    const r = validar(base({ id: 1, lote_id: 2, empleado_id: 3, fecha_importacion: "x" }));
    expect(r.ok).toBe(true);
    expect(Object.keys(r.marca)).not.toEqual(expect.arrayContaining(["id", "lote_id", "empleado_id", "fecha_importacion"]));
  });

  it.each([[null], [undefined], ["texto"], [5], [[]], [true]])("una marca que no es objeto (%p) se rechaza", (m) => {
    expect(rechazo(m)).toBe("la marca no es un objeto");
  });
});

describe("validarMarca - id_externo", () => {
  it.each([
    [1000123, "1000123"],
    ["1000123", "1000123"],
    ["00123", "123"], // mismo id de BioTime: los ceros a la izquierda no crean otra marca
    [0, "0"],
    ["123456789012345678", "123456789012345678"],
  ])("acepta %p como %p", (entrada, esperado) => {
    expect(validar(base({ id_externo: entrada })).marca.id_externo).toBe(esperado);
  });

  it.each([
    [undefined, /obligatorio/],
    [null, /obligatorio/],
    ["", /obligatorio/],
    [{}, /número o texto/],
    [[1], /número o texto/],
    [true, /número o texto/],
    [1.5, /entero válido/],
    [-3, /entero válido/],
    [Number.MAX_SAFE_INTEGER + 2, /entero válido/],
    ["abc", /entero de hasta 18 dígitos/],
    [" 12 ", /entero de hasta 18 dígitos/],
    ["12.5", /entero de hasta 18 dígitos/],
    ["1234567890123456789", /entero de hasta 18 dígitos/], // 19 dígitos: no cabe con holgura en BIGINT
    ["x".repeat(65), /excede 64/],
    ["12\u0000", /no permitidos/],
  ])("rechaza %p", (valor, patron) => {
    expect(rechazo(base({ id_externo: valor }))).toMatch(patron);
  });

  it("el límite es de 64 caracteres: 64 pasa en un origen de texto, 65 no", () => {
    expect(validar(base({ id_externo: "a".repeat(64) }), { origen: "otro" }).ok).toBe(true);
    expect(validar(base({ id_externo: "a".repeat(65) }), { origen: "otro" }).ok).toBe(false);
  });

  it("en un rechazo por otro campo devuelve el id_externo leído (y null si no se pudo leer)", () => {
    expect(validar(base({ marca_ts: "x" })).id_externo).toBe("1000123");
    expect(validar(base({ id_externo: {}, marca_ts: "x" })).id_externo).toBeNull();
    expect(validar(base({ id_externo: "z".repeat(100) })).id_externo).toHaveLength(64);
  });
});

describe("validarMarca - codigo_empleado", () => {
  it("recorta espacios de los extremos", () => {
    expect(validar(base({ codigo_empleado: "  12 \t" })).marca.codigo_empleado).toBe("12");
  });
  it("conserva los ceros a la izquierda (texto tal cual)", () => {
    expect(validar(base({ codigo_empleado: "007" })).marca.codigo_empleado).toBe("007");
  });
  it("acepta 50 caracteres y rechaza 51 (después del trim)", () => {
    expect(validar(base({ codigo_empleado: ` ${"9".repeat(50)} ` })).ok).toBe(true);
    expect(rechazo(base({ codigo_empleado: "9".repeat(51) }))).toMatch(/excede 50/);
  });
  it.each([
    [undefined, /obligatorio/],
    [null, /obligatorio/],
    ["", /obligatorio/],
    ["   ", /obligatorio/],
    [123, /debe ser texto/],
    [{}, /debe ser texto/],
    [["1"], /debe ser texto/],
    ["12\u0000", /no permitidos/],
  ])("rechaza %p", (valor, patron) => {
    expect(rechazo(base({ codigo_empleado: valor }))).toMatch(patron);
  });
});

describe("validarMarca - marca_ts (ISO 8601 con zona obligatoria)", () => {
  it.each([
    ["2026-01-15T14:00:00Z", "2026-01-15T14:00:00.000Z"],
    ["2026-01-15T14:00:00z".toUpperCase(), "2026-01-15T14:00:00.000Z"],
    ["2026-01-15T08:00:00-06:00", "2026-01-15T14:00:00.000Z"],
    ["2026-01-15T08:00:00-0600", "2026-01-15T14:00:00.000Z"],
    ["2026-01-15T08:00:00-06", "2026-01-15T14:00:00.000Z"],
    ["2026-01-15T20:30:00+05:30", "2026-01-15T15:00:00.000Z"],
    ["2026-01-15T14:00Z", "2026-01-15T14:00:00.000Z"],
    ["2026-01-15T14:00:00.123Z", "2026-01-15T14:00:00.123Z"],
    ["2026-01-15T14:00:00.123456789Z", "2026-01-15T14:00:00.123Z"],
    ["2026-01-15T23:59:59Z", "2026-01-15T23:59:59.000Z"],
    ["2024-02-29T10:00:00Z", "2024-02-29T10:00:00.000Z"], // bisiesto
  ])("acepta %s", (entrada, esperado) => {
    expect(validar(base({ marca_ts: entrada })).marca.marca_ts).toBe(esperado);
  });

  it.each([
    ["2026-01-15T14:00:00", "sin zona horaria"],
    ["2026-01-15 14:00:00", "sin zona horaria"],
    ["2026-01-15T14:00", "sin zona horaria"],
    ["2026-01-15T14:00:00.500", "sin zona horaria"],
  ])("rechaza %s como sin zona", (entrada) => {
    expect(rechazo(base({ marca_ts: entrada }))).toBe("marca_ts sin zona horaria");
  });

  it.each([
    "2026-01-15",
    "2026-01-15 14:00:00Z", // ISO exige T
    "15/01/2026 14:00:00",
    "ayer",
    "",
    "2026-13-01T10:00:00Z",
    "2026-00-10T10:00:00Z",
    "2026-02-30T10:00:00Z",
    "2025-02-29T10:00:00Z",
    "2026-04-31T10:00:00Z",
    "2026-01-32T10:00:00Z",
    "2026-01-15T24:00:00Z",
    "2026-01-15T14:60:00Z",
    "2026-01-15T14:00:60Z",
    "2026-01-15T14:00:00+24:00",
    "2026-01-15T14:00:00+05:60",
    "1969-12-31T23:00:00Z",
    "2026-01-15T14:00:00Z\n",
    `2026-01-15T14:00:00${"0".repeat(40)}Z`,
  ])("rechaza %p como no ISO 8601 válido", (entrada) => {
    expect(rechazo(base({ marca_ts: entrada }))).toMatch(/marca_ts (no es una fecha ISO 8601 válida|es obligatorio)/);
  });

  it.each([[1768485600000], [{}], [true], [["2026-01-15T14:00:00Z"]]])("rechaza el tipo %p", (entrada) => {
    expect(rechazo(base({ marca_ts: entrada }))).toBe("marca_ts no es una fecha ISO 8601 válida");
  });

  it.each([[undefined], [null]])("marca_ts %p es obligatorio", (entrada) => {
    expect(rechazo(base({ marca_ts: entrada }))).toBe("marca_ts es obligatorio");
  });

  it("rechaza más de 24 h en el futuro y acepta justo 24 h", () => {
    const limite = new Date(AHORA + 24 * 3600 * 1000);
    expect(validar(base({ marca_ts: limite.toISOString() })).ok).toBe(true);
    expect(rechazo(base({ marca_ts: new Date(AHORA + 24 * 3600 * 1000 + 1000).toISOString() }))).toBe("marca_ts está más de 24 h en el futuro");
    expect(validar(base({ marca_ts: new Date(AHORA + 3600 * 1000).toISOString() })).ok).toBe(true);
  });

  it("el futuro se mide en instantes: una hora local con desplazamiento que cae más allá de 24 h también se rechaza", () => {
    // 2026-06-02T12:00:01Z equivale a 2026-06-02T06:00:01-06:00
    expect(rechazo(base({ marca_ts: "2026-06-02T06:00:01-06:00" }))).toMatch(/futuro/);
    expect(validar(base({ marca_ts: "2026-06-02T06:00:00-06:00" })).ok).toBe(true);
  });

  it("usa el reloj real cuando no se inyecta", () => {
    const manana = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    expect(validarMarca(base({ marca_ts: manana }), { origen: "biotime" }).ok).toBe(false);
  });
});

describe("validarMarca - subida_ts (opcional, con zona)", () => {
  it("acepta ausente y null", () => {
    expect(validar(base({ subida_ts: null })).marca.subida_ts).toBeNull();
    expect(validar(base()).marca.subida_ts).toBeNull();
  });
  it("acepta con zona (también en el futuro: solo marca_ts tiene ese tope)", () => {
    expect(validar(base({ subida_ts: "2030-01-01T00:00:00Z" })).marca.subida_ts).toBe("2030-01-01T00:00:00.000Z");
    expect(validar(base({ subida_ts: "2026-01-15T08:00:02-06:00" })).marca.subida_ts).toBe("2026-01-15T14:00:02.000Z");
  });
  it.each([
    ["2026-01-15T14:00:02", "subida_ts sin zona horaria"],
    ["", "subida_ts no es una fecha ISO 8601 válida"],
    ["x", "subida_ts no es una fecha ISO 8601 válida"],
    [5, "subida_ts no es una fecha ISO 8601 válida"],
  ])("rechaza %p", (entrada, motivo) => {
    expect(rechazo(base({ subida_ts: entrada }))).toBe(motivo);
  });
});

describe("validarMarca - estado_marca y tipo_verificacion", () => {
  it.each([
    [0, "0"],
    ["0", "0"],
    [3, "3"],
    ["255", "255"],
    [-1, "-1"],
    [32767, "32767"],
  ])("estado_marca %p -> %p", (entrada, esperado) => {
    expect(validar(base({ estado_marca: entrada })).marca.estado_marca).toBe(esperado);
  });
  it.each([[1.5], ["abc"], ["1.5"], [""], [" 1"], [32768], [-32769], [{}], [[0]], [true], ["99999999999"]])("estado_marca %p se rechaza", (entrada) => {
    expect(rechazo(base({ estado_marca: entrada }))).toMatch(/estado_marca/);
  });
  it("estado_marca null o ausente es NULL", () => {
    expect(validar(base({ estado_marca: null })).marca.estado_marca).toBeNull();
    expect(validar(base()).marca.estado_marca).toBeNull();
  });

  it.each([
    [0, "0"], // verify_type 0 es atípico pero válido
    [15, "15"],
    ["15", "15"],
    [101, "101"],
  ])("tipo_verificacion %p -> %p", (entrada, esperado) => {
    expect(validar(base({ tipo_verificacion: entrada })).marca.tipo_verificacion).toBe(esperado);
  });
  it.each([[1.2], ["x"], [""], [{}], [true], [2147483648], [["15"]]])("tipo_verificacion %p se rechaza", (entrada) => {
    expect(rechazo(base({ tipo_verificacion: entrada }))).toMatch(/tipo_verificacion/);
  });
});

describe("validarMarca - terminal_sn, terminal_alias, area_externa", () => {
  it.each(["terminal_sn", "terminal_alias", "area_externa"])("%s: la CADENA VACÍA es válida y se conserva", (campo) => {
    const r = validar(base({ [campo]: "" }));
    expect(r.ok).toBe(true);
    expect(r.marca[campo]).toBe("");
  });
  it.each(["terminal_sn", "terminal_alias", "area_externa"])("%s: null y ausente son NULL; no se recorta", (campo) => {
    expect(validar(base({ [campo]: null })).marca[campo]).toBeNull();
    expect(validar(base()).marca[campo]).toBeNull();
    expect(validar(base({ [campo]: " A " })).marca[campo]).toBe(" A ");
  });
  it.each([
    ["terminal_sn", 50],
    ["terminal_alias", 100],
    ["area_externa", 100],
  ])("%s: acepta %i caracteres y rechaza uno más", (campo, maximo) => {
    expect(validar(base({ [campo]: "a".repeat(maximo) })).ok).toBe(true);
    expect(rechazo(base({ [campo]: "a".repeat(maximo + 1) }))).toBe(`${campo} no es válido`);
  });
  it.each(["terminal_sn", "terminal_alias", "area_externa"])("%s: no texto o con NUL se rechaza", (campo) => {
    for (const malo of [5, {}, [], true, "a\u0000b"]) {
      expect(rechazo(base({ [campo]: malo }))).toBe(`${campo} no es válido`);
    }
  });
});

describe("validarMarca - crudo", () => {
  it("acepta {} y objetos anidados", () => {
    expect(validar(base({ crudo: {} })).marca.crudo).toBe("{}");
    expect(JSON.parse(validar(base({ crudo: { a: { b: [1, 2, { c: null }] } } })).marca.crudo)).toEqual({ a: { b: [1, 2, { c: null }] } });
  });
  it("null y ausente son NULL", () => {
    expect(validar(base({ crudo: null })).marca.crudo).toBeNull();
    expect(validar(base()).marca.crudo).toBeNull();
  });
  it.each([["texto"], [5], [true], [[1, 2]]])("rechaza %p (no es un objeto)", (crudo) => {
    expect(rechazo(base({ crudo }))).toBe("crudo debe ser un objeto");
  });
  it("acepta exactamente 2 KB y rechaza un byte más (en bytes UTF-8, no en caracteres)", () => {
    const hueco = JSON.stringify({ k: "" }).length; // {"k":""}
    const justo = { k: "a".repeat(2048 - hueco) };
    expect(Buffer.byteLength(JSON.stringify(justo))).toBe(2048);
    expect(validar(base({ crudo: justo })).ok).toBe(true);
    expect(rechazo(base({ crudo: { k: "a".repeat(2048 - hueco + 1) } }))).toBe("crudo excede 2 KB");
    // 'é' ocupa 2 bytes: 1030 caracteres pasan de 2048 bytes aunque tengan menos de 2048 caracteres
    expect(rechazo(base({ crudo: { k: "é".repeat(1030) } }))).toBe("crudo excede 2 KB");
  });
  it("rechaza NUL (jsonb no lo admite) en valores y en claves, a cualquier profundidad", () => {
    expect(rechazo(base({ crudo: { a: "x\u0000y" } }))).toMatch(/no permitidos/);
    expect(rechazo(base({ crudo: { "k\u0000": 1 } }))).toMatch(/no permitidos/);
    expect(rechazo(base({ crudo: { a: [{ b: ["z\u0000"] }] } }))).toMatch(/no permitidos/);
  });
  it("rechaza sustitutos Unicode sueltos (jsonb los rechaza)", () => {
    expect(rechazo(base({ crudo: { a: "\ud800" } }))).toMatch(/no permitidos/);
    expect(validar(base({ crudo: { a: "😀" } })).ok).toBe(true);
  });
  it("rechaza anidamientos absurdos (profundidad > 20)", () => {
    let objeto = { fin: 1 };
    for (let i = 0; i < 30; i += 1) objeto = { n: objeto };
    expect(rechazo(base({ crudo: objeto }))).toMatch(/no permitidos/);
  });
});

describe("validarMarca - los motivos no reflejan el valor recibido", () => {
  it("un valor con contenido sensible no aparece en el motivo", () => {
    const motivo = rechazo(base({ marca_ts: "TOKEN-SECRETO-123" }));
    expect(motivo).not.toContain("TOKEN-SECRETO");
  });
});

describe("interpretarInstante", () => {
  it("devuelve la fecha o el motivo con el nombre del campo", () => {
    expect(interpretarInstante("2026-01-15T14:00:00Z", "campo").fecha.toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(interpretarInstante("2026-01-15T14:00:00", "campo").motivo).toBe("campo sin zona horaria");
    expect(interpretarInstante(5, "campo").motivo).toBe("campo no es una fecha ISO 8601 válida");
  });
});

describe("compararIds", () => {
  it("ordena numéricamente (no como texto)", () => {
    expect(["100", "9", "25", "1000000", "30"].sort(compararIds)).toEqual(["9", "25", "30", "100", "1000000"]);
    expect(compararIds("5", "5")).toBe(0);
    expect(compararIds("123456789012345678", "123456789012345679")).toBe(-1);
  });
  it("ids no numéricos se ordenan como texto", () => {
    expect(["b", "a"].sort(compararIds)).toEqual(["a", "b"]);
  });
});
