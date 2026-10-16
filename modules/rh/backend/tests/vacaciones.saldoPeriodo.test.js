const request = require("supertest");
const express = require("express");

let mockUser;
jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, _res, next) => {
    req.user = mockUser;
    next();
  },
}));
jest.mock("../../../portal/backend/middleware/permisos.middleware", () => ({
  verificarPermiso: () => (_req, _res, next) => next(),
  tienePermiso: jest.fn(),
}));
jest.mock("../models/empleado.model", () => ({
  obtenerPorUsuarioId: jest.fn(),
  obtenerPorId: jest.fn(),
}));
jest.mock("../models/solicitudVacaciones.model", () => ({
  obtenerPorId: jest.fn(),
  calcularSaldo: jest.fn(),
  tieneTraslape: jest.fn(),
  obtenerCupoDepartamento: jest.fn(),
  ocupacionPorDia: jest.fn(),
}));
jest.mock("../models/calendarioLaboral.model", () => ({ listar: jest.fn() }));
jest.mock("../services/notificacion.service", () => ({}));
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn(),
}));

const { tienePermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const Empleado = require("../models/empleado.model");
const Solicitud = require("../models/solicitudVacaciones.model");
const Calendario = require("../models/calendarioLaboral.model");

const app = express();
app.use(express.json());
app.use("/vacaciones", require("../routes/vacaciones.routes"));

const ANIO = new Date().getFullYear();
const INT4_MAX = 2147483647;

function comoRH() {
  mockUser = { usuario_id: 20, rol_id: 2 };
  tienePermiso.mockResolvedValue(true);
}
function comoEmpleado(id) {
  mockUser = { usuario_id: 10, rol_id: 3 };
  tienePermiso.mockResolvedValue(false);
  Empleado.obtenerPorUsuarioId.mockResolvedValue({ id, departamento_id: null });
}

describe("GET /vacaciones/saldo: periodo por query (solo lectura)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Solicitud.calcularSaldo.mockResolvedValue({ dias_periodo: 12, dias_pendientes: 12 });
    comoEmpleado(5);
  });

  it("sin periodo usa el año actual", async () => {
    const r = await request(app).get("/vacaciones/saldo");
    expect(r.status).toBe(200);
    expect(Solicitud.calcularSaldo).toHaveBeenCalledWith(5, ANIO);
    expect(r.body.datos.periodo).toBe(ANIO);
  });

  it.each([ANIO - 10, ANIO, ANIO + 2])("acepta el año %i (dentro de actual-10 .. actual+2)", async (anio) => {
    const r = await request(app).get(`/vacaciones/saldo?periodo=${anio}`);
    expect(r.status).toBe(200);
    expect(Solicitud.calcularSaldo).toHaveBeenCalledWith(5, anio);
    expect(r.body.datos.periodo).toBe(anio);
  });

  it.each([
    [String(ANIO - 11)],
    [String(ANIO + 3)],
    ["2045"],
    ["0"],
    ["-2026"],
    ["abc"],
    ["2026.5"],
    ["2e3"],
    ["20260"],
    [" 2026"],
    ["2026abc"],
  ])("rechaza periodo=%s con 400 y no consulta el saldo", async (periodo) => {
    const r = await request(app).get(`/vacaciones/saldo?periodo=${encodeURIComponent(periodo)}`);
    expect(r.status).toBe(400);
    expect(r.body.exito).toBe(false);
    expect(r.body.mensaje).toMatch(/periodo/i);
    expect(Solicitud.calcularSaldo).not.toHaveBeenCalled();
  });

  it("rechaza periodo repetido (arreglo) con 400", async () => {
    const r = await request(app).get(`/vacaciones/saldo?periodo=${ANIO}&periodo=${ANIO - 1}`);
    expect(r.status).toBe(400);
    expect(Solicitud.calcularSaldo).not.toHaveBeenCalled();
  });
});

describe("empleado_id fuera de int4: 400 en /saldo, /disponibilidad y /ocupacion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    comoRH();
    Empleado.obtenerPorId.mockResolvedValue(null);
  });

  const rutas = [
    ["/vacaciones/saldo", ""],
    ["/vacaciones/disponibilidad", "&fecha_inicial=2026-10-19&fecha_final=2026-10-20"],
    ["/vacaciones/ocupacion", "&desde=2026-10-01&hasta=2026-10-31"],
  ];

  it.each(rutas)("RH: %s con empleado_id = int4 máximo + 1 da 400 sin tocar la BD", async (ruta, extra) => {
    const r = await request(app).get(`${ruta}?empleado_id=${INT4_MAX + 1}${extra}`);
    expect(r.status).toBe(400);
    expect(r.body.exito).toBe(false);
    expect(Empleado.obtenerPorId).not.toHaveBeenCalled();
    expect(Solicitud.calcularSaldo).not.toHaveBeenCalled();
  });

  it.each(rutas)("RH: %s con un número enorme (30 dígitos) da 400", async (ruta, extra) => {
    const r = await request(app).get(`${ruta}?empleado_id=${"9".repeat(30)}${extra}`);
    expect(r.status).toBe(400);
  });

  it.each(rutas)("RH: %s con el int4 máximo llega al controlador (404 si no existe)", async (ruta, extra) => {
    Solicitud.calcularSaldo.mockResolvedValue(null);
    const r = await request(app).get(`${ruta}?empleado_id=${INT4_MAX}${extra}`);
    expect(r.status).toBe(404);
  });

  it("un empleado (no RH) con empleado_id gigante también recibe 400, no 403 ni 500", async () => {
    comoEmpleado(5);
    const r = await request(app).get(`/vacaciones/saldo?empleado_id=${INT4_MAX + 1}`);
    expect(r.status).toBe(400);
  });

  it("GET /vacaciones/:id con id fuera de int4 da 400", async () => {
    const r = await request(app).get(`/vacaciones/${INT4_MAX + 1}`);
    expect(r.status).toBe(400);
    expect(Solicitud.obtenerPorId).not.toHaveBeenCalled();
  });
});

describe("disponibilidad no toma el periodo del cliente", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    comoEmpleado(5);
    Empleado.obtenerPorId.mockResolvedValue({ id: 5, departamento_id: null });
    Calendario.listar.mockResolvedValue([]);
    Solicitud.calcularSaldo.mockResolvedValue({ dias_pendientes: 12 });
    Solicitud.tieneTraslape.mockResolvedValue(false);
  });

  it("con periodo=2040 en la query calcula el saldo del año de fecha_inicial", async () => {
    const r = await request(app).get(
      "/vacaciones/disponibilidad?fecha_inicial=2026-10-19&fecha_final=2026-10-20&periodo=2040",
    );
    expect(r.status).toBe(200);
    expect(Solicitud.calcularSaldo).toHaveBeenCalledWith(5, 2026);
  });
});
