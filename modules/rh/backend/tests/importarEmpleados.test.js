const request = require("supertest");
const express = require("express");
const { crearBd } = require("./fakeEmpleadosImportacion");

jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, _res, next) => { req.user = { usuario_id: 5, rol_id: 3, rol_nombre: "rh_admin" }; next(); },
}));
jest.mock("../../../portal/backend/middleware/permisos.middleware", () => ({
  verificarPermiso: () => (_req, _res, next) => next(),
}));
jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn(), connect: jest.fn() } }));

const { grupo } = require("../../../portal/backend/config/database");
const Empleado = require("../models/empleado.model");
const { prepararFilaEmpleado, esFechaValida, validarParesJefes, nombresUnicos } = require("../utils/importarEmpleados");

const app = express();
app.use(express.json()); // mismo límite global (100 kb) que el portal
app.use("/api/empleados", require("../routes/empleados.routes"));
app.use("/api/puestos", require("../routes/puestos.routes"));
app.use("/api/areas", require("../routes/areas.routes"));
app.use("/api/departamentos", require("../routes/departamentos.routes"));

const base = (i, extra = {}) => ({ _fila: i + 1, nombre: `Ana${i}`, apellido_paterno: "Prueba", ...extra });
const CURP = (n) => `XXXX0001010000${String(n).padStart(4, "0")}`; // 18 caracteres ficticios

const CATALOGOS = {
  puestos: [{ id: 7, nombre: "Analista" }, { id: 8, nombre: "Jefe de Área" }],
  departamentos: [{ id: 3, nombre: "Tecnologías de la Información" }],
  ubicaciones: [{ id: 2, nombre: "Planta Norte" }],
};

// Conecta el mock de `grupo` a una BD en memoria.
function simularBd(opciones = {}) {
  const bd = crearBd({ ...CATALOGOS, ...opciones });
  grupo.query.mockImplementation(bd.query);
  grupo.connect.mockImplementation(bd.connect);
  return bd;
}

const mapas = () => ({
  puestos: { analista: 7, "jefe de area": 8 },
  departamentos: { "tecnologias de la informacion": 3 },
  ubicaciones: { "planta norte": 2 },
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("prepararFilaEmpleado / esFechaValida", () => {
  it("valida fechas AAAA-MM-DD reales", () => {
    for (const ok of ["2024-02-29", "1900-01-01", "2100-12-31"]) expect(esFechaValida(ok)).toBe(true);
    for (const mal of ["2023-02-29", "2100-02-29", "1899-12-31", "2101-01-01", "2024-13-01", "2024-00-10", "2024-1-1", "15/01/2024", "45305.7", "", "2024-01-32"]) {
      expect(esFechaValida(mal)).toBe(false);
    }
  });

  it("nombre y apellido paterno: requeridos, 100 caracteres y sin NUL (rechazan la fila)", () => {
    expect(prepararFilaEmpleado({ nombre: "Ana" }).error).toMatch(/requeridos/);
    expect(prepararFilaEmpleado(null).error).toBeTruthy();
    expect(prepararFilaEmpleado(base(1, { nombre: "x".repeat(101) })).error).toMatch(/Nombre excede 100 caracteres \(tiene 101\)/);
    expect(prepararFilaEmpleado(base(1, { apellido_paterno: "x".repeat(101) })).error).toMatch(/Apellido paterno excede 100/);
    expect(prepararFilaEmpleado(base(1, { nombre: "x".repeat(100) })).error).toBeUndefined();
    expect(prepararFilaEmpleado(base(1, { nombre: "A\u0000B" })).error).toMatch(/caracteres no permitidos/);
    expect(prepararFilaEmpleado(base(1, { apellido_paterno: "A\u0000B" })).error).toMatch(/caracteres no permitidos/);
    expect(prepararFilaEmpleado(base(1, { nombre: { a: 1 } })).error).toMatch(/Nombre/);
  });

  it("las fechas inválidas siguen rechazando la fila (las 5 columnas de fecha)", () => {
    for (const campo of ["fecha_nacimiento", "fecha_ingreso", "fecha_imss", "fecha_renovacion", "fecha_baja"]) {
      expect(prepararFilaEmpleado(base(1, { [campo]: "2023-02-29" })).error).toMatch(/inválida \(usa AAAA-MM-DD/);
      expect(prepararFilaEmpleado(base(1, { [campo]: "2024-02-29" })).error).toBeUndefined();
    }
  });

  it("un valor inválido de un campo OPCIONAL no rechaza la fila: queda vacío y genera advertencia", () => {
    const r = prepararFilaEmpleado(base(1, {
      rfc: "123", nss: "12", clabe: "999", celular_personal: "555", codigo_postal: "ABC", cp_fiscal: "123456",
      genero: "Marciano", banco: "Banco Inventado", estado_nacimiento: "Atlantida", correo_personal: "no-es-correo",
      estatus: "volando", colonia: "c".repeat(101),
    }));
    expect(r.error).toBeUndefined();
    for (const campo of ["rfc", "nss", "clabe", "celular_personal", "codigo_postal", "cp_fiscal", "genero", "banco", "estado_nacimiento", "correo_personal", "estatus", "colonia"]) {
      expect(r.fila[campo]).toBe("");
    }
    const porCampo = Object.fromEntries(r.advertencias.map((a) => [a.campo, a]));
    expect(Object.keys(porCampo)).toHaveLength(12);
    // NSS/RFC/CLABE: solo "formato inválido", sin el valor recibido
    for (const campo of ["rfc", "nss", "clabe"]) {
      expect(porCampo[campo]).toEqual({ campo, valor_recibido: null, motivo: "formato inválido" });
    }
    expect(porCampo.celular_personal).toEqual({ campo: "celular_personal", valor_recibido: "555", motivo: "teléfono inválido (deben ser 10 dígitos)" });
    expect(porCampo.colonia.valor_recibido).toHaveLength(40);
    expect(porCampo.colonia.motivo).toMatch(/excede 100/);
    expect(porCampo.genero.motivo).toMatch(/no está entre las opciones/);
  });

  it("CURP y RFC se pasan a mayúsculas; el NSS de 10 dígitos NO se completa con ceros: se omite con advertencia sin mostrar el valor (A2)", () => {
    const r = prepararFilaEmpleado(base(1, { curp: "xxxx000101hxxxxxx0", rfc: "xxxx000101xx1", nss: "1234567890" }));
    expect(r.fila).toMatchObject({ curp: "XXXX000101HXXXXXX0", rfc: "XXXX000101XX1", nss: "" });
    expect(r.advertencias).toEqual([{ campo: "nss", valor_recibido: null, motivo: "NSS de 10 dígitos: verifica el 0 inicial (el campo se omitió)" }]);
    expect(prepararFilaEmpleado(base(1, { rfc: "XXXX000101XX" })).fila.rfc).toBe("XXXX000101XX"); // 12 caracteres (persona moral)
    expect(prepararFilaEmpleado(base(1, { nss: 12345678901 })).fila.nss).toBe("12345678901");
    expect(prepararFilaEmpleado(base(1, { nss: "1234567890123" })).fila.nss).toBe("");
  });

  it("CURP presente pero inválida = ERROR de la fila (nunca advertencia): 17, 19, símbolos, NUL, objeto (A1)", () => {
    for (const mala of ["A".repeat(17), "A".repeat(19), "XXXX00010100000-01", "XXXX0001010000001!", "CORTA", "a\u0000b", { a: 1 }, [1]]) {
      const r = prepararFilaEmpleado(base(1, { curp: mala }));
      expect(r.error).toBe("CURP inválida: no se puede identificar al empleado");
      expect(r.fila).toBeUndefined();
    }
    expect(prepararFilaEmpleado(base(1, { curp: "XXXX000101HXXXXXX0" })).fila.curp).toBe("XXXX000101HXXXXXX0");
    expect(prepararFilaEmpleado(base(1, { curp: " xxxx 000101 hxxxxxx 0 " })).fila.curp).toBe("XXXX000101HXXXXXX0");
    expect(prepararFilaEmpleado(base(1, { curp: "" })).error).toBeUndefined();
    expect(prepararFilaEmpleado(base(1, { curp: "   " })).fila.curp).toBe("");
  });

  it("número de nómina: se recorta, '101.0' de Excel pasa a '101', y NUL o más de 50 caracteres rechazan la fila (identificador)", () => {
    expect(prepararFilaEmpleado(base(1, { numero_nomina: "  N-7 " })).fila.numero_nomina).toBe("N-7");
    expect(prepararFilaEmpleado(base(1, { numero_nomina: "101.0" })).fila.numero_nomina).toBe("101");
    expect(prepararFilaEmpleado(base(1, { numero_nomina: 101 })).fila.numero_nomina).toBe("101");
    expect(prepararFilaEmpleado(base(1, { numero_nomina: "0101" })).fila.numero_nomina).toBe("0101"); // los ceros se conservan
    expect(prepararFilaEmpleado(base(1, { numero_nomina: "10.5" })).fila.numero_nomina).toBe("10.5");
    expect(prepararFilaEmpleado(base(1, { numero_nomina: "a\u0000" })).error).toMatch(/Número de nómina contiene caracteres no permitidos/);
    expect(prepararFilaEmpleado(base(1, { numero_nomina: "x".repeat(51) })).error).toMatch(/Número de nómina excede 50/);
    expect(prepararFilaEmpleado(base(1, { numero_nomina: { a: 1 } })).error).toMatch(/Número de nómina/);
  });

  it("celda numérica de 16+ dígitos (_precision): CLABE/NSS/otros se omiten con advertencia 'guarda la columna como Texto'; CURP y nómina rechazan la fila (F-IE-4)", () => {
    const r = prepararFilaEmpleado(base(1, { clabe: "123456789012345000", nss: "12345678901", _precision: ["clabe", "calle", 5] }));
    expect(r.fila.clabe).toBe("");
    expect(r.fila.nss).toBe("12345678901");
    expect(r.advertencias).toEqual(expect.arrayContaining([
      { campo: "clabe", valor_recibido: null, motivo: expect.stringMatching(/16 o más dígitos.*Texto/) },
      { campo: "calle", valor_recibido: null, motivo: expect.stringMatching(/Texto/) },
    ]));
    expect(prepararFilaEmpleado(base(1, { _precision: ["numero_nomina"], numero_nomina: "1" })).error).toMatch(/Texto/);
    expect(prepararFilaEmpleado(base(1, { _precision: ["curp"], curp: "XXXX000101HXXXXXX0" })).error).toBe("CURP inválida: no se puede identificar al empleado");
    expect(prepararFilaEmpleado(base(1, { _precision: "clabe" })).advertencias).toEqual([]); // formato no válido: se ignora
  });

  it.each([
    ["+52 (55) 1234-5678", "5512345678"], ["52 55 1234 5678", "5512345678"], ["55-1234-5678", "5512345678"],
    ["5512345678", "5512345678"], ["5212345678", "5212345678"], ["+521 5512345678", "5512345678"], ["55.1234.5678", "5512345678"],
  ])("teléfono %p -> %p", (entrada, esperado) => {
    expect(prepararFilaEmpleado(base(1, { celular_personal: entrada })).fila.celular_personal).toBe(esperado);
  });

  it("código postal y cp_fiscal: 5 dígitos, rellena el 0 que Excel quitó", () => {
    const r = prepararFilaEmpleado(base(1, { codigo_postal: 6000, cp_fiscal: "1234" }));
    expect(r.fila).toMatchObject({ codigo_postal: "06000", cp_fiscal: "01234" });
    expect(r.advertencias).toEqual([]);
    expect(prepararFilaEmpleado(base(1, { codigo_postal: "123" })).advertencias[0].campo).toBe("codigo_postal");
  });

  it("catálogos: sin acentos ni mayúsculas, guarda el nombre canónico (y alias comunes)", () => {
    const r = prepararFilaEmpleado(base(1, {
      genero: "FEMENINO", estado_civil: "union libre", escolaridad: "preparatoria / bachillerato", tipo_contrato: "indeterminado",
      estado_nacimiento: "queretaro", estado_residencia: "CDMX", banco: "bbva mexico", estatus: "SUSPENDIDO",
    }));
    expect(r.advertencias).toEqual([]);
    expect(r.fila).toMatchObject({
      genero: "Femenino", estado_civil: "Unión libre", escolaridad: "Preparatoria / Bachillerato", tipo_contrato: "Indeterminado",
      estado_nacimiento: "Querétaro", estado_residencia: "Ciudad de México", banco: "BBVA México", estatus: "suspendido",
    });
    expect(prepararFilaEmpleado(base(1, { banco: "Banamex", escolaridad: "Prepa" })).fila).toMatchObject({ banco: "Citibanamex", escolaridad: "Preparatoria / Bachillerato" });
  });

  it("NUL en un campo opcional (F-IMP-1) es advertencia, nunca error 500; también en puesto, departamento, ubicación y jefe", () => {
    const campos = ["calle", "puesto", "departamento", "ubicacion", "jefe_nomina", "motivo_baja", "genero", "parentesco_emergencia"];
    const r = prepararFilaEmpleado(base(1, Object.fromEntries(campos.map((c) => [c, "a\u0000b"]))));
    expect(r.error).toBeUndefined();
    expect(r.advertencias.map((a) => a.campo).sort()).toEqual([...campos].sort());
    for (const a of r.advertencias) expect(a.valor_recibido === null || !a.valor_recibido.includes("\u0000")).toBe(true);
    for (const c of campos) expect(r.fila[c]).toBe("");
    expect(prepararFilaEmpleado(base(1, { jefe_curp: "x\u0000" })).advertencias[0]).toMatchObject({ campo: "jefe_curp", valor_recibido: null });
  });

  it("valores no convertibles (objetos) en campos opcionales son advertencia", () => {
    const r = prepararFilaEmpleado(base(1, { calle: [1], puesto: {} }));
    expect(r.error).toBeUndefined();
    expect(r.advertencias.map((a) => a.campo).sort()).toEqual(["calle", "puesto"]);
  });

  it("nombresUnicos no devuelve textos con NUL (no llegan a ninguna consulta)", () => {
    expect(nombresUnicos([{ puesto: "A\u0000" }, { puesto: "Ok" }, { puesto: "ok" }], "puesto")).toEqual(["ok"]);
  });
});

describe("Empleado.importarLote - modo omitir", () => {
  it("inserta TODAS las columnas del expediente, resuelve puesto, departamento y ubicación por nombre sin acentos", async () => {
    const bd = simularBd();
    const completa = base(1, {
      apellido_materno: "Muestra", fecha_nacimiento: "1990-01-01", curp: CURP(1), rfc: "XXXX000101XX1", nss: "01234567890",
      genero: "Femenino", estado_civil: "Soltero", escolaridad: "Licenciatura", estado_nacimiento: "Jalisco",
      celular_personal: "5512345678", correo_personal: "ana@ejemplo.com", telefono_emergencia: "5587654321",
      parentesco_emergencia: "Madre", contacto_emergencia: "Rosa", calle: "Calle 1", colonia: "Centro", codigo_postal: "06000",
      municipio: "Cuauhtémoc", estado_residencia: "Ciudad de México", numero_nomina: "N-1", fecha_imss: "2024-01-01",
      fecha_ingreso: "2024-01-02", fecha_renovacion: "2025-01-02", tipo_contrato: "Determinado", celular_corporativo: "5511112222",
      infonavit: "INF1", fonacot: "FON1", puesto: "ANALISTA", departamento: "tecnologías de la información", ubicacion: "planta norte",
      banco: "Banorte", clabe: "072345678901234568", cp_fiscal: "06000", estatus: "baja", fecha_baja: "2026-01-01", motivo_baja: "Prueba",
    });
    const r = await Empleado.importarLote([completa], mapas());
    expect(r).toMatchObject({ insertados: 1, actualizados: 0, errores: [], advertencias: [], duplicados: 0, jefes_pendientes: [] });
    const e = bd.estado.empleados[0];
    expect(e).toMatchObject({
      nombre: "Ana1", curp: CURP(1), estado_nacimiento: "Jalisco", calle: "Calle 1", cp_fiscal: "06000", banco: "Banorte",
      puesto_id: 7, departamento_id: 3, ubicacion_id: 2, estatus: "baja", fecha_baja: "2026-01-01", fecha_imss: "2024-01-01",
    });
    expect(Object.keys(e)).not.toContain("usuario_id_modificado");
    expect(r.sin_catalogo).toEqual({ puestos: [], departamentos: [], ubicaciones: [] });
  });

  it("estatus 'activo' por omisión y vacíos como NULL (no se guardan)", async () => {
    const bd = simularBd();
    await Empleado.importarLote([base(1, { fecha_nacimiento: "", fecha_ingreso: "  " })], mapas());
    expect(bd.estado.empleados[0].estatus).toBe("activo");
    expect(bd.estado.empleados[0].fecha_nacimiento).toBeUndefined();
  });

  it("fechas inválidas NO llegan a la BD: error por fila con número, nombre y motivo", async () => {
    const bd = simularBd();
    const r = await Empleado.importarLote([
      base(1, { fecha_ingreso: "45305.74958333333" }),
      base(2, { fecha_nacimiento: "15/01/2024" }),
      base(3, { fecha_imss: "2023-02-29" }),
      base(4, { fecha_ingreso: "2024-01-15" }),
    ], mapas());
    expect(bd.estado.empleados).toHaveLength(1);
    expect(r.insertados).toBe(1);
    expect(r.errores).toHaveLength(3);
    expect(r.errores[0]).toEqual({ fila: 2, nombre: "Ana1 Prueba", error: "Fecha de ingreso inválida (usa AAAA-MM-DD, año entre 1900 y 2100)" });
    expect(r.errores[1].error).toMatch(/^Fecha de nacimiento inválida/);
    expect(r.errores[2].error).toMatch(/^Fecha de alta IMSS inválida/);
  });

  it("advertencias con fila y nombre; la fila entra sin el campo inválido", async () => {
    const bd = simularBd();
    const r = await Empleado.importarLote([base(1, { numero_nomina: "N-1", rfc: "mal", celular_personal: "123", genero: "Femenino" })], mapas());
    expect(r.insertados).toBe(1);
    expect(bd.estado.empleados[0].rfc).toBeUndefined();
    expect(bd.estado.empleados[0].genero).toBe("Femenino");
    expect(r.advertencias).toEqual([
      { fila: 2, nombre: "Ana1 Prueba", campo: "rfc", valor_recibido: null, motivo: "formato inválido" },
      { fila: 2, nombre: "Ana1 Prueba", campo: "celular_personal", valor_recibido: "123", motivo: "teléfono inválido (deben ser 10 dígitos)" },
    ]);
  });

  it("limita las advertencias devueltas a 1000 por lote pero cuenta las omitidas", async () => {
    simularBd();
    const filas = Array.from({ length: 150 }, (_, i) => base(i, { numero_nomina: `N${i}`, celular_personal: "1", telefono_emergencia: "2", celular_corporativo: "3", codigo_postal: "x", cp_fiscal: "y", genero: "z", banco: "w", estatus: "v" }));
    const r = await Empleado.importarLote(filas, mapas());
    expect(r.advertencias).toHaveLength(1000);
    expect(r.advertencias_omitidas).toBe(150 * 8 - 1000);
  });

  it("duplicados con detalle: CURP existente, nómina existente y repetida en el archivo", async () => {
    simularBd({ empleados: [{ id: 1, nombre: "X", apellido_paterno: "Y", curp: CURP(1), numero_nomina: "N-1" }] });
    const r = await Empleado.importarLote([
      base(1, { curp: CURP(1).toLowerCase() }),
      base(2, { numero_nomina: "n-1" }),
      base(3, { curp: CURP(3), numero_nomina: "N-9" }),
      base(4, { curp: CURP(3).toLowerCase() }),
      base(5, { numero_nomina: "n-9" }),
    ], mapas());
    expect(r.insertados).toBe(1);
    expect(r.duplicados).toBe(4);
    expect(r.duplicados_detalle).toEqual([
      { fila: 2, nombre: "Ana1 Prueba", motivo: "CURP ya existe" },
      { fila: 3, nombre: "Ana2 Prueba", motivo: "Número de nómina ya existe" },
      { fila: 5, nombre: "Ana4 Prueba", motivo: "repetida en el archivo" },
      { fila: 6, nombre: "Ana5 Prueba", motivo: "repetida en el archivo" },
    ]);
  });

  it("sin N+1 de comprobación: UNA consulta de claves por lote (con ANY) y una transacción con candado", async () => {
    const bd = simularBd();
    await Empleado.importarLote(Array.from({ length: 50 }, (_, i) => base(i, { curp: CURP(i), numero_nomina: `N${i}` })), mapas());
    const busquedas = bd.estado.sentencias.filter((s) => /FROM empleados WHERE LOWER\(curp\) = ANY/.test(s.sql));
    expect(busquedas).toHaveLength(1);
    expect(busquedas[0].params[0]).toHaveLength(50);
    // la búsqueda incluye también la nómina sin ceros a la izquierda (posible duplicado '0101' vs '101')
    expect(busquedas[0].sql).toMatch(/OR LTRIM\(LOWER\(numero_nomina\), '0'\) = ANY\(\$3\)\s*ORDER BY id$/);
    expect(busquedas[0].params[2]).toHaveLength(50);
    expect(bd.estado.transacciones).toEqual({ begin: 1, commit: 1, rollback: 0 });
    expect(bd.estado.sentencias.some((s) => /SELECT LOWER\(curp\) AS curp FROM empleados WHERE curp IS NOT NULL/.test(s.sql))).toBe(false);
  });

  it("lote sin CURP ni nómina: no consulta empleados existentes", async () => {
    const bd = simularBd();
    await Empleado.importarLote([base(1), base(2)], mapas());
    expect(bd.estado.sentencias.filter((s) => /ANY/.test(s.sql))).toHaveLength(0);
  });

  it("limita el detalle de duplicados a 200 pero cuenta todos", async () => {
    simularBd({ empleados: [{ id: 1, nombre: "X", apellido_paterno: "Y", curp: CURP(1) }] });
    const filas = Array.from({ length: 200 }, (_, i) => base(i, { curp: CURP(1) }));
    filas.push(base(300, { curp: CURP(1) }));
    const r = await Empleado.importarLote(filas, mapas());
    expect(r.duplicados).toBe(201);
    expect(r.duplicados_detalle).toHaveLength(200);
  });

  it("un fallo inesperado de la BD en una fila no filtra su texto, se registra y no aborta las demás", async () => {
    simularBd({ fallaEn: (q, p) => /^INSERT INTO empleados/.test(q) && p[0] === "Ana2" });
    const r = await Empleado.importarLote([base(1), base(2), base(3)], mapas());
    expect(r.insertados).toBe(2);
    expect(r.errores).toEqual([{ fila: 3, nombre: "Ana2 Prueba", error: "No se pudo guardar la fila" }]);
    expect(JSON.stringify(r)).not.toMatch(/PostgreSQL|invalid input|syntax/i);
    expect(console.error).toHaveBeenCalled();
  });

  it("guarda el modo omitir aunque se pida 'actualizar' con otro valor desconocido", async () => {
    const bd = simularBd({ empleados: [{ id: 1, nombre: "X", apellido_paterno: "Y", curp: CURP(1) }] });
    const r = await Empleado.importarLote([base(1, { curp: CURP(1), genero: "Femenino" })], mapas(), { modo: "otro" });
    expect(r.duplicados).toBe(1);
    expect(bd.estado.empleados[0].genero).toBeUndefined();
  });
});

describe("Empleado.importarLote - catálogos fuera del catálogo", () => {
  it("guarda sin el dato pero informa nombre y filas afectadas (solo insertadas; máx. 100 nombres)", async () => {
    const bd = simularBd();
    const r = await Empleado.importarLote([
      base(1, { puesto: "Analista", departamento: "Tecnologías de la Información", ubicacion: "Planta Norte" }),
      base(2, { puesto: "Chofer", departamento: "Logística", ubicacion: "Bodega" }),
      base(3, { puesto: "chofer", departamento: "LOGÍSTICA", ubicacion: "bodega" }),
      base(4, { puesto: "Chofer", fecha_ingreso: "31/02/2024" }), // error: no cuenta
      base(5, { departamento: "Reparto" }),
    ], mapas());
    expect(r.insertados).toBe(4);
    expect(bd.estado.empleados[0]).toMatchObject({ puesto_id: 7, departamento_id: 3, ubicacion_id: 2 });
    expect(bd.estado.empleados[1].puesto_id).toBeUndefined();
    expect(r.sin_catalogo).toEqual({
      puestos: [{ nombre: "Chofer", filas: 2 }],
      departamentos: [{ nombre: "Logística", filas: 2 }, { nombre: "Reparto", filas: 1 }],
      ubicaciones: [{ nombre: "Bodega", filas: 2 }],
    });
    const muchos = Array.from({ length: 150 }, (_, i) => base(i, { puesto: `Puesto${i}` }));
    const r2 = await Empleado.importarLote(muchos, mapas());
    expect(r2.sin_catalogo.puestos).toHaveLength(100);
  });
});

describe("Empleado.importarLote - modo actualizar", () => {
  const existentes = () => [
    { id: 1, usuario_id: 77, nombre: "Ana", apellido_paterno: "Vieja", curp: CURP(1), numero_nomina: "N-1", genero: "Femenino", calle: "Calle Vieja", puesto_id: 7, fecha_ingreso: "2020-01-01" },
    { id: 2, usuario_id: null, nombre: "Beto", apellido_paterno: "Sin Nomina", curp: CURP(2), numero_nomina: null },
    { id: 3, usuario_id: null, nombre: "Carla", apellido_paterno: "Sin Curp", curp: null, numero_nomina: "N-3" },
  ];
  const actualizar = (filas) => Empleado.importarLote(filas, mapas(), { modo: "actualizar" });

  it("coincide por CURP, sobrescribe solo celdas con valor y NUNCA borra con celdas vacías; no toca usuario_id", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([{
      _fila: 2, nombre: "Ana", apellido_paterno: "Nueva", curp: CURP(1).toLowerCase(), calle: "Calle Nueva", genero: "", colonia: "Centro",
      fecha_ingreso: "2021-05-05", puesto: "Jefe de Área", numero_nomina: "",
    }]);
    expect(r).toMatchObject({ insertados: 0, actualizados: 1, sin_cambios: 0, errores: [], duplicados: 0 });
    expect(r.actualizados_detalle).toEqual([{ fila: 2, nombre: "Ana Nueva", campos: 5 }]); // apellido, calle, colonia, fecha_ingreso, puesto_id
    expect(bd.estado.empleados[0]).toMatchObject({
      usuario_id: 77, apellido_paterno: "Nueva", calle: "Calle Nueva", colonia: "Centro", genero: "Femenino", numero_nomina: "N-1",
      fecha_ingreso: "2021-05-05", puesto_id: 8,
    });
    expect(JSON.stringify(r.actualizados_detalle)).not.toMatch(/Calle Nueva|2021/); // solo el número de campos
  });

  it("sin_cambios cuando el archivo trae los mismos valores", async () => {
    simularBd({ empleados: existentes() });
    const r = await actualizar([{ _fila: 2, nombre: "Ana", apellido_paterno: "Vieja", curp: CURP(1), genero: "femenino", calle: "Calle Vieja", fecha_ingreso: "2020-01-01", puesto: "analista" }]);
    expect(r).toMatchObject({ actualizados: 0, sin_cambios: 1 });
  });

  it("rellena número de nómina (por CURP) y CURP (por nómina) cuando el empleado no los tiene", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([
      base(1, { nombre: "Beto", apellido_paterno: "Sin Nomina", curp: CURP(2), numero_nomina: "N-2" }),
      base(2, { nombre: "Carla", apellido_paterno: "Sin Curp", curp: CURP(3), numero_nomina: "n-3" }),
    ]);
    expect(r).toMatchObject({ actualizados: 2, errores: [] });
    expect(bd.estado.empleados[1].numero_nomina).toBe("N-2");
    expect(bd.estado.empleados[2].curp).toBe(CURP(3));
    expect(bd.estado.empleados[2].numero_nomina).toBe("N-3"); // misma nómina en otra capitalización: no se cambia
  });

  it("sin CURP en la fila coincide por número de nómina", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([base(1, { nombre: "Carla", apellido_paterno: "Sin Curp", numero_nomina: "N-3", genero: "Femenino" })]);
    expect(r.actualizados).toBe(1);
    expect(bd.estado.empleados[2].genero).toBe("Femenino");
  });

  it("conflictos: otra nómina, otra CURP y CURP de A con nómina de B -> error de la fila, sin modificar", async () => {
    const bd = simularBd({ empleados: existentes() });
    const antes = JSON.stringify(bd.estado.empleados);
    const r = await actualizar([
      base(1, { curp: CURP(1), numero_nomina: "N-OTRA", calle: "X" }),
      base(2, { curp: CURP(9), numero_nomina: "N-1", calle: "X" }),
      base(3, { curp: CURP(1), numero_nomina: "N-3", calle: "X" }),
    ]);
    expect(r.actualizados).toBe(0);
    expect(r.errores.map((e) => e.error)).toEqual([
      "Conflicto: el empleado con esa CURP ya tiene otro número de nómina; no se sobrescribe",
      "Conflicto: el empleado con ese número de nómina ya tiene otra CURP; no se sobrescribe",
      "Conflicto: la CURP corresponde a un empleado y el número de nómina a otro; no se modificó ninguno",
    ]);
    expect(JSON.stringify(bd.estado.empleados)).toBe(antes);
    expect(JSON.stringify(r.errores)).not.toContain(CURP(1));
  });

  it("inserta los que no existen y la segunda aparición en el mismo lote es 'repetida en el archivo'", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([
      base(1, { curp: CURP(50), numero_nomina: "N-50" }),
      base(2, { curp: CURP(50) }),
      base(3, { curp: CURP(1), genero: "Otro" }),
      base(4, { curp: CURP(1), genero: "Masculino" }),
    ]);
    expect(r).toMatchObject({ insertados: 1, actualizados: 1, duplicados: 2 });
    expect(r.duplicados_detalle.map((d) => d.motivo)).toEqual(["repetida en el archivo", "repetida en el archivo"]);
    expect(bd.estado.empleados.find((e) => e.id === 1).genero).toBe("Otro");
  });

  it("una transacción por lote: COMMIT al terminar y la conexión se libera", async () => {
    const bd = simularBd({ empleados: existentes() });
    await actualizar([base(1, { curp: CURP(1), calle: "Z" })]);
    expect(bd.estado.transacciones).toEqual({ begin: 1, commit: 1, rollback: 0 });
    expect(bd.estado.liberados).toBe(1);
  });

  it("un SQL inesperado revierte SOLO esa fila (SAVEPOINT), se reporta con texto genérico y el lote se confirma (M9)", async () => {
    const bd = simularBd({
      empleados: existentes(),
      fallaEn: (q, p) => /^UPDATE empleados SET/.test(q) && p.includes("Falla"),
    });
    const r = await actualizar([
      base(1, { curp: CURP(60) }), // alta
      base(2, { curp: CURP(1), calle: "Cambio ok" }),
      base(3, { curp: CURP(2), calle: "Falla" }),
    ]);
    expect(r).toMatchObject({ insertados: 1, actualizados: 1 });
    expect(r.errores).toEqual([{ fila: 4, nombre: "Ana3 Prueba", error: "No se pudo guardar la fila" }]);
    expect(JSON.stringify(r)).not.toMatch(/PostgreSQL|simulado/);
    expect(bd.estado.empleados.find((e) => e.id === 1).calle).toBe("Cambio ok");
    expect(bd.estado.empleados.find((e) => e.id === 2).calle).toBeUndefined();
    expect(bd.estado.empleados.some((e) => e.curp === CURP(60))).toBe(true);
    expect(bd.estado.transacciones).toEqual({ begin: 1, commit: 1, rollback: 0 });
    expect(bd.estado.liberados).toBe(1);
  });

  it("si falla el BEGIN o el candado (no una fila) el lote entero se deshace y el error se propaga", async () => {
    const bd = simularBd({ empleados: existentes(), fallaEn: (q) => /^SELECT .* FROM empleados WHERE LOWER\(curp\)/.test(q) });
    await expect(actualizar([base(1, { curp: CURP(1), calle: "X" })])).rejects.toThrow();
    expect(bd.estado.transacciones).toEqual({ begin: 1, commit: 0, rollback: 1 });
    expect(bd.estado.liberados).toBe(1);
  });

  it("los errores de validación por fila no abortan el lote", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([base(1, { curp: CURP(1), calle: "A", fecha_ingreso: "xx" }), base(2, { curp: CURP(1), calle: "B" })]);
    expect(r).toMatchObject({ actualizados: 1 });
    expect(r.errores).toHaveLength(1);
    expect(bd.estado.transacciones.commit).toBe(1);
  });

  it("A3: en modo actualizar se IGNORAN estatus, fecha_baja y motivo_baja con una advertencia por fila (no reactiva ni da de baja)", async () => {
    const bd = simularBd({ empleados: [
      { id: 1, nombre: "Ana", apellido_paterno: "A", curp: CURP(1), estatus: "baja", fecha_baja: "2026-01-01", motivo_baja: "Renuncia" },
      { id: 2, nombre: "Beto", apellido_paterno: "B", curp: CURP(2), estatus: "activo" },
    ] });
    const r = await actualizar([
      { _fila: 2, nombre: "Ana", apellido_paterno: "A", curp: CURP(1), estatus: "Activo", calle: "Nueva" },
      { _fila: 3, nombre: "Beto", apellido_paterno: "B", curp: CURP(2), estatus: "baja", fecha_baja: "2026-03-01", motivo_baja: "X" },
      { _fila: 4, nombre: "Beto", apellido_paterno: "B", curp: CURP(2), calle: "otra" },
    ]);
    expect(bd.estado.empleados[0]).toMatchObject({ estatus: "baja", fecha_baja: "2026-01-01", motivo_baja: "Renuncia", calle: "Nueva" });
    expect(bd.estado.empleados[1].estatus).toBe("activo");
    expect(bd.estado.empleados[1].fecha_baja).toBeUndefined();
    expect(r.actualizados).toBe(1);
    expect(r.sin_cambios).toBe(1);
    expect(r.advertencias.map((a) => [a.fila, a.campo, a.motivo])).toEqual([
      [2, "estatus", expect.stringMatching(/pantalla de Empleados/)], [3, "estatus", expect.stringMatching(/pantalla de Empleados/)],
    ]);
  });

  it("A3: al CREAR se respetan estatus y baja; una baja sin fecha se crea como activo con advertencia; fecha de baja sin estatus baja se ignora", async () => {
    const bd = simularBd();
    const r = await Empleado.importarLote([
      base(1, { curp: CURP(1), estatus: "baja", fecha_baja: "2026-03-01", motivo_baja: "Renuncia" }),
      base(2, { curp: CURP(2), estatus: "baja" }),
      base(3, { curp: CURP(3), estatus: "suspendido" }),
      base(4, { curp: CURP(4), fecha_baja: "2026-03-01", motivo_baja: "X" }),
    ], mapas());
    expect(r.insertados).toBe(4);
    const por = (c) => bd.estado.empleados.find((e) => e.curp === c);
    expect(por(CURP(1))).toMatchObject({ estatus: "baja", fecha_baja: "2026-03-01", motivo_baja: "Renuncia" });
    expect(por(CURP(2)).estatus).toBe("activo");
    expect(por(CURP(3)).estatus).toBe("suspendido");
    expect(por(CURP(4)).fecha_baja).toBeUndefined();
    expect(r.advertencias.map((a) => a.fila)).toEqual([3, 5]);
  });

  it("puesto no encontrado en una actualización: se conserva el anterior y se avisa en sin_catalogo", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([{ _fila: 2, nombre: "Ana", apellido_paterno: "Vieja", curp: CURP(1), puesto: "Inexistente", ubicacion: "Nada" }]);
    expect(r.actualizados).toBe(0);
    expect(r.sin_cambios).toBe(1);
    expect(bd.estado.empleados[0].puesto_id).toBe(7);
    expect(r.sin_catalogo.puestos).toEqual([{ nombre: "Inexistente", filas: 1 }]);
    expect(r.sin_catalogo.ubicaciones).toEqual([{ nombre: "Nada", filas: 1 }]);
  });
});

describe("integridad del modo actualizar (carga real de empleados)", () => {
  const nombre = { nombre: "Ana", apellido_paterno: "Vieja" };
  const existentes = () => [
    { id: 1, ...nombre, curp: CURP(1), numero_nomina: "101", nss: "11111111111", clabe: "000000000000000001", estatus: "activo" },
    { id: 2, nombre: "Beto", apellido_paterno: "B", curp: CURP(2), numero_nomina: "7", estatus: "activo" },
  ];
  const actualizar = (filas) => Empleado.importarLote(filas, mapas(), { modo: "actualizar" });
  const omitir = (filas) => Empleado.importarLote(filas, mapas(), { modo: "omitir" });
  const sinTocar = (bd, antes) => expect(JSON.stringify(bd.estado.empleados)).toBe(antes);

  it("A1: CURP de 17 caracteres o con un error NO inserta ni actualiza (71 se queda en 71) en ambos modos", async () => {
    const bd = simularBd({ empleados: existentes() });
    const antes = JSON.stringify(bd.estado.empleados);
    for (const f of [actualizar, omitir]) {
      const r = await f([{ _fila: 2, ...nombre, curp: CURP(1).slice(0, 17), calle: "X" }, { _fila: 3, ...nombre, curp: `${CURP(1)}Z`, numero_nomina: "101", calle: "X" }]);
      expect(r).toMatchObject({ insertados: 0, actualizados: 0, duplicados: 0 });
      expect(r.errores.map((e) => e.error)).toEqual(Array(2).fill("CURP inválida: no se puede identificar al empleado"));
    }
    sinTocar(bd, antes);
    expect(bd.estado.sentencias.filter((s) => /^(INSERT|UPDATE)/.test(s.sql))).toHaveLength(0);
  });

  it("A1: en modo actualizar una fila sin CURP ni nómina es ERROR 'sin identificador' y NUNCA se inserta", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([{ _fila: 2, ...nombre, calle: "X" }, { _fila: 3, ...nombre, numero_nomina: "   ", curp: "  " }]);
    expect(r).toMatchObject({ insertados: 0, actualizados: 0 });
    expect(r.errores).toHaveLength(2);
    expect(r.errores[0].error).toMatch(/^Sin identificador/);
    expect(bd.estado.empleados).toHaveLength(2);
  });

  it("A1: en modo omitir/crear sin CURP ni nómina SÍ se crea, con la advertencia de que reimportar duplicará", async () => {
    const bd = simularBd();
    const r = await omitir([{ _fila: 2, ...nombre }]);
    expect(r.insertados).toBe(1);
    expect(bd.estado.empleados).toHaveLength(1);
    expect(r.advertencias).toEqual([{ fila: 2, nombre: "Ana Vieja", campo: "numero_nomina", valor_recibido: null, motivo: expect.stringMatching(/sin CURP ni número de nómina.*duplicará/) }]);
  });

  it("A1: nómina con un cero de más o de menos ('0101' vs '101', '007' vs '7') = posible duplicado: ERROR, no inserta ni actualiza, en ambos modos", async () => {
    const bd = simularBd({ empleados: existentes() });
    const antes = JSON.stringify(bd.estado.empleados);
    for (const f of [actualizar, omitir]) {
      const r = await f([
        { _fila: 2, ...nombre, numero_nomina: "0101", calle: "X" },
        { _fila: 3, nombre: "Beto", apellido_paterno: "B", numero_nomina: "007", calle: "X" },
        { _fila: 4, nombre: "Otro", apellido_paterno: "C", numero_nomina: "00101" },
      ]);
      expect(r).toMatchObject({ insertados: 0, actualizados: 0, duplicados: 0 });
      expect(r.errores.map((e) => e.error)).toEqual(Array(3).fill(expect.stringMatching(/^Posible duplicado.*ceros a la izquierda/)));
    }
    sinTocar(bd, antes);
  });

  it("A1: la nómina exacta sigue funcionando (con espacios y con '.0' de Excel) y no es 'posible duplicado'", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([{ _fila: 2, ...nombre, numero_nomina: " 101.0 ", calle: "Nueva" }, { _fila: 3, nombre: "Beto", apellido_paterno: "B", numero_nomina: 7, calle: "Otra" }]);
    expect(r).toMatchObject({ actualizados: 2, errores: [] });
    expect(bd.estado.empleados[0].calle).toBe("Nueva");
  });

  it("R-2: nómina con espacio interno o caracteres no permitidos = ERROR; '700 002' sin CURP NO crea un duplicado de '700002'", async () => {
    const bd = simularBd({ empleados: [{ id: 1, nombre: "Ana", apellido_paterno: "Vieja", numero_nomina: "700002", estatus: "activo" }] });
    for (const f of [actualizar, omitir]) {
      const r = await f([{ _fila: 2, ...nombre, numero_nomina: "700 002", calle: "X" }, { _fila: 3, ...nombre, numero_nomina: "7000#2" }, { _fila: 4, ...nombre, numero_nomina: "70\t0002" }]);
      expect(r).toMatchObject({ insertados: 0, actualizados: 0 });
      expect(r.errores.map((e) => e.error)).toEqual([
        "Número de nómina inválido: contiene espacios",
        "Número de nómina inválido: solo se permiten letras, dígitos, guion, guion bajo y punto",
        "Número de nómina inválido: contiene espacios",
      ]);
    }
    expect(bd.estado.empleados).toHaveLength(1);
    expect(prepararFilaEmpleado(base(1, { numero_nomina: "A-1_b.2" })).error).toBeUndefined();
    expect(prepararFilaEmpleado(base(1, { jefe_nomina: "7 2" })).advertencias[0]).toMatchObject({ campo: "jefe_nomina", motivo: expect.stringMatching(/contiene espacios/) });
    expect(prepararFilaEmpleado(base(1, { jefe_nomina: "7 2" })).fila.jefe_nomina).toBe("");
    expect(validarParesJefes([{ empleado_id: 1, jefe_nomina: "7 2" }, { empleado_id: 2, jefe_nomina: "7-2" }]).validos).toEqual([{ empleado_id: 2, fila: null, jefe_nomina: "7-2", jefe_curp: "" }]);
  });

  it("A1: posible duplicado también entre filas del mismo lote ('N-1' no choca con 'N-01'; '0050' después de '50' sí)", async () => {
    simularBd();
    const r = await omitir([base(1, { numero_nomina: "50" }), base(2, { numero_nomina: "0050" }), base(3, { numero_nomina: "N-1" }), base(4, { numero_nomina: "N-01" })]);
    expect(r.insertados).toBe(3);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toMatchObject({ fila: 3, error: expect.stringMatching(/^Posible duplicado/) });
  });

  it("M2: una CURP o nómina que coincide con VARIOS empleados es ERROR (nunca se elige uno), en ambos modos", async () => {
    const bd = simularBd({ empleados: [
      ...existentes(),
      { id: 3, nombre: "Dup", apellido_paterno: "A", curp: CURP(1), numero_nomina: "900" },
      { id: 4, nombre: "Dup", apellido_paterno: "B", curp: CURP(4), numero_nomina: "7" },
    ] });
    const antes = JSON.stringify(bd.estado.empleados);
    for (const f of [actualizar, omitir]) {
      const r = await f([{ _fila: 2, ...nombre, curp: CURP(1), calle: "X" }, { _fila: 3, ...nombre, numero_nomina: "7", calle: "X" }]);
      expect(r).toMatchObject({ actualizados: 0, duplicados: 0, insertados: 0 });
      expect(r.errores.map((e) => e.error)).toEqual([
        "La CURP coincide con 2 empleados; resuelve el duplicado antes de importar",
        "El número de nómina coincide con 2 empleados; resuelve el duplicado antes de importar",
      ]);
    }
    sinTocar(bd, antes);
  });

  it("A2: NSS de 10 dígitos o CLABE corta NO pisan el valor existente (se omiten con advertencia); uno válido sí actualiza", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([
      { _fila: 2, ...nombre, curp: CURP(1), nss: "2222222222", clabe: "12345" },
      { _fila: 3, ...nombre, curp: CURP(1), nss: "22222222222" },
    ]);
    expect(r.advertencias.map((a) => [a.fila, a.campo, a.valor_recibido])).toEqual([[2, "nss", null], [2, "clabe", null]]);
    expect(r).toMatchObject({ actualizados: 0, sin_cambios: 1, duplicados: 1 }); // la 2.ª fila del mismo empleado es repetida
    expect(bd.estado.empleados[0]).toMatchObject({ nss: "11111111111", clabe: "000000000000000001" });
  });

  it("A2: una celda numérica de 16+ dígitos (_precision) en clabe no pisa la CLABE existente", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([{ _fila: 2, ...nombre, curp: CURP(1), clabe: "123456789012345000", _precision: ["clabe"] }]);
    expect(r.advertencias[0]).toMatchObject({ campo: "clabe", motivo: expect.stringMatching(/Texto/) });
    expect(bd.estado.empleados[0].clabe).toBe("000000000000000001");
  });

  it("M1: cada transacción de lote (omitir y actualizar) toma el candado de importación ANTES de leer el estado", async () => {
    for (const modo of ["omitir", "actualizar"]) {
      const bd = simularBd({ empleados: existentes() });
      await Empleado.importarLote([base(1, { curp: CURP(1) })], mapas(), { modo });
      const sql = bd.estado.sentencias.map((s) => s.sql);
      expect(sql[0]).toBe("BEGIN");
      expect(sql[1]).toBe("SET LOCAL lock_timeout = '3s'"); // R-3: la espera por el candado tiene límite
      expect(sql[2]).toMatch(/^SELECT pg_advisory_xact_lock/);
      expect(bd.estado.candados).toEqual([[4410, 1]]);
      expect(sql.findIndex((x) => /FROM empleados WHERE LOWER\(curp\)/.test(x))).toBeGreaterThan(2);
    }
    const bd = simularBd({ empleados: [
      { id: 1, nombre: "A", apellido_paterno: "A", curp: CURP(1), numero_nomina: "N1" },
    ] });
    await Empleado.asignarJefes([{ empleado_id: 1, fila: 2, jefe_nomina: "N1", jefe_curp: "" }]);
    expect(bd.estado.candados).toEqual([[4410, 1]]); // la segunda pasada toma el MISMO candado
  });

  it("M1: las escrituras van en orden determinista (actualizaciones por id, altas por clave) sea cual sea el orden del archivo", async () => {
    const filas = [
      { _fila: 2, nombre: "Beto", apellido_paterno: "B", curp: CURP(2), calle: "b" },
      { _fila: 3, nombre: "Ana", apellido_paterno: "Vieja", curp: CURP(1), calle: "a" },
      base(7, { curp: CURP(70) }), base(5, { curp: CURP(50) }), base(6, { curp: CURP(60) }),
    ];
    const ordenes = [];
    for (const lista of [filas, [...filas].reverse()]) {
      const bd = simularBd({ empleados: existentes() });
      const r = await actualizar(lista);
      expect(r).toMatchObject({ actualizados: 2, insertados: 3, errores: [] });
      ordenes.push(bd.estado.sentencias.filter((s) => /^(INSERT|UPDATE)/.test(s.sql)).map((s) => `${s.sql.slice(0, 6)}${JSON.stringify(s.params)}`));
    }
    expect(ordenes[0]).toEqual(ordenes[1]);
    expect(ordenes[0][0]).toMatch(/^UPDATE.*"a",1\]/); // la actualización del id 1 va antes que la del id 2
  });

  it("los resultados salen en el orden del archivo aunque se escriba en otro orden", async () => {
    simularBd({ empleados: existentes() });
    const r = await actualizar([
      { _fila: 9, nombre: "Beto", apellido_paterno: "B", curp: CURP(2), calle: "b" },
      { _fila: 5, nombre: "Ana", apellido_paterno: "Vieja", curp: CURP(1), calle: "a" },
      { _fila: 3, nombre: "Z", apellido_paterno: "Z", numero_nomina: "" },
    ]);
    expect(r.actualizados_detalle.map((d) => d.fila)).toEqual([5, 9]);
    expect(r.errores[0].fila).toBe(3);
  });

  it("F-IE-6: el log de una fila con error SQL no imprime la fila: solo número, SQLSTATE y constraint", async () => {
    simularBd({
      fallaEn: (q) => { if (/^INSERT INTO empleados/.test(q)) { const e = new Error('invalid input syntax for type date: "SECRETO-PRIVADO"'); e.code = "22007"; e.constraint = "c_x"; e.detail = "Key (curp)=(XXXX000101HXXXXXX0) ya existe"; throw e; } return false; },
    });
    await omitir([base(1, { calle: "Calle Privada 99", curp: CURP(1) })]);
    const log = console.error.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(log).toMatch(/fila 2: tipo=Error código=22007 constraint=c_x/);
    expect(log).not.toMatch(/SECRETO|Privada|XXXX0001|Ana1|ya existe/);
  });
});

describe("jefe inmediato: pares pendientes y segunda pasada", () => {
  const equipo = () => [
    { id: 1, nombre: "Ana", apellido_paterno: "A", curp: CURP(1), numero_nomina: "N1" },
    { id: 2, nombre: "Beto", apellido_paterno: "B", curp: CURP(2), numero_nomina: "N2" },
    { id: 3, nombre: "Carla", apellido_paterno: "C", curp: CURP(3), numero_nomina: "N3" },
    { id: 4, nombre: "Dora", apellido_paterno: "D", curp: CURP(4), numero_nomina: "N4" },
  ];
  const par = (empleado_id, jefe_nomina = "", jefe_curp = "", fila = empleado_id + 1) => ({ empleado_id, fila, jefe_nomina, jefe_curp });
  const jefeDe = (bd, id) => bd.estado.empleados.find((e) => e.id === id).jefe_inmediato_id || null;

  it("importarLote devuelve los pares (empleado_id, jefe por nómina o CURP) y no asigna el jefe todavía", async () => {
    const bd = simularBd();
    const r = await Empleado.importarLote([
      base(1, { curp: CURP(1), numero_nomina: "N1" }),
      base(2, { curp: CURP(2), jefe_nomina: "N1" }),
      base(3, { curp: CURP(3), jefe_curp: CURP(1).toLowerCase() }),
    ], mapas());
    expect(r.jefes_pendientes).toEqual([
      { empleado_id: 2, fila: 3, jefe_nomina: "N1", jefe_curp: "" },
      { empleado_id: 3, fila: 4, jefe_nomina: "", jefe_curp: CURP(1) },
    ]);
    expect(r.jefes).toEqual({ pendientes: 2 });
    expect(bd.estado.empleados.every((e) => !e.jefe_inmediato_id)).toBe(true);
    expect(bd.estado.sentencias.filter((x) => /^(INSERT|UPDATE)/.test(x.sql)).some((x) => /jefe_inmediato_id/.test(x.sql))).toBe(false);
  });

  it("las filas duplicadas (modo omitir) y con error no generan pares", async () => {
    simularBd({ empleados: equipo() });
    const r = await Empleado.importarLote([
      base(1, { curp: CURP(1), jefe_nomina: "N2" }), base(2, { fecha_ingreso: "xx", jefe_nomina: "N2" }),
    ], mapas());
    expect(r.jefes_pendientes).toEqual([]);
  });

  it("asigna por nómina o CURP (incluso un jefe que llegó en un lote anterior), por la BD completa", async () => {
    const bd = simularBd({ empleados: equipo() });
    const r = await Empleado.asignarJefes([par(2, "n1"), par(3, "", CURP(1).toLowerCase()), par(4, "N2", CURP(2))]);
    expect(r).toMatchObject({ asignados: 3, no_encontrados: 0, ciclos: 0, conflictos: 0, advertencias: [] });
    expect([jefeDe(bd, 2), jefeDe(bd, 3), jefeDe(bd, 4)]).toEqual([1, 1, 2]);
    expect(bd.estado.transacciones).toEqual({ begin: 1, commit: 1, rollback: 0 });
  });

  it("jefe no encontrado, auto-referencia y contradicción nómina/CURP: advertencia y sin asignar", async () => {
    const bd = simularBd({ empleados: equipo() });
    const r = await Empleado.asignarJefes([par(2, "NOEXISTE"), par(3, "", "ZZZZ00000000000000"), par(4, "N4"), par(1, "N2", CURP(3))]);
    expect(r).toMatchObject({ asignados: 0, no_encontrados: 2, ciclos: 1, conflictos: 1 });
    expect(bd.estado.empleados.every((e) => !e.jefe_inmediato_id)).toBe(true);
    const motivos = r.advertencias.map((a) => a.motivo);
    expect(motivos[0]).toMatch(/número de nómina de jefe/);
    expect(motivos[1]).toMatch(/esa CURP de jefe/);
    expect(motivos[2]).toMatch(/propio jefe/);
    expect(motivos[3]).toMatch(/corresponden a empleados distintos/);
    expect(r.advertencias[0]).toMatchObject({ fila: 3, nombre: "Beto B", campo: "jefe", valor_recibido: "NOEXISTE" });
    expect(r.advertencias[1].valor_recibido).toBeNull(); // CURP: sin mostrar el valor
  });

  it("ciclo directo (A->B->A) y largo (A->B->C->A): ninguno de sus miembros queda asignado; el resto sí", async () => {
    const bd = simularBd({ empleados: equipo() });
    const r = await Empleado.asignarJefes([par(1, "N2"), par(2, "N3"), par(3, "N1"), par(4, "N1")]);
    expect(r).toMatchObject({ asignados: 1, ciclos: 3 });
    expect([jefeDe(bd, 1), jefeDe(bd, 2), jefeDe(bd, 3), jefeDe(bd, 4)]).toEqual([null, null, null, 1]);
    const directo = simularBd({ empleados: equipo() });
    const r2 = await Empleado.asignarJefes([par(1, "N2"), par(2, "N1")]);
    expect(r2).toMatchObject({ asignados: 0, ciclos: 2 });
    expect(directo.estado.empleados.every((e) => !e.jefe_inmediato_id)).toBe(true);
  });

  it("el ciclo también se detecta contra jefes que ya estaban en la BD", async () => {
    const e = equipo();
    e[1].jefe_inmediato_id = 1; // B ya tiene como jefe a A
    e[2].jefe_inmediato_id = 2; // C ya tiene como jefe a B
    const bd = simularBd({ empleados: e });
    const r = await Empleado.asignarJefes([par(1, "N3")]); // A -> C cierra A->C->B->A
    expect(r).toMatchObject({ asignados: 0, ciclos: 1 });
    expect(jefeDe(bd, 1)).toBeNull();
    expect(jefeDe(bd, 2)).toBe(1); // lo existente no se toca
  });

  it("un empleado debajo de un ciclo ya existente no se bloquea; mismo jefe -> sin cambios", async () => {
    const e = equipo();
    e[3].jefe_inmediato_id = 2;
    const bd = simularBd({ empleados: e });
    const r = await Empleado.asignarJefes([par(4, "N2"), par(3, "N1")]);
    expect(r).toMatchObject({ asignados: 1, sin_cambios: 1, ciclos: 0 });
    expect(jefeDe(bd, 3)).toBe(1);
  });

  it("si falla el SQL hace ROLLBACK y propaga", async () => {
    const bd = simularBd({ empleados: equipo(), fallaEn: (q) => /^UPDATE empleados e SET jefe_inmediato_id/.test(q) });
    await expect(Empleado.asignarJefes([par(2, "N1")])).rejects.toThrow();
    expect(bd.estado.transacciones).toMatchObject({ rollback: 1, commit: 0 });
    expect(bd.estado.liberados).toBe(1);
  });

  it("M10: un jefe con estatus distinto de activo (baja, suspendido) NO se asigna: advertencia", async () => {
    const e = equipo();
    e[0].estatus = "baja"; e[2].estatus = "suspendido";
    const bd = simularBd({ empleados: e });
    const r = await Empleado.asignarJefes([par(2, "N1"), par(4, "N3"), par(1, "N4")]);
    expect(r).toMatchObject({ asignados: 1, no_activos: 2 });
    expect([jefeDe(bd, 2), jefeDe(bd, 4), jefeDe(bd, 1)]).toEqual([null, null, 4]);
    expect(r.advertencias.map((a) => a.motivo)).toEqual([expect.stringMatching(/no está activo/), expect.stringMatching(/no está activo/)]);
  });

  it("M2: un jefe por nómina o CURP que coincide con varios empleados es advertencia (ambiguo) y no se asigna", async () => {
    const e = equipo();
    e.push({ id: 5, nombre: "Eva", apellido_paterno: "E", curp: CURP(5), numero_nomina: "n1" }, { id: 6, nombre: "Fer", apellido_paterno: "F", curp: CURP(2), numero_nomina: "N6" });
    const bd = simularBd({ empleados: e });
    const r = await Empleado.asignarJefes([par(3, "N1"), par(4, "", CURP(2).toLowerCase()), par(1, "N6")]);
    expect(r).toMatchObject({ asignados: 1, ambiguos: 2 });
    expect([jefeDe(bd, 3), jefeDe(bd, 4), jefeDe(bd, 1)]).toEqual([null, null, 6]);
  });

  it("validarParesJefes descarta pares malformados y topa en 500", () => {
    expect(validarParesJefes(null).error).toBeTruthy();
    expect(validarParesJefes(Array.from({ length: 501 }, () => ({}))).error).toMatch(/Máximo 500/);
    const { validos } = validarParesJefes([
      { empleado_id: 1, fila: 3, jefe_nomina: " N1 " }, { empleado_id: "1", jefe_nomina: "N" }, { empleado_id: 2 },
      { empleado_id: 3, jefe_nomina: "a\u0000" }, { empleado_id: 4, jefe_curp: "x".repeat(19) }, null, { empleado_id: 5, jefe_curp: "C" },
    ]);
    expect(validos).toEqual([
      { empleado_id: 1, fila: 3, jefe_nomina: "N1", jefe_curp: "" }, { empleado_id: 5, fila: null, jefe_nomina: "", jefe_curp: "C" },
    ]);
  });
});

describe("R-3: una importación no puede congelar la intranet (lock_timeout, 409 y tope de importaciones simultáneas)", () => {
  const { MENSAJE_IMPORTACION_EN_CURSO, tomarCupoImportacion, MAX_IMPORTACIONES_SIMULTANEAS } = require("../utils/candadosImportacion");
  const bloqueo = () => Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
  const esCandado = (q) => /^SELECT pg_advisory_xact_lock/.test(q);
  const cuerpo409 = { exito: false, mensaje: "Hay otra importación en curso; el lote no se aplicó. Espera unos segundos y reintenta" };

  it("el mensaje 409 es el acordado", () => {
    expect(MENSAJE_IMPORTACION_EN_CURSO).toBe(cuerpo409.mensaje);
    expect(MAX_IMPORTACIONES_SIMULTANEAS).toBe(2);
  });

  it("lock_timeout vencido (55P03) en un lote de empleados: 409 con el mensaje, ROLLBACK, nada a medias y la conexión se libera", async () => {
    const bd = simularBd({ fallaEn: (q) => esCandado(q) && bloqueo() });
    const res = await request(app).post("/api/empleados/importar").send({ filas: [base(1, { curp: CURP(1) })], modo: "actualizar" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual(cuerpo409);
    expect(bd.estado.transacciones).toMatchObject({ begin: 1, commit: 0, rollback: 1 });
    expect(bd.estado.empleados).toHaveLength(0);
    expect(bd.estado.liberados).toBe(1);
    expect(bd.estado.sentencias.filter((s) => /^(INSERT|UPDATE)/.test(s.sql))).toHaveLength(0);
  });

  it("lo mismo en la segunda pasada de jefes y también cuando el bloqueo vence después (p. ej. al escribir una fila)... solo el candado", async () => {
    simularBd({ empleados: [{ id: 1, nombre: "A", apellido_paterno: "A", numero_nomina: "N1" }], fallaEn: (q) => esCandado(q) && bloqueo() });
    const res = await request(app).post("/api/empleados/importar/jefes").send({ pares: [{ empleado_id: 1, jefe_nomina: "N1" }] });
    expect(res.status).toBe(409);
    expect(res.body).toEqual(cuerpo409);
  });

  it("el SET LOCAL va antes del candado en la segunda pasada de jefes", async () => {
    const bd = simularBd({ empleados: [{ id: 1, nombre: "A", apellido_paterno: "A", numero_nomina: "N1" }] });
    await Empleado.asignarJefes([{ empleado_id: 1, fila: 2, jefe_nomina: "N1", jefe_curp: "" }]);
    const sql = bd.estado.sentencias.map((x) => x.sql);
    expect(sql.slice(0, 3)).toEqual(["BEGIN", "SET LOCAL lock_timeout = '3s'", expect.stringMatching(/^SELECT pg_advisory_xact_lock/)]);
  });

  it("tomarCupoImportacion: el tercer lote simultáneo falla al instante y liberar es idempotente", () => {
    const a = tomarCupoImportacion();
    const b = tomarCupoImportacion();
    expect(() => tomarCupoImportacion()).toThrow(MENSAJE_IMPORTACION_EN_CURSO);
    a(); a(); // idempotente: no libera dos cupos
    const c = tomarCupoImportacion();
    expect(() => tomarCupoImportacion()).toThrow();
    b(); c();
    tomarCupoImportacion()();
  });

  it("15 importaciones simultáneas: solo 2 piden conexión al pool, las otras 13 reciben 409 inmediato sin tocarlo; luego todo se libera", async () => {
    const bd = simularBd();
    let abrir;
    const compuerta = new Promise((r) => { abrir = r; });
    const conectar = bd.estado && grupo.connect.getMockImplementation();
    grupo.connect.mockImplementation(async () => { await compuerta; return conectar(); });
    const peticiones = Array.from({ length: 15 }, (_, i) => request(app).post("/api/empleados/importar").send({ filas: [base(i, { curp: CURP(i) })] }).then((r) => r)); // .then arranca la petición (superagent es perezoso)
    // las 13 sin cupo responden mientras las 2 primeras siguen esperando su conexión
    await new Promise((r) => setTimeout(r, 300));
    expect(grupo.connect).toHaveBeenCalledTimes(2);
    abrir();
    const respuestas = await Promise.all(peticiones);
    const estados = respuestas.map((r) => r.status).sort();
    expect(estados.filter((e) => e === 200)).toHaveLength(2);
    expect(estados.filter((e) => e === 409)).toHaveLength(13);
    expect(estados.filter((e) => e >= 500)).toHaveLength(0);
    respuestas.filter((r) => r.status === 409).forEach((r) => expect(r.body).toEqual(cuerpo409));
    expect(grupo.connect).toHaveBeenCalledTimes(2);
    // el cupo se liberó: otra importación normal funciona
    grupo.connect.mockImplementation(conectar);
    expect((await request(app).post("/api/empleados/importar").send({ filas: [base(99, { curp: CURP(99) })] })).status).toBe(200);
  });

  it("si la conexión al pool falla, el cupo se libera (no se queda ocupado) y responde 500 genérico", async () => {
    simularBd(); // catálogos disponibles: la falla es solo la conexión del pool
    grupo.connect.mockRejectedValue(new Error("pool agotado"));
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post("/api/empleados/importar").send({ filas: [base(1, { curp: CURP(1) })] });
      expect(res.status).toBe(500); // 4 > 2: si el cupo se filtrara, saldría 409
    }
  });

  it("las rutas de departamentos también devuelven 409 (lock_timeout)", async () => {
    jest.resetModules();
    jest.doMock("../../../portal/backend/middleware/permisos.middleware", () => ({ verificarPermiso: () => (_a, _b, n) => n(), tienePermiso: async () => true }));
    const C = require("../controllers/departamento.controller");
    const g = require("../../../portal/backend/config/database").grupo;
    const { crearBd: nuevaBd } = require("./fakeEmpleadosImportacion");
    const fake = nuevaBd({ ...CATALOGOS, fallaEn: (q) => esCandado(q) && bloqueo() });
    g.query.mockImplementation(async (sql) => (/FROM areas|FROM turnos/.test(sql) ? { rows: [] } : { rows: [{ hoy: "2026-10-22" }] }));
    g.connect.mockImplementation(fake.connect);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await C.importar({ body: { filas: [{ nombre: "X" }] }, user: { usuario_id: 5 }, headers: {}, socket: {} }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(cuerpo409);
    expect(fake.estado.transacciones.rollback).toBe(1);
  });
});

describe("auditoría de la importación", () => {
  async function conAuditoria(registrarAccion, cuerpo, reqExtra = {}) {
    jest.resetModules();
    jest.doMock("../../../auditoria/backend/services/auditoria.service", () => ({ registrarAccion }));
    const C = require("../controllers/empleado.controller");
    const bd = require("../../../portal/backend/config/database").grupo;
    const fake = crearBd(CATALOGOS);
    bd.query.mockImplementation(fake.query);
    bd.connect.mockImplementation(fake.connect);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await C.importar({ body: cuerpo, user: { usuario_id: 5 }, headers: {}, socket: { remoteAddress: "::1" }, ...reqExtra }, res);
    jest.dontMock("../../../auditoria/backend/services/auditoria.service");
    return res;
  }

  it("registra IMPORTAR_EMPLEADOS con conteos (incl. actualizados), sin datos personales y con la IP recortada a 45", async () => {
    const registrarAccion = jest.fn().mockResolvedValue(null);
    const res = await conAuditoria(
      registrarAccion,
      { filas: [base(1, { curp: CURP(1) }), base(2, { fecha_ingreso: "xx" }), base(3, { curp: "mala", celular_personal: "1" })] },
      { headers: { "x-forwarded-for": "1.2.3.4, " + "9.9.9.9, ".repeat(20), "user-agent": "t" } }
    );
    expect(registrarAccion).toHaveBeenCalledTimes(1);
    const [rq, modulo, tabla, id, accion, previos, nuevos] = registrarAccion.mock.calls[0];
    expect([modulo, tabla, accion, previos, id]).toEqual(["rh", "empleados", "IMPORTAR_EMPLEADOS", null, "importacion"]);
    expect(accion.length).toBeLessThanOrEqual(20);
    expect(nuevos).toEqual({ filas_recibidas: 3, modo: "omitir", insertados: 1, actualizados: 0, sin_cambios: 0, duplicados: 0, errores: 2, advertencias: 0 });
    expect(JSON.stringify(nuevos)).not.toMatch(/Ana|XXXX/);
    expect(rq.headers["x-forwarded-for"].length).toBe(45);
    expect(res.json.mock.calls[0][0].exito).toBe(true);
  });

  it("si la auditoría falla, la importación igual responde 200", async () => {
    const res = await conAuditoria(jest.fn().mockRejectedValue(new Error("boom")), { filas: [base(1)] });
    expect(res.json.mock.calls[0][0].exito).toBe(true);
  });
});

describe("POST /empleados/importar (controlador)", () => {
  const filaCompleta = (i) => base(i, {
    apellido_materno: "Muestra", curp: CURP(i), rfc: "XXXX000101XX1", nss: "12345678901", numero_nomina: `NOM-${i}`,
    genero: "Femenino", estado_civil: "Soltero", escolaridad: "Licenciatura", tipo_contrato: "Indeterminado",
    fecha_nacimiento: "1990-01-01", fecha_ingreso: "2024-01-15", puesto: "Analista", departamento: "Tecnologías de la Información",
    ubicacion: "Planta Norte", correo_personal: "ana.prueba@ejemplo.com", celular_personal: "5512345678", telefono_emergencia: "5587654321",
    parentesco_emergencia: "Madre", contacto_emergencia: "Rosa Muestra", calle: "Calle Falsa 123", colonia: "Centro", codigo_postal: "06000",
    municipio: "Cuauhtémoc", estado_residencia: "Ciudad de México", estado_nacimiento: "Jalisco", fecha_imss: "2024-01-15",
    fecha_renovacion: "2025-01-15", celular_corporativo: "5511112222", banco: "Banorte", clabe: "072345678901234568", cp_fiscal: "06000",
    estatus: "activo", jefe_nomina: "NOM-1",
  });

  it("responde con conteos y detalle; lotes de 100 filas con TODAS las columnas caben en el parser global de 100 kb", async () => {
    simularBd();
    const lote = Array.from({ length: 100 }, (_, i) => filaCompleta(i));
    const bytes = Buffer.byteLength(JSON.stringify({ filas: lote, modo: "actualizar" }));
    expect(bytes).toBeLessThan(100 * 1024);
    const res = await request(app).post("/api/empleados/importar").send({ filas: lote });
    expect(res.status).toBe(200);
    expect(res.body.datos).toMatchObject({ insertados: 100, duplicados: 0, errores: [], advertencias: [], jefes: { pendientes: 100 } });
    expect(res.body.datos.jefes_pendientes).toHaveLength(100);
  });

  it("modo inválido -> 400; modo actualizar usa transacción; más de 200 filas -> 400; vacío -> 400", async () => {
    const bd = simularBd();
    const m = await request(app).post("/api/empleados/importar").send({ filas: [base(1)], modo: "borrar" });
    expect(m.status).toBe(400);
    expect(m.body.mensaje).toMatch(/Modo de importación no válido/);
    const ok = await request(app).post("/api/empleados/importar").send({ filas: [base(1)], modo: "actualizar" });
    expect(ok.status).toBe(200);
    expect(bd.estado.transacciones.commit).toBe(1);
    const r1 = await request(app).post("/api/empleados/importar").send({ filas: Array.from({ length: 201 }, (_, i) => base(i)) });
    expect(r1.status).toBe(400);
    expect(r1.body.mensaje).toMatch(/Máximo 200 filas/);
    expect((await request(app).post("/api/empleados/importar").send({ filas: [] })).status).toBe(400);
    expect((await request(app).post("/api/empleados/importar").send({})).status).toBe(400);
  });

  it("catálogos por nombre sin acentos ni mayúsculas, ubicación incluida", async () => {
    const bd = simularBd();
    const res = await request(app).post("/api/empleados/importar").send({
      filas: [base(1, { puesto: "JEFE DE AREA", departamento: "tecnologias de la informacion", ubicacion: "PLANTA NORTE" }), base(2, { ubicacion: "Marte" })],
    });
    expect(bd.estado.empleados[0]).toMatchObject({ puesto_id: 8, departamento_id: 3, ubicacion_id: 2 });
    expect(res.body.datos.sin_catalogo.ubicaciones).toEqual([{ nombre: "Marte", filas: 1 }]);
  });

  it("NUL en puesto/departamento/ubicación/jefe/campos NO produce 500: advertencias (F-IMP-1)", async () => {
    simularBd();
    const res = await request(app).post("/api/empleados/importar").send({
      filas: [base(1, { numero_nomina: "N-1", puesto: "A\u0000B", departamento: "\u0000", ubicacion: "x\u0000", jefe_nomina: "\u0000", calle: "a\u0000b" }), base(2, { nombre: "A\u0000" }), base(3, { curp: "\u0000" }), base(4, { numero_nomina: "\u0000" })],
    });
    expect(res.status).toBe(200);
    expect(res.body.datos.insertados).toBe(1);
    expect(res.body.datos.advertencias.map((a) => a.campo).sort()).toEqual(["calle", "departamento", "jefe_nomina", "puesto", "ubicacion"]);
    expect(res.body.datos.errores).toHaveLength(3); // nombre, CURP y nómina con NUL: error de la fila, nunca 500
    const p = await request(app).post("/api/puestos/importar").send({ filas: [{ nombre: "A\u0000B" }] });
    expect(p.status).not.toBe(500);
  });

  it("1000 filas en 10 lotes: conteos exactos con inválidas, advertencias, duplicadas y largas", async () => {
    simularBd();
    const todas = Array.from({ length: 1000 }, (_, i) => {
      if (i % 10 === 0) return base(i, { fecha_ingreso: "45305.7" }); // error
      if (i % 10 === 1) return base(i, { numero_nomina: `U${i}`, rfc: "X".repeat(25) }); // advertencia: entra sin RFC
      if (i % 10 === 2) return base(i, { numero_nomina: "REPE" }); // duplicada desde la 2.ª
      return base(i, { curp: CURP(i) });
    });
    const suma = { insertados: 0, duplicados: 0, errores: 0, advertencias: 0 };
    for (let k = 0; k < 1000; k += 100) {
      const res = await request(app).post("/api/empleados/importar").send({ filas: todas.slice(k, k + 100) });
      expect(res.status).toBe(200);
      suma.insertados += res.body.datos.insertados;
      suma.duplicados += res.body.datos.duplicados;
      suma.errores += res.body.datos.errores.length;
      suma.advertencias += res.body.datos.advertencias.length;
    }
    // La BD en memoria sí conserva lo insertado: "REPE" entra una vez en total y las otras 99 son duplicadas.
    expect(suma).toEqual({ insertados: 1000 - 100 - 99, duplicados: 99, errores: 100, advertencias: 100 });
  });

  it("un error de BD inesperado devuelve 500 genérico sin error.message", async () => {
    grupo.query.mockRejectedValue(new Error("connection refused 10.0.0.5:5432 password=secreto"));
    const res = await request(app).post("/api/empleados/importar").send({ filas: [base(1)] });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ exito: false, mensaje: "Error al importar empleados" });
    expect(JSON.stringify(res.body)).not.toMatch(/secreto|10\.0\.0\.5/);
  });

  it("en modo actualizar un SQL inesperado da 500 genérico y deshace el lote", async () => {
    const bd = simularBd({ fallaEn: (q) => /^INSERT INTO empleados/.test(q) });
    const res = await request(app).post("/api/empleados/importar").send({ filas: [base(1, { curp: CURP(1) })], modo: "actualizar" });
    // el error SQL de UNA fila ya no tumba el lote (SAVEPOINT): 200 con el error de esa fila y texto genérico
    expect(res.status).toBe(200);
    expect(res.body.datos.errores).toEqual([{ fila: 2, nombre: "Ana1 Prueba", error: "No se pudo guardar la fila" }]);
    expect(bd.estado.transacciones).toMatchObject({ begin: 1, commit: 1 });
    // y un fallo del lote (la lectura de estado) sí da 500 genérico y ROLLBACK
    const bd2 = simularBd({ fallaEn: (q) => /FROM empleados WHERE LOWER\(curp\)/.test(q) });
    const r2 = await request(app).post("/api/empleados/importar").send({ filas: [base(1, { curp: CURP(1) })], modo: "actualizar" });
    expect(r2.status).toBe(500);
    expect(r2.body).toEqual({ exito: false, mensaje: "Error al importar empleados" });
    expect(bd2.estado.transacciones.rollback).toBe(1);
  });

  it("filas no objeto o con puesto numérico no revientan el controlador", async () => {
    simularBd();
    const res = await request(app).post("/api/empleados/importar").send({ filas: [null, 5, "x", base(1, { puesto: 7 })] });
    expect(res.status).toBe(200);
    expect(res.body.datos.insertados).toBe(1);
    expect(res.body.datos.errores).toHaveLength(3);
  });
});

describe("POST /empleados/importar/jefes (controlador)", () => {
  const equipo = [
    { id: 1, nombre: "Ana", apellido_paterno: "A", curp: CURP(1), numero_nomina: "N1" },
    { id: 2, nombre: "Beto", apellido_paterno: "B", curp: CURP(2), numero_nomina: "N2" },
  ];

  it("asigna, devuelve advertencias y audita IMPORTAR_EMP_JEFES con conteos", async () => {
    jest.resetModules();
    const registrarAccion = jest.fn().mockResolvedValue(null);
    jest.doMock("../../../auditoria/backend/services/auditoria.service", () => ({ registrarAccion }));
    const C = require("../controllers/empleado.controller");
    const bd = crearBd({ empleados: equipo });
    const g = require("../../../portal/backend/config/database").grupo;
    g.query.mockImplementation(bd.query);
    g.connect.mockImplementation(bd.connect);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await C.importarJefes({
      body: { pares: [{ empleado_id: 2, fila: 3, jefe_nomina: "N1" }, { empleado_id: 1, fila: 2, jefe_nomina: "NOPE" }] },
      user: { usuario_id: 5 }, headers: {}, socket: {},
    }, res);
    jest.dontMock("../../../auditoria/backend/services/auditoria.service");
    const datos = res.json.mock.calls[0][0].datos;
    expect(datos).toMatchObject({ asignados: 1, no_encontrados: 1 });
    expect(bd.estado.empleados[1].jefe_inmediato_id).toBe(1);
    const [, , , , accion, , nuevos] = registrarAccion.mock.calls[0];
    expect(accion).toBe("IMPORTAR_EMP_JEFES");
    expect(accion.length).toBeLessThanOrEqual(20);
    expect(nuevos).toEqual({ pares_recibidos: 2, asignados: 1, sin_cambios: 0, no_encontrados: 1, ciclos: 0, conflictos: 0 });
  });

  it("400 sin pares o con demasiados; 500 genérico si falla la BD", async () => {
    simularBd({ empleados: equipo });
    expect((await request(app).post("/api/empleados/importar/jefes").send({})).status).toBe(400);
    expect((await request(app).post("/api/empleados/importar/jefes").send({ pares: Array.from({ length: 501 }, () => ({})) })).status).toBe(400);
    grupo.connect.mockRejectedValue(new Error("secreto"));
    const r = await request(app).post("/api/empleados/importar/jefes").send({ pares: [{ empleado_id: 1, jefe_nomina: "N2" }] });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/secreto/);
  });
});


describe("Descargar empleados actuales (GET /empleados/exportar-importacion)", () => {
  it("F-IE-3: orden ÚNICO (nombre, apellidos, id), fechas con to_char en SQL (sin depender de la zona horaria) y sin paginar", async () => {
    grupo.query.mockResolvedValue({ rows: [] });
    await Empleado.listarParaExportar();
    const sql = grupo.query.mock.calls[0][0].replace(/\s+/g, " ");
    expect(sql).toMatch(/ORDER BY e\.nombre, e\.apellido_paterno, e\.apellido_materno NULLS FIRST, e\.id\s*$/);
    for (const c of ["fecha_nacimiento", "fecha_imss", "fecha_ingreso", "fecha_renovacion", "fecha_baja"]) {
      expect(sql).toContain(`to_char(e.${c}, 'YYYY-MM-DD') AS ${c}`);
    }
    expect(sql).not.toMatch(/LIMIT|OFFSET/);
    expect(sql).toMatch(/AS jefe_nomina/);
    expect(sql).toMatch(/AS jefe_curp/);
  });

  it("M8: exige el mismo permiso que el listado (rh/Empleados/consulta) y la ruta va antes de /:id", () => {
    const fuente = require("fs").readFileSync(require("path").join(__dirname, "../routes/empleados.routes.js"), "utf8");
    expect(fuente).toMatch(/router\.get\("\/exportar-importacion", verificarPermiso\("rh", "Empleados", "consulta"\), ControladorEmpleado\.exportarParaImportacion\)/);
    expect(fuente.indexOf("/exportar-importacion")).toBeLessThan(fuente.indexOf('"/:id"'));
  });

  it("responde con la lista y registra la auditoría EXPORTAR_EMPLEADOS (<= 20 caracteres) solo con el número de filas", async () => {
    jest.resetModules();
    const registrarAccion = jest.fn().mockResolvedValue(null);
    jest.doMock("../../../auditoria/backend/services/auditoria.service", () => ({ registrarAccion }));
    const C = require("../controllers/empleado.controller");
    const g = require("../../../portal/backend/config/database").grupo;
    g.query.mockResolvedValue({ rows: [{ nombre: "Ana", curp: "XXXX000101HXXXXXX0" }, { nombre: "Beto", curp: null }] });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await C.exportarParaImportacion({ user: { usuario_id: 5 }, headers: {}, socket: {} }, res);
    expect(res.json.mock.calls[0][0]).toEqual({ exito: true, datos: { empleados: [{ nombre: "Ana", curp: "XXXX000101HXXXXXX0" }, { nombre: "Beto", curp: null }] } });
    const [, modulo, tabla, , accion, previos, nuevos] = registrarAccion.mock.calls[0];
    expect([modulo, tabla, accion, previos]).toEqual(["rh", "empleados", "EXPORTAR_EMPLEADOS", null]);
    expect(accion.length).toBeLessThanOrEqual(20);
    expect(nuevos).toEqual({ filas: 2 });
    expect(JSON.stringify(nuevos)).not.toMatch(/Ana|XXXX/);
    jest.dontMock("../../../auditoria/backend/services/auditoria.service");
  });

  it("un error de BD responde 500 genérico y el log solo trae el código (sin datos)", async () => {
    grupo.query.mockRejectedValue(Object.assign(new Error('valor "SECRETO-PRIVADO"'), { code: "XX000" }));
    const res = await request(app).get("/api/empleados/exportar-importacion");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ exito: false, mensaje: "Error al exportar empleados" });
    expect(console.error.mock.calls.map((c) => c.join(" ")).join("\n")).not.toMatch(/SECRETO/);
  });
});

describe("importadores de catálogos: errores claros y sin texto de BD", () => {
  it("puestos: duplicado con detalle, error genérico por fila y 500 sin error.message", async () => {
    grupo.query.mockImplementation(async (sql, params) => {
      if (/SELECT LOWER\(nombre\) AS nombre FROM puestos$/.test(sql.trim())) return { rows: [{ nombre: "gerente" }] };
      if (/INSERT INTO puestos/.test(sql)) {
        if (params[0] === "Malo") throw new Error("value too long for type character varying(100)");
        return { rows: [] };
      }
      return { rows: [] };
    });
    const res = await request(app).post("/api/puestos/importar").send({
      filas: [{ _fila: 2, nombre: "Gerente" }, { _fila: 3, nombre: "Malo" }, { _fila: 4, nombre: "Bueno" }, { _fila: 5, nombre: "" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.datos).toEqual({
      insertados: 1, duplicados: 1,
      duplicados_detalle: [{ fila: 2, nombre: "Gerente", motivo: "Nombre ya existe" }],
      errores: [
        { fila: 3, nombre: "Malo", error: "No se pudo insertar la fila" },
        { fila: 5, nombre: "", error: "El campo nombre es requerido" },
      ],
    });
    grupo.query.mockRejectedValue(new Error("secreto de bd"));
    const r500 = await request(app).post("/api/puestos/importar").send({ filas: [{ nombre: "X" }] });
    expect(r500.status).toBe(500);
    expect(JSON.stringify(r500.body)).not.toMatch(/secreto/);
  });

  it("áreas: mismo formato y 500 sin error.message", async () => {
    grupo.query.mockImplementation(async (sql) => {
      if (/FROM areas$/.test(sql.trim())) return { rows: [{ nombre: "ventas" }] };
      return { rows: [] };
    });
    const a = await request(app).post("/api/areas/importar").send({ filas: [{ _fila: 2, nombre: "Ventas" }, { _fila: 3, nombre: "Nueva" }] });
    expect(a.body.datos).toMatchObject({ insertados: 1, duplicados: 1, duplicados_detalle: [{ fila: 2, nombre: "Ventas", motivo: "Nombre ya existe" }] });
    grupo.query.mockRejectedValue(new Error("secreto de bd"));
    const r = await request(app).post("/api/areas/importar").send({ filas: [{ nombre: "X" }] });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/secreto/);
  });
});
