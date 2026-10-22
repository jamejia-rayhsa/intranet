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
const CURP = (n) => `PRUA9001010000${String(n).padStart(4, "0")}`; // 18 caracteres ficticios

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
      curp: "CORTA", rfc: "123", nss: "12", clabe: "999", celular_personal: "555", codigo_postal: "ABC", cp_fiscal: "123456",
      genero: "Marciano", banco: "Banco Inventado", estado_nacimiento: "Atlantida", correo_personal: "no-es-correo",
      estatus: "volando", colonia: "c".repeat(101),
    }));
    expect(r.error).toBeUndefined();
    for (const campo of ["curp", "rfc", "nss", "clabe", "celular_personal", "codigo_postal", "cp_fiscal", "genero", "banco", "estado_nacimiento", "correo_personal", "estatus", "colonia"]) {
      expect(r.fila[campo]).toBe("");
    }
    const porCampo = Object.fromEntries(r.advertencias.map((a) => [a.campo, a]));
    expect(Object.keys(porCampo)).toHaveLength(13);
    // CURP/NSS/RFC/CLABE: solo "formato inválido", sin el valor recibido
    for (const campo of ["curp", "rfc", "nss", "clabe"]) {
      expect(porCampo[campo]).toEqual({ campo, valor_recibido: null, motivo: "formato inválido" });
    }
    expect(porCampo.celular_personal).toEqual({ campo: "celular_personal", valor_recibido: "555", motivo: "teléfono inválido (deben ser 10 dígitos)" });
    expect(porCampo.colonia.valor_recibido).toHaveLength(40);
    expect(porCampo.colonia.motivo).toMatch(/excede 100/);
    expect(porCampo.genero.motivo).toMatch(/no está entre las opciones/);
  });

  it("CURP y RFC se pasan a mayúsculas; NSS de 10 dígitos se rellena con 0 y avisa sin mostrar el valor", () => {
    const r = prepararFilaEmpleado(base(1, { curp: "prua900101hdfrxx01", rfc: "prua900101ab1", nss: "1234567890" }));
    expect(r.fila).toMatchObject({ curp: "PRUA900101HDFRXX01", rfc: "PRUA900101AB1", nss: "01234567890" });
    expect(r.advertencias).toEqual([{ campo: "nss", valor_recibido: null, motivo: expect.stringMatching(/10 dígitos.*0 a la izquierda/) }]);
    expect(prepararFilaEmpleado(base(1, { rfc: "PRUA900101AB" })).fila.rfc).toBe("PRUA900101AB"); // 12 caracteres (persona moral)
    expect(prepararFilaEmpleado(base(1, { nss: 12345678901 })).fila.nss).toBe("12345678901");
  });

  it("CURP: exactamente 18 caracteres alfanuméricos (17, 19 y con símbolos son formato inválido)", () => {
    for (const mala of ["A".repeat(17), "A".repeat(19), "AAAA90010100000-01", "AAAA9001010000001!"]) {
      const r = prepararFilaEmpleado(base(1, { curp: mala }));
      expect(r.fila.curp).toBe("");
      expect(r.advertencias).toEqual([{ campo: "curp", valor_recibido: null, motivo: "formato inválido" }]);
    }
    expect(prepararFilaEmpleado(base(1, { curp: "AAAA900101HDFRRR01" })).fila.curp).toBe("AAAA900101HDFRRR01");
    expect(prepararFilaEmpleado(base(1, { curp: " aaaa 900101 hdfrrr 01 " })).fila.curp).toBe("AAAA900101HDFRRR01");
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
    const campos = ["calle", "numero_nomina", "puesto", "departamento", "ubicacion", "jefe_nomina", "curp", "motivo_baja", "genero", "parentesco_emergencia"];
    const r = prepararFilaEmpleado(base(1, Object.fromEntries(campos.map((c) => [c, "a\u0000b"]))));
    expect(r.error).toBeUndefined();
    expect(r.advertencias.map((a) => a.campo).sort()).toEqual([...campos].sort());
    for (const a of r.advertencias) expect(a.valor_recibido === null || !a.valor_recibido.includes("\u0000")).toBe(true);
    for (const c of campos) expect(r.fila[c]).toBe("");
    expect(prepararFilaEmpleado(base(1, { jefe_curp: "x\u0000" })).advertencias[0]).toMatchObject({ campo: "jefe_curp", valor_recibido: null });
  });

  it("valores no convertibles (objetos) en campos opcionales son advertencia", () => {
    const r = prepararFilaEmpleado(base(1, { curp: { a: 1 }, calle: [1], puesto: {} }));
    expect(r.error).toBeUndefined();
    expect(r.advertencias.map((a) => a.campo).sort()).toEqual(["calle", "curp", "puesto"]);
  });

  it("nombresUnicos no devuelve textos con NUL (no llegan a ninguna consulta)", () => {
    expect(nombresUnicos([{ puesto: "A\u0000" }, { puesto: "Ok" }, { puesto: "ok" }], "puesto")).toEqual(["ok"]);
  });
});

describe("Empleado.importarLote - modo omitir", () => {
  it("inserta TODAS las columnas del expediente, resuelve puesto, departamento y ubicación por nombre sin acentos", async () => {
    const bd = simularBd();
    const completa = base(1, {
      apellido_materno: "Muestra", fecha_nacimiento: "1990-01-01", curp: CURP(1), rfc: "PRUA900101AB1", nss: "01234567890",
      genero: "Femenino", estado_civil: "Soltero", escolaridad: "Licenciatura", estado_nacimiento: "Jalisco",
      celular_personal: "5512345678", correo_personal: "ana@ejemplo.com", telefono_emergencia: "5587654321",
      parentesco_emergencia: "Madre", contacto_emergencia: "Rosa", calle: "Calle 1", colonia: "Centro", codigo_postal: "06000",
      municipio: "Cuauhtémoc", estado_residencia: "Ciudad de México", numero_nomina: "N-1", fecha_imss: "2024-01-01",
      fecha_ingreso: "2024-01-02", fecha_renovacion: "2025-01-02", tipo_contrato: "Determinado", celular_corporativo: "5511112222",
      infonavit: "INF1", fonacot: "FON1", puesto: "ANALISTA", departamento: "tecnologías de la información", ubicacion: "planta norte",
      banco: "Banorte", clabe: "072345678901234568", cp_fiscal: "06000", estatus: "suspendido", fecha_baja: "2026-01-01", motivo_baja: "Prueba",
    });
    const r = await Empleado.importarLote([completa], mapas());
    expect(r).toMatchObject({ insertados: 1, actualizados: 0, errores: [], advertencias: [], duplicados: 0, jefes_pendientes: [] });
    const e = bd.estado.empleados[0];
    expect(e).toMatchObject({
      nombre: "Ana1", curp: CURP(1), estado_nacimiento: "Jalisco", calle: "Calle 1", cp_fiscal: "06000", banco: "Banorte",
      puesto_id: 7, departamento_id: 3, ubicacion_id: 2, estatus: "suspendido", fecha_baja: "2026-01-01", fecha_imss: "2024-01-01",
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
    const r = await Empleado.importarLote([base(1, { curp: "mala", celular_personal: "123", genero: "Femenino" })], mapas());
    expect(r.insertados).toBe(1);
    expect(bd.estado.empleados[0].curp).toBeUndefined();
    expect(bd.estado.empleados[0].genero).toBe("Femenino");
    expect(r.advertencias).toEqual([
      { fila: 2, nombre: "Ana1 Prueba", campo: "curp", valor_recibido: null, motivo: "formato inválido" },
      { fila: 2, nombre: "Ana1 Prueba", campo: "celular_personal", valor_recibido: "123", motivo: "teléfono inválido (deben ser 10 dígitos)" },
    ]);
  });

  it("limita las advertencias devueltas a 1000 por lote pero cuenta las omitidas", async () => {
    simularBd();
    const filas = Array.from({ length: 150 }, (_, i) => base(i, { celular_personal: "1", telefono_emergencia: "2", celular_corporativo: "3", codigo_postal: "x", cp_fiscal: "y", genero: "z", banco: "w", estatus: "v" }));
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

  it("sin N+1 de comprobación: UNA consulta de claves por lote (con ANY) y ninguna transacción", async () => {
    const bd = simularBd();
    await Empleado.importarLote(Array.from({ length: 50 }, (_, i) => base(i, { curp: CURP(i), numero_nomina: `N${i}` })), mapas());
    const busquedas = bd.estado.sentencias.filter((s) => /FROM empleados WHERE LOWER\(curp\) = ANY/.test(s.sql));
    expect(busquedas).toHaveLength(1);
    expect(busquedas[0].params[0]).toHaveLength(50);
    expect(bd.estado.transacciones).toEqual({ begin: 0, commit: 0, rollback: 0 });
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
    expect(r.errores).toEqual([{ fila: 3, nombre: "Ana2 Prueba", error: "No se pudo insertar la fila" }]);
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

  it("un SQL inesperado hace ROLLBACK de TODO el lote (nada queda a medias) y propaga el error", async () => {
    const bd = simularBd({
      empleados: existentes(),
      fallaEn: (q, p) => /^UPDATE empleados SET/.test(q) && p.includes("Falla"),
    });
    const antes = JSON.stringify(bd.estado.empleados);
    await expect(actualizar([
      base(1, { curp: CURP(60) }), // se inserta antes del fallo
      base(2, { curp: CURP(1), calle: "Cambio ok" }),
      base(3, { curp: CURP(2), calle: "Falla" }),
    ])).rejects.toThrow();
    expect(bd.estado.transacciones).toEqual({ begin: 1, commit: 0, rollback: 1 });
    expect(JSON.stringify(bd.estado.empleados)).toBe(antes);
    expect(bd.estado.liberados).toBe(1);
  });

  it("los errores de validación por fila no abortan el lote", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([base(1, { curp: CURP(1), calle: "A", fecha_ingreso: "xx" }), base(2, { curp: CURP(1), calle: "B" })]);
    expect(r).toMatchObject({ actualizados: 1 });
    expect(r.errores).toHaveLength(1);
    expect(bd.estado.transacciones.commit).toBe(1);
  });

  it("estatus y fecha de baja se actualizan desde el archivo; un estatus inválido es advertencia", async () => {
    const bd = simularBd({ empleados: existentes() });
    const r = await actualizar([
      base(1, { curp: CURP(1), estatus: "Baja", fecha_baja: "2026-03-01", motivo_baja: "Renuncia" }),
      base(2, { curp: CURP(2), estatus: "volando" }),
    ]);
    expect(bd.estado.empleados[0]).toMatchObject({ estatus: "baja", fecha_baja: "2026-03-01", motivo_baja: "Renuncia" });
    expect(r.advertencias.map((a) => a.campo)).toEqual(["estatus"]);
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
      { filas: [base(1, { curp: CURP(1) }), base(2, { fecha_ingreso: "xx" }), base(3, { curp: "mala" })] },
      { headers: { "x-forwarded-for": "1.2.3.4, " + "9.9.9.9, ".repeat(20), "user-agent": "t" } }
    );
    expect(registrarAccion).toHaveBeenCalledTimes(1);
    const [rq, modulo, tabla, id, accion, previos, nuevos] = registrarAccion.mock.calls[0];
    expect([modulo, tabla, accion, previos, id]).toEqual(["rh", "empleados", "IMPORTAR_EMPLEADOS", null, "importacion"]);
    expect(accion.length).toBeLessThanOrEqual(20);
    expect(nuevos).toEqual({ filas_recibidas: 3, modo: "omitir", insertados: 2, actualizados: 0, sin_cambios: 0, duplicados: 0, errores: 1, advertencias: 1 });
    expect(JSON.stringify(nuevos)).not.toMatch(/Ana|PRUA/);
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
    apellido_materno: "Muestra", curp: CURP(i), rfc: "PRUA900101AB1", nss: "12345678901", numero_nomina: `NOM-${i}`,
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
      filas: [base(1, { puesto: "A\u0000B", departamento: "\u0000", ubicacion: "x\u0000", jefe_nomina: "\u0000", calle: "a\u0000b", curp: "\u0000" }), base(2, { nombre: "A\u0000" })],
    });
    expect(res.status).toBe(200);
    expect(res.body.datos.insertados).toBe(1);
    expect(res.body.datos.advertencias.map((a) => a.campo).sort()).toEqual(["calle", "curp", "departamento", "jefe_nomina", "puesto", "ubicacion"]);
    expect(res.body.datos.errores).toHaveLength(1);
    const p = await request(app).post("/api/puestos/importar").send({ filas: [{ nombre: "A\u0000B" }] });
    expect(p.status).not.toBe(500);
  });

  it("1000 filas en 10 lotes: conteos exactos con inválidas, advertencias, duplicadas y largas", async () => {
    simularBd();
    const todas = Array.from({ length: 1000 }, (_, i) => {
      if (i % 10 === 0) return base(i, { fecha_ingreso: "45305.7" }); // error
      if (i % 10 === 1) return base(i, { curp: "X".repeat(25) }); // advertencia: entra sin CURP
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
    const res = await request(app).post("/api/empleados/importar").send({ filas: [base(1)], modo: "actualizar" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ exito: false, mensaje: "Error al importar empleados" });
    expect(bd.estado.transacciones.rollback).toBe(1);
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
