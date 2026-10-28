// API de la relación cuenta <-> empleado: matriz de permisos por rol (verificarPermiso REAL con la consulta de permisos
// simulada), validaciones, errores genéricos y auditoría solo con ids/conteos. El modelo se simula: su lógica se prueba
// en empleadoCuenta.model.test.js y contra Postgres real aparte.
const request = require("supertest");
const express = require("express");

const USUARIOS_TOKEN = {
  "token-rh_admin": { usuario_id: 1, rol_id: 10, rol_nombre: "rh_admin" },
  "token-super_admin": { usuario_id: 2, rol_id: 11, rol_nombre: "super_admin" },
  "token-portal_admin": { usuario_id: 3, rol_id: 12, rol_nombre: "portal_admin" },
  "token-rh_empleado": { usuario_id: 4, rol_id: 13, rol_nombre: "rh_empleado" },
  "token-jefe": { usuario_id: 5, rol_id: 14, rol_nombre: "jefe" },
  "token-empleado": { usuario_id: 6, rol_id: 15, rol_nombre: "empleado" },
};
// permisos de la opción Empleados por rol (como el seed: edición solo rh_admin; rh_empleado y otros, lectura o nada)
const EMPLEADOS_POR_ROL = { 10: ["consulta", "edicion"], 12: [], 13: ["consulta"], 14: [], 15: [] };

jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, res, next) => {
    const t = (req.headers.authorization || "").replace("Bearer ", "");
    const u = USUARIOS_TOKEN[t];
    if (!u) return res.status(401).json({ exito: false, mensaje: "No autenticado" });
    req.user = u;
    next();
  },
}));
jest.mock("../../../portal/backend/config/database", () => ({
  grupo: {
    query: jest.fn(async (_sql, [rolId, , opcion, tipos]) => {
      const tiene = opcion === "Empleados" && (EMPLEADOS_POR_ROL[rolId] || []).some((t) => tipos.includes(t));
      return { rows: tiene ? [{ existe: 1 }] : [] };
    }),
  },
}));
jest.mock("../models/empleadoCuenta.model", () => {
  class ErrorVinculacion extends Error {
    constructor(estado, mensaje, extra) { super(mensaje); this.estado = estado; this.extra = extra || {}; }
  }
  return {
    ErrorVinculacion,
    vistaPrevia: jest.fn(), cuentasDisponibles: jest.fn(), vincularLote: jest.fn(), cambiarCuentaDeEmpleado: jest.fn(),
  };
});
jest.mock("../utils/auditoriaImportacion", () => ({ auditarImportacion: jest.fn(async () => {}) }));
jest.mock("../models/empleado.model", () => ({}));
jest.mock("../controllers/empleado.controller", () => {
  const f = (_req, res) => res.json({ exito: true });
  return { listar: f, importar: f, importarJefes: f, exportarParaImportacion: f, obtenerPorUsuario: f, listarSubordinados: f, obtener: f, crear: f, actualizar: f, marcarBaja: f };
});
jest.mock("../controllers/empleadoHijo.controller", () => {
  const f = (_req, res) => res.json({ exito: true });
  return { listar: f, crear: f, actualizar: f, eliminar: f };
});

const Modelo = require("../models/empleadoCuenta.model");
const { auditarImportacion } = require("../utils/auditoriaImportacion");

const app = express();
app.use(express.json());
app.use("/api/empleados", require("../routes/empleados.routes"));

const con = (rol) => (req) => (rol ? req.set("Authorization", `Bearer token-${rol}`) : req);
const ENDPOINTS = [
  ["get", "/api/empleados/cuentas/vista-previa", undefined],
  ["get", "/api/empleados/cuentas/disponibles", undefined],
  ["post", "/api/empleados/cuentas/vincular", { pares: [{ usuario_id: 1, empleado_id: 1 }], confirmar: true }],
  ["post", "/api/empleados/7/cuenta", { usuario_id: 3 }],
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  Modelo.vistaPrevia.mockResolvedValue({ contadores: {}, cuentas: [], total: 0 });
  Modelo.cuentasDisponibles.mockResolvedValue({ cuentas: [], total: 0 });
  Modelo.vincularLote.mockResolvedValue({ vinculadas: 1, omitidas: 0, sin_acceso_asistencia: 0, privilegiadas: 0, detalle: [{ usuario_id: 1, empleado_id: 1, resultado: "vinculada" }] });
  Modelo.cambiarCuentaDeEmpleado.mockResolvedValue({ accion: "vinculada", empleado_id: 7, usuario_id: 3, anterior: null, cuenta: { sin_acceso_asistencia: false, privilegiada: false } });
});

describe("permisos por rol", () => {
  describe.each(ENDPOINTS)("%s %s", (metodo, ruta, cuerpo) => {
    const llamar = (rol) => con(rol)(request(app)[metodo](ruta)).send(cuerpo);
    it("sin token: 401", async () => { expect((await llamar(null)).status).toBe(401); });
    it.each(["rh_admin", "super_admin"])("%s: permitido", async (rol) => { expect((await llamar(rol)).status).toBe(200); });
    it.each(["portal_admin", "rh_empleado", "jefe", "empleado"])("%s: 403 y no toca el modelo", async (rol) => {
      expect((await llamar(rol)).status).toBe(403);
      for (const f of Object.values(Modelo).filter((x) => typeof x === "function" && x.mock)) expect(f).not.toHaveBeenCalled();
    });
  });
});

describe("GET vista-previa y disponibles", () => {
  it("aplica el tope de página y valida el estado", async () => {
    await con("rh_admin")(request(app).get("/api/empleados/cuentas/vista-previa?limite=99999&pagina=abc&estado=hack"));
    expect(Modelo.vistaPrevia).toHaveBeenCalledWith({ pagina: 1, limite: 100, estado: "" });
    await con("rh_admin")(request(app).get("/api/empleados/cuentas/vista-previa?estado=varias&pagina=2&limite=10"));
    expect(Modelo.vistaPrevia).toHaveBeenLastCalledWith({ pagina: 2, limite: 10, estado: "varias" });
  });
  it("disponibles: búsqueda limpia y con tope", async () => {
    await con("rh_admin")(request(app).get(`/api/empleados/cuentas/disponibles?busqueda=${"a".repeat(300)}&limite=500`));
    const arg = Modelo.cuentasDisponibles.mock.calls[0][0];
    expect(arg.busqueda).toHaveLength(100);
    expect(arg.limite).toBe(100);
  });
  it("error interno: 500 genérico sin texto de la base", async () => {
    Modelo.vistaPrevia.mockRejectedValue(Object.assign(new Error('relation "usuarios" does not exist'), { code: "42P01" }));
    const r = await con("rh_admin")(request(app).get("/api/empleados/cuentas/vista-previa"));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/relation|usuarios|42P01/);
  });
});

describe("POST /cuentas/vincular", () => {
  const enviar = (cuerpo) => con("rh_admin")(request(app).post("/api/empleados/cuentas/vincular")).send(cuerpo);
  const par = { usuario_id: 1, empleado_id: 2 };
  it("exige confirmación explícita (confirmar === true)", async () => {
    for (const confirmar of [undefined, false, "true", 1]) expect((await enviar({ pares: [par], confirmar })).status).toBe(400);
    expect(Modelo.vincularLote).not.toHaveBeenCalled();
  });
  it("valida los pares (400) y el tope de 50", async () => {
    expect((await enviar({ pares: [], confirmar: true })).status).toBe(400);
    expect((await enviar({ pares: [{ usuario_id: "x", empleado_id: 1 }], confirmar: true })).status).toBe(400);
    const muchos = Array.from({ length: 51 }, (_, i) => ({ usuario_id: i + 1, empleado_id: i + 1 }));
    expect((await enviar({ pares: muchos, confirmar: true })).status).toBe(400);
    expect(Modelo.vincularLote).not.toHaveBeenCalled();
  });
  it("aplica y audita VINCULAR_CUENTAS solo con ids y conteos (sin correos ni nombres)", async () => {
    const r = await enviar({ pares: [par], confirmar: true });
    expect(r.status).toBe(200);
    expect(Modelo.vincularLote).toHaveBeenCalledWith([par], { confirmarPrivilegiadas: false });
    const [, tabla, accion, conteos, registro] = auditarImportacion.mock.calls[0];
    expect(tabla).toBe("empleados");
    expect(accion).toBe("VINCULAR_CUENTAS");
    expect(accion.length).toBeLessThanOrEqual(20);
    expect(registro).toBe("cuentas");
    expect(conteos).toEqual({ pares_recibidos: 1, vinculadas: 1, omitidas: 0, privilegiadas: 0, sin_acceso_asistencia: 0, pares: [[1, 1]] });
    expect(JSON.stringify(conteos)).not.toMatch(/@/);
  });
  it("confirmar_privilegiadas solo cuenta con true estricto", async () => {
    await enviar({ pares: [par], confirmar: true, confirmar_privilegiadas: "true" });
    expect(Modelo.vincularLote).toHaveBeenLastCalledWith([par], { confirmarPrivilegiadas: false });
    await enviar({ pares: [par], confirmar: true, confirmar_privilegiadas: true });
    expect(Modelo.vincularLote).toHaveBeenLastCalledWith([par], { confirmarPrivilegiadas: true });
  });
  it("409 del modelo (los datos cambiaron) se devuelve con sus conflictos y sin auditar", async () => {
    Modelo.vincularLote.mockRejectedValue(new Modelo.ErrorVinculacion(409, "Los datos cambiaron", { conflictos: [{ usuario_id: 1, empleado_id: 2, motivo: "cuenta_ya_vinculada" }] }));
    const r = await enviar({ pares: [par], confirmar: true });
    expect(r.status).toBe(409);
    expect(r.body.conflictos[0].motivo).toBe("cuenta_ya_vinculada");
    expect(auditarImportacion).not.toHaveBeenCalled();
  });
  it("error inesperado: 500 genérico", async () => {
    Modelo.vincularLote.mockRejectedValue(Object.assign(new Error("password authentication failed for user postgres"), { code: "28P01" }));
    const r = await enviar({ pares: [par], confirmar: true });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/password|postgres|28P01/);
  });
});

describe("POST /:id/cuenta", () => {
  const enviar = (cuerpo, id = 7) => con("rh_admin")(request(app).post(`/api/empleados/${id}/cuenta`)).send(cuerpo);
  it("valida id, usuario_id obligatorio, tipo y confirmación al desvincular", async () => {
    expect((await enviar({ usuario_id: 3 }, "x")).status).toBe(400);
    expect((await enviar({})).status).toBe(400);
    expect((await enviar({ usuario_id: "abc" })).status).toBe(400);
    expect((await enviar({ usuario_id: 0 })).status).toBe(400);
    expect((await enviar({ usuario_id: null })).status).toBe(400);
    expect((await enviar({ usuario_id: null, confirmar: "si" })).status).toBe(400);
    expect(Modelo.cambiarCuentaDeEmpleado).not.toHaveBeenCalled();
  });
  it("vincula y audita VINCULAR_CUENTA con ids", async () => {
    const r = await enviar({ usuario_id: 3 });
    expect(r.status).toBe(200);
    expect(r.body.datos.accion).toBe("vinculada");
    expect(auditarImportacion.mock.calls[0].slice(1)).toEqual(["empleados", "VINCULAR_CUENTA", { empleado_id: 7, usuario_id: 3 }, "7"]);
  });
  it("desvincula (confirmar true) y audita DESVINCULAR_CUENTA con el id anterior", async () => {
    Modelo.cambiarCuentaDeEmpleado.mockResolvedValue({ accion: "desvinculada", empleado_id: 7, usuario_id: null, anterior: 3, cuenta: null });
    const r = await enviar({ usuario_id: null, confirmar: true });
    expect(r.status).toBe(200);
    expect(Modelo.cambiarCuentaDeEmpleado).toHaveBeenCalledWith(7, null, { confirmarPrivilegiada: false });
    expect(auditarImportacion.mock.calls[0].slice(2, 4)).toEqual(["DESVINCULAR_CUENTA", { empleado_id: 7, usuario_id: 3 }]);
    expect("DESVINCULAR_CUENTA".length).toBeLessThanOrEqual(20);
  });
  it("desvincular a quien no tiene cuenta no audita", async () => {
    Modelo.cambiarCuentaDeEmpleado.mockResolvedValue({ accion: "sin_cuenta", empleado_id: 7, usuario_id: null, anterior: null, cuenta: null });
    expect((await enviar({ usuario_id: null, confirmar: true })).status).toBe(200);
    expect(auditarImportacion).not.toHaveBeenCalled();
  });
  it("empleado inexistente: 404; conflicto: 409; 500 genérico", async () => {
    Modelo.cambiarCuentaDeEmpleado.mockRejectedValueOnce(new Modelo.ErrorVinculacion(409, "x", { conflictos: [{ motivo: "empleado_no_existe" }] }));
    expect((await enviar({ usuario_id: 3 })).status).toBe(404);
    Modelo.cambiarCuentaDeEmpleado.mockRejectedValueOnce(new Modelo.ErrorVinculacion(409, "ya vinculada", { conflictos: [{ motivo: "cuenta_ya_vinculada" }] }));
    expect((await enviar({ usuario_id: 3 })).status).toBe(409);
    Modelo.cambiarCuentaDeEmpleado.mockRejectedValueOnce(new Error("boom interno"));
    const r = await enviar({ usuario_id: 3 });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/boom/);
  });
});
