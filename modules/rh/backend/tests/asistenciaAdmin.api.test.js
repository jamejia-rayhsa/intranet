// Lectura para las pantallas de administración de Asistencia: permisos por rol, validaciones, paginación,
// parámetros (sin interpolar texto del usuario) y errores genéricos. BD simulada (fakeAsistenciaDb).
const request = require("supertest");
const express = require("express");

let mockUser;
jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, res, next) => {
    if (!mockUser) return res.status(401).json({ exito: false, mensaje: "sin token" });
    req.user = mockUser;
    next();
  },
}));
jest.mock("../../../portal/backend/config/database", () => {
  const { crearBD } = require("./fakeAsistenciaDb");
  const bd = crearBD();
  return { grupo: bd.grupo, __bd: bd };
});
jest.mock("../../../auditoria/backend/models/auditoria.model", () => ({ crear: jest.fn().mockResolvedValue({}) }));
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({ registrarAccion: jest.fn() }));

const { __bd: bd } = require("../../../portal/backend/config/database");
const { diasEntre } = require("../controllers/asistenciaAdmin.controller");

const app = express();
app.use(express.json());
app.use("/api/asistencia", require("../routes/asistencia.routes"));

const BASE = "/api/asistencia";
const RANGO = "desde=2026-10-01&hasta=2026-10-07";

// Permisos sembrados (migraciones 012/013): solo rh_admin y super_admin tienen Turnos e Ingesta
const PERMISOS_POR_ROL = {
  rh_admin: { Asistencia: ["consulta", "edicion"], Turnos: ["consulta", "edicion"], Ingesta: ["consulta", "edicion"] },
  portal_admin: { Asistencia: ["consulta"] },
  rh_empleado: { Asistencia: ["consulta"] },
  jefe: { Asistencia: ["consulta"] },
  empleado: { Asistencia: ["consulta"] },
};

function entrar(rol) {
  mockUser = { usuario_id: 5, rol_id: 3, rol_nombre: rol };
  bd.estado.permisos = PERMISOS_POR_ROL[rol] || {};
}

function reglasBase() {
  bd.cuando(/WITH hoy AS \(SELECT .*deptos AS/s, () => ({
    rows: [{ turno_id: 1, departamentos: 2, empleados_individuales: 1, empleados_efectivos: 9 }],
  }));
  bd.cuando(/FROM empleados e\s+LEFT JOIN departamentos d ON d.id = e.departamento_id\s+CROSS JOIN hoy/s, () => ({
    rows: [{ id: 7, nombre: "Ana Prueba", numero_nomina: "1001", total: 45 }],
  }));
  bd.cuando(/SELECT COUNT\(\*\)::int AS total FROM asistencia_marcas m WHERE/, () => ({ rows: [{ total: 120 }] }));
  bd.cuando(/FROM asistencia_marcas m\s+LEFT JOIN empleados e/s, () => ({
    rows: [{ id: "9", id_externo: "5001", codigo_empleado: "1001", marca_ts: "2026-10-01T14:03:00.000Z", empleado_id: 7 }],
  }));
  bd.cuando(/WITH g AS/, () => ({
    rows: [{ codigo: "9999", marcas: 3, total_codigos: 4, total_marcas: "10", reciente: true }],
  }));
  bd.cuando(/e\.estatus = 'activo' AND \(e\.numero_nomina IS NULL/, () => ({
    rows: [{ id: 2, nombre: "Beto Ficticio", departamento: "Almacén", total: 3 }],
  }));
  bd.cuando(/FROM asistencia_sync_estado s/, () => ({ rows: [{ origen: "biotime", ultimo_id_externo: "100" }] }));
  bd.cuando(/FROM asistencia_sync_lotes l WHERE l\.origen = \$1 ORDER BY l\.id DESC LIMIT 1/, () => ({ rows: [{ id: 4, estatus: "ok" }] }));
  bd.cuando(/estatus = 'ok' ORDER BY/, () => ({ rows: [{ fecha_recepcion: "2026-10-01T15:00:00.000Z" }] }));
  bd.cuando(/empleado_id IS NULL"?$|AND empleado_id IS NULL/, () => ({ rows: [{ total: 7 }] }));
  bd.cuando(/FROM pg_class/, () => ({ rows: [{ estimado: "250000" }] }));
  bd.cuando(/SELECT now\(\) AS ahora/, () => ({ rows: [{ ahora: "2026-10-01T16:00:00.000Z" }] }));
  bd.cuando(/COUNT\(\*\)::int AS total FROM asistencia_sync_lotes/, () => ({ rows: [{ total: 55 }] }));
  bd.cuando(/FROM asistencia_sync_lotes l LEFT JOIN asistencia_llaves k/, () => ({ rows: [{ id: 4, estatus: "ok" }] }));
}

beforeEach(() => {
  jest.clearAllMocks();
  bd.reiniciar();
  reglasBase();
  entrar("rh_admin");
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const RUTAS = [
  ["/turnos/uso", "Turnos"],
  ["/empleados", "Turnos"],
  [`/marcas?${RANGO}`, "Ingesta"],
  ["/marcas/codigos-sin-empleado", "Ingesta"],
  ["/empleados-sin-nomina", "Ingesta"],
  ["/sincronizacion/estado", "Ingesta"],
  ["/sincronizacion/lotes", "Ingesta"],
];

describe("Lectura de administración de asistencia - permisos", () => {
  it.each(RUTAS)("%s: 401 sin token", async (ruta) => {
    mockUser = null;
    const r = await request(app).get(BASE + ruta);
    expect(r.status).toBe(401);
    expect(bd.sqls()).toHaveLength(0);
  });

  describe.each(RUTAS)("%s", (ruta) => {
    it.each(["rh_admin", "super_admin"])("%s puede consultar", async (rol) => {
      entrar(rol === "super_admin" ? "rh_admin" : rol);
      mockUser.rol_nombre = rol;
      const r = await request(app).get(BASE + ruta);
      expect(r.status).toBe(200);
      expect(r.body.exito).toBe(true);
    });

    it.each(["portal_admin", "rh_empleado", "jefe", "empleado"])("%s recibe 403 y no toca los datos", async (rol) => {
      entrar(rol);
      const r = await request(app).get(BASE + ruta);
      expect(r.status).toBe(403);
      expect(bd.sqls()).toHaveLength(0);
    });
  });

  it("la lectura de Ingesta exige Ingesta y la de turnos exige Turnos (no se intercambian)", async () => {
    mockUser = { usuario_id: 5, rol_id: 3, rol_nombre: "rh_admin" };
    bd.estado.permisos = { Turnos: ["consulta"] };
    expect((await request(app).get(`${BASE}/sincronizacion/estado`)).status).toBe(403);
    expect((await request(app).get(`${BASE}/turnos/uso`)).status).toBe(200);
    bd.estado.permisos = { Ingesta: ["consulta"] };
    expect((await request(app).get(`${BASE}/turnos/uso`)).status).toBe(403);
    expect((await request(app).get(`${BASE}/sincronizacion/estado`)).status).toBe(200);
  });
});

describe("GET /turnos/uso", () => {
  it("devuelve el uso por turno y no choca con /turnos/:id", async () => {
    const r = await request(app).get(`${BASE}/turnos/uso`);
    expect(r.status).toBe(200);
    expect(r.body.datos).toEqual([{ turno_id: 1, departamentos: 2, empleados_individuales: 1, empleados_efectivos: 9 }]);
    expect(bd.hubo(/FROM turnos t WHERE t\.id = \$1/)).toBe(false);
  });
});

describe("GET /empleados (buscador)", () => {
  it("pagina, escapa los comodines y no interpola el texto en el SQL", async () => {
    const r = await request(app).get(`${BASE}/empleados`).query({ q: "100%_x'; DROP TABLE empleados;--", pagina: 3, limite: 10 });
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ total: 45, pagina: 3, limite: 10, paginas_totales: 5 });
    expect(r.body.datos.empleados[0].total).toBeUndefined();
    const llamada = bd.sqls()[0];
    expect(llamada.sql).not.toMatch(/DROP TABLE/);
    expect(llamada.params[0]).toBe("%100\\%\\_x'; DROP TABLE empleados;--%");
    expect(llamada.params.slice(1)).toEqual([10, 20]);
  });

  it.each([
    ["limite=51"],
    ["limite=0"],
    ["pagina=0"],
    ["pagina=1e3"],
    ["pagina=-1"],
    ["q[]=a"],
    [`q=${"a".repeat(101)}`],
    ["q=a%00b"],
  ])("rechaza %s con 400", async (consulta) => {
    const r = await request(app).get(`${BASE}/empleados?${consulta}`);
    expect(r.status).toBe(400);
    expect(bd.sqls()).toHaveLength(0);
  });
});

describe("GET /marcas", () => {
  it("devuelve la página con total y parámetros posicionales", async () => {
    const r = await request(app).get(`${BASE}/marcas?${RANGO}&pagina=2&limite=25`);
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ total: 120, pagina: 2, limite: 25, paginas_totales: 5 });
    expect(r.headers["cache-control"]).toBe("no-store");
    const consulta = bd.sqls().find((l) => /LIMIT/.test(l.sql));
    expect(consulta.params.slice(0, 2)).toEqual(["2026-10-01", "2026-10-07"]);
    expect(consulta.params.slice(-2)).toEqual([25, 25]);
  });

  it("no selecciona datos innecesarios (crudo, area_externa, hashes)", async () => {
    await request(app).get(`${BASE}/marcas?${RANGO}`);
    const sql = bd.sqls().map((l) => l.sql).join("\n");
    expect(sql).not.toMatch(/crudo|area_externa|hash/);
  });

  it("acepta exactamente 93 días y rechaza 94", async () => {
    expect((await request(app).get(`${BASE}/marcas?desde=2026-07-01&hasta=2026-10-01`)).status).toBe(200); // 93 días
    const r = await request(app).get(`${BASE}/marcas?desde=2026-07-01&hasta=2026-10-02`); // 94 días
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toMatch(/93 días/);
  });

  it("cuenta bien el rango a través de un cambio de año y de febrero", () => {
    expect(diasEntre("2025-12-31", "2026-01-01")).toBe(1);
    expect(diasEntre("2028-02-28", "2028-03-01")).toBe(2);
  });

  it.each([
    ["sin fechas", ""],
    ["falta hasta", "desde=2026-10-01"],
    ["fecha inexistente", "desde=2026-02-30&hasta=2026-03-02"],
    ["formato", "desde=01/10/2026&hasta=07/10/2026"],
    ["hasta anterior", "desde=2026-10-07&hasta=2026-10-01"],
    ["fecha repetida (arreglo)", "desde=2026-10-01&desde=2026-10-02&hasta=2026-10-07"],
    ["limite excesivo", `${RANGO}&limite=501`],
    ["pagina cero", `${RANGO}&pagina=0`],
    ["vinculadas inválido", `${RANGO}&vinculadas=quizas`],
    ["empleado_id con SQL", `${RANGO}&empleado_id=1;DROP`],
    ["empleado_id negativo", `${RANGO}&empleado_id=-3`],
    ["contar inválido", `${RANGO}&contar=2`],
    ["buscar arreglo", `${RANGO}&buscar[]=a`],
    ["terminal con control", `${RANGO}&terminal=a%0Ab`],
    ["codigo largo", `${RANGO}&codigo=${"9".repeat(101)}`],
  ])("400 por %s, sin consultar la BD", async (_nombre, consulta) => {
    const r = await request(app).get(`${BASE}/marcas?${consulta}`);
    expect(r.status).toBe(400);
    expect(r.body.exito).toBe(false);
    expect(bd.sqls()).toHaveLength(0);
  });

  it("combina filtros con parámetros y escapa los comodines del buscador y la terminal", async () => {
    const r = await request(app)
      .get(`${BASE}/marcas`)
      .query({ desde: "2026-10-01", hasta: "2026-10-07", buscar: "a_b%", terminal: "T%1", vinculadas: "no", empleado_id: "7", codigo: "1001" });
    expect(r.status).toBe(200);
    const c = bd.sqls().find((l) => /LIMIT/.test(l.sql));
    expect(c.sql).toMatch(/m\.empleado_id IS NULL/);
    expect(c.sql).not.toMatch(/a_b|T%1|1001/);
    expect(c.params).toEqual(expect.arrayContaining([7, "1001", "a_b%", "%a\\_b\\%%", "T%1", "%T\\%1%"]));
  });

  it("el rango es por día local de México: hasta es inclusivo (hasta + 1 día exclusivo) y la zona es explícita", async () => {
    await request(app).get(`${BASE}/marcas?${RANGO}`);
    const c = bd.sqls().find((l) => /LIMIT/.test(l.sql));
    expect(c.sql).toContain("m.marca_ts >= ($1::date::timestamp AT TIME ZONE 'America/Mexico_City')");
    expect(c.sql).toContain("m.marca_ts < (($2::date + 1)::timestamp AT TIME ZONE 'America/Mexico_City')");
  });

  it("contar=false omite el COUNT y deja total y paginas_totales en null", async () => {
    const r = await request(app).get(`${BASE}/marcas?${RANGO}&contar=false`);
    expect(r.status).toBe(200);
    expect(r.body.datos.total).toBeNull();
    expect(r.body.datos.paginas_totales).toBeNull();
    expect(bd.hubo(/COUNT\(\*\)/)).toBe(false);
  });

  it("vinculadas=si filtra las vinculadas", async () => {
    await request(app).get(`${BASE}/marcas?${RANGO}&vinculadas=si`);
    expect(bd.sqls().find((l) => /LIMIT/.test(l.sql)).sql).toMatch(/m\.empleado_id IS NOT NULL/);
  });

  it("un fallo de BD responde 500 genérico sin texto de la BD ni SQL", async () => {
    bd.reiniciar();
    bd.estado.permisos = PERMISOS_POR_ROL.rh_admin;
    bd.cuando(/FROM asistencia_marcas/, new Error('relation "asistencia_marcas" does not exist SELECT m.id'));
    const r = await request(app).get(`${BASE}/marcas?${RANGO}`);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/relation|SELECT|asistencia_marcas/);
  });
});

describe("GET /marcas/codigos-sin-empleado y /empleados-sin-nomina", () => {
  it("resume los códigos huérfanos con totales", async () => {
    const r = await request(app).get(`${BASE}/marcas/codigos-sin-empleado`);
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ total_codigos: 4, total_marcas: 10, limite: 200 });
    expect(r.body.datos.codigos[0]).toEqual({ codigo: "9999", marcas: 3, reciente: true });
    expect(bd.sqls()[0].params).toEqual([200]);
  });

  it("lista los activos sin nómina con tope", async () => {
    const r = await request(app).get(`${BASE}/empleados-sin-nomina`);
    expect(r.status).toBe(200);
    expect(r.body.datos).toEqual({ empleados: [{ id: 2, nombre: "Beto Ficticio", departamento: "Almacén" }], total: 3, limite: 200 });
  });

  it("responde 500 genérico ante un fallo", async () => {
    bd.reiniciar();
    bd.estado.permisos = PERMISOS_POR_ROL.rh_admin;
    bd.cuando(/FROM empleados e/, new Error("password authentication failed for user"));
    const r = await request(app).get(`${BASE}/empleados-sin-nomina`);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/password/);
  });
});

describe("GET /sincronizacion/*", () => {
  it("estado: usa la estimación si la tabla es grande y no hace COUNT total", async () => {
    const r = await request(app).get(`${BASE}/sincronizacion/estado`);
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({
      origen: "biotime",
      ultimo_id_externo: "100",
      total_marcas: 250000,
      total_marcas_estimado: true,
      marcas_sin_vincular: 7,
      ahora: "2026-10-01T16:00:00.000Z",
    });
    expect(bd.hubo(/SELECT COUNT\(\*\)::int AS total FROM asistencia_marcas WHERE origen = \$1$/)).toBe(false);
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("estado: una estimación pequeña (5 000 < umbral) no se usa: se cuenta exacto", async () => {
    bd.cuando(/FROM pg_class/, () => ({ rows: [{ estimado: "5000" }] }));
    bd.estado.reglas.unshift(bd.estado.reglas.pop());
    bd.cuando(/SELECT COUNT\(\*\)::int AS total FROM asistencia_marcas WHERE origen = \$1$/, () => ({ rows: [{ total: 4999 }] }));
    bd.estado.reglas.unshift(bd.estado.reglas.pop());
    const r = await request(app).get(`${BASE}/sincronizacion/estado`);
    expect(r.body.datos).toMatchObject({ total_marcas: 4999, total_marcas_estimado: false });
  });

  it("estado: con tabla pequeña o sin ANALYZE (reltuples -1) cuenta exacto", async () => {
    bd.reiniciar();
    bd.estado.permisos = PERMISOS_POR_ROL.rh_admin;
    bd.cuando(/FROM pg_class/, () => ({ rows: [{ estimado: "-1" }] }));
    bd.cuando(/SELECT COUNT\(\*\)::int AS total FROM asistencia_marcas WHERE origen = \$1$/, () => ({ rows: [{ total: 321 }] }));
    bd.cuando(/AND empleado_id IS NULL/, () => ({ rows: [{ total: 0 }] }));
    bd.cuando(/SELECT now\(\)/, () => ({ rows: [{ ahora: "x" }] }));
    const r = await request(app).get(`${BASE}/sincronizacion/estado`);
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ total_marcas: 321, total_marcas_estimado: false, ultimo_lote: null, ultimo_lote_ok: null });
  });

  it("estado: 500 genérico", async () => {
    bd.reiniciar();
    bd.estado.permisos = PERMISOS_POR_ROL.rh_admin;
    bd.cuando(/asistencia_sync_estado/, new Error("connection refused 10.1.2.3:5432"));
    const r = await request(app).get(`${BASE}/sincronizacion/estado`);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/10\.1\.2\.3|connection/);
  });

  it("lotes: pagina y valida", async () => {
    const r = await request(app).get(`${BASE}/sincronizacion/lotes?pagina=2&limite=20`);
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ total: 55, pagina: 2, limite: 20, paginas_totales: 3 });
    expect(bd.sqls().find((l) => /LIMIT/.test(l.sql)).params).toEqual(["biotime", 20, 20]);
    expect(bd.sqls().map((l) => l.sql).join("\n")).not.toMatch(/hash_cuerpo|l\.ip\b/);
    for (const c of ["limite=101", "pagina=0", "limite=abc"]) {
      expect((await request(app).get(`${BASE}/sincronizacion/lotes?${c}`)).status).toBe(400);
    }
  });
});
