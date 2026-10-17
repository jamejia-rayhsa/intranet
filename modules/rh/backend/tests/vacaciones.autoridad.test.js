// Quién puede aprobar o rechazar vacaciones: jefe inmediato VIGENTE del solicitante (empleados.jefe_inmediato_id
// al momento de responder, no el guardado en la solicitud), RH y super_admin; nadie lo propio. Rutas y controlador reales; modelos, permisos y auth sustituidos.
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
  obtenerFechasBloqueadas: jest.fn().mockResolvedValue([]),
  TIPO_BLOQUEO: "actividad",
}));
jest.mock("../models/solicitudVacaciones.model", () => ({
  obtenerPorId: jest.fn(),
  enTransaccion: jest.fn(),
  empleadoIdDeSolicitud: jest.fn(),
  jefeVigenteDeEmpleado: jest.fn(),
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
  85: { empleado: { id: 8 }, rh: false, edicionVacaciones: false }, // el jefe 8, pero solo con Vacaciones:consulta
};

function como(usuarioId) {
  mockUser = { usuario_id: usuarioId, rol_id: 2 };
  const { empleado, rh, edicionVacaciones = true } = USUARIOS[usuarioId];
  Empleado.obtenerPorUsuarioId.mockResolvedValue(empleado);
  tienePermiso.mockImplementation(async (_u, _m, opcion, tipo) => {
    if (opcion === "Vacaciones" && tipo === "edicion") return edicionVacaciones;
    return rh && opcion === "Empleados" && tipo === "edicion";
  });
}

// La solicitud, tal como la ve la ruta (sin bloqueo) y tal como la ve la transacción (bloqueada).
// `jefeId` = jefe VIGENTE del empleado (empleados.jefe_inmediato_id); `extra.jefe_inmediato_id` = el
// jefe guardado al crear (histórico: por defecto otro jefe, 77, para probar que NO decide nada).
function solicitud(empleadoId, jefeId, extra = {}) {
  return {
    id: 1,
    empleado_id: empleadoId,
    jefe_vigente_id: jefeId,
    jefe_inmediato_id: 77,
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
// La fila bloqueada de la transacción (SELECT * ... FOR UPDATE) NO trae el jefe vigente: se lee aparte
// con jefeVigenteDeEmpleado. Si el controlador dejara de leerlo, estas pruebas fallan.
const filaBloqueada = (sol) => {
  const fila = { ...sol };
  delete fila.jefe_vigente_id;
  return fila;
};
function preparar(enRuta, enTransaccion = enRuta) {
  Solicitud.obtenerPorId.mockResolvedValue(enRuta);
  Solicitud.empleadoIdDeSolicitud.mockResolvedValue(enTransaccion.empleado_id);
  Solicitud.jefeVigenteDeEmpleado.mockResolvedValue(enTransaccion.jefe_vigente_id);
  Solicitud.obtenerParaResponder.mockResolvedValue(filaBloqueada(enTransaccion));
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
  // Jefe VIGENTE: el jefe guardado al crear (77 por defecto, aquí 80) ya no autoriza; el nuevo sí
  ["jefe anterior (guardado en la solicitud) ya no autoriza", 80, solicitud(5, 9, { jefe_inmediato_id: 8 }), 403],
  ["jefe vigente aunque no sea el guardado", 90, solicitud(5, 9, { jefe_inmediato_id: 8 }), 200],
  ["jefe vigente en NULL: el guardado no autoriza", 80, solicitud(5, null, { jefe_inmediato_id: 8 }), 403],
  ["jefe vigente en NULL: RH sí", 200, solicitud(5, null, { jefe_inmediato_id: 8 }), 200],
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
        preparar(solicitud(5, 8), solicitud(5, 12)); // la ruta veia jefe 8; en la transaccion el vigente es 12
        const res = await accion();
        expect(res.status).toBe(403);
        expect(res.body.mensaje).toMatch(/autoridad/);
        expect(Solicitud.responder).not.toHaveBeenCalled();
        expect(Notificacion.notificarPermisoAprobado).not.toHaveBeenCalled();
      }
    });

    it("el jefe vigente se lee con el cliente de la transaccion, despues de bloquear la solicitud (nunca con el pool)", async () => {
      como(80);
      preparar(solicitud(5, 8));
      const cliente = { query: jest.fn() };
      Solicitud.enTransaccion.mockImplementation(async (fn) => fn(cliente));
      const orden = [];
      Solicitud.obtenerParaResponder.mockImplementation(async () => {
        orden.push("solicitud");
        return filaBloqueada(solicitud(5, 8));
      });
      Solicitud.jefeVigenteDeEmpleado.mockImplementation(async (empleadoId, c, bloquear) => {
        orden.push("jefe");
        expect(c).toBe(cliente);
        expect(empleadoId).toBe(5);
        expect(bloquear).toBe(true); // FOR SHARE: un cambio de jefe concurrente espera al COMMIT
        return 8;
      });
      expect((await aprobar()).status).toBe(200);
      expect(orden).toEqual(["solicitud", "jefe"]);
    });

    it("el jefe cambia entre la ruta y la transaccion a otra persona: el anterior pierde, el nuevo ya habia sido rechazado por la ruta", async () => {
      como(80);
      preparar(solicitud(5, 8), solicitud(5, 9)); // la ruta veia jefe 8; en la transaccion el vigente es 9
      const res = await aprobar();
      expect(res.status).toBe(403);
      expect(res.body.mensaje).toMatch(/autoridad/);
      expect(Solicitud.responder).not.toHaveBeenCalled();
    });

    it("403 de lo propio por la ruta (RH y jefe) con el mensaje especifico, no el generico", async () => {
      for (const usuario of [200, 300, 80]) {
        como(usuario);
        const propia = usuario === 200 ? 20 : usuario === 300 ? 30 : 8;
        preparar(solicitud(propia, 9));
        const res = await aprobar();
        expect(res.status).toBe(403);
        expect(res.body.mensaje).toBe("No puedes aprobar ni rechazar tu propia solicitud de vacaciones");
      }
    });

    it("403 de quien no es el jefe vigente por la ruta: mensaje de autoridad; inexistente: el generico", async () => {
      como(110);
      preparar(solicitud(5, 8));
      expect((await aprobar()).body.mensaje).toBe("No tienes autoridad para responder esta solicitud de vacaciones");
      Solicitud.obtenerPorId.mockResolvedValue(undefined);
      expect((await aprobar()).body.mensaje).toBe("No tienes acceso a este recurso");
    });

    it("el jefe llega a serlo entre la ruta y la transaccion: la ruta ya lo rechazo (403)", async () => {
      como(90);
      preparar(solicitud(5, 8), solicitud(5, 9)); // ruta: jefe 8; transaccion: jefe 9
      expect((await aprobar()).status).toBe(403);
      expect(Solicitud.obtenerParaResponder).not.toHaveBeenCalled();
    });

    it("lo propio: 403 con mensaje claro dentro de la transaccion aunque la ruta lo viera ajeno", async () => {
      como(200);
      preparar(solicitud(5, 8), solicitud(20, 8));
      Solicitud.empleadoIdDeSolicitud.mockResolvedValue(20);
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
        return filaBloqueada(solicitud(5, 8));
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
    it("el listado usa el jefe VIGENTE, no el guardado en la solicitud", async () => {
      como(80);
      Solicitud.listar.mockResolvedValue([
        { ...solicitud(5, 9, { jefe_inmediato_id: 8 }), id: 1 }, // guardado 8, vigente 9: ya no
        { ...solicitud(6, 8, { jefe_inmediato_id: 9 }), id: 2 }, // guardado 9, vigente 8: ahora si
      ]);
      Solicitud.contar.mockResolvedValue(2);
      const res = await request(app).get("/vacaciones");
      expect(res.body.datos.solicitudes.map((s) => s.puede_responder)).toEqual([false, true]);
    });
    it("sin Vacaciones:edicion (la ruta de responder lo exige) no se ofrece responder, ni al jefe", async () => {
      expect(await puede(85)).toEqual([false, false, false, false, false]);
    });
    it("solicitante comun: nada", async () => {
      expect(await puede(50)).toEqual([false, false, false, false, false]);
    });
    it("el listado decide RH por permiso (como responder), no por el nombre del rol: rh_admin sin Empleados:edicion ve solo su equipo", async () => {
      como(110);
      mockUser = { usuario_id: 110, rol_id: 2, rol_nombre: "rh_admin" };
      Solicitud.listar.mockResolvedValue([]);
      Solicitud.contar.mockResolvedValue(0);
      const res = await request(app).get("/vacaciones");
      expect(res.body.datos.es_admin).toBe(false);
      const filtros = Solicitud.listar.mock.calls[0][0];
      expect(filtros.ver_todo).toBeUndefined();
      expect(filtros.empleado_o_jefe_id).toBe(11);
    });
  });
});
