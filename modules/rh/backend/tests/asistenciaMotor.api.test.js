/* eslint-env jest */
// API del motor de asistencia: matriz de permisos por rol, alcance (IDOR), validación de entradas, códigos de
// negocio, auditoría y errores 500 genéricos. El motor (services) se simula; el SQL real se prueba con Postgres.
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

// Permisos por opción de cada rol (como los siembran las migraciones 008/012)
const ROLES = {
  empleado: { user: { usuario_id: 1, rol_id: 2, rol_nombre: "empleado" }, permisos: { Asistencia: ["consulta"] } },
  jefe: { user: { usuario_id: 2, rol_id: 2, rol_nombre: "empleado" }, permisos: { Asistencia: ["consulta"] } },
  otroJefe: { user: { usuario_id: 3, rol_id: 2, rol_nombre: "empleado" }, permisos: { Asistencia: ["consulta"] } },
  // rh_empleado del seed solo tiene Asistencia:consulta: ve lo propio como cualquier empleado
  rh_empleado: { user: { usuario_id: 4, rol_id: 5, rol_nombre: "rh_empleado" }, permisos: { Asistencia: ["consulta"] } },
  // rol con Empleados:edicion (lectura de RH) pero sin Asistencia:edicion: lee todo y no escribe
  rh_lectura: { user: { usuario_id: 8, rol_id: 9, rol_nombre: "rh_lectura" }, permisos: { Asistencia: ["consulta"], Empleados: ["consulta", "edicion"] } },
  rh_admin: { user: { usuario_id: 5, rol_id: 4, rol_nombre: "rh_admin" }, permisos: { Asistencia: ["consulta", "edicion"], Empleados: ["consulta", "edicion"], Turnos: ["consulta", "edicion"] } },
  super_admin: { user: { usuario_id: 6, rol_id: 1, rol_nombre: "super_admin" }, permisos: {} },
  portal_admin: { user: { usuario_id: 7, rol_id: 3, rol_nombre: "portal_admin" }, permisos: {} },
};
// Ficha de empleado de cada usuario; el jefe 20 tiene a 21 y 22 como subordinados directos
const FICHAS = { 1: { id: 10, estatus: "activo" }, 2: { id: 20, estatus: "activo" }, 3: { id: 30, estatus: "activo" }, 4: { id: 40, estatus: "activo" }, 5: { id: 50, estatus: "activo" } }; // 8 (rh_lectura): sin ficha
const SUBORDINADOS = { 20: [21, 22], 30: [31] };

function como(rol) {
  mockUser = ROLES[rol].user;
  bd.estado.permisos = ROLES[rol].permisos;
}
const consultasDatos = (re) => bd.sqls().filter((l) => re.test(l.sql));
const get = (url) => request(app).get(url);
const RANGO = "desde=2026-10-01&hasta=2026-10-15";
const CIERRE = { esperados: { ajustes_pendientes: 0, sin_identificador: 0 } };

beforeEach(() => {
  jest.clearAllMocks();
  bd.reiniciar();
  Empleado.obtenerPorUsuarioId.mockImplementation(async (uid) => FICHAS[uid]);
  bd.cuando(/FROM empleados\s+WHERE jefe_inmediato_id = \$1/, (_sql, p) => ({ rows: (SUBORDINADOS[p[0]] || []).map((id) => ({ id })) }));
  Motor.leerParametros.mockResolvedValue({ analisis_desde: "2026-09-01", comida_desde: "13:00", comida_hasta: "16:00" });
  // contadores frescos del cierre: nada pendiente (el servidor los compara con `esperados`)
  bd.cuando(/FROM asistencia_periodos p\s+WHERE p\.id = \$1/, { rows: [{ estado: "abierto", dias_pendientes: 0, ajustes_pendientes: 0 }] });
  bd.cuando(/FROM asistencia_diaria d/, { rows: [] });
  como("rh_admin");
});

describe("GET /resultados - alcance por rol (IDOR)", () => {
  const idsConsultados = () => {
    const q = consultasDatos(/FROM asistencia_diaria d/);
    return q.length ? q[q.length - 1].params[0] : "sin consulta";
  };

  it("un empleado sin empleado_id ve SOLO lo propio", async () => {
    como("empleado");
    expect((await get(`/api/asistencia/resultados?${RANGO}`)).status).toBe(200);
    expect(idsConsultados()).toEqual([10]);
  });

  it("un empleado pide a otro (o a uno inexistente): 403 uniforme y sin consultar los resultados", async () => {
    como("empleado");
    for (const id of [11, 20, 99999]) {
      const r = await get(`/api/asistencia/resultados?${RANGO}&empleado_id=${id}`);
      expect(r.status).toBe(403);
      expect(r.body.mensaje).toBe("No tienes acceso a este recurso");
    }
    expect(consultasDatos(/FROM asistencia_diaria d/)).toHaveLength(0);
  });

  it("un empleado puede pedir explícitamente lo propio", async () => {
    como("empleado");
    expect((await get(`/api/asistencia/resultados?${RANGO}&empleado_id=10`)).status).toBe(200);
    expect(idsConsultados()).toEqual([10]);
  });

  it("el jefe inmediato vigente ve a sus subordinados directos y a sí mismo, nadie más", async () => {
    como("jefe");
    expect((await get(`/api/asistencia/resultados?${RANGO}`)).status).toBe(200);
    expect(idsConsultados()).toEqual([20, 21, 22]);
    expect((await get(`/api/asistencia/resultados?${RANGO}&empleado_id=21`)).status).toBe(200);
    expect(idsConsultados()).toEqual([21]);
    for (const ajeno of [10, 31, 30]) expect((await get(`/api/asistencia/resultados?${RANGO}&empleado_id=${ajeno}`)).status).toBe(403);
  });

  it("otro jefe NO ve a los subordinados del primero", async () => {
    como("otroJefe");
    expect((await get(`/api/asistencia/resultados?${RANGO}&empleado_id=21`)).status).toBe(403);
    expect((await get(`/api/asistencia/resultados?${RANGO}&empleado_id=31`)).status).toBe(200);
  });

  it("el jefe se vuelve a consultar en CADA petición (jefe vigente, no el guardado)", async () => {
    como("jefe");
    await get(`/api/asistencia/resultados?${RANGO}&empleado_id=21`);
    SUBORDINADOS[20] = [22]; // 21 cambió de jefe
    try {
      expect((await get(`/api/asistencia/resultados?${RANGO}&empleado_id=21`)).status).toBe(403);
    } finally {
      SUBORDINADOS[20] = [21, 22];
    }
  });

  it.each(["rh_lectura", "rh_admin", "super_admin"])("%s ve a cualquier empleado y, sin filtro, a todos", async (rol) => {
    como(rol);
    expect((await get(`/api/asistencia/resultados?${RANGO}&empleado_id=999`)).status).toBe(200);
    expect(idsConsultados()).toEqual([999]);
    expect((await get(`/api/asistencia/resultados?${RANGO}`)).status).toBe(200);
    expect(idsConsultados()).toBeNull();
  });

  it("rh_empleado (solo Asistencia:consulta) ve lo propio y no a los demás", async () => {
    como("rh_empleado");
    expect((await get(`/api/asistencia/resultados?${RANGO}&empleado_id=10`)).status).toBe(403);
    expect((await get(`/api/asistencia/resultados?${RANGO}&empleado_id=40`)).status).toBe(200);
  });

  it("portal_admin (sin permiso de Asistencia) recibe 403 sin tocar la BD de resultados", async () => {
    como("portal_admin");
    expect((await get(`/api/asistencia/resultados?${RANGO}`)).status).toBe(403);
    expect(consultasDatos(/FROM asistencia_diaria d/)).toHaveLength(0);
  });

  it("un usuario sin ficha de empleado recibe 403", async () => {
    como("empleado");
    Empleado.obtenerPorUsuarioId.mockResolvedValueOnce(undefined);
    expect((await get(`/api/asistencia/resultados?${RANGO}`)).status).toBe(403);
  });

  it("devuelve filas y paginación", async () => {
    bd.estado.reglas.length = 0;
    bd.cuando(/FROM asistencia_diaria d/, { rows: [{ id: 1, empleado_id: 10, fecha: "2026-10-01", estatus: "puntual", total: "37" }] });
    const r = await get(`/api/asistencia/resultados?${RANGO}&pagina=2&limite=10`);
    expect(r.body).toEqual({ exito: true, datos: [expect.objectContaining({ estatus: "puntual" })], paginacion: { pagina: 2, limite: 10, total: 37 } });
    expect(r.body.datos[0].total).toBeUndefined();
    expect(consultasDatos(/FROM asistencia_diaria d/)[0].params.slice(-2)).toEqual([10, 10]);
  });
});

describe("subordinados dados de baja", () => {
  it("solo se listan si su baja no es anterior al rango consultado (la fecha inicial viaja al SQL)", async () => {
    como("jefe");
    await get("/api/asistencia/resultados?desde=2026-10-01&hasta=2026-10-15");
    const q = consultasDatos(/FROM empleados\s+WHERE jefe_inmediato_id/)[0];
    expect(q.params).toEqual([20, "2026-10-01"]);
    expect(q.sql).toMatch(/estatus = 'activo' OR \(empleados\.estatus = 'baja' AND empleados\.fecha_baja IS NOT NULL AND empleados\.fecha_baja >= \$2::date\)/);
    expect(q.sql).not.toMatch(/IS DISTINCT FROM 'baja'/); // un suspendido no es subordinado vigente
  });
});

describe("GET /periodos - datos de gestión", () => {
  const fila = { id: 1, estado: "abierto", reabierto_motivo: "Marcas tardías", reabierto_por: 5, veces_reabierto: 1, total: "1" };
  it("rh_empleado/empleado NO ven quién reabrió ni por qué; rh_admin y rh_lectura sí", async () => {
    bd.cuando(/FROM asistencia_periodos p/, { rows: [fila] });
    for (const rol of ["empleado", "jefe", "rh_empleado"]) {
      como(rol);
      const d = (await get("/api/asistencia/periodos")).body.datos[0];
      expect(d).not.toHaveProperty("reabierto_motivo");
      expect(d).not.toHaveProperty("reabierto_por");
      expect(d).not.toHaveProperty("veces_reabierto");
      expect(d).not.toHaveProperty("id");
      expect(d.estado).toBe("abierto");
    }
    for (const rol of ["rh_admin", "rh_lectura", "super_admin"]) {
      como(rol);
      expect((await get("/api/asistencia/periodos")).body.datos[0]).toMatchObject({ reabierto_motivo: "Marcas tardías", reabierto_por: 5 });
    }
  });
});

describe("recalcular/cerrar/reabrir no esperan el candado", () => {
  it("la API no pide espera al motor: responde 409 inmediato si hay un recálculo en curso", async () => {
    Motor.recalcular.mockResolvedValue({ ocupado: true });
    Motor.cerrarPeriodo.mockResolvedValue({ codigo: "ocupado" });
    Motor.reabrirPeriodo.mockResolvedValue({ codigo: "ocupado" });
    const r1 = await request(app).post("/api/asistencia/recalcular").send({ desde: "2026-10-01", hasta: "2026-10-02" });
    const r2 = await request(app).post("/api/asistencia/periodos/3/cerrar").send(CIERRE);
    const r3 = await request(app).post("/api/asistencia/periodos/3/reabrir").send({ motivo: "motivo válido" });
    for (const r of [r1, r2, r3]) {
      expect(r.status).toBe(409);
      expect(r.body.mensaje).toBe("Hay un recálculo en curso; reintenta en unos segundos");
    }
    for (const mock of [Motor.recalcular, Motor.cerrarPeriodo, Motor.reabrirPeriodo]) expect(mock.mock.calls[0][0]).not.toHaveProperty("esperaMs");
  });
});

describe("GET /resultados y /resumen - validación", () => {
  const ruta = ["/api/asistencia/resultados", "/api/asistencia/resumen"];
  describe.each(ruta)("%s", (url) => {
    it.each([
      ["sin fechas", ""],
      ["sin hasta", "desde=2026-10-01"],
      ["fecha inexistente", "desde=2026-02-30&hasta=2026-03-02"],
      ["formato", "desde=01/10/2026&hasta=15/10/2026"],
      ["hasta antes de desde", "desde=2026-10-15&hasta=2026-10-01"],
      ["más de 92 días", "desde=2026-01-01&hasta=2026-04-03"],
      ["arreglo en desde", "desde[]=2026-10-01&hasta=2026-10-15"],
      ["página 0", `${RANGO}&pagina=0`],
      ["página no numérica", `${RANGO}&pagina=abc`],
      ["límite 501", `${RANGO}&limite=501`],
      ["límite 0", `${RANGO}&limite=0`],
      ["límite decimal", `${RANGO}&limite=1.5`],
    ])("400: %s", async (_n, qs) => {
      const r = await get(`${url}?${qs}`);
      expect(r.status).toBe(400);
      expect(r.body.exito).toBe(false);
    });

    it("exactamente 92 días es válido", async () => {
      expect((await get(`${url}?desde=2026-07-01&hasta=2026-09-30`)).status).toBe(200);
      expect((await get(`${url}?desde=2026-07-01&hasta=2026-10-01`)).status).toBe(400);
    });
  });

  it("empleado_id y departamento_id inválidos -> 400", async () => {
    for (const qs of ["empleado_id=abc", "empleado_id=0", "empleado_id=-1", "empleado_id[]=1", "empleado_id=99999999999"]) {
      expect((await get(`/api/asistencia/resultados?${RANGO}&${qs}`)).status).toBe(400);
    }
    for (const qs of ["departamento_id=x", "departamento_id=0"]) {
      expect((await get(`/api/asistencia/resumen?${RANGO}&${qs}`)).status).toBe(400);
    }
  });
});

describe("GET /resumen - alcance", () => {
  const ultima = () => consultasDatos(/GROUP BY d\.empleado_id/).pop();

  it("empleado: solo lo propio, aunque pida un departamento", async () => {
    como("empleado");
    expect((await get(`/api/asistencia/resumen?${RANGO}&departamento_id=4`)).status).toBe(200);
    expect(ultima().params.slice(0, 4)).toEqual([[10], "2026-10-01", "2026-10-15", 4]);
  });

  it("jefe: él y sus subordinados; RH: todos con filtro de departamento", async () => {
    como("jefe");
    await get(`/api/asistencia/resumen?${RANGO}`);
    expect(ultima().params[0]).toEqual([20, 21, 22]);
    como("rh_admin");
    await get(`/api/asistencia/resumen?${RANGO}&departamento_id=4`);
    expect(ultima().params.slice(0, 4)).toEqual([null, "2026-10-01", "2026-10-15", 4]);
  });

  it("portal_admin: 403", async () => {
    como("portal_admin");
    expect((await get(`/api/asistencia/resumen?${RANGO}`)).status).toBe(403);
  });

  it("el SQL cuenta cada estatus (incluye pendiente y justificada)", async () => {
    await get(`/api/asistencia/resumen?${RANGO}`);
    for (const s of ["puntual", "retardo", "falta", "salida_anticipada", "incompleta", "vacaciones", "permiso", "descanso", "festivo", "justificada", "sin_turno", "pendiente"]) {
      expect(ultima().sql).toContain(`d.estatus = '${s}'`);
    }
  });
});

describe("GET /periodos", () => {
  it("lo ven los roles con Asistencia:consulta; portal_admin no", async () => {
    bd.cuando(/FROM asistencia_periodos p/, { rows: [{ id: 1, estado: "abierto", total: "1" }] });
    for (const rol of ["empleado", "jefe", "rh_empleado", "rh_lectura", "rh_admin", "super_admin"]) {
      como(rol);
      expect((await get("/api/asistencia/periodos")).status).toBe(200);
    }
    como("portal_admin");
    expect((await get("/api/asistencia/periodos")).status).toBe(403);
  });

  it("filtra por estado y valida", async () => {
    expect((await get("/api/asistencia/periodos?estado=cerrado")).status).toBe(200);
    expect(consultasDatos(/FROM asistencia_periodos p/)[0].params[0]).toBe("cerrado");
    expect((await get("/api/asistencia/periodos?estado=otro")).status).toBe(400);
  });
});

describe("POST /periodos/:id/cerrar y /reabrir", () => {
  const MOTIVO = { motivo: "Marcas tardías de una terminal sin red" };

  describe.each([["cerrar", CIERRE], ["reabrir", MOTIVO]])("%s: matriz de permisos", (accion, cuerpo) => {
    it.each(["empleado", "jefe", "otroJefe", "rh_empleado", "rh_lectura", "portal_admin"])("%s -> 403 sin tocar el motor ni auditar", async (rol) => {
      como(rol);
      const r = await request(app).post(`/api/asistencia/periodos/3/${accion}`).send(cuerpo);
      expect(r.status).toBe(403);
      expect(Motor.cerrarPeriodo).not.toHaveBeenCalled();
      expect(Motor.reabrirPeriodo).not.toHaveBeenCalled();
      expect(Auditoria.crear).not.toHaveBeenCalled();
    });

    it.each(["rh_admin", "super_admin"])("%s -> 200 con auditoría", async (rol) => {
      como(rol);
      Motor.cerrarPeriodo.mockResolvedValue({ codigo: "ok", periodo: { id: 3 }, dias_evaluados: 10, ejecucion_id: 1 });
      Motor.reabrirPeriodo.mockResolvedValue({ codigo: "ok", periodo: { id: 3 }, dias_evaluados: 10, ejecucion_id: 1 });
      const r = await request(app).post(`/api/asistencia/periodos/3/${accion}`).send(cuerpo);
      expect(r.status).toBe(200);
      expect(Auditoria.crear).toHaveBeenCalledTimes(1);
      const dato = Auditoria.crear.mock.calls[0][0];
      expect(dato).toMatchObject({ modulo: "rh", tabla: "asistencia_periodos", registro_id: "3", usuario_id: ROLES[rol].user.usuario_id });
      expect(dato.accion.length).toBeLessThanOrEqual(20);
    });
  });

  it("identificador inválido -> 400", async () => {
    for (const id of ["abc", "0x1", "-1", "1.5", "99999999999"]) {
      expect((await request(app).post(`/api/asistencia/periodos/${id}/cerrar`)).status).toBe(400);
    }
    expect(Motor.cerrarPeriodo).not.toHaveBeenCalled();
  });

  it.each([
    ["ocupado", 409], ["no_existe", 404], ["ya_cerrado", 409], ["no_terminado", 409],
  ])("cerrar con código %s -> %i y sin auditoría", async (codigo, estado) => {
    Motor.cerrarPeriodo.mockResolvedValue({ codigo });
    const r = await request(app).post("/api/asistencia/periodos/3/cerrar").send(CIERRE);
    expect(r.status).toBe(estado);
    expect(Auditoria.crear).not.toHaveBeenCalled();
  });

  it("reabrir EXIGE motivo (10 a 500 caracteres, sin caracteres de control)", async () => {
    for (const cuerpo of [{}, { motivo: "" }, { motivo: "    " }, { motivo: "abc" }, { motivo: "123456789" }, { motivo: 12345 }, { motivo: ["motivo largo"] }, { motivo: "x".repeat(501) }, { motivo: "motivo\u0000raro" }]) {
      const r = await request(app).post("/api/asistencia/periodos/3/reabrir").send(cuerpo);
      expect(r.status).toBe(400);
    }
    expect(Motor.reabrirPeriodo).not.toHaveBeenCalled();
  });

  it("reabrir pasa el motivo recortado y el usuario al motor; la auditoría lo guarda", async () => {
    Motor.reabrirPeriodo.mockResolvedValue({ codigo: "ok", periodo: { id: 3 }, dias_evaluados: 1, ejecucion_id: 1 });
    await request(app).post("/api/asistencia/periodos/3/reabrir").send({ motivo: "  Corrección de marcas  " });
    expect(Motor.reabrirPeriodo).toHaveBeenCalledWith({ id: 3, usuarioId: 5, motivo: "Corrección de marcas" });
    expect(Auditoria.crear.mock.calls[0][0].valores_nuevos).toMatchObject({ estado: "abierto", motivo: "Corrección de marcas" });
  });

  it.each([["ocupado", 409], ["no_existe", 404], ["no_cerrado", 409]])("reabrir con código %s -> %i", async (codigo, estado) => {
    Motor.reabrirPeriodo.mockResolvedValue({ codigo });
    const r = await request(app).post("/api/asistencia/periodos/3/reabrir").send({ motivo: "motivo válido" });
    expect(r.status).toBe(estado);
  });
});

describe("POST /recalcular", () => {
  const cuerpo = { desde: "2026-10-01", hasta: "2026-10-15" };

  it.each(["empleado", "jefe", "rh_empleado", "rh_lectura", "portal_admin"])("%s -> 403", async (rol) => {
    como(rol);
    expect((await request(app).post("/api/asistencia/recalcular").send(cuerpo)).status).toBe(403);
    expect(Motor.recalcular).not.toHaveBeenCalled();
  });

  it.each(["rh_admin", "super_admin"])("%s -> 200, llama al motor con el rango y audita", async (rol) => {
    como(rol);
    Motor.recalcular.mockResolvedValue({ ocupado: false, ejecucion_id: 7, desde: "2026-10-01", hasta: "2026-10-15", empleados: 3, dias_evaluados: 45, dias_modificados: 2, dias_omitidos_cerrados: 0 });
    const r = await request(app).post("/api/asistencia/recalcular").send({ ...cuerpo, empleado_id: 12 });
    expect(r.status).toBe(200);
    expect(Motor.recalcular).toHaveBeenCalledWith({ desde: "2026-10-01", hasta: "2026-10-15", empleadoIds: [12], usuarioId: ROLES[rol].user.usuario_id });
    expect(r.body.datos).toMatchObject({ ejecucion_id: 7, dias_evaluados: 45 });
    expect(Auditoria.crear.mock.calls[0][0]).toMatchObject({ accion: "RECALCULAR", tabla: "asistencia_diaria" });
  });

  it.each([
    [{}], [{ desde: "2026-10-01" }], [{ ...cuerpo, hasta: "2026-02-30" }], [{ desde: "2026-01-01", hasta: "2026-12-31" }],
    [{ ...cuerpo, empleado_id: "abc" }], [{ ...cuerpo, empleado_id: -3 }], [{ ...cuerpo, empleado_id: [1] }], [{ desde: ["2026-10-01"], hasta: "2026-10-02" }],
  ])("cuerpo inválido %j -> 400", async (c) => {
    expect((await request(app).post("/api/asistencia/recalcular").send(c)).status).toBe(400);
    expect(Motor.recalcular).not.toHaveBeenCalled();
  });

  it("sin cuerpo JSON -> 400", async () => {
    expect((await request(app).post("/api/asistencia/recalcular")).status).toBe(400);
  });

  it("el motor ocupado -> 409; todo el rango en periodos cerrados -> 409 con instrucción de reabrir", async () => {
    Motor.recalcular.mockResolvedValueOnce({ ocupado: true });
    expect((await request(app).post("/api/asistencia/recalcular").send(cuerpo)).status).toBe(409);
    Motor.recalcular.mockResolvedValueOnce({ ocupado: false, ejecucion_id: 1, dias_evaluados: 0, dias_omitidos_cerrados: 15 });
    const r = await request(app).post("/api/asistencia/recalcular").send(cuerpo);
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toMatch(/reabre/i);
    expect(Auditoria.crear).not.toHaveBeenCalled();
  });
});

describe("lecturas de gestión: sin identificador, ajustes pendientes y parámetros", () => {
  const lecturas = ["/api/asistencia/sin-identificador", "/api/asistencia/ajustes-pendientes", "/api/asistencia/parametros"];

  describe.each(lecturas)("GET %s", (url) => {
    beforeEach(() => {
      bd.cuando(/FROM empleados e/, { rows: [] });
      bd.cuando(/FROM asistencia_ajustes_pendientes/, { rows: [] });
      Motor.leerParametros.mockResolvedValue({ analisis_desde: "2026-09-01" });
      Motor.listarParametros.mockResolvedValue([]);
    });

    it.each(["empleado", "jefe", "otroJefe", "rh_empleado", "portal_admin"])("%s -> 403", async (rol) => {
      como(rol);
      expect((await get(url)).status).toBe(403);
    });

    it.each(["rh_lectura", "rh_admin", "super_admin"])("%s -> 200", async (rol) => {
      como(rol);
      expect((await get(url)).status).toBe(200);
    });
  });

  it("sin-identificador usa analisis_desde de los parámetros", async () => {
    bd.cuando(/FROM empleados e/, { rows: [{ id: 5, motivo: "sin_numero_nomina", total: "1" }] });
    Motor.leerParametros.mockResolvedValue({ analisis_desde: "2026-09-01" });
    const r = await get("/api/asistencia/sin-identificador");
    expect(r.body.datos).toEqual([{ id: 5, motivo: "sin_numero_nomina" }]);
    expect(consultasDatos(/FROM empleados e/)[0].params[0]).toBe("2026-09-01");
  });

  it("ajustes: resueltos debe ser true|false", async () => {
    expect((await get("/api/asistencia/ajustes-pendientes?resueltos=quizas")).status).toBe(400);
    expect((await get("/api/asistencia/ajustes-pendientes?resueltos=true")).status).toBe(200);
  });

  it("parámetros: devuelve los 9 con tipo y si son editables", async () => {
    Motor.listarParametros.mockResolvedValue([{ clave: "dias_cierre", valor: "3", descripcion: "x", fecha_actualizacion: null }]);
    const r = await get("/api/asistencia/parametros");
    expect(r.body.datos).toHaveLength(9);
    expect(r.body.datos.find((p) => p.clave === "dias_cierre")).toMatchObject({ valor: 3, tipo: "entero", editable: true });
    expect(r.body.datos.find((p) => p.clave === "version_motor").editable).toBe(false);
  });
});

describe("POST /ajustes-pendientes/:id/resolver", () => {
  beforeEach(() => {
    bd.cuando(/SELECT id, empleado_id, to_char\(fecha/, { rows: [{ id: 4, empleado_id: 10, fecha: "2026-10-05", periodo_id: 1, marca_id: "9", motivo: "marca_posterior_cierre", resuelto_en: null }] });
    bd.cuando(/UPDATE asistencia_ajustes_pendientes/, { rows: [{ id: 4, empleado_id: 10, fecha: "2026-10-05", resuelto_en: "x" }] });
  });

  it.each(["empleado", "jefe", "rh_empleado", "rh_lectura", "portal_admin"])("%s -> 403", async (rol) => {
    como(rol);
    expect((await request(app).post("/api/asistencia/ajustes-pendientes/4/resolver").send({})).status).toBe(403);
    expect(consultasDatos(/UPDATE asistencia_ajustes_pendientes/)).toHaveLength(0);
  });

  it("rh_admin resuelve con nota, queda auditado y se guarda quién", async () => {
    const r = await request(app).post("/api/asistencia/ajustes-pendientes/4/resolver").send({ nota: "Se reabrió el periodo" });
    expect(r.status).toBe(200);
    expect(consultasDatos(/UPDATE asistencia_ajustes_pendientes/)[0].params).toEqual([4, 5, "Se reabrió el periodo"]);
    expect(Auditoria.crear.mock.calls[0][0]).toMatchObject({ accion: "RESOLVER_AJUSTE", tabla: "asistencia_ajustes_pendientes", registro_id: "4" });
  });

  it("inexistente 404, ya resuelto 409, nota inválida 400, id inválido 400", async () => {
    bd.estado.reglas.length = 0;
    bd.cuando(/SELECT id, empleado_id, to_char\(fecha/, { rows: [] });
    expect((await request(app).post("/api/asistencia/ajustes-pendientes/4/resolver").send({})).status).toBe(404);
    bd.estado.reglas.length = 0;
    bd.cuando(/SELECT id, empleado_id, to_char\(fecha/, { rows: [{ id: 4 }] });
    bd.cuando(/UPDATE asistencia_ajustes_pendientes/, { rows: [] });
    expect((await request(app).post("/api/asistencia/ajustes-pendientes/4/resolver").send({})).status).toBe(409);
    expect((await request(app).post("/api/asistencia/ajustes-pendientes/4/resolver").send({ nota: "x".repeat(501) })).status).toBe(400);
    expect((await request(app).post("/api/asistencia/ajustes-pendientes/4/resolver").send({ nota: 5 })).status).toBe(400);
    expect((await request(app).post("/api/asistencia/ajustes-pendientes/abc/resolver").send({})).status).toBe(400);
  });
});

describe("incidencias de RH (justificar un día)", () => {
  const cuerpo = { empleado_id: 10, fecha: "2026-10-05", motivo: "Cita médica con comprobante" };
  const abrirDia = (estatus = "falta", periodo = "abierto") => {
    bd.estado.reglas.length = 0;
    bd.cuando(/SELECT d\.id, d\.estatus, d\.periodo_id FROM asistencia_diaria d/, { rows: [{ id: 1, estatus, periodo_id: 1 }] });
    bd.cuando(/FROM asistencia_periodos WHERE id = \$1 FOR SHARE/, { rows: [{ id: 1, estado: periodo }] });
    bd.cuando(/INSERT INTO asistencia_incidencias/, { rows: [{ id: 77, empleado_id: 10, fecha: "2026-10-05", tipo: "justificacion", activa: true }] });
    bd.cuando(/FROM asistencia_diaria d WHERE d\.empleado_id/, { rows: [{ empleado_id: 10, fecha: "2026-10-05", estatus: "justificada" }] });
  };

  it.each(["empleado", "jefe", "rh_empleado", "rh_lectura", "portal_admin"])("%s -> 403", async (rol) => {
    como(rol);
    expect((await request(app).post("/api/asistencia/incidencias").send(cuerpo)).status).toBe(403);
    expect(consultasDatos(/INSERT INTO asistencia_incidencias/)).toHaveLength(0);
  });

  it("rh_admin justifica una falta de un periodo abierto: inserta, audita, recalcula ese día y devuelve el nuevo estatus", async () => {
    abrirDia();
    Motor.recalcularDia.mockResolvedValue(true);
    const r = await request(app).post("/api/asistencia/incidencias").send(cuerpo);
    expect(r.status).toBe(201);
    expect(consultasDatos(/INSERT INTO asistencia_incidencias/)[0].params).toEqual([10, "2026-10-05", "Cita médica con comprobante", 5]);
    expect(consultasDatos(/INSERT INTO asistencia_incidencias/)[0].sql).toMatch(/'justificacion'/);
    expect(Motor.recalcularDia).toHaveBeenCalledWith({ empleadoId: 10, fecha: "2026-10-05", usuarioId: 5 });
    expect(r.body.datos).toMatchObject({ recalculado: true, dia: { estatus: "justificada" } });
    expect(Auditoria.crear.mock.calls[0][0]).toMatchObject({ accion: "JUSTIFICAR_DIA", tabla: "asistencia_incidencias", registro_id: "77" });
    // nunca se tocan las marcas
    expect(bd.sqls().some((l) => /UPDATE asistencia_marcas|DELETE FROM asistencia_marcas/.test(l.sql))).toBe(false);
  });

  it("con el motor ocupado la justificación queda registrada y se recalcula en la siguiente vuelta", async () => {
    abrirDia();
    Motor.recalcularDia.mockResolvedValue(false);
    const r = await request(app).post("/api/asistencia/incidencias").send(cuerpo);
    expect(r.status).toBe(201);
    expect(r.body.datos.recalculado).toBe(false);
    expect(r.body.mensaje).toMatch(/siguiente vuelta/);
  });

  it("un fallo del recálculo no deshace la justificación (201) y no filtra el error", async () => {
    abrirDia();
    Motor.recalcularDia.mockRejectedValue(Object.assign(new Error("SQL secreto"), { code: "XX000" }));
    const espia = jest.spyOn(console, "error").mockImplementation(() => {});
    const r = await request(app).post("/api/asistencia/incidencias").send(cuerpo);
    expect(r.status).toBe(201);
    expect(JSON.stringify(espia.mock.calls)).not.toMatch(/SQL secreto/);
    espia.mockRestore();
  });

  it("periodo cerrado -> 409 (hay que reabrirlo); sin resultado -> 404; no justificable -> 409", async () => {
    abrirDia("falta", "cerrado");
    expect((await request(app).post("/api/asistencia/incidencias").send(cuerpo)).status).toBe(409);
    abrirDia("puntual");
    expect((await request(app).post("/api/asistencia/incidencias").send(cuerpo)).status).toBe(409);
    bd.estado.reglas.length = 0;
    bd.cuando(/SELECT d\.id, d\.estatus, d\.periodo_id FROM asistencia_diaria d/, { rows: [] });
    expect((await request(app).post("/api/asistencia/incidencias").send(cuerpo)).status).toBe(404);
    expect(Auditoria.crear).not.toHaveBeenCalled();
    expect(consultasDatos(/INSERT INTO asistencia_incidencias/)).toHaveLength(0);
  });

  it("un día ya justificado (o una carrera entre dos justificaciones) -> 409, sin segunda incidencia", async () => {
    abrirDia("justificada");
    expect((await request(app).post("/api/asistencia/incidencias").send(cuerpo)).status).toBe(409);
    expect(consultasDatos(/INSERT INTO asistencia_incidencias/)).toHaveLength(0);
    abrirDia("falta");
    bd.estado.reglas.unshift({ re: /INSERT INTO asistencia_incidencias/, respuesta: Object.assign(new Error("dup"), { code: "23505" }) });
    const r = await request(app).post("/api/asistencia/incidencias").send(cuerpo);
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toMatch(/justificación activa/);
    expect(Auditoria.crear).not.toHaveBeenCalled();
  });

  it("si ya hay una justificación activa del día no se inserta otra (409)", async () => {
    abrirDia("falta");
    bd.estado.reglas.unshift({ re: /SELECT id FROM asistencia_incidencias WHERE empleado_id = \$1 AND fecha = \$2::date AND activa/, respuesta: { rows: [{ id: 5 }] } });
    expect((await request(app).post("/api/asistencia/incidencias").send(cuerpo)).status).toBe(409);
    expect(consultasDatos(/INSERT INTO asistencia_incidencias/)).toHaveLength(0);
  });

  it("valida empleado_id, fecha y motivo (5 a 500, sin caracteres de control)", async () => {
    for (const c of [{}, { ...cuerpo, empleado_id: "x" }, { ...cuerpo, fecha: "2026-13-01" }, { ...cuerpo, motivo: "" }, { ...cuerpo, motivo: "abcd" }, { ...cuerpo, motivo: "x".repeat(501) }, { ...cuerpo, motivo: "a\u0000bcdef" }]) {
      const r = await request(app).post("/api/asistencia/incidencias").send(c);
      if (r.status !== 400) throw new Error(`caso ${JSON.stringify(c).slice(0, 80)} -> ${r.status}`);
    }
    expect(consultasDatos(/asistencia_incidencias/)).toHaveLength(0);
  });

  it("anular: solo RH admin, periodo abierto, audita y recalcula", async () => {
    como("rh_lectura");
    expect((await request(app).post("/api/asistencia/incidencias/77/anular")).status).toBe(403);
    como("rh_admin");
    bd.estado.reglas.length = 0;
    bd.cuando(/FROM asistencia_incidencias i WHERE i\.id = \$1 FOR UPDATE/, { rows: [{ id: 77, empleado_id: 10, fecha: "2026-10-05", tipo: "justificacion", activa: true }] });
    bd.cuando(/FROM asistencia_periodos WHERE \$1::date BETWEEN/, { rows: [{ id: 1, estado: "abierto" }] });
    Motor.recalcularDia.mockResolvedValue(true);
    const r = await request(app).post("/api/asistencia/incidencias/77/anular");
    expect(r.status).toBe(200);
    expect(consultasDatos(/UPDATE asistencia_incidencias SET activa = false/)).toHaveLength(1);
    expect(Auditoria.crear.mock.calls[0][0].accion).toBe("ANULAR_INCIDENCIA");
    expect(Motor.recalcularDia).toHaveBeenCalledWith({ empleadoId: 10, fecha: "2026-10-05", usuarioId: 5 });
  });

  it("anular en periodo cerrado -> 409 sin cambios", async () => {
    bd.estado.reglas.length = 0;
    bd.cuando(/FROM asistencia_incidencias i WHERE i\.id = \$1 FOR UPDATE/, { rows: [{ id: 77, empleado_id: 10, fecha: "2026-10-05", tipo: "justificacion", activa: true }] });
    bd.cuando(/FROM asistencia_periodos WHERE \$1::date BETWEEN/, { rows: [{ id: 1, estado: "cerrado" }] });
    expect((await request(app).post("/api/asistencia/incidencias/77/anular")).status).toBe(409);
    expect(consultasDatos(/UPDATE asistencia_incidencias SET activa = false/)).toHaveLength(0);
  });
});

describe("PUT /parametros", () => {
  it.each(["empleado", "jefe", "rh_empleado", "rh_lectura", "portal_admin"])("%s -> 403", async (rol) => {
    como(rol);
    expect((await request(app).put("/api/asistencia/parametros").send({ dias_cierre: 5 })).status).toBe(403);
    expect(Motor.guardarParametros).not.toHaveBeenCalled();
  });

  it.each(["rh_admin", "super_admin"])("%s guarda parámetros válidos y audita valores previos y nuevos", async (rol) => {
    como(rol);
    Motor.guardarParametros.mockResolvedValue({ previos: { dias_cierre: "3" }, nuevos: { dias_cierre: "5" } });
    const r = await request(app).put("/api/asistencia/parametros").send({ dias_cierre: "5", margen_dia_completo_min: 90, confirmacion: "cambiar" });
    expect(r.status).toBe(200);
    expect(Motor.guardarParametros).toHaveBeenCalledWith({ dias_cierre: 5, margen_dia_completo_min: 90 }, ROLES[rol].user.usuario_id);
    const dato = Auditoria.crear.mock.calls[0][0];
    expect(dato).toMatchObject({ accion: "ACTUALIZAR_PARAM", tabla: "asistencia_parametros", valores_previos: { dias_cierre: "3" }, valores_nuevos: { dias_cierre: "5" } });
    expect(dato.accion.length).toBeLessThanOrEqual(20);
  });

  it("comida_desde/comida_hasta: formato HH:MM y desde < hasta contra los valores vigentes", async () => {
    Motor.leerParametros.mockResolvedValue({ comida_desde: "13:00", comida_hasta: "16:00" });
    Motor.guardarParametros.mockResolvedValue({ previos: {}, nuevos: {} });
    expect((await request(app).put("/api/asistencia/parametros").send({ comida_desde: "12:00", comida_hasta: "15:00" })).status).toBe(200);
    expect(Motor.guardarParametros).toHaveBeenCalledWith({ comida_desde: "12:00", comida_hasta: "15:00" }, 5);
    Motor.guardarParametros.mockClear();
    for (const c of [{ comida_desde: "16:00" }, { comida_hasta: "12:00" }, { comida_desde: "15:00", comida_hasta: "14:00" }, { comida_desde: "25:00" }, { comida_hasta: "4pm" }, { comida_desde: 13 }]) {
      expect((await request(app).put("/api/asistencia/parametros").send(c)).status).toBe(400);
    }
    expect(Motor.guardarParametros).not.toHaveBeenCalled();
  });

  it.each([
    [{}], [[]], [{ dias_cierre: 31 }], [{ dias_cierre: -1 }], [{ dias_cierre: "1e1" }], [{ margen_dia_completo_min: 721 }],
    [{ analisis_desde: "2026-02-30" }], [{ cierre_automatico_desde: "ayer" }], [{ version_motor: 2 }], [{ inventado: 1 }],
    [{ dias_cierre: 5, barrido_completo_horas: 0 }], [{ ventana_seguridad_dias: 32 }],
  ])("%j -> 400 y no se guarda nada", async (c) => {
    expect((await request(app).put("/api/asistencia/parametros").send(c)).status).toBe(400);
    expect(Motor.guardarParametros).not.toHaveBeenCalled();
  });
});

describe("errores 500 genéricos y auditoría acotada", () => {
  it("un fallo de BD en una lectura da 500 genérico sin texto de PostgreSQL y el log no lleva el mensaje", async () => {
    bd.estado.reglas.length = 0;
    bd.cuando(/FROM asistencia_diaria d/, Object.assign(new Error('relation "x" does not exist; Failing row contains (CURP ABC)'), { code: "42P01" }));
    const espia = jest.spyOn(console, "error").mockImplementation(() => {});
    const r = await get(`/api/asistencia/resultados?${RANGO}`);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/relation|CURP|Failing|42P01/);
    expect(r.body.mensaje).toBe("Error al consultar los resultados de asistencia");
    expect(JSON.stringify(espia.mock.calls)).not.toMatch(/CURP|Failing/);
    espia.mockRestore();
  });

  it.each([
    ["post", "/api/asistencia/periodos/3/cerrar", () => Motor.cerrarPeriodo, CIERRE],
    ["post", "/api/asistencia/periodos/3/reabrir", () => Motor.reabrirPeriodo, { motivo: "motivo válido" }],
    ["post", "/api/asistencia/recalcular", () => Motor.recalcular, { desde: "2026-10-01", hasta: "2026-10-02" }],
    ["put", "/api/asistencia/parametros", () => Motor.guardarParametros, { dias_cierre: 4, confirmacion: "CAMBIAR" }],
  ])("%s %s con un error interno -> 500 genérico", async (metodo, url, motor, cuerpo) => {
    motor().mockRejectedValue(Object.assign(new Error("password authentication failed for user postgres"), { code: "28P01" }));
    const espia = jest.spyOn(console, "error").mockImplementation(() => {});
    const r = await request(app)[metodo](url).send(cuerpo);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/password|postgres|28P01/);
    expect(Auditoria.crear).not.toHaveBeenCalled();
    espia.mockRestore();
  });

  it("si la auditoría falla la operación no se rompe", async () => {
    Auditoria.crear.mockRejectedValueOnce(new Error("auditoría caída"));
    Motor.guardarParametros.mockResolvedValue({ previos: {}, nuevos: {} });
    const espia = jest.spyOn(console, "error").mockImplementation(() => {});
    expect((await request(app).put("/api/asistencia/parametros").send({ dias_cierre: 4, confirmacion: "CAMBIAR" })).status).toBe(200);
    espia.mockRestore();
  });

  it("la IP de la auditoría se recorta a 45 caracteres (X-Forwarded-For largo no pierde el registro)", async () => {
    Motor.guardarParametros.mockResolvedValue({ previos: {}, nuevos: {} });
    await request(app).put("/api/asistencia/parametros").set("X-Forwarded-For", "1.1.1.1, ".repeat(20)).send({ dias_cierre: 4, confirmacion: "CAMBIAR" });
    const ip = Auditoria.crear.mock.calls[0][0].ip_origen;
    expect(ip === null || ip.length <= 45).toBe(true);
  });
});

describe("rutas de la Fase 4 en el router", () => {
  const fs = require("fs");
  const path = require("path");
  const rutas = fs.readFileSync(path.join(__dirname, "../routes/asistencia.routes.js"), "utf8");

  it("todas las rutas del motor van detrás de authenticateJWT (router.use) y cada escritura exige Asistencia:edicion", () => {
    expect(rutas).toMatch(/router\.use\(authenticateJWT\)/);
    for (const m of rutas.matchAll(/router\.(post|put)\("(\/(?:periodos|recalcular|ajustes-pendientes|incidencias|parametros)[^"]*)", ([A-Z_]+)/g)) {
      expect(m[3]).toBe("ESCRIBIR_ASISTENCIA");
    }
  });
});
