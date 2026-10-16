// Quién puede aprobar o rechazar vacaciones: jefe inmediato del solicitante, RH y super_admin;
// nadie lo propio. Rutas y controlador reales; modelos, permisos y auth sustituidos.
// La autoridad real se comprueba dentro de la transacción con la solicitud ya bloqueada.
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
jest.mock("../services/notificacion.service", () => ({
  notificarNuevoPermiso: jest.fn().mockResolvedValue(),
  notificarPermisoAprobado: jest.fn().mockResolvedValue(),
  notificarPermisoRechazado: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(null),
}));
jest.mock("../models/empleado.model", () => ({
  obtenerPorUsuarioId: jest.fn(),
  obtenerPorId: jest.fn(),
}));
jest.mock("../models/calendarioLaboral.model", () => ({
  obtenerFechasNoHabiles: jest.fn().mockResolvedValue([]),
}));
jest.mock("../models/solicitudVacaciones.model", () => ({
  obtenerPorId: jest.fn(),
  enTransaccion: jest.fn(),
  empleadoIdDeSolicitud: jest.fn(),
  bloquearEmpleado: jest.fn(),
  obtenerParaResponder: jest.fn(),
  bloquearDepartamento: jest.fn(),
  tieneTraslape: jest.fn(),
  calcularSaldo: jest.fn(),
  responder: jest.fn(),
  listar: jest.fn(),
  contar: jest.fn(),
}));

const { tienePermiso } = require("../../../portal/backend/middleware/permisos.middleware");
const Empleado = require("../models/empleado.model");
const Solicitud = require("../models/solicitudVacaciones.model");
const Notificacion = require("../services/notificacion.service");

const app = express();
app.use(express.json());
app.use("/vacaciones", require("../routes/vacaciones.routes"));

// usuario_id -> { empleado, rh }
const USUARIOS = {
  50: { empleado: { id: 5 }, rh: false }, // solicitante común (jefe 8)
  80: { empleado: { id: 8 }, rh: false }, // jefe de 5 (su jefe es 9)
  90: { empleado: { id: 9 }, rh: false }, // jefe del jefe
  110: { empleado: { id: 11 }, rh: false }, // empleado común sin relación
  200: { empleado: { id: 20 }, rh: true }, // rh_admin
  300: { empleado: { id: 30 }, rh: true }, // super_admin
  400: { empleado: undefined, rh: true }, // rh sin empleado vinculado
  410: { empleado: undefined, rh: false }, // usuario sin empleado ni RH
};

function como(usuarioId) {
  mockUser = { usuario_id: usuarioId, rol_id: 2 };
  const { empleado, rh } = USUARIOS[usuarioId];
  Empleado.obtenerPorUsuarioId.mockResolvedValue(empleado);
  tienePermiso.mockImplementation(async (_u, _m, opcion, tipo) => rh && opcion === "Empleados" && tipo === "edicion");
}

// La solicitud, tal como la ve la ruta (sin bloqueo) y tal como la ve la transacción (bloqueada)
function solicitud(empleadoId, jefeId, extra = {}) {
  return {
    id: 1,
    empleado_id: empleadoId,
    jefe_inmediato_id: jefeId,
    estatus: "pendiente",
    departamento_id: null,
    periodo: 2026,
    dias_a_disfrutar: 2,
    fecha_inicial: "2026-11-02",
    fecha_final: "2026-11-03",
    fecha_inicial_txt: "2026-11-02",
    fecha_final_txt: "2026-11-03",
    ...extra,
  };
}
function preparar(enRuta, enTransaccion = enRuta) {
  Solicitud.obtenerPorId.mockResolvedValue(enRuta);
  Solicitud.empleadoIdDeSolicitud.mockResolvedValue(enTransaccion.empleado_id);
  Solicitud.obtenerParaResponder.mockResolvedValue(enTransaccion);
  Solicitud.responder.mockImplementation(async (id, estatus) => ({ id, estatus }));
}

const aprobar = () => request(app).put("/vacaciones/1/responder").send({ estatus: "aprobado" });
const rechazar = () =>
  request(app).put("/vacaciones/1/responder").send({ estatus: "rechazado", motivo_rechazo: "Cobertura" });

// Empleado 5 (jefe 8), empleado 8 (jefe 9), empleado 6 (sin jefe), RH 20 y super 30 (sin jefe)
const MATRIZ = [
  ["jefe del solicitante", 80, solicitud(5, 8), 200],
  ["RH de otro", 200, solicitud(5, 8), 200],
  ["super_admin de otro", 300, solicitud(5, 8), 200],
  ["RH sin empleado vinculado, de otro", 400, solicitud(5, 8), 200],
  ["jefe del jefe (solicitud de un jefe)", 90, solicitud(8, 9), 200],
  ["RH, solicitud de un jefe", 200, solicitud(8, 9), 200],
  ["RH, solicitante sin jefe", 200, solicitud(6, null), 200],
  ["super_admin, solicitante sin jefe", 300, solicitud(6, null), 200],
  ["RH propio", 200, solicitud(20, null), 403],
  ["RH propio aunque tenga jefe", 200, solicitud(20, 8), 403],
  ["super_admin propio", 300, solicitud(30, null), 403],
  ["jefe propio (su jefe es otro)", 80, solicitud(8, 9), 403],
  ["jefe de otra persona", 90, solicitud(5, 8), 403],
  ["empleado común", 110, solicitud(5, 8), 403],
  ["solicitante común, lo propio", 50, solicitud(5, 8), 403],
  ["sin jefe: empleado común", 110, solicitud(6, null), 403],
  ["sin jefe: un jefe de otro equipo", 80, solicitud(6, null), 403],
  ["usuario sin empleado ni RH", 410, solicitud(5, 8), 403],
];

describe("Vacaciones - autoridad para aprobar y rechazar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    Solicitud.enTransaccion.mockImplementation(async (fn) => fn({ query: jest.fn() }));
    Solicitud.tieneTraslape.mockResolvedValue(false);
    Solicitud.calcularSaldo.mockResolvedValue(null);
    Empleado.obtenerPorId.mockResolvedValue({ id: 5, usuario_correo: "a@rayhsa.com.mx" });
  });
  afterEach(() => jest.restoreAllMocks());

  describe.each([
    ["aprobar", aprobar],
    ["rechazar", rechazar],
  ])("%s", (_nombre, accion) => {
    it.each(MATRIZ)("%s -> %i", async (_caso, usuario, sol, esperado) => {
      como(usuario);
      preparar(sol);
      const res = await accion();
      expect(res.status).toBe(esperado);
      if (esperado === 403) {
        expect(Solicitud.responder).not.toHaveBeenCalled();
        expect(Notificacion.notificarPermisoAprobado).not.toHaveBeenCalled();
        expect(Notificacion.notificarPermisoRechazado).not.toHaveBeenCalled();
      } else {
        expect(Solicitud.responder).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe("la transaccion es la autoridad", () => {
    it("el jefe cambia entre la ruta y la transaccion: 403 y sin cambios (aprobar y rechazar)", async () => {
      for (const accion of [aprobar, rechazar]) {
        jest.clearAllMocks();
        Solicitud.enTransaccion.mockImplementation(async (fn) => fn({ query: jest.fn() }));
        como(80);
        preparar(solicitud(5, 8), solicitud(5, 12)); // la ruta veia jefe 8; la fila bloqueada, jefe 12
        const res = await accion();
        expect(res.status).toBe(403);
        expect(res.body.mensaje).toMatch(/autoridad/);
        expect(Solicitud.responder).not.toHaveBeenCalled();
        expect(Notificacion.notificarPermisoAprobado).not.toHaveBeenCalled();
      }
    });

    it("el jefe llega a serlo entre la ruta y la transaccion: la ruta ya lo rechazo (403)", async () => {
      como(90);
      preparar(solicitud(5, 8), solicitud(5, 9));
      expect((await aprobar()).status).toBe(403);
      expect(Solicitud.obtenerParaResponder).not.toHaveBeenCalled();
    });

    it("lo propio: 403 con mensaje claro dentro de la transaccion aunque la ruta lo viera ajeno", async () => {
      como(200);
      preparar(solicitud(5, 8), solicitud(20, 8));
      const res = await aprobar();
      expect(res.status).toBe(403);
      expect(res.body.mensaje).toMatch(/tu propia solicitud/);
      expect(Solicitud.responder).not.toHaveBeenCalled();
    });

    it("la autoridad se comprueba antes del 409 de 'ya respondida' (no revela estado)", async () => {
      como(110);
      preparar(solicitud(5, 8), solicitud(5, 8, { estatus: "aprobado" }));
      expect((await aprobar()).status).toBe(403);
    });

    it("un autorizado ante una ya respondida recibe 409", async () => {
      como(80);
      preparar(solicitud(5, 8, { estatus: "aprobado" }));
      expect((await aprobar()).status).toBe(409);
    });

    it("no consulta el pool dentro de la transaccion: tienePermiso se resuelve antes de enTransaccion", async () => {
      como(200);
      preparar(solicitud(5, 8));
      const orden = [];
      tienePermiso.mockImplementation(async () => {
        orden.push("tienePermiso");
        return true;
      });
      Solicitud.enTransaccion.mockImplementation(async (fn) => {
        orden.push("tx");
        return fn({ query: jest.fn() });
      });
      expect((await aprobar()).status).toBe(200);
      expect(orden.filter((o) => o === "tienePermiso").length).toBeGreaterThan(0);
      const ultimoPermiso = orden.lastIndexOf("tienePermiso");
      expect(ultimoPermiso).toBeLessThan(orden.indexOf("tx"));
    });

    it("conserva el orden de bloqueos empleado -> solicitud al aprobar", async () => {
      como(80);
      preparar(solicitud(5, 8));
      const orden = [];
      Solicitud.bloquearEmpleado.mockImplementation(async () => orden.push("empleado"));
      Solicitud.obtenerParaResponder.mockImplementation(async () => {
        orden.push("solicitud");
        return solicitud(5, 8);
      });
      expect((await aprobar()).status).toBe(200);
      expect(orden).toEqual(["empleado", "solicitud"]);
    });
  });

  describe("listado: puede_responder", () => {
    const sols = [
      { ...solicitud(5, 8), id: 1 },
      { ...solicitud(8, 9), id: 2 },
      { ...solicitud(20, null), id: 3 },
      { ...solicitud(6, null), id: 4 },
      { ...solicitud(5, 8, { estatus: "aprobado" }), id: 5 },
    ];
    const puede = async (usuario) => {
      como(usuario);
      Solicitud.listar.mockResolvedValue(sols);
      Solicitud.contar.mockResolvedValue(sols.length);
      const res = await request(app).get("/vacaciones");
      return res.body.datos.solicitudes.map((s) => s.puede_responder);
    };
    it("RH: todo menos lo propio y lo ya respondido", async () => {
      expect(await puede(200)).toEqual([true, true, false, true, false]);
    });
    it("super_admin con empleado propio (30) puede con todo lo pendiente", async () => {
      expect(await puede(300)).toEqual([true, true, true, true, false]);
    });
    it("jefe: solo las de su equipo; no la propia", async () => {
      expect(await puede(80)).toEqual([true, false, false, false, false]);
    });
    it("solicitante comun: nada", async () => {
      expect(await puede(50)).toEqual([false, false, false, false, false]);
    });
  });
});
