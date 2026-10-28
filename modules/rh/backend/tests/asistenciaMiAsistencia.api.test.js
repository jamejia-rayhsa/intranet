/* eslint-env jest */
// «Mi asistencia» y «Mi equipo»: GET /mi-contexto, GET /mi-equipo/hoy, ?equipo=1 y lo que NO debe salir a quien consulta lo
// propio o a su equipo. Matriz de alcance (empleado, jefe, jefe de jefes, sin empleado vinculado, RH, portal_admin).
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
jest.mock("../models/turno.model", () => ({ hoyMexico: jest.fn(), obtenerEfectivo: jest.fn() }));
jest.mock("../services/asistencia/motorAsistencia", () => ({ leerParametros: jest.fn() }));

const { __bd: bd } = require("../../../portal/backend/config/database");
const Empleado = require("../models/empleado.model");
const Turno = require("../models/turno.model");
const Motor = require("../services/asistencia/motorAsistencia");

const app = express();
app.use(express.json());
app.use("/api/asistencia", require("../routes/asistencia.routes"));

const ROLES = {
  empleado: { user: { usuario_id: 1, rol_id: 1, rol_nombre: "empleado" }, permisos: { Asistencia: ["consulta"] } },
  jefe: { user: { usuario_id: 2, rol_id: 2, rol_nombre: "empleado" }, permisos: { Asistencia: ["consulta"] } },
  jefe_de_jefes: { user: { usuario_id: 3, rol_id: 3, rol_nombre: "empleado" }, permisos: { Asistencia: ["consulta"] } },
  sin_ficha: { user: { usuario_id: 9, rol_id: 9, rol_nombre: "empleado" }, permisos: { Asistencia: ["consulta"] } },
  sin_permiso: { user: { usuario_id: 8, rol_id: 8, rol_nombre: "otro" }, permisos: {} },
  rh_admin: { user: { usuario_id: 5, rol_id: 5, rol_nombre: "rh_admin" }, permisos: { Asistencia: ["consulta", "edicion"], Empleados: ["consulta", "edicion"] } },
  rh_sin_ficha: { user: { usuario_id: 6, rol_id: 6, rol_nombre: "rh_admin" }, permisos: { Asistencia: ["consulta", "edicion"], Empleados: ["consulta", "edicion"] } },
  super_admin: { user: { usuario_id: 7, rol_id: 7, rol_nombre: "super_admin" }, permisos: {} },
  portal_admin: { user: { usuario_id: 4, rol_id: 4, rol_nombre: "portal_admin" }, permisos: { Asistencia: ["consulta"] } },
};
// usuario -> empleado. A=10 (empleado), 20 jefe de 21 y 22, 30 jefe de jefes (directos 20 y 25), 50 RH que también es jefe de 51
const FICHAS = { 1: { id: 10 }, 2: { id: 20 }, 3: { id: 30 }, 4: { id: 70 }, 5: { id: 50 } };
const DIRECTOS = { 20: [21, 22], 30: [20, 25], 50: [51] };
const como = (rol) => {
  mockUser = ROLES[rol].user;
  bd.estado.permisos = ROLES[rol].permisos;
};
const get = (url) => request(app).get(url);
const RANGO = "desde=2026-10-01&hasta=2026-10-15";

const FILA_DIA = {
  id: 1, empleado_id: 21, fecha: "2026-10-05", estatus: "justificada", cruza_medianoche: false, periodo_id: 3, periodo_estado: "abierto",
  turno_id: 4, departamento_id: 2, marcas_usadas: ["9"], version_calculo: 1, nombre: "Ana",
  detalle: { explicaciones: [], banderas: [] },
  solicitud_vacaciones_id: 5, permiso_id: 6, calendario_id: 7, incidencia_id: 8, departamento_actual_id: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
  bd.reiniciar();
  Empleado.obtenerPorUsuarioId.mockImplementation(async (uid) => FICHAS[uid]);
  Turno.hoyMexico.mockResolvedValue("2026-10-28");
  Turno.obtenerEfectivo.mockResolvedValue(null);
  Motor.leerParametros.mockResolvedValue({ analisis_desde: "2026-09-01" });
  // la lista de subordinados directos depende del jefe consultado (primer parámetro)
  bd.cuando(/COUNT\(\*\)::int AS n FROM empleados/, (_s, p) => ({ rows: [{ n: (DIRECTOS[p[0]] || []).length }] }));
  bd.cuando(/FROM empleados\s+WHERE jefe_inmediato_id = \$1/, (_s, p) => ({ rows: (DIRECTOS[p[0]] || []).map((id) => ({ id })) }));
  bd.cuando(/FROM asistencia_periodos WHERE \$1::date BETWEEN/, { rows: [{ id: 3, fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31", estado: "abierto" }] });
  bd.cuando(/FROM empleados e WHERE e\.id = \$1/, (_s, p) => ({ rows: [{ id: p[0], nombre: "Eva", apellido_paterno: "Ruiz", apellido_materno: null, estatus: "activo", fecha_baja: null, tiene_nomina: true, nomina_compartida: false }] }));
  bd.cuando(/FROM asistencia_diaria d\s+JOIN empleados e\s+LEFT JOIN departamentos/, { rows: [] });
  bd.cuando(/FROM asistencia_diaria d\s+JOIN empleados e/, { rows: [{ ...FILA_DIA }] });
  bd.cuando(/FROM asistencia_marcas m/, { rows: [{ id: "9", marca_ts: "2026-10-05T14:00:00.000Z", terminal_alias: "SEDE-A" }] });
  bd.cuando(/FROM solicitudes_vacaciones WHERE id = \$1/, { rows: [{ id: 5, fecha_inicial: "2026-10-05", fecha_final: "2026-10-06", estatus: "aprobado" }] });
  bd.cuando(/FROM permisos_ausencia WHERE id = \$1/, { rows: [{ id: 6, tipo: "salud", fecha_inicio: "2026-10-05", fecha_fin: "2026-10-05", estatus: "aprobado" }] });
  bd.cuando(/FROM calendario_laboral WHERE id = \$1/, { rows: [{ id: 7, nombre: "Festivo", tipo: "oficial" }] });
  bd.cuando(/FROM asistencia_incidencias i/, { rows: [{ id: 8, motivo: "Cita médica", activa: true, fecha_creacion: "2026-10-06T10:00:00.000Z", creado_por_nombre: null }] });
  como("empleado");
});

describe("GET /mi-contexto", () => {
  it("sin Asistencia:consulta -> 403 y no consulta nada del empleado", async () => {
    como("sin_permiso");
    expect((await get("/api/asistencia/mi-contexto")).status).toBe(403);
    expect(bd.hubo(/FROM empleados/)).toBe(false);
  });

  it("empleado vinculado con nómina y turno: contexto sin ids ajenos ni datos de gestión", async () => {
    Turno.obtenerEfectivo.mockResolvedValue({
      origen: "departamento",
      turno: { nombre: "Rayhsa", descanso_min: 60, dias: [{ dia_semana: 3, laborable: true, hora_entrada: "08:00", hora_salida: "17:00" }] },
    });
    const r = await get("/api/asistencia/mi-contexto");
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    const d = r.body.datos;
    expect(d).toMatchObject({ vinculado: true, es_jefe: false, subordinados_directos: 0, analisis_desde: "2026-09-01", hoy: "2026-10-28" });
    expect(d.empleado).toMatchObject({ id: 10, nombre: "Eva Ruiz", tiene_nomina: true, nomina_compartida: false });
    // 2026-10-28 es miércoles = 3: horario de hoy
    expect(d.empleado.turno).toEqual({ nombre: "Rayhsa", origen: "departamento", entrada_hoy: "08:00", salida_hoy: "17:00", descanso_min: 60 });
    expect(d.periodo_actual).toEqual({ id: 3, fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31", estado: "abierto" });
    expect(JSON.stringify(d)).not.toMatch(/jefe_inmediato|usuario_id|numero_nomina|curp/);
  });

  it("sin turno asignado -> turno null (la pantalla avisa)", async () => {
    expect((await get("/api/asistencia/mi-contexto")).body.datos.empleado.turno).toBeNull();
  });

  it("sin empleado vinculado -> 200 con vinculado:false (sin inventar datos)", async () => {
    como("sin_ficha");
    const r = await get("/api/asistencia/mi-contexto");
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ vinculado: false, empleado: null, es_jefe: false, subordinados_directos: 0 });
  });

  it("es jefe solo con subordinados directos ACTIVOS y los cuenta (el SQL excluye al propio empleado)", async () => {
    como("jefe");
    const r = await get("/api/asistencia/mi-contexto");
    expect(r.body.datos).toMatchObject({ es_jefe: true, subordinados_directos: 2 });
    const q = bd.sqls().find((l) => /COUNT\(\*\)::int AS n/.test(l.sql));
    expect(q.params).toEqual([20]);
    expect(q.sql).toMatch(/id <> \$1/);
    expect(q.sql).toMatch(/estatus = 'activo'/);
  });

  it("el empleado de un jefe de jefes cuenta solo a sus directos (no a los de sus subordinados)", async () => {
    como("jefe_de_jefes");
    expect((await get("/api/asistencia/mi-contexto")).body.datos.subordinados_directos).toBe(2);
  });

  it("si el motor aún no creó la quincena actual se calcula con la misma regla (id null)", async () => {
    bd.estado.reglas.unshift({ re: /FROM asistencia_periodos WHERE \$1::date BETWEEN/, respuesta: { rows: [] } });
    const r = await get("/api/asistencia/mi-contexto");
    expect(r.body.datos.periodo_actual).toEqual({ id: null, fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31", estado: "abierto" });
  });

  it("nómina compartida se informa sin decir con quién", async () => {
    bd.estado.reglas.unshift({ re: /FROM empleados e WHERE e\.id = \$1/, respuesta: { rows: [{ id: 10, nombre: "Eva", apellido_paterno: "Ruiz", estatus: "activo", tiene_nomina: true, nomina_compartida: true }] } });
    expect((await get("/api/asistencia/mi-contexto")).body.datos.empleado.nomina_compartida).toBe(true);
  });

  it("error de BD -> 500 genérico", async () => {
    bd.estado.reglas.unshift({ re: /FROM empleados e WHERE e\.id = \$1/, respuesta: Object.assign(new Error("secreto interno"), { code: "XX000" }) });
    const r = await get("/api/asistencia/mi-contexto");
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/secreto/);
  });
});

describe("GET /mi-equipo/hoy", () => {
  const FILA_EQUIPO = {
    empleado_id: 21, nombre: "Ana", apellido_paterno: "Soto", apellido_materno: "", numero_nomina: "100", estatus: "activo", tiene_nomina: true,
    dia_estatus: "pendiente", primera_marca: "2026-10-28T14:03:00.000Z", marcas_hoy: 1, entrada_programada: "08:00", salida_programada: "17:00",
  };
  it("pide solo a los subordinados DIRECTOS del propio usuario, con la fecha de hoy del servidor", async () => {
    como("jefe");
    bd.cuando(/FROM empleados e\s+LEFT JOIN asistencia_diaria d/, { rows: [FILA_EQUIPO] });
    const r = await get("/api/asistencia/mi-equipo/hoy?jefe_id=99&hoy=2020-01-01");
    expect(r.status).toBe(200);
    const q = bd.sqls().find((l) => /LEFT JOIN asistencia_diaria d/.test(l.sql));
    expect(q.params).toEqual([20, "2026-10-28"]); // ni jefe_id ni hoy de la petición
    expect(q.sql).toMatch(/e\.jefe_inmediato_id = \$1 AND e\.id <> \$1/);
    expect(q.sql).toMatch(/e\.estatus IS DISTINCT FROM 'baja' OR \(e\.fecha_baja IS NOT NULL AND e\.fecha_baja >= \$2::date\)/);
    expect(r.body.datos).toMatchObject({ hoy: "2026-10-28", es_jefe: true, truncado: false });
    expect(r.body.datos.ahora).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.body.datos.equipo[0]).toMatchObject({ empleado_id: 21, nombre_completo: "Ana Soto", dia_estatus: "pendiente" });
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  it("no devuelve jefe, usuario ni ids internos", async () => {
    como("jefe");
    bd.cuando(/FROM empleados e\s+LEFT JOIN asistencia_diaria d/, { rows: [FILA_EQUIPO] });
    const q = bd.sqls();
    await get("/api/asistencia/mi-equipo/hoy");
    const sql = bd.sqls().find((l) => /LEFT JOIN asistencia_diaria d/.test(l.sql)).sql;
    expect(q).toBeDefined();
    expect(sql).not.toMatch(/terminal_sn|usuario_id|d\.id\b|jefe_inmediato_id AS|detalle,|curp/);
  });
  it("un empleado sin subordinados recibe es_jefe:false y lista vacía", async () => {
    bd.cuando(/FROM empleados e\s+LEFT JOIN asistencia_diaria d/, { rows: [] });
    const r = await get("/api/asistencia/mi-equipo/hoy");
    expect(r.body.datos).toMatchObject({ es_jefe: false, equipo: [] });
  });
  it("sin empleado vinculado: vacío y sin consultar equipo", async () => {
    como("sin_ficha");
    const r = await get("/api/asistencia/mi-equipo/hoy");
    expect(r.body.datos).toMatchObject({ es_jefe: false, equipo: [] });
    expect(bd.hubo(/LEFT JOIN asistencia_diaria d/)).toBe(false);
  });
  it("sin Asistencia:consulta -> 403", async () => {
    como("sin_permiso");
    expect((await get("/api/asistencia/mi-equipo/hoy")).status).toBe(403);
  });
  it("RH que además es jefe ve SOLO a su equipo (el SQL parte del propio empleado)", async () => {
    como("rh_admin");
    bd.cuando(/FROM empleados e\s+LEFT JOIN asistencia_diaria d/, { rows: [{ ...FILA_EQUIPO, empleado_id: 51 }] });
    await get("/api/asistencia/mi-equipo/hoy");
    expect(bd.sqls().find((l) => /LEFT JOIN asistencia_diaria d/.test(l.sql)).params[0]).toBe(50);
  });
  it("error de BD -> 500 genérico", async () => {
    bd.cuando(/FROM empleados e\s+LEFT JOIN asistencia_diaria d/, Object.assign(new Error("secreto"), { code: "XX000" }));
    const r = await get("/api/asistencia/mi-equipo/hoy");
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/secreto/);
  });
});

describe("matriz de alcance: empleado, jefe y jefe de jefes", () => {
  const rutaDia = (id) => `/api/asistencia/resultados/dia?empleado_id=${id}&fecha=2026-10-05`;
  const rutaRes = (id) => `/api/asistencia/resultados?empleado_id=${id}&${RANGO}`;

  it("el empleado A ve lo suyo y NO ve a B (IDOR) por /resultados, /resultados/dia ni /resumen", async () => {
    como("empleado");
    expect((await get(rutaRes(10))).status).toBe(200);
    expect((await get(rutaDia(10))).status).toBe(200);
    bd.estado.llamadas = [];
    expect((await get(rutaRes(21))).status).toBe(403);
    expect((await get(rutaDia(21))).status).toBe(403);
    expect(bd.hubo(/FROM asistencia_diaria d/)).toBe(false);
    // /resumen no acepta un empleado: solo agrupa los ids visibles (el propio)
    const r = await get(`/api/asistencia/resumen?${RANGO}&empleado_id=21`);
    expect(r.status).toBe(200);
    expect(bd.sqls().find((l) => /COUNT\(\*\) FILTER/.test(l.sql)).params[0]).toEqual([10]);
  });

  it("el jefe ve a sus directos, no a un par, ni a su propio jefe, ni a los subordinados de otro jefe", async () => {
    como("jefe");
    for (const ok of [20, 21, 22]) expect((await get(rutaDia(ok))).status).toBe(200);
    for (const ajeno of [10, 25, 30, 51]) expect((await get(rutaDia(ajeno))).status).toBe(403);
    for (const ajeno of [10, 25, 30]) expect((await get(rutaRes(ajeno))).status).toBe(403);
    await get(`/api/asistencia/resumen?${RANGO}`);
    expect(bd.sqls().filter((l) => /COUNT\(\*\) FILTER/.test(l.sql)).pop().params[0]).toEqual([20, 21, 22]);
  });

  it("el jefe de jefes ve solo a sus directos: no a los subordinados de sus subordinados", async () => {
    como("jefe_de_jefes");
    for (const ok of [30, 20, 25]) expect((await get(rutaDia(ok))).status).toBe(200);
    for (const nieto of [21, 22]) expect((await get(rutaDia(nieto))).status).toBe(403);
    for (const nieto of [21, 22]) expect((await get(rutaRes(nieto))).status).toBe(403);
    await get(`/api/asistencia/resumen?${RANGO}`);
    expect(bd.sqls().filter((l) => /COUNT\(\*\) FILTER/.test(l.sql)).pop().params[0]).toEqual([30, 20, 25]);
  });

  it("el usuario sin empleado vinculado recibe 403 uniforme (sin consultar días)", async () => {
    como("sin_ficha");
    expect((await get(rutaDia(10))).status).toBe(403);
    expect((await get(rutaRes(10))).status).toBe(403);
    expect((await get(`/api/asistencia/resumen?${RANGO}`)).status).toBe(403);
    expect(bd.hubo(/FROM asistencia_diaria d/)).toBe(false);
  });

  it("rh_admin y super_admin ven a cualquiera", async () => {
    for (const rol of ["rh_admin", "super_admin"]) {
      como(rol);
      expect((await get(rutaDia(21))).status).toBe(200);
      expect((await get(rutaRes(99))).status).toBe(200);
    }
  });

  it("portal_admin (con los grants reales: solo Asistencia:consulta) ve lo propio y nada de gestión", async () => {
    como("portal_admin");
    expect((await get(rutaDia(70))).status).toBe(200);
    expect((await get(rutaDia(21))).status).toBe(403);
    for (const ruta of ["/api/asistencia/ejecuciones", "/api/asistencia/parametros", "/api/asistencia/sin-identificador", "/api/asistencia/periodos/3/contadores"]) {
      expect((await get(ruta)).status).toBe(403);
    }
  });

  it("las rutas de lectura nuevas no admiten escritura (solo GET)", async () => {
    for (const ruta of ["/api/asistencia/mi-contexto", "/api/asistencia/mi-equipo/hoy"]) {
      for (const metodo of ["post", "put", "delete", "patch"]) {
        expect((await request(app)[metodo](ruta).send({})).status).toBe(404);
      }
    }
  });
});

describe("?equipo=1 (pantalla «Mi equipo»): solo los directos, sin importar el rol", () => {
  const resumenIds = () => bd.sqls().filter((l) => /COUNT\(\*\) FILTER/.test(l.sql)).pop().params[0];
  const resultadosIds = () => bd.sqls().filter((l) => /JOIN empleados e ON e\.id = d\.empleado_id\s+LEFT JOIN asistencia_periodos p/.test(l.sql)).pop();

  it("el jefe recibe a sus directos SIN su propio empleado", async () => {
    como("jefe");
    expect((await get(`/api/asistencia/resumen?${RANGO}&equipo=1`)).status).toBe(200);
    expect(resumenIds()).toEqual([21, 22]);
  });
  it("RH que es jefe: equipo=1 limita al equipo (nunca ids null = toda la empresa)", async () => {
    como("rh_admin");
    await get(`/api/asistencia/resumen?${RANGO}&equipo=1`);
    expect(resumenIds()).toEqual([51]);
    await get(`/api/asistencia/resumen?${RANGO}`);
    expect(resumenIds()).toBeNull(); // sin equipo=1, RH ve todo
  });
  it("RH sin ficha de empleado + equipo=1 -> 403", async () => {
    como("rh_sin_ficha");
    expect((await get(`/api/asistencia/resumen?${RANGO}&equipo=1`)).status).toBe(403);
  });
  it("con equipo=1 un empleado fuera del equipo (o el propio jefe) da 403 aun para RH", async () => {
    como("rh_admin");
    expect((await get(`/api/asistencia/resultados?empleado_id=51&${RANGO}&equipo=1`)).status).toBe(200);
    expect((await get(`/api/asistencia/resultados?empleado_id=21&${RANGO}&equipo=1`)).status).toBe(403);
    expect((await get(`/api/asistencia/resultados?empleado_id=50&${RANGO}&equipo=1`)).status).toBe(403);
  });
  it("jefe de jefes con equipo=1: sus directos, no los nietos", async () => {
    como("jefe_de_jefes");
    expect((await get(`/api/asistencia/resultados?empleado_id=20&${RANGO}&equipo=1`)).status).toBe(200);
    expect((await get(`/api/asistencia/resultados?empleado_id=21&${RANGO}&equipo=1`)).status).toBe(403);
    await get(`/api/asistencia/resumen?${RANGO}&equipo=1`);
    expect(resumenIds()).toEqual([20, 25]);
  });
  it("equipo con cualquier valor distinto de 1 -> 400", async () => {
    for (const v of ["0", "true", "2", ""]) expect((await get(`/api/asistencia/resumen?${RANGO}&equipo=${v}`)).status).toBe(400);
    expect((await get(`/api/asistencia/resumen?${RANGO}&equipo[]=1`)).status).toBe(400);
  });
  it("equipo=1 sin subordinados: lista vacía (ids [] no es todos)", async () => {
    como("empleado");
    expect((await get(`/api/asistencia/resumen?${RANGO}&equipo=1`)).status).toBe(200);
    expect(resumenIds()).toEqual([]);
    expect(resultadosIds()).toBeUndefined();
  });
});

describe("lo que NO sale a quien consulta lo propio o a su equipo", () => {
  const DIA = "/api/asistencia/resultados/dia?empleado_id=21&fecha=2026-10-05";
  const INTERNOS = ["id", "turno_id", "departamento_id", "periodo_id", "marcas_usadas", "version_calculo", "solicitud_vacaciones_id", "permiso_id", "calendario_id", "incidencia_id", "departamento_actual_id"];

  it("el detalle de un jefe: sin ids internos, sin terminal_sn, sin quién justificó, CON el motivo", async () => {
    como("jefe");
    const r = await get(DIA);
    expect(r.status).toBe(200);
    for (const campo of INTERNOS) expect(r.body.datos.dia).not.toHaveProperty(campo);
    expect(r.body.datos.marcas[0]).toEqual({ marca_ts: "2026-10-05T14:00:00.000Z", terminal_alias: "SEDE-A", rol: "entrada" });
    const { vacaciones, permiso, festivo, justificacion } = r.body.datos.cruces;
    for (const c of [vacaciones, permiso, festivo, justificacion]) expect(c).not.toHaveProperty("id");
    expect(justificacion).toMatchObject({ motivo: "Cita médica", creado_por_nombre: null });
    const sqlMarcas = bd.sqls().find((l) => /FROM asistencia_marcas m/.test(l.sql)).sql;
    expect(sqlMarcas).not.toMatch(/terminal_sn/);
    expect(bd.sqls().find((l) => /FROM asistencia_incidencias i/.test(l.sql)).sql).not.toMatch(/concat_ws/);
  });
  it("el mismo detalle para RH conserva los ids y el nombre de quien justificó", async () => {
    como("rh_admin");
    const r = await get(DIA);
    expect(r.body.datos.dia.id).toBe(1);
    expect(r.body.datos.marcas[0].id).toBe("9");
    expect(r.body.datos.cruces.justificacion.id).toBe(8);
    expect(bd.sqls().find((l) => /FROM asistencia_incidencias i/.test(l.sql)).sql).toMatch(/concat_ws/);
  });
  it("/resultados del empleado: sin id de fila, turno, departamento, periodo, marcas usadas ni versión", async () => {
    bd.estado.reglas.unshift({ re: /JOIN empleados e ON e\.id = d\.empleado_id\s+LEFT JOIN asistencia_periodos p/, respuesta: { rows: [{ ...FILA_DIA, empleado_id: 10, total: "1" }] } });
    como("empleado");
    const r = await get(`/api/asistencia/resultados?empleado_id=10&${RANGO}`);
    expect(r.status).toBe(200);
    for (const campo of ["id", "turno_id", "departamento_id", "periodo_id", "marcas_usadas", "version_calculo"]) expect(r.body.datos[0]).not.toHaveProperty(campo);
    expect(r.body.datos[0]).toMatchObject({ estatus: "justificada", periodo_estado: "abierto" });
    expect(r.body.paginacion.total).toBe(1);
    como("rh_admin");
    expect((await get(`/api/asistencia/resultados?empleado_id=10&${RANGO}`)).body.datos[0]).toMatchObject({ id: 1, turno_id: 4 });
  });
  it("/resumen del jefe: sin departamento_id; RH lo conserva", async () => {
    bd.estado.reglas.unshift({ re: /COUNT\(\*\) FILTER/, respuesta: { rows: [{ empleado_id: 21, nombre: "Ana", departamento_id: 2, departamento: "Ventas", total: "1" }] } });
    como("jefe");
    expect((await get(`/api/asistencia/resumen?${RANGO}`)).body.datos[0]).not.toHaveProperty("departamento_id");
    como("rh_admin");
    expect((await get(`/api/asistencia/resumen?${RANGO}`)).body.datos[0].departamento_id).toBe(2);
  });
  it("/periodos del empleado: sin motivo de reapertura, quién cerró o reabrió, tipo de cierre ni conteos globales", async () => {
    const f = {
      id: 1, estado: "cerrado", cerrado_por: 5, cerrado_por_nombre: "Ana RH", reabierto_por: 5, reabierto_por_nombre: "Ana RH", reabierto_motivo: "motivo interno",
      tipo_cierre: "manual", no_cerrar_automatico: true, dias_pendientes: 40, ajustes_pendientes: 3, fecha_inicio: "2026-10-01", fecha_fin: "2026-10-15", total: "1",
    };
    bd.estado.reglas.unshift({ re: /FROM asistencia_periodos p/, respuesta: { rows: [f] } });
    como("empleado");
    const p = (await get("/api/asistencia/periodos")).body.datos[0];
    for (const campo of ["cerrado_por", "cerrado_por_nombre", "reabierto_por", "reabierto_por_nombre", "reabierto_motivo", "tipo_cierre", "no_cerrar_automatico", "dias_pendientes", "ajustes_pendientes"]) {
      expect(p).not.toHaveProperty(campo);
    }
    expect(p).toMatchObject({ estado: "cerrado", fecha_inicio: "2026-10-01" });
    como("rh_admin");
    expect((await get("/api/asistencia/periodos")).body.datos[0]).toMatchObject({ dias_pendientes: 40, tipo_cierre: "manual" });
  });
  it("ningún camino de lectura responde con texto de PostgreSQL (500 genérico)", async () => {
    como("empleado");
    bd.estado.reglas.unshift({ re: /FROM asistencia_diaria d/, respuesta: Object.assign(new Error("relation secreto"), { code: "42P01" }) });
    for (const ruta of [`/api/asistencia/resultados?empleado_id=10&${RANGO}`, `/api/asistencia/resumen?${RANGO}`, "/api/asistencia/resultados/dia?empleado_id=10&fecha=2026-10-05"]) {
      const r = await get(ruta);
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toMatch(/secreto|42P01/);
    }
  });
});
