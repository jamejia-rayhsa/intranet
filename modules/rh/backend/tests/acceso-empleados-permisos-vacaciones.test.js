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
jest.mock("../models/empleado.model", () => ({ obtenerPorUsuarioId: jest.fn() }));
jest.mock("../models/permisoAusencia.model", () => ({ obtenerPorId: jest.fn() }));
jest.mock("../models/solicitudVacaciones.model", () => ({ obtenerPorId: jest.fn() }));
const ok = (req, res) => res.json({ exito: true, query: req.query, body: req.body });
jest.mock("../controllers/empleado.controller", () => {
  const f = (req, res) => res.json({ exito: true });
  return { listar: f, importar: f, obtenerPorUsuario: f, listarSubordinados: f, obtener: f, crear: f, actualizar: f, marcarBaja: f };
});
jest.mock("../controllers/empleadoHijo.controller", () => {
  const f = (req, res) => res.json({ exito: true });
  return { listar: f, crear: f, actualizar: f, eliminar: f };
});
jest.mock("../controllers/permisos.controller", () => ({ listar: ok, obtener: ok, crear: ok, responder: ok }));
jest.mock("../controllers/vacaciones.controller", () => ({
  obtenerSaldo: ok, listar: ok, obtener: ok, crear: ok, responder: ok,
}));

const { tienePermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const Empleado = require("../models/empleado.model");
const Permiso = require("../models/permisoAusencia.model");
const Solicitud = require("../models/solicitudVacaciones.model");

const app = express();
app.use(express.json());
app.use("/empleados", require("../routes/empleados.routes"));
app.use("/permisos", require("../routes/permisos.routes"));
app.use("/vacaciones", require("../routes/vacaciones.routes"));

// tienePermiso(user, 'rh', opcion, tipo): RH si opcion=Empleados y el tipo cubre
function comoRH(tipos = ["consulta", "edicion"]) {
  mockUser = { usuario_id: 20, rol_id: 2 };
  tienePermiso.mockImplementation(async (_u, _m, opcion, tipo) => opcion === "Empleados" && tipos.includes(tipo));
}
function comoEmpleado(id) {
  mockUser = { usuario_id: 10, rol_id: 3 };
  tienePermiso.mockResolvedValue(false);
  Empleado.obtenerPorUsuarioId.mockResolvedValue(id ? { id } : undefined);
}

describe("RH: empleados, permisos de ausencia y vacaciones por propietario", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe("GET /empleados/:id", () => {
    it("dueno si; ajeno 403; sin empleado 403; id invalido 400", async () => {
      comoEmpleado(5);
      expect((await request(app).get("/empleados/5")).status).toBe(200);
      expect((await request(app).get("/empleados/6")).status).toBe(403);
      expect((await request(app).get("/empleados/x")).status).toBe(400);
      comoEmpleado(null);
      expect((await request(app).get("/empleados/5")).status).toBe(403);
    });
    it("Empleados:consulta ve cualquiera (aunque no tenga edicion)", async () => {
      comoRH(["consulta"]);
      expect((await request(app).get("/empleados/6")).status).toBe(200);
    });
    it("/mi-perfil sigue abierto; hijos y subordinados validan id numerico", async () => {
      comoEmpleado(5);
      expect((await request(app).get("/empleados/mi-perfil")).status).toBe(200);
      expect((await request(app).get("/empleados/x/hijos")).status).toBe(400);
      expect((await request(app).get("/empleados/jefe/x/subordinados")).status).toBe(400);
    });
  });

  describe("permisos de ausencia", () => {
    it("listado: no-RH queda forzado a su empleado, aunque pida otro", async () => {
      comoEmpleado(5);
      let r = await request(app).get("/permisos?empleado_id=6");
      expect(r.status).toBe(403);
      r = await request(app).get("/permisos");
      expect(r.status).toBe(200);
      expect(Number(r.body.query.empleado_id)).toBe(5);
      r = await request(app).get("/permisos?empleado_id=5");
      expect(r.status).toBe(200);
    });
    it("listado: sin empleado vinculado 403; RH sin forzar", async () => {
      comoEmpleado(null);
      expect((await request(app).get("/permisos")).status).toBe(403);
      comoRH();
      const r = await request(app).get("/permisos?empleado_id=6");
      expect(r.status).toBe(200);
      expect(r.body.query.empleado_id).toBe("6");
    });
    it("GET /:id: dueno si, ajeno e inexistente 403, RH si", async () => {
      comoEmpleado(5);
      Permiso.obtenerPorId.mockResolvedValue({ id: 1, empleado_id: 5 });
      expect((await request(app).get("/permisos/1")).status).toBe(200);
      Permiso.obtenerPorId.mockResolvedValue({ id: 2, empleado_id: 6 });
      expect((await request(app).get("/permisos/2")).status).toBe(403);
      Permiso.obtenerPorId.mockResolvedValue(undefined);
      expect((await request(app).get("/permisos/3")).status).toBe(403);
      comoRH();
      expect((await request(app).get("/permisos/2")).status).toBe(200);
    });
    it("crear: empleado ajeno 403; propio y sin empleado_id se fuerzan al propio; RH puede por otro", async () => {
      comoEmpleado(5);
      expect((await request(app).post("/permisos").send({ empleado_id: 6 })).status).toBe(403);
      let r = await request(app).post("/permisos").send({ empleado_id: 5, tipo: "otro" });
      expect(r.status).toBe(200);
      r = await request(app).post("/permisos").send({ tipo: "otro" });
      expect(r.body.body.empleado_id).toBe(5);
      comoRH();
      r = await request(app).post("/permisos").send({ empleado_id: 6 });
      expect(r.status).toBe(200);
      expect(r.body.body.empleado_id).toBe(6);
    });
    it("responder: solo RH (rh_empleado con Permisos:edicion no basta)", async () => {
      comoEmpleado(5);
      expect((await request(app).put("/permisos/1/responder").send({ estatus: "aprobado" })).status).toBe(403);
      comoRH();
      expect((await request(app).put("/permisos/1/responder").send({ estatus: "aprobado" })).status).toBe(200);
      expect((await request(app).put("/permisos/x/responder")).status).toBe(400);
    });
  });

  describe("vacaciones", () => {
    it("saldo: sin empleado_id pasa al controlador; ajeno 403; propio ok; RH ok", async () => {
      comoEmpleado(5);
      expect((await request(app).get("/vacaciones/saldo")).status).toBe(200);
      expect((await request(app).get("/vacaciones/saldo?empleado_id=5")).status).toBe(200);
      expect((await request(app).get("/vacaciones/saldo?empleado_id=6")).status).toBe(403);
      expect((await request(app).get("/vacaciones/saldo?empleado_id=x")).status).toBe(400);
      comoRH();
      expect((await request(app).get("/vacaciones/saldo?empleado_id=6")).status).toBe(200);
    });
    it("crear: por otro empleado 403; propio ok; RH ok", async () => {
      comoEmpleado(5);
      expect((await request(app).post("/vacaciones").send({ empleado_id: 6 })).status).toBe(403);
      expect((await request(app).post("/vacaciones").send({})).status).toBe(200);
      comoRH();
      expect((await request(app).post("/vacaciones").send({ empleado_id: 6 })).status).toBe(200);
    });
    it("GET /:id: dueno, jefe inmediato y RH; otro 403", async () => {
      Solicitud.obtenerPorId.mockResolvedValue({ id: 1, empleado_id: 5, jefe_inmediato_id: 8 });
      comoEmpleado(5);
      expect((await request(app).get("/vacaciones/1")).status).toBe(200);
      comoEmpleado(8);
      expect((await request(app).get("/vacaciones/1")).status).toBe(200);
      comoEmpleado(9);
      expect((await request(app).get("/vacaciones/1")).status).toBe(403);
      comoRH();
      expect((await request(app).get("/vacaciones/1")).status).toBe(200);
    });
    it("responder: jefe inmediato y RH si; solicitante, otro empleado e inexistente 403", async () => {
      Solicitud.obtenerPorId.mockResolvedValue({ id: 1, empleado_id: 5, jefe_inmediato_id: 8 });
      comoEmpleado(8);
      expect((await request(app).put("/vacaciones/1/responder").send({ estatus: "aprobado" })).status).toBe(200);
      comoEmpleado(5);
      expect((await request(app).put("/vacaciones/1/responder").send({ estatus: "aprobado" })).status).toBe(403);
      comoEmpleado(9);
      expect((await request(app).put("/vacaciones/1/responder").send({ estatus: "aprobado" })).status).toBe(403);
      Solicitud.obtenerPorId.mockResolvedValue(undefined);
      comoEmpleado(8);
      expect((await request(app).put("/vacaciones/2/responder")).status).toBe(403);
      comoRH();
      expect((await request(app).put("/vacaciones/1/responder").send({ estatus: "aprobado" })).status).toBe(200);
    });
    it("el jefe de si mismo no se auto-aprueba", async () => {
      Solicitud.obtenerPorId.mockResolvedValue({ id: 1, empleado_id: 8, jefe_inmediato_id: 8 });
      comoEmpleado(8);
      expect((await request(app).put("/vacaciones/1/responder").send({ estatus: "aprobado" })).status).toBe(403);
    });
  });
});
