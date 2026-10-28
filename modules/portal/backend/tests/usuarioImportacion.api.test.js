// API de "Importar usuarios": solo super_admin (matriz por rol con el middleware de la ruta REAL), validaciones de petición,
// forma de la respuesta, errores genéricos y auditoría solo con conteos e ids. El modelo se simula (ver usuarioImportacion.model.test.js).
const request = require("supertest");
const express = require("express");

const TOKENS = {
  "token-super_admin": { usuario_id: 2, rol_id: 1, rol_nombre: "super_admin" },
  "token-portal_admin": { usuario_id: 3, rol_id: 2, rol_nombre: "portal_admin" },
  "token-rh_admin": { usuario_id: 1, rol_id: 3, rol_nombre: "rh_admin" },
  "token-rh_empleado": { usuario_id: 4, rol_id: 4, rol_nombre: "rh_empleado" },
  "token-sin_rol": { usuario_id: 5, rol_id: null, rol_nombre: null },
};

jest.mock("../middleware/auth.middleware", () => ({
  authenticateJWT: (req, res, next) => {
    const u = TOKENS[(req.headers.authorization || "").replace("Bearer ", "")];
    if (!u) return res.status(401).json({ exito: false, mensaje: "No autenticado" });
    req.user = u;
    next();
  },
}));
// verificarPermiso REAL: todos los roles tendrían Usuarios:edicion; el 403 de importar debe venir de la regla de super_admin
jest.mock("../config/database", () => ({ grupo: { query: jest.fn(async () => ({ rows: [{ existe: 1 }] })) } }));
jest.mock("../controllers/usuario.controller", () => {
  const f = (_req, res) => res.json({ exito: true });
  return { listar: f, obtener: f, crear: f, actualizar: f, eliminar: f, resetearPassword: f, asignarRol: f };
});
jest.mock("../models/usuarioImportacion.model", () => {
  class ErrorImportacionUsuarios extends Error { constructor(e, m) { super(m); this.estado = e; } }
  return { ErrorImportacionUsuarios, vistaPrevia: jest.fn(), aplicar: jest.fn() };
});
jest.mock("../../../rh/backend/utils/auditoriaImportacion", () => ({ auditarImportacion: jest.fn(async () => {}) }));

const Modelo = require("../models/usuarioImportacion.model");
const { auditarImportacion } = require("../../../rh/backend/utils/auditoriaImportacion");

const app = express();
app.use(express.json());
app.use("/api/usuarios", require("../routes/usuario.routes"));

const fila = (i = 0) => ({ _fila: i + 2, correo: `u${i}@rayhsa.com.mx`, nombre: "Ana", apellido: "Prueba", numero_nomina: String(100 + i) });
const llamar = (token, ruta, cuerpo) => {
  const r = request(app).post(`/api/usuarios${ruta}`);
  if (token) r.set("Authorization", `Bearer ${token}`);
  return r.send(cuerpo);
};
const RUTAS = [["/importar/vista-previa", { filas: [fila()] }], ["/importar", { filas: [fila()], confirmar: true }]];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("permisos: solo super_admin", () => {
  it.each(RUTAS)("%s: sin token 401", async (ruta, cuerpo) => {
    expect((await llamar(null, ruta, cuerpo)).status).toBe(401);
  });
  for (const rol of ["portal_admin", "rh_admin", "rh_empleado", "sin_rol"]) {
    it.each(RUTAS)(`%s: ${rol} 403 aunque tenga Usuarios:edicion y sin tocar el modelo`, async (ruta, cuerpo) => {
      const r = await llamar(`token-${rol}`, ruta, cuerpo);
      expect(r.status).toBe(403);
      expect(r.body.mensaje).toMatch(/super_admin/);
    });
  }
  it("el 403 no deja rastro: ni modelo ni auditoría", async () => {
    await llamar("token-portal_admin", "/importar", { filas: [fila()], confirmar: true });
    expect(Modelo.aplicar).not.toHaveBeenCalled();
    expect(Modelo.vistaPrevia).not.toHaveBeenCalled();
    expect(auditarImportacion).not.toHaveBeenCalled();
  });
});

describe("vista previa", () => {
  it("super_admin recibe el resultado del modelo", async () => {
    Modelo.vistaPrevia.mockResolvedValue({ filas: [], resumen: { total: 1 }, rol: "rh_empleado" });
    const r = await llamar("token-super_admin", "/importar/vista-previa", { filas: [fila()] });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ exito: true, datos: { filas: [], resumen: { total: 1 }, rol: "rh_empleado" } });
    expect(Modelo.vistaPrevia.mock.calls[0][0][0].fila.correo).toBe("u0@rayhsa.com.mx");
  });
  it.each([[{}], [{ filas: [] }], [{ filas: "x" }], [{ filas: Array.from({ length: 201 }, (_, i) => fila(i)) }]])("400 con el cuerpo %#", async (cuerpo) => {
    const r = await llamar("token-super_admin", "/importar/vista-previa", cuerpo);
    expect(r.status).toBe(400);
    expect(Modelo.vistaPrevia).not.toHaveBeenCalled();
  });
  it("200 filas exactas pasan", async () => {
    Modelo.vistaPrevia.mockResolvedValue({ filas: [], resumen: {} });
    expect((await llamar("token-super_admin", "/importar/vista-previa", { filas: Array.from({ length: 200 }, (_, i) => fila(i)) })).status).toBe(200);
  });
  it("un error del modelo no filtra texto de la base de datos", async () => {
    Modelo.vistaPrevia.mockRejectedValue(Object.assign(new Error('duplicate key value violates unique constraint "usuarios_correo_key" Key (correo)=(ana@rayhsa.com.mx)'), { code: "23505" }));
    const r = await llamar("token-super_admin", "/importar/vista-previa", { filas: [fila()] });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/duplicate|ana@/);
  });
  it("el rol inexistente (409 del modelo) se informa", async () => {
    const { ErrorImportacionUsuarios } = Modelo;
    Modelo.vistaPrevia.mockRejectedValue(new ErrorImportacionUsuarios(409, "El rol rh_empleado no existe: no se puede importar"));
    const r = await llamar("token-super_admin", "/importar/vista-previa", { filas: [fila()] });
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toMatch(/rh_empleado/);
  });
});

describe("importar (aplicar)", () => {
  const resultado = {
    creadas: 1, omitidas: 1, errores: 1, verificar: 1,
    filas: [
      { fila: 2, nombre: "Ana Prueba", estado: "creada", motivo: "", usuario_id: 10, empleado_id: 20, avisos: ["El nombre del archivo no coincide con el del empleado (Beto Otro)"] },
      { fila: 3, nombre: "Luis Ficticio", estado: "omitida", motivo: "Ya existe una cuenta con ese correo; no se modificó", usuario_id: null, empleado_id: null, avisos: [] },
      { fila: 4, nombre: "Eva Demo", estado: "error", motivo: "Número de nómina ambiguo", usuario_id: null, empleado_id: null, avisos: [] },
      { fila: 5, nombre: "Raul Demo", estado: "verificar", motivo: "No se pudo confirmar", usuario_id: 11, empleado_id: null, avisos: [] },
    ],
  };

  it("exige la confirmación explícita", async () => {
    const r = await llamar("token-super_admin", "/importar", { filas: [fila()] });
    expect(r.status).toBe(400);
    expect(Modelo.aplicar).not.toHaveBeenCalled();
    expect((await llamar("token-super_admin", "/importar", { filas: [fila()], confirmar: "true" })).status).toBe(400);
  });
  it.each([[{ confirmar: true }], [{ confirmar: true, filas: [] }], [{ confirmar: true, filas: Array.from({ length: 201 }, (_, i) => fila(i)) }]])("400 con el cuerpo %#", async (cuerpo) => {
    expect((await llamar("token-super_admin", "/importar", cuerpo)).status).toBe(400);
    expect(Modelo.aplicar).not.toHaveBeenCalled();
  });
  it("responde con la forma del importador y el detalle por fila", async () => {
    Modelo.aplicar.mockResolvedValue(resultado);
    const r = await llamar("token-super_admin", "/importar", { filas: [fila()], confirmar: true });
    expect(r.status).toBe(200);
    const d = r.body.datos;
    expect(d).toMatchObject({ insertados: 1, duplicados: 1, verificar: 1 });
    expect(d.errores).toEqual([
      { fila: 4, nombre: "Eva Demo", error: "Número de nómina ambiguo" },
      { fila: 5, nombre: "Raul Demo", error: "Verificar: No se pudo confirmar" },
    ]);
    expect(d.duplicados_detalle).toEqual([{ fila: 3, nombre: "Luis Ficticio", motivo: "Ya existe una cuenta con ese correo; no se modificó" }]);
    expect(d.advertencias[0]).toMatchObject({ fila: 2, campo: "nombre", valor_recibido: null });
    expect(d.filas).toHaveLength(4);
  });
  it("audita IMPORTAR_USUARIOS en el módulo portal SOLO con conteos e ids (sin correos, nombres ni motivos)", async () => {
    Modelo.aplicar.mockResolvedValue(resultado);
    await llamar("token-super_admin", "/importar", { filas: [fila(), fila(1), fila(2), fila(3)], confirmar: true });
    expect(auditarImportacion).toHaveBeenCalledTimes(1);
    const [, tabla, accion, conteos, registroId, modulo] = auditarImportacion.mock.calls[0];
    expect([tabla, accion, registroId, modulo]).toEqual(["usuarios", "IMPORTAR_USUARIOS", "importacion", "portal"]);
    expect(conteos).toEqual({
      filas_recibidas: 4, creadas: 1, omitidas: 1, errores: 1, por_verificar: 1,
      usuarios_creados: [10], pares: [[10, 20]], usuarios_por_verificar: [11],
    });
    const texto = JSON.stringify(conteos);
    expect(texto).not.toMatch(/@|rayhsa|Ana|Luis|Eva|Prueba|ambiguo/);
    expect("IMPORTAR_USUARIOS".length).toBeLessThanOrEqual(20);
  });
  it("409 de otra importación en curso: sin auditar", async () => {
    const { ErrorImportacionUsuarios } = Modelo;
    Modelo.aplicar.mockRejectedValue(new ErrorImportacionUsuarios(409, "Hay otra importación de usuarios en curso"));
    const r = await llamar("token-super_admin", "/importar", { filas: [fila()], confirmar: true });
    expect(r.status).toBe(409);
    expect(auditarImportacion).not.toHaveBeenCalled();
  });
  it("error inesperado: 500 genérico", async () => {
    Modelo.aplicar.mockRejectedValue(new Error("connection refused db-interno"));
    const r = await llamar("token-super_admin", "/importar", { filas: [fila()], confirmar: true });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/db-interno|refused/);
  });
});
