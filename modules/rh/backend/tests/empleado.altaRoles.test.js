// Alta de empleado con usuario (POST /api/empleados con crear_usuario): la asignación de roles sigue la
// MISMA regla que el alta de usuarios del portal. rh_admin (rh/Empleados:edicion) no puede crear cuentas
// con super_admin, rh_admin ni tickets_admin; los demás roles sí. Rutas y controlador reales; modelos,
// GoTrue y auth sustituidos; el pool es el pool falso con estado de la delegación de roles.
const request = require("supertest");
const express = require("express");
const { crearPoolFalso, IDS, USUARIOS } = require("../../../portal/backend/tests/fakeDelegacion");

let mockUser;
const mockPool = crearPoolFalso();
jest.mock("../config/database", () => ({ grupo: mockPool }));
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
  crear: jest.fn(async (datos) => ({ id: 500, ...datos })),
  obtenerPorId: jest.fn(),
  obtenerPorUsuarioId: jest.fn(),
  actualizar: jest.fn(),
}));
jest.mock("../models/ubicacion.model", () => ({ siguienteFolio: jest.fn() }));
jest.mock("../../../portal/backend/models/usuario.model", () => ({
  buscarPorCorreo: jest.fn(),
  crear: jest.fn(),
  actualizar: jest.fn(),
  eliminar: jest.fn(),
}));
jest.mock("../../../portal/backend/services/supabaseAdmin.service", () => ({
  crearUsuario: jest.fn(),
  eliminarUsuario: jest.fn(),
}));
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(null),
}));

const Usuario = require("../../../portal/backend/models/usuario.model");
const SupabaseAdmin = require("../../../portal/backend/services/supabaseAdmin.service");
const Empleado = require("../models/empleado.model");

const app = express();
app.use(express.json());
app.use("/empleados", require("../routes/empleados.routes"));

const comoRhAdmin = () => {
  mockUser = { usuario_id: USUARIOS.rhAdmin, rol_id: IDS.rhAdmin, rol_nombre: "rh_admin" };
};
const comoSuperAdmin = () => {
  mockUser = { usuario_id: USUARIOS.super, rol_id: IDS.super, rol_nombre: "super_admin" };
};

const BASE = { nombre: "Ana", apellido_paterno: "Prueba", crear_usuario: true, correo: "ana@rayhsa.com.mx" };
const alta = (extra) => request(app).post("/empleados").send({ ...BASE, ...extra });

beforeEach(() => {
  mockPool.reiniciar();
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  Usuario.buscarPorCorreo.mockResolvedValue(undefined);
  Usuario.crear.mockResolvedValue({ id: 60 });
  Usuario.actualizar.mockResolvedValue({});
  Usuario.eliminar.mockResolvedValue({});
  SupabaseAdmin.crearUsuario.mockResolvedValue({ id: "uid-60" });
});
afterEach(() => jest.restoreAllMocks());

const nadaCreado = () => {
  expect(SupabaseAdmin.crearUsuario).not.toHaveBeenCalled();
  expect(Usuario.crear).not.toHaveBeenCalled();
  expect(Empleado.crear).not.toHaveBeenCalled();
  expect(mockPool.rolDe(60)).toEqual([]);
};

describe("POST /empleados con crear_usuario: roles iniciales", () => {
  describe("rh_admin (no es super_admin)", () => {
    beforeEach(comoRhAdmin);

    it.each([
      ["super_admin", IDS.super],
      ["rh_admin", IDS.rhAdmin],
      ["tickets_admin", IDS.ticketsAdmin],
    ])("rol_id %s -> 403 y no se crea nada (ni GoTrue, ni usuario, ni empleado, ni usuario_rol)", async (_n, rol) => {
      const r = await alta({ rol_id: rol });
      expect(r.status).toBe(403);
      expect(r.body.mensaje).toMatch(/solo un super_admin/);
      nadaCreado();
    });

    it("roles[] con un rol privilegiado entre otros -> 403 sin crear nada (no se asigna ni el permitido)", async () => {
      const r = await alta({ roles: [IDS.rhEmpleado, IDS.super] });
      expect(r.status).toBe(403);
      nadaCreado();
    });

    it("rol_id como texto numérico también se valida", async () => {
      const r = await alta({ rol_id: String(IDS.super) });
      expect(r.status).toBe(403);
      nadaCreado();
    });

    it("rol_id tiene prioridad sobre roles[], pero ambos se cierran: privilegiado en rol_id -> 403", async () => {
      const r = await alta({ rol_id: IDS.super, roles: [IDS.rhEmpleado] });
      expect(r.status).toBe(403);
      nadaCreado();
    });

    it("posesión estricta: un rol con permisos que rh_admin no posee (portal_admin, parcial) -> 403 sin crear nada", async () => {
      for (const extra of [{ rol_id: IDS.portal }, { rol_id: IDS.parcial }, { roles: [IDS.rhEmpleado, IDS.portal] }]) {
        const r = await alta(extra);
        expect(r.status).toBe(403);
        nadaCreado();
      }
    });

    it("un rol no privilegiado cuyos permisos rh_admin posee completos (rh_empleado) se asigna (201)", async () => {
      const r = await alta({ rol_id: IDS.rhEmpleado });
      expect(r.status).toBe(201);
      expect(mockPool.rolDe(60)).toEqual([IDS.rhEmpleado]);
      expect(SupabaseAdmin.crearUsuario).toHaveBeenCalledTimes(1);
    });

    it("roles[] no privilegiados (con duplicados) se asignan sin repetir", async () => {
      const r = await alta({ roles: [IDS.rhEmpleado, IDS.auditor, IDS.rhEmpleado] });
      expect(r.status).toBe(201);
      expect(mockPool.rolDe(60).sort()).toEqual([IDS.rhEmpleado, IDS.auditor].sort());
    });

    it("sin roles: 201 y sin usuario_rol", async () => {
      const r = await alta({});
      expect(r.status).toBe(201);
      expect(mockPool.rolDe(60)).toEqual([]);
    });

    it("rol inexistente -> 404 sin crear nada; ids inválidos -> 400", async () => {
      expect((await alta({ rol_id: 999 })).status).toBe(404);
      nadaCreado();
      for (const extra of [{ rol_id: "abc" }, { rol_id: [1] }, { rol_id: 2 ** 40 }, { roles: "1" }, { roles: [1, "x"] }, { roles: [{ id: 1 }] }]) {
        const r = await alta(extra);
        expect(r.status).toBe(400);
      }
      nadaCreado();
    });

    it("sin crear_usuario no hay asignación de roles ni validación (el empleado se crea sin cuenta)", async () => {
      const r = await request(app)
        .post("/empleados")
        .send({ nombre: "Ana", apellido_paterno: "P", rol_id: IDS.super });
      expect(r.status).toBe(201);
      expect(SupabaseAdmin.crearUsuario).not.toHaveBeenCalled();
      expect(mockPool.rolDe(60)).toEqual([]);
    });

    it("la conexión del pool se libera aunque se rechace el rol", async () => {
      await alta({ rol_id: IDS.super });
      expect(mockPool.liberadas).toBe(mockPool.conexiones);
    });
  });

  describe("super_admin", () => {
    beforeEach(comoSuperAdmin);

    it("puede crear la cuenta con super_admin, rh_admin o ambos (201)", async () => {
      expect((await alta({ rol_id: IDS.super })).status).toBe(201);
      expect(mockPool.rolDe(60)).toEqual([IDS.super]);
      mockPool.reiniciar();
      expect((await alta({ roles: [IDS.rhAdmin, IDS.ticketsAdmin] })).status).toBe(201);
      expect(mockPool.rolDe(60).sort()).toEqual([IDS.rhAdmin, IDS.ticketsAdmin].sort());
    });
  });
});
