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
  // F-R2A-T4: RH solo con Empleados:edicion (sin Asistencia:consulta) lee la gestión y no escribe
  solo_empleados: { user: { usuario_id: 9, rol_id: 9, rol_nombre: "solo_empleados" }, permisos: { Empleados: ["consulta", "edicion"] } },
  rh_admin: { user: { usuario_id: 5, rol_id: 5, rol_nombre: "rh_admin" }, permisos: { Asistencia: ["consulta", "edicion"], Empleados: ["consulta", "edicion"] } },
  super_admin: { user: { usuario_id: 6, rol_id: 6, rol_nombre: "super_admin" }, permisos: {} },
  // grants reales de la migración 012: cualquier rol con Vacaciones/Empleados de consulta recibe Asistencia:consulta
  portal_admin: { user: { usuario_id: 7, rol_id: 7, rol_nombre: "portal_admin" }, permisos: { Asistencia: ["consulta"] } },
};
const FICHAS = { 1: { id: 10 }, 2: { id: 20 }, 4: { id: 40 }, 5: { id: 50 }, 7: { id: 70 } };
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

let contadores;
beforeEach(() => {
  jest.clearAllMocks();
  bd.reiniciar();
  Empleado.obtenerPorUsuarioId.mockImplementation(async (uid) => FICHAS[uid]);
  bd.cuando(/FROM empleados\s+WHERE jefe_inmediato_id = \$1/, (_sql, p) => ({ rows: p[0] === 20 ? [{ id: 21 }] : [] }));
  Motor.leerParametros.mockResolvedValue({ analisis_desde: "2026-09-01" });
  contadores = { estado: "abierto", dias_pendientes: 0, ajustes_pendientes: 0 };
  bd.cuando(/FROM asistencia_periodos p\s+WHERE p\.id = \$1/, () => ({ rows: contadores ? [contadores] : [] }));
  bd.cuando(/FROM asistencia_diaria d\s+JOIN empleados e/, { rows: [{ ...FILA_DIA }] });
  bd.cuando(/FROM asistencia_marcas m/, { rows: [{ id: "9", marca_ts: "2026-10-05T14:00:00.000Z", terminal_alias: "SEDE-A" }] });
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
  it.each([[{ tipo: "otro", filas: 1 }], [{ tipo: "resumen", filas: -1 }], [{ tipo: "resumen", filas: 15001 }], [{ tipo: "resumen", filas: "5" }], [{ filas: 5 }]])(
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
  it("/periodos solo muestra nombres e id de quien cerró o reabrió a RH", async () => {
    const f = { id: 1, estado: "cerrado", cerrado_por: 5, cerrado_por_nombre: "Ana RH", reabierto_por: 5, reabierto_por_nombre: "Ana RH", reabierto_motivo: "m", total: "1" };
    bd.estado.reglas.unshift({ re: /FROM asistencia_periodos p/, respuesta: { rows: [f] } });
    como("rh_admin");
    expect((await get("/api/asistencia/periodos")).body.datos[0].cerrado_por_nombre).toBe("Ana RH");
    como("empleado");
    const p = (await get("/api/asistencia/periodos")).body.datos[0];
    expect(p.cerrado_por_nombre).toBeUndefined();
    expect(p.cerrado_por).toBeUndefined();
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

describe("GET /resultados/dia - IDOR de jefe y datos solo de RH", () => {
  it("un jefe ve a su subordinado directo (200) y NO a un empleado que no lo es (403, sin consultar el día)", async () => {
    como("jefe");
    expect((await get("/api/asistencia/resultados/dia?empleado_id=21&fecha=2026-10-05")).status).toBe(200);
    bd.reiniciar();
    bd.cuando(/FROM empleados\s+WHERE jefe_inmediato_id = \$1/, { rows: [{ id: 21 }] });
    bd.cuando(/FROM asistencia_diaria d\s+JOIN empleados e/, { rows: [{ ...FILA_DIA }] });
    como("jefe");
    for (const ajeno of [22, 20 + 1000, 10]) {
      expect((await get(`/api/asistencia/resultados/dia?empleado_id=${ajeno}&fecha=2026-10-05`)).status).toBe(403);
    }
    expect(bd.hubo(/FROM asistencia_diaria d\s+JOIN empleados e/)).toBe(false);
  });
  it("la lista de subordinados se pide con la fecha del día (un ex-subordinado de baja anterior no se ve)", async () => {
    como("jefe");
    await get("/api/asistencia/resultados/dia?empleado_id=21&fecha=2026-10-05");
    const q = bd.sqls().find((l) => /jefe_inmediato_id = \$1/.test(l.sql));
    expect(q.params).toEqual([20, "2026-10-05"]);
    expect(q.sql).toMatch(/fecha_baja >= \$2::date/);
  });
  it("un empleado solo ve su propio día; portal_admin con los grants reales ve lo propio y nada ajeno", async () => {
    como("empleado");
    expect((await get("/api/asistencia/resultados/dia?empleado_id=10&fecha=2026-10-05")).status).toBe(200);
    expect((await get("/api/asistencia/resultados/dia?empleado_id=21&fecha=2026-10-05")).status).toBe(403);
    como("portal_admin");
    expect((await get("/api/asistencia/resultados/dia?empleado_id=21&fecha=2026-10-05")).status).toBe(403);
    expect((await get("/api/asistencia/ejecuciones")).status).toBe(403);
  });
  it("cada marca trae su rol (lo calcula el servidor) y la serie del lector solo la ve RH", async () => {
    const r = await get(DIA);
    expect(r.body.datos.marcas[0].rol).toBe("otra");
    expect(bd.sqls().find((l) => /FROM asistencia_marcas m/.test(l.sql)).sql).toMatch(/m\.terminal_sn/);
    bd.reiniciar();
    bd.cuando(/FROM empleados\s+WHERE jefe_inmediato_id = \$1/, { rows: [{ id: 21 }] });
    bd.cuando(/FROM asistencia_diaria d\s+JOIN empleados e/, { rows: [{ ...FILA_DIA }] });
    como("jefe");
    await get(DIA);
    expect(bd.sqls().find((l) => /FROM asistencia_marcas m/.test(l.sql)).sql).not.toMatch(/terminal_sn/);
  });
  it("más de 100 marcas se avisan (marcas_truncadas) y no se devuelven de más", async () => {
    const muchas = Array.from({ length: 101 }, (_, i) => ({ id: String(i + 1), marca_ts: "2026-10-05T14:00:00.000Z", terminal_alias: "A" }));
    bd.estado.reglas.unshift({ re: /FROM asistencia_marcas m/, respuesta: { rows: muchas } });
    const r = await get(DIA);
    expect(r.body.datos.marcas).toHaveLength(100);
    expect(r.body.datos.marcas_truncadas).toBe(true);
  });
});

describe("cerrar una quincena: contadores esperados y días pendientes", () => {
  const cerrar = (cuerpo) => request(app).post("/api/asistencia/periodos/3/cerrar").send(cuerpo);
  const OK = { esperados: { ajustes_pendientes: 0, sin_identificador: 0 } };
  it.each([[{}], [{ esperados: null }], [{ esperados: { ajustes_pendientes: 0 } }], [{ esperados: { ajustes_pendientes: -1, sin_identificador: 0 } }], [{ esperados: { ajustes_pendientes: "0", sin_identificador: 0 } }]])(
    "sin esperados válidos %j -> 400 y no se toca el motor",
    async (cuerpo) => {
      expect((await cerrar(cuerpo)).status).toBe(400);
      expect(Motor.cerrarPeriodo).not.toHaveBeenCalled();
    },
  );
  it("si los ajustes o los sin identificador ya no son los mostrados -> 409 con los datos frescos, sin cerrar ni auditar", async () => {
    contadores = { estado: "abierto", dias_pendientes: 0, ajustes_pendientes: 2 };
    const r = await cerrar(OK);
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("datos_cambiaron");
    expect(r.body.mensaje).toMatch(/datos cambiaron/);
    expect(r.body.datos).toMatchObject({ ajustes_pendientes: 2, sin_identificador: 0 });
    expect(Motor.cerrarPeriodo).not.toHaveBeenCalled();
    expect(Auditoria.crear).not.toHaveBeenCalled();
  });
  it("periodo inexistente -> 404", async () => {
    contadores = null;
    expect((await cerrar(OK)).status).toBe(404);
  });
  it("con días pendientes el servidor responde 409 con el motivo (sin parámetro para forzar)", async () => {
    Motor.cerrarPeriodo.mockResolvedValue({ codigo: "con_pendientes", pendientes: 3 });
    const r = await cerrar({ ...OK, forzar: true });
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toMatch(/3 días pendientes/);
    expect(Motor.cerrarPeriodo).toHaveBeenCalledWith({ id: 3, usuarioId: 5 });
    expect(Auditoria.crear).not.toHaveBeenCalled();
  });
  it("al cerrar, la auditoría guarda los contadores que RH vio", async () => {
    Motor.cerrarPeriodo.mockResolvedValue({ codigo: "ok", periodo: { id: 3 }, dias_evaluados: 1, ejecucion_id: 1 });
    expect((await cerrar(OK)).status).toBe(200);
    expect(Auditoria.crear.mock.calls[0][0].valores_nuevos).toMatchObject({ estado: "cerrado", ajustes_pendientes: 0, sin_identificador: 0 });
  });
  it("una quincena ya cerrada no se compara con esperados: responde lo que diga el motor", async () => {
    contadores = { estado: "cerrado", dias_pendientes: 0, ajustes_pendientes: 5 };
    Motor.cerrarPeriodo.mockResolvedValue({ codigo: "ya_cerrado" });
    expect((await cerrar(OK)).status).toBe(409);
    expect(Motor.cerrarPeriodo).toHaveBeenCalled();
  });
  it.each(["empleado", "jefe", "rh_empleado", "portal_admin"])("GET /periodos/:id/contadores: %s -> 403", async (rol) => {
    como(rol);
    expect((await get("/api/asistencia/periodos/3/contadores")).status).toBe(403);
  });
  it.each(["rh_lectura", "rh_admin", "super_admin"])("GET /periodos/:id/contadores: %s -> 200 con los tres contadores", async (rol) => {
    como(rol);
    const r = await get("/api/asistencia/periodos/3/contadores");
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ dias_pendientes: 0, ajustes_pendientes: 0, sin_identificador: 0 });
  });
  it("el motivo de reapertura exige 10 caracteres", async () => {
    const reabrir = (motivo) => request(app).post("/api/asistencia/periodos/3/reabrir").send({ motivo });
    expect((await reabrir("123456789")).status).toBe(400);
    Motor.reabrirPeriodo.mockResolvedValue({ codigo: "ok", periodo: { id: 3 }, dias_evaluados: 1, ejecucion_id: 1 });
    expect((await reabrir("1234567890")).status).toBe(200);
  });
});

describe("PUT /parametros: confirmación reforzada en el servidor", () => {
  const poner = (c) => request(app).put("/api/asistencia/parametros").send(c);
  beforeEach(() => {
    Motor.leerParametros.mockResolvedValue({ comida_desde: "13:00", comida_hasta: "16:00" });
    Motor.guardarParametros.mockResolvedValue({ previos: {}, nuevos: {} });
  });
  it.each([[{ analisis_desde: "2026-09-10" }], [{ cierre_automatico_desde: "2026-11-01" }], [{ dias_cierre: 1 }], [{ dias_cierre: 1, comida_desde: "12:00" }]])(
    "%j sin confirmación -> 400 y no se guarda",
    async (c) => {
      const r = await poner(c);
      expect(r.status).toBe(400);
      expect(r.body.mensaje).toMatch(/confirmación reforzada/);
      expect(Motor.guardarParametros).not.toHaveBeenCalled();
    },
  );
  it.each([["otra cosa"], [""], [5], [null]])("confirmación incorrecta %j -> 400", async (confirmacion) => {
    expect((await poner({ dias_cierre: 1, confirmacion })).status).toBe(400);
    expect(Motor.guardarParametros).not.toHaveBeenCalled();
  });
  it("con CAMBIAR (cualquier mayúscula) guarda sin pasar la confirmación como parámetro", async () => {
    expect((await poner({ analisis_desde: "2026-09-10", dias_cierre: 2, confirmacion: " cambiar " })).status).toBe(200);
    expect(Motor.guardarParametros).toHaveBeenCalledWith({ analisis_desde: "2026-09-10", dias_cierre: 2 }, 5);
  });
  it("los demás parámetros no piden confirmación reforzada", async () => {
    expect((await poner({ comida_hasta: "15:00", margen_dia_completo_min: 60, ventana_seguridad_dias: 5, barrido_completo_horas: 12 })).status).toBe(200);
  });
  it("solo la confirmación, sin parámetros -> 400", async () => {
    expect((await poner({ confirmacion: "CAMBIAR" })).status).toBe(400);
  });
  it("si la validación de la ventana de comida falla dentro de la transacción -> 400 con su mensaje", async () => {
    Motor.guardarParametros.mockRejectedValue(Object.assign(new Error("validacion"), { validacion: "comida_desde debe ser anterior a comida_hasta" }));
    const r = await poner({ comida_desde: "12:00" });
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toMatch(/anterior a comida_hasta/);
  });
});

describe("anular una justificación", () => {
  it("si el motor estaba ocupado el mensaje no afirma que el día se recalculó", async () => {
    bd.estado.reglas.unshift({ re: /FROM asistencia_incidencias i WHERE i\.id = \$1 FOR UPDATE/, respuesta: { rows: [{ id: 9, empleado_id: 21, fecha: "2026-10-05", tipo: "justificacion", activa: true }] } });
    bd.estado.reglas.unshift({ re: /FROM asistencia_periodos WHERE \$1::date BETWEEN/, respuesta: { rows: [{ id: 3, estado: "abierto" }] } });
    Motor.recalcularDia.mockResolvedValue(false);
    const r = await request(app).post("/api/asistencia/incidencias/9/anular").send({});
    expect(r.status).toBe(200);
    expect(r.body.datos.recalculado).toBe(false);
    expect(r.body.mensaje).toMatch(/se recalculará en la siguiente vuelta/);
    Motor.recalcularDia.mockResolvedValue(true);
    bd.estado.reglas.unshift({ re: /FROM asistencia_incidencias i WHERE i\.id = \$1 FOR UPDATE/, respuesta: { rows: [{ id: 9, empleado_id: 21, fecha: "2026-10-05", tipo: "justificacion", activa: true }] } });
    const r2 = await request(app).post("/api/asistencia/incidencias/9/anular").send({});
    expect(r2.body.mensaje).toBe("Justificación anulada");
  });
});

describe("F-R2A-T4: un rol con SOLO Empleados:edicion lee la gestión (sin 403) y no escribe", () => {
  beforeEach(() => {
    como("solo_empleados");
    bd.cuando(/FROM empleados e/, { rows: [] });
    bd.cuando(/FROM asistencia_ajustes_pendientes/, { rows: [] });
    Motor.listarParametros.mockResolvedValue([]);
  });
  it.each([
    "/api/asistencia/resultados?desde=2026-10-01&hasta=2026-10-15",
    "/api/asistencia/resumen?desde=2026-10-01&hasta=2026-10-15",
    "/api/asistencia/periodos",
    "/api/asistencia/periodos/3/contadores",
    "/api/asistencia/ejecuciones",
    "/api/asistencia/sin-identificador",
    "/api/asistencia/ajustes-pendientes",
    "/api/asistencia/parametros",
    DIA,
  ])("GET %s -> 200", async (url) => {
    const r = await get(url);
    expect(r.status).toBe(200);
  });
  it("sin ficha de empleado el detalle de un día igual lo ve (RH ve a todos)", async () => {
    expect((await get(DIA)).status).toBe(200);
  });
  it("POST de lectura de gestión (exportaciones y días) -> 2xx", async () => {
    expect((await request(app).post("/api/asistencia/resultados/exportaciones").send({ tipo: "resumen", filas: 1 })).status).toBe(201);
    expect((await request(app).post("/api/asistencia/resultados/dias").send({ desde: "2026-10-01", hasta: "2026-10-15", empleado_ids: [21] })).status).toBe(200);
  });
  it.each([
    ["post", "/api/asistencia/periodos/3/cerrar", { esperados: { ajustes_pendientes: 0, sin_identificador: 0 } }],
    ["post", "/api/asistencia/periodos/3/reabrir", { motivo: "motivo suficiente" }],
    ["post", "/api/asistencia/recalcular", { desde: "2026-10-01", hasta: "2026-10-02" }],
    ["put", "/api/asistencia/parametros", { comida_hasta: "15:00" }],
    ["post", "/api/asistencia/incidencias", { empleado_id: 21, fecha: "2026-10-05", motivo: "motivo suficiente" }],
    ["post", "/api/asistencia/ajustes-pendientes/1/resolver", {}],
  ])("%s %s -> 403 (la escritura sigue siendo solo de Asistencia:edicion)", async (metodo, url, cuerpo) => {
    expect((await request(app)[metodo](url).send(cuerpo)).status).toBe(403);
    expect(Motor.guardarParametros).not.toHaveBeenCalled();
  });
  it("un rol sin Empleados:edicion ni Asistencia sigue sin acceso a la gestión (403)", async () => {
    como("portal_admin");
    for (const u of ["/api/asistencia/parametros", "/api/asistencia/ejecuciones", "/api/asistencia/sin-identificador", "/api/asistencia/periodos/3/contadores"]) expect((await get(u)).status).toBe(403);
    como("empleado");
    expect((await request(app).post("/api/asistencia/resultados/dias").send({ desde: "2026-10-01", hasta: "2026-10-15", empleado_ids: [21] })).status).toBe(403);
  });
  it("sin ningún permiso de asistencia ni de empleados: 403 también en lecturas compartidas", async () => {
    mockUser = { usuario_id: 11, rol_id: 11, rol_nombre: "otro" };
    bd.estado.permisos = { Vacaciones: ["consulta"] };
    expect((await get("/api/asistencia/periodos")).status).toBe(403);
    expect((await get("/api/asistencia/resultados?desde=2026-10-01&hasta=2026-10-15")).status).toBe(403);
  });
});

describe("GET /ejecuciones: límite por omisión", () => {
  it("sin limite usa 20 y con limite 100 acepta; 101 es 400", async () => {
    expect((await get("/api/asistencia/ejecuciones")).status).toBe(200);
    expect(bd.sqls().find((l) => /asistencia_ejecuciones/.test(l.sql)).params).toEqual([20]);
    expect((await get("/api/asistencia/ejecuciones?limite=100")).status).toBe(200);
    expect((await get("/api/asistencia/ejecuciones?limite=101")).status).toBe(400);
  });
});

describe("POST /resultados/dias (CSV de detalle filtrado, paginación por clave)", () => {
  const post = (c) => request(app).post("/api/asistencia/resultados/dias").send(c);
  const base = { desde: "2026-10-01", hasta: "2026-10-15", empleado_ids: [21, 22, 21] };
  beforeEach(() => {
    bd.estado.reglas.unshift({ re: /AND d\.id > \$4::int/, respuesta: { rows: [{ id: 7 }, { id: 9 }] } });
    bd.estado.reglas.unshift({ re: /SELECT COUNT\(\*\)::int AS total FROM asistencia_diaria d WHERE/, respuesta: { rows: [{ total: 321 }] } });
  });
  it("primera página: total real, ids sin repetir, parámetros enlazados y siguiente = último id si la página se llenó", async () => {
    const r = await post({ ...base, limite: 2 });
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(321);
    expect(r.body.siguiente).toBe(9);
    const q = bd.sqls().find((l) => /AND d\.id > \$4::int/.test(l.sql));
    expect(q.params).toEqual([[21, 22], "2026-10-01", "2026-10-15", 0, 2]);
    expect(q.sql).toMatch(/ORDER BY d\.id LIMIT \$5/);
  });
  it("páginas siguientes (despues_id) no recalculan el total y la última devuelve siguiente null", async () => {
    const r = await post({ ...base, limite: 5, despues_id: 9 });
    expect(r.body.total).toBeNull();
    expect(r.body.siguiente).toBeNull();
    expect(bd.sqls().some((l) => /SELECT COUNT/.test(l.sql))).toBe(false);
    expect(bd.sqls().find((l) => /AND d\.id > \$4::int/.test(l.sql)).params[3]).toBe(9);
  });
  it.each([
    [{ ...base, empleado_ids: [] }], [{ ...base, empleado_ids: "21" }], [{ ...base, empleado_ids: [0] }], [{ ...base, empleado_ids: ["1"] }],
    [{ ...base, empleado_ids: Array.from({ length: 5001 }, (_, i) => i + 1) }], [{ ...base, limite: 501 }], [{ ...base, limite: 0 }],
    [{ ...base, despues_id: -1 }], [{ ...base, despues_id: "9" }], [{ ...base, desde: "2026-01-01", hasta: "2026-12-31" }], [{ ...base, desde: "x" }],
  ])("entrada inválida -> 400 sin consultar", async (c) => {
    expect((await post(c)).status).toBe(400);
    expect(bd.sqls().some((l) => /asistencia_diaria d/.test(l.sql))).toBe(false);
  });
  it.each(["empleado", "jefe", "rh_empleado", "portal_admin"])("%s -> 403", async (rol) => {
    como(rol);
    expect((await post(base)).status).toBe(403);
  });
});

describe("el menú y el aviso de la cuadrícula (estructura)", () => {
  const fs = require("fs");
  const path = require("path");
  it("la cuadrícula no usa aria-label en las celdas (el nombre sale del contenido visible) y el submenú no tiene altura fija", () => {
    const celda = fs.readFileSync(path.join(__dirname, "../../frontend/components/asistencia/CuadriculaAsistencia.jsx"), "utf8");
    expect(celda).not.toMatch(/<button[^>]*aria-label/s);
    const css = fs.readFileSync(path.join(__dirname, "../../../portal/frontend/styles/rayhsa-system.css"), "utf8") + fs.readFileSync(path.join(__dirname, "../../../portal/frontend/styles/globales.css"), "utf8");
    expect(css).not.toMatch(/sidebar-subitems\.abierto\s*\{[^}]*max-height:\s*\d+px/);
  });
});
