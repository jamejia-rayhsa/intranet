const request = require("supertest");
const express = require("express");

jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, _res, next) => { req.user = { usuario_id: 5, rol_id: 3, rol_nombre: "rh_admin" }; next(); },
}));
jest.mock("../../../portal/backend/middleware/permisos.middleware", () => ({
  verificarPermiso: () => (_req, _res, next) => next(),
}));
jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn() } }));

const { grupo } = require("../../../portal/backend/config/database");
const Empleado = require("../models/empleado.model");
const { prepararFilaEmpleado, esFechaValida } = require("../utils/importarEmpleados");

const app = express();
app.use(express.json()); // mismo límite global (100 kb) que el portal
app.use("/api/empleados", require("../routes/empleados.routes"));
app.use("/api/puestos", require("../routes/puestos.routes"));
app.use("/api/areas", require("../routes/areas.routes"));
app.use("/api/departamentos", require("../routes/departamentos.routes"));

const base = (i, extra = {}) => ({ _fila: i + 1, nombre: `Ana${i}`, apellido_paterno: "Prueba", ...extra });

// Simula la BD: existentes (curp/nómina) y los INSERT que van quedando.
function simularBd({ curps = [], nominas = [], falla } = {}) {
  const inserts = [];
  grupo.query.mockImplementation(async (sql, params) => {
    if (/SELECT LOWER\(curp\)/.test(sql)) return { rows: curps.map((curp) => ({ curp })) };
    if (/SELECT LOWER\(numero_nomina\)/.test(sql)) return { rows: nominas.map((n) => ({ n })) };
    if (/INSERT INTO empleados/.test(sql)) {
      if (falla && falla(params)) {
        const e = new Error('invalid input syntax for type date: "xx" (detalle interno de PostgreSQL)');
        e.code = "22007";
        throw e;
      }
      inserts.push(params);
      return { rows: [] };
    }
    return { rows: [] };
  });
  return inserts;
}

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

  it("rechaza longitudes excedidas con un mensaje claro", () => {
    const casos = [
      ["nombre", 101, /Nombre excede 100 caracteres \(tiene 101\)/],
      ["apellido_paterno", 101, /Apellido paterno excede 100/],
      ["apellido_materno", 101, /Apellido materno excede 100/],
      ["curp", 19, /CURP excede 18/],
      ["rfc", 14, /RFC excede 13/],
      ["nss", 12, /NSS excede 11/],
      ["numero_nomina", 51, /Número de nómina excede 50/],
      ["genero", 21, /Género excede 20/],
      ["estado_civil", 31, /Estado civil excede 30/],
      ["escolaridad", 51, /Escolaridad excede 50/],
      ["tipo_contrato", 51, /Tipo de contrato excede 50/],
      ["correo_personal", 256, /Correo personal excede 255/],
      ["celular_personal", 21, /Celular personal excede 20/],
    ];
    for (const [campo, largo, patron] of casos) {
      expect(prepararFilaEmpleado(base(1, { [campo]: "x".repeat(largo) })).error).toMatch(patron);
      expect(prepararFilaEmpleado(base(1, { [campo]: "x".repeat(largo - 1) })).error).toBeUndefined();
    }
  });

  it("requeridos, objetos, NUL y números", () => {
    expect(prepararFilaEmpleado({ nombre: "Ana" }).error).toMatch(/requeridos/);
    expect(prepararFilaEmpleado(null).error).toBeTruthy();
    expect(prepararFilaEmpleado(base(1, { curp: { a: 1 } })).error).toMatch(/CURP/);
    expect(prepararFilaEmpleado(base(1, { nombre: "A\u0000B" })).error).toMatch(/caracteres no permitidos/);
    expect(prepararFilaEmpleado(base(1, { nss: 12345678901 })).fila.nss).toBe("12345678901");
  });
});

describe("Empleado.importarLote", () => {
  it("inserta con fechas válidas y vacías como NULL", async () => {
    const inserts = simularBd();
    const r = await Empleado.importarLote([
      base(1, { fecha_nacimiento: "1990-01-01", fecha_ingreso: "2024-02-29" }),
      base(2, { fecha_nacimiento: "", fecha_ingreso: "  " }),
    ]);
    expect(r).toEqual({ insertados: 2, duplicados: 0, duplicados_detalle: [], errores: [] });
    expect(inserts[0].slice(11, 13)).toEqual(["1990-01-01", "2024-02-29"]);
    expect(inserts[1].slice(11, 13)).toEqual([null, null]);
  });

  it("fechas inválidas NO llegan a la BD: error por fila con número, nombre y motivo", async () => {
    const inserts = simularBd();
    const r = await Empleado.importarLote([
      base(1, { fecha_ingreso: "45305.74958333333" }),
      base(2, { fecha_nacimiento: "15/01/2024" }),
      base(3, { fecha_ingreso: "2023-02-29" }),
      base(4, { fecha_ingreso: "2024-01-15" }),
    ]);
    expect(inserts).toHaveLength(1);
    expect(r.insertados).toBe(1);
    expect(r.errores).toHaveLength(3);
    expect(r.errores[0]).toEqual({ fila: 2, nombre: "Ana1 Prueba", error: "Fecha de ingreso inválida (usa AAAA-MM-DD, año entre 1900 y 2100)" });
    expect(r.errores[1].error).toMatch(/^Fecha de nacimiento inválida/);
    expect(r.errores[2].fila).toBe(4);
  });

  it("longitudes excedidas se reportan antes del INSERT", async () => {
    const inserts = simularBd();
    const r = await Empleado.importarLote([base(1, { curp: "C".repeat(30) }), base(2)]);
    expect(inserts).toHaveLength(1);
    expect(r.errores).toEqual([{ fila: 2, nombre: "Ana1 Prueba", error: "CURP excede 18 caracteres (tiene 30)" }]);
  });

  it("duplicados con detalle: CURP existente, nómina existente y repetida en el archivo", async () => {
    simularBd({ curps: ["curp00000000000001"], nominas: ["n-1"] });
    const r = await Empleado.importarLote([
      base(1, { curp: "CURP00000000000001" }),
      base(2, { numero_nomina: "N-1" }),
      base(3, { curp: "NUEVA0000000000001", numero_nomina: "N-9" }),
      base(4, { curp: "nueva0000000000001" }),
      base(5, { numero_nomina: "n-9" }),
    ]);
    expect(r.insertados).toBe(1);
    expect(r.duplicados).toBe(4);
    expect(r.duplicados_detalle).toEqual([
      { fila: 2, nombre: "Ana1 Prueba", motivo: "CURP ya existe" },
      { fila: 3, nombre: "Ana2 Prueba", motivo: "Número de nómina ya existe" },
      { fila: 5, nombre: "Ana4 Prueba", motivo: "repetida en el archivo" },
      { fila: 6, nombre: "Ana5 Prueba", motivo: "repetida en el archivo" },
    ]);
  });

  it("limita el detalle de duplicados a 200 pero cuenta todos", async () => {
    simularBd({ curps: ["curp0000000000000x"] });
    const filas = Array.from({ length: 200 }, (_, i) => base(i, { curp: "CURP0000000000000X" }));
    filas.push(base(300, { curp: "CURP0000000000000X" }));
    const r = await Empleado.importarLote(filas);
    expect(r.duplicados).toBe(201);
    expect(r.duplicados_detalle).toHaveLength(200);
  });

  it("un fallo inesperado de la BD no filtra su texto y se registra en el log", async () => {
    simularBd({ falla: (p) => p[0] === "Ana2" });
    const r = await Empleado.importarLote([base(1), base(2), base(3)]);
    expect(r.insertados).toBe(2);
    expect(r.errores).toEqual([{ fila: 3, nombre: "Ana2 Prueba", error: "No se pudo insertar la fila" }]);
    expect(JSON.stringify(r)).not.toMatch(/PostgreSQL|invalid input|syntax/i);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("POST /empleados/importar (controlador)", () => {
  it("responde con conteos y detalle; lotes de 100 filas caben en el parser global de 100 kb", async () => {
    simularBd({ curps: ["dup00000000000000x"] });
    const fila = (i) => base(i, {
      curp: `CURP${String(i).padStart(14, "0")}`, rfc: "RFCF900101ABC", nss: "12345678901", numero_nomina: `NOM-${i}`,
      genero: "Femenino", estado_civil: "Soltero", escolaridad: "Licenciatura", tipo_contrato: "Indeterminado",
      fecha_nacimiento: "1990-01-01", fecha_ingreso: "2024-01-15", puesto: "Analista de TI", departamento: "Tecnologías de la Información",
      correo_personal: "ana.prueba@ejemplo.com", celular_personal: "5512345678",
    });
    const lote = Array.from({ length: 100 }, (_, i) => fila(i));
    const bytes = Buffer.byteLength(JSON.stringify({ filas: lote }));
    expect(bytes).toBeLessThan(60 * 1024);
    const res = await request(app).post("/api/empleados/importar").send({ filas: lote });
    expect(res.status).toBe(200);
    expect(res.body.datos).toMatchObject({ insertados: 100, duplicados: 0, errores: [], duplicados_detalle: [] });
  });

  it("1000 filas en 10 lotes: conteos exactos con inválidas, duplicadas y largas", async () => {
    simularBd();
    const todas = Array.from({ length: 1000 }, (_, i) => {
      if (i % 10 === 0) return base(i, { fecha_ingreso: "45305.7" }); // inválida
      if (i % 10 === 1) return base(i, { curp: "X".repeat(25) }); // larga
      if (i % 10 === 2) return base(i, { numero_nomina: "REPE" }); // duplicada desde la 2.ª
      return base(i, { curp: `CURP${String(i).padStart(14, "0")}` });
    });
    const suma = { insertados: 0, duplicados: 0, errores: 0, detalle: 0 };
    for (let k = 0; k < 1000; k += 100) {
      const res = await request(app).post("/api/empleados/importar").send({ filas: todas.slice(k, k + 100) });
      expect(res.status).toBe(200);
      suma.insertados += res.body.datos.insertados;
      suma.duplicados += res.body.datos.duplicados;
      suma.errores += res.body.datos.errores.length;
      suma.detalle += res.body.datos.duplicados_detalle.length;
    }
    // La BD simulada no conserva lo insertado entre lotes: "REPE" se inserta una vez por lote (10) y 9 por lote son duplicadas.
    expect(suma).toEqual({ insertados: 710, duplicados: 90, errores: 200, detalle: 90 });
  });

  it("más de 200 filas -> 400; vacío -> 400; cuerpo > 100 kb -> 413 JSON", async () => {
    simularBd();
    const r1 = await request(app).post("/api/empleados/importar").send({ filas: Array.from({ length: 201 }, (_, i) => base(i)) });
    expect(r1.status).toBe(400);
    expect(r1.body.mensaje).toMatch(/Máximo 200 filas/);
    expect((await request(app).post("/api/empleados/importar").send({ filas: [] })).status).toBe(400);
    expect((await request(app).post("/api/empleados/importar").send({})).status).toBe(400);
  });

  it("un error de BD inesperado devuelve 500 genérico sin error.message", async () => {
    grupo.query.mockRejectedValue(new Error("connection refused 10.0.0.5:5432 password=secreto"));
    const res = await request(app).post("/api/empleados/importar").send({ filas: [base(1)] });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ exito: false, mensaje: "Error al importar empleados" });
    expect(JSON.stringify(res.body)).not.toMatch(/secreto|10\.0\.0\.5/);
  });

  it("filas no objeto o con puesto numérico no revientan el controlador", async () => {
    simularBd();
    const res = await request(app).post("/api/empleados/importar").send({ filas: [null, 5, "x", base(1, { puesto: 7 })] });
    expect(res.status).toBe(200);
    expect(res.body.datos.insertados).toBe(1);
    expect(res.body.datos.errores).toHaveLength(3);
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

  it("áreas y departamentos: mismo formato y 500 sin error.message", async () => {
    grupo.query.mockImplementation(async (sql) => {
      if (/FROM areas$/.test(sql.trim())) return { rows: [{ nombre: "ventas" }] };
      if (/FROM departamentos$/.test(sql.trim())) return { rows: [{ nombre: "ti" }] };
      return { rows: [] };
    });
    const a = await request(app).post("/api/areas/importar").send({ filas: [{ _fila: 2, nombre: "Ventas" }, { _fila: 3, nombre: "Nueva" }] });
    expect(a.body.datos).toMatchObject({ insertados: 1, duplicados: 1, duplicados_detalle: [{ fila: 2, nombre: "Ventas", motivo: "Nombre ya existe" }] });
    const d = await request(app).post("/api/departamentos/importar").send({ filas: [{ _fila: 2, nombre: "TI" }, { nombre: "" }] });
    expect(d.body.datos.duplicados_detalle[0]).toEqual({ fila: 2, nombre: "TI", motivo: "Nombre ya existe" });
    expect(d.body.datos.errores[0]).toEqual({ fila: null, nombre: "", error: "El campo nombre es requerido" });
    grupo.query.mockRejectedValue(new Error("secreto de bd"));
    const r = await request(app).post("/api/areas/importar").send({ filas: [{ nombre: "X" }] });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/secreto/);
  });
});
