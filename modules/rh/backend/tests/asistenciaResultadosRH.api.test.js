/* eslint-env jest */
// Endpoints añadidos para las pantallas de resultados de RH: GET /resultados/dia, GET /ejecuciones,
// POST /resultados/exportaciones y los campos nuevos de /resumen, /periodos y /parametros.
const request = require("supertest");
const express = require("express");

let mockUser;
jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, _res, next) => {
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
jest.mock("../models/empleado.model", () => ({ obtenerPorUsuarioId: jest.fn() }));
jest.mock("../services/asistencia/motorAsistencia", () => ({
  leerParametros: jest.fn(),
  listarParametros: jest.fn(),
  guardarParametros: jest.fn(),
  cerrarPeriodo: jest.fn(),
  reabrirPeriodo: jest.fn(),
  recalcular: jest.fn(),
  recalcularDia: jest.fn(),
}));

const { __bd: bd } = require("../../../portal/backend/config/database");
const Auditoria = require("../../../auditoria/backend/models/auditoria.model");
const Empleado = require("../models/empleado.model");
const Motor = require("../services/asistencia/motorAsistencia");

const app = express();
app.use(express.json());
app.use("/api/asistencia", require("../routes/asistencia.routes"));

const ROLES = {
  empleado: { user: { usuario_id: 1, rol_id: 1, rol_nombre: "empleado" }, permisos: { Asistencia: ["consulta"] } },
  jefe: { user: { usuario_id: 2, rol_id: 2, rol_nombre: "empleado" }, permisos: { Asistencia: ["consulta"] } },
  rh_empleado: { user: { usuario_id: 4, rol_id: 4, rol_nombre: "rh_empleado" }, permisos: { Asistencia: ["consulta"] } },
  rh_lectura: { user: { usuario_id: 8, rol_id: 8, rol_nombre: "rh_lectura" }, permisos: { Asistencia: ["consulta"], Empleados: ["consulta", "edicion"] } },
  rh_admin: { user: { usuario_id: 5, rol_id: 5, rol_nombre: "rh_admin" }, permisos: { Asistencia: ["consulta", "edicion"], Empleados: ["consulta", "edicion"] } },
  super_admin: { user: { usuario_id: 6, rol_id: 6, rol_nombre: "super_admin" }, permisos: {} },
  portal_admin: { user: { usuario_id: 7, rol_id: 7, rol_nombre: "portal_admin" }, permisos: {} },
};
const FICHAS = { 1: { id: 10 }, 2: { id: 20 }, 4: { id: 40 }, 5: { id: 50 } };
const como = (rol) => {
  mockUser = ROLES[rol].user;
  bd.estado.permisos = ROLES[rol].permisos;
};
const get = (url) => request(app).get(url);
const DIA = "/api/asistencia/resultados/dia?empleado_id=21&fecha=2026-10-05";

const FILA_DIA = {
  id: 1, empleado_id: 21, fecha: "2026-10-05", estatus: "falta", cruza_medianoche: false, periodo_id: 3, periodo_estado: "abierto",
  nombre: "Ana", marcas_usadas: [], detalle: { explicaciones: ["Sin marcas"], banderas: [] },
  solicitud_vacaciones_id: null, permiso_id: null, calendario_id: null, incidencia_id: null, departamento_actual_id: 4,
};

beforeEach(() => {
  jest.clearAllMocks();
  bd.reiniciar();
  Empleado.obtenerPorUsuarioId.mockImplementation(async (uid) => FICHAS[uid]);
  bd.cuando(/FROM empleados\s+WHERE jefe_inmediato_id = \$1/, (_sql, p) => ({ rows: p[0] === 20 ? [{ id: 21 }] : [] }));
  bd.cuando(/FROM asistencia_diaria d\s+JOIN empleados e/, { rows: [{ ...FILA_DIA }] });
  bd.cuando(/FROM asistencia_marcas m/, { rows: [{ id: "9", marca_ts: "2026-10-05T14:00:00.000Z" }] });
  bd.cuando(/FROM asistencia_incidencias i/, { rows: [] });
  bd.cuando(/FROM asistencia_ejecuciones/, { rows: [{ id: "1", tipo: "completa", estado: "ok" }] });
  como("rh_admin");
});

describe("GET /resultados/dia", () => {
  it("RH recibe el día, las marcas y los cruces; el SQL va parametrizado y sin campos internos", async () => {
    const r = await get(DIA);
    expect(r.status).toBe(200);
    expect(r.body.datos.dia.estatus).toBe("falta");
    expect(r.body.datos.dia.departamento_actual_id).toBeUndefined();
    expect(r.body.datos.marcas).toHaveLength(1);
    expect(r.body.datos.cruces).toEqual({ vacaciones: null, permiso: null, festivo: null, justificacion: null });
    const q = bd.sqls().find((l) => /FROM asistencia_marcas m/.test(l.sql));
    expect(q.params).toEqual([21, "2026-10-05", 1]);
    expect(q.sql).not.toMatch(/2026-10-05/);
  });

  it("un turno que cruza la medianoche pide también el día siguiente", async () => {
    bd.estado.reglas.unshift({ re: /FROM asistencia_diaria d\s+JOIN empleados e/, respuesta: { rows: [{ ...FILA_DIA, cruza_medianoche: true }] } });
    await get(DIA);
    expect(bd.sqls().find((l) => /FROM asistencia_marcas m/.test(l.sql)).params[2]).toBe(2);
  });

  it("sin resultado calculado -> 404", async () => {
    bd.estado.reglas.unshift({ re: /FROM asistencia_diaria d\s+JOIN empleados e/, respuesta: { rows: [] } });
    expect((await get(DIA)).status).toBe(404);
  });

  it("RH ve quién justificó; un jefe no recibe ese dato", async () => {
    await get(DIA);
    expect(bd.sqls().find((l) => /FROM asistencia_incidencias i/.test(l.sql)).sql).toMatch(/concat_ws/);
    bd.reiniciar();
    bd.cuando(/FROM empleados\s+WHERE jefe_inmediato_id = \$1/, { rows: [{ id: 21 }] });
    bd.cuando(/FROM asistencia_diaria d\s+JOIN empleados e/, { rows: [{ ...FILA_DIA }] });
    como("jefe");
    expect((await get(DIA)).status).toBe(200);
    expect(bd.sqls().find((l) => /FROM asistencia_incidencias i/.test(l.sql)).sql).not.toMatch(/concat_ws/);
  });

  it.each(["empleado", "rh_empleado"])("%s: un empleado ajeno -> 403 y no consulta el día", async (rol) => {
    como(rol);
    expect((await get(DIA)).status).toBe(403);
    expect(bd.hubo(/FROM asistencia_diaria d\s+JOIN empleados e/)).toBe(false);
  });

  it("portal_admin sin Asistencia -> 403", async () => {
    como("portal_admin");
    expect((await get(DIA)).status).toBe(403);
  });

  it.each([
    ["empleado_id=abc&fecha=2026-10-05"],
    ["empleado_id=0&fecha=2026-10-05"],
    ["empleado_id=21"],
    ["empleado_id=21&fecha=2026-02-30"],
    ["empleado_id=21&fecha=05/10/2026"],
    ["empleado_id[]=21&fecha=2026-10-05"],
  ])("entrada inválida %s -> 400", async (q) => {
    expect((await get(`/api/asistencia/resultados/dia?${q}`)).status).toBe(400);
  });

  it("error de BD -> 500 genérico", async () => {
    bd.estado.reglas.unshift({ re: /FROM asistencia_diaria d\s+JOIN empleados e/, respuesta: Object.assign(new Error("secreto interno"), { code: "XX000" }) });
    const r = await get(DIA);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/secreto/);
  });
});

describe("GET /ejecuciones", () => {
  it.each(["empleado", "jefe", "rh_empleado", "portal_admin"])("%s -> 403", async (rol) => {
    como(rol);
    expect((await get("/api/asistencia/ejecuciones")).status).toBe(403);
  });
  it.each(["rh_lectura", "rh_admin", "super_admin"])("%s -> 200", async (rol) => {
    como(rol);
    const r = await get("/api/asistencia/ejecuciones?limite=5");
    expect(r.status).toBe(200);
    expect(bd.sqls().find((l) => /asistencia_ejecuciones/.test(l.sql)).params).toEqual([5]);
  });
  it.each(["0", "101", "x", "1.5"])("limite %s -> 400", async (l) => {
    expect((await get(`/api/asistencia/ejecuciones?limite=${l}`)).status).toBe(400);
  });
});

describe("POST /resultados/exportaciones", () => {
  const post = (cuerpo) => request(app).post("/api/asistencia/resultados/exportaciones").send(cuerpo);
  it.each(["empleado", "jefe", "rh_empleado", "portal_admin"])("%s -> 403 y sin auditoría", async (rol) => {
    como(rol);
    expect((await post({ tipo: "resumen", filas: 3 })).status).toBe(403);
    expect(Auditoria.crear).not.toHaveBeenCalled();
  });
  it.each(["rh_lectura", "rh_admin", "super_admin"])("%s registra solo tipo y conteo", async (rol) => {
    como(rol);
    const r = await post({ tipo: "detalle", filas: 120, nombre: "Ana" });
    expect(r.status).toBe(201);
    const a = Auditoria.crear.mock.calls[0][0];
    expect(a.accion).toBe("EXPORTAR_ASISTENCIA");
    expect(a.accion.length).toBeLessThanOrEqual(20);
    expect(a.valores_nuevos).toEqual({ tipo: "detalle", filas: 120 });
    Auditoria.crear.mockClear();
  });
  it.each([[{ tipo: "otro", filas: 1 }], [{ tipo: "resumen", filas: -1 }], [{ tipo: "resumen", filas: 10001 }], [{ tipo: "resumen", filas: "5" }], [{ filas: 5 }]])(
    "cuerpo inválido %j -> 400",
    async (cuerpo) => {
      expect((await post(cuerpo)).status).toBe(400);
      expect(Auditoria.crear).not.toHaveBeenCalled();
    },
  );
  it("si la bitácora falla responde 500 (la pantalla debe saberlo)", async () => {
    Auditoria.crear.mockRejectedValueOnce(new Error("x"));
    expect((await post({ tipo: "resumen", filas: 1 })).status).toBe(500);
  });
});

describe("campos nuevos de lectura", () => {
  it("/resumen calcula faltas con marcas, incompletas por comida y días con marcas", async () => {
    bd.cuando(/FROM asistencia_diaria d\s+JOIN empleados e\s+LEFT JOIN departamentos/, { rows: [] });
    // la regla de FILA_DIA (JOIN empleados e) tiene prioridad en esta prueba: se usa reglas.unshift
    bd.estado.reglas.unshift({ re: /COUNT\(\*\) FILTER/, respuesta: { rows: [] } });
    const r = await get("/api/asistencia/resumen?desde=2026-10-01&hasta=2026-10-15");
    expect(r.status).toBe(200);
    const sql = bd.sqls().find((l) => /FILTER/.test(l.sql)).sql;
    expect(sql).toMatch(/faltas_con_marcas/);
    expect(sql).toMatch(/incompletas_comida/);
    expect(sql).toMatch(/dias_con_marcas/);
    expect(sql).toMatch(/GROUP BY d\.empleado_id, e\.id, dep\.id/);
  });
  it("/periodos incluye días pendientes", async () => {
    bd.estado.reglas.unshift({ re: /FROM asistencia_periodos p/, respuesta: { rows: [] } });
    await get("/api/asistencia/periodos");
    expect(bd.sqls().find((l) => /FROM asistencia_periodos p/.test(l.sql)).sql).toMatch(/dias_pendientes/);
  });
  it("/periodos solo muestra nombres de quien cerró o reabrió a RH", async () => {
    const f = { id: 1, estado: "cerrado", cerrado_por: 5, cerrado_por_nombre: "Ana RH", reabierto_por: 5, reabierto_por_nombre: "Ana RH", reabierto_motivo: "m", total: "1" };
    bd.estado.reglas.unshift({ re: /FROM asistencia_periodos p/, respuesta: { rows: [f] } });
    como("rh_admin");
    expect((await get("/api/asistencia/periodos")).body.datos[0].cerrado_por_nombre).toBe("Ana RH");
    como("empleado");
    const p = (await get("/api/asistencia/periodos")).body.datos[0];
    expect(p.cerrado_por_nombre).toBeUndefined();
    expect(p.reabierto_por_nombre).toBeUndefined();
    expect(p.reabierto_motivo).toBeUndefined();
  });
  it("/parametros expone mínimo y máximo para validar en la pantalla", async () => {
    Motor.listarParametros.mockResolvedValue([{ clave: "dias_cierre", valor: "3", descripcion: "d" }]);
    const r = await get("/api/asistencia/parametros");
    const p = r.body.datos.find((x) => x.clave === "dias_cierre");
    expect(p.minimo).toBe(0);
    expect(p.maximo).toBe(30);
    expect(r.body.datos.find((x) => x.clave === "comida_desde").minimo).toBeNull();
  });
});
