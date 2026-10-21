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
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(null),
}));

const { __bd: bd } = require("../../../portal/backend/config/database");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");
const Turno = require("../models/turno.model");

const app = express();
app.use(express.json());
app.use("/api/asistencia", require("../routes/asistencia.routes"));

const ASIGNACION = {
  id: 11,
  departamento_id: 3,
  empleado_id: 9,
  turno_id: 5,
  vigente_desde: "2026-11-01",
  vigente_hasta: null,
};
const TURNO_FILA = { id: 5, nombre: "Rayhsa", activo: true };

const CASOS = [
  { tipo: "departamento", ruta: "departamentos", columna: "departamento_id", tabla: "turno_departamento", padre: "departamentos", espacio: 4301, id: 3 },
  { tipo: "empleado", ruta: "empleados", columna: "empleado_id", tabla: "turno_empleado", padre: "empleados", espacio: 4302, id: 9 },
];

beforeEach(() => {
  jest.clearAllMocks();
  bd.reiniciar();
  mockUser = { usuario_id: 5, rol_id: 3, rol_nombre: "rh_admin" };
  bd.estado.permisos = { Asistencia: ["consulta", "edicion"], Turnos: ["consulta", "edicion"], Empleados: ["consulta", "edicion"] };
});

describe.each(CASOS)("Asignaciones a $tipo", ({ tipo, ruta, columna, tabla, padre, espacio, id }) => {
  const url = `/api/asistencia/asignaciones/${ruta}`;
  const cuerpo = { [columna]: id, turno_id: 5, vigente_desde: "2026-11-01" };
  const simularAlta = () => {
    bd.cuando(new RegExp(`SELECT id FROM ${padre} WHERE id = \\$1`), { rows: [{ id }] });
    bd.cuando(/FROM turnos WHERE id = \$1 FOR SHARE/, { rows: [TURNO_FILA] });
    bd.cuando(new RegExp(`INSERT INTO ${tabla} `), { rows: [{ id: 11 }] });
    bd.cuando(new RegExp(`FROM ${tabla} a WHERE a\\.id = \\$1`), { rows: [ASIGNACION] });
  };

  describe("permisos", () => {
    it("ver asignaciones exige Turnos:consulta (Asistencia:consulta no basta)", async () => {
      bd.estado.permisos = { Asistencia: ["consulta"] };
      expect((await request(app).get(url)).status).toBe(403);
      bd.estado.permisos = { Turnos: ["consulta"] };
      bd.cuando(/FROM turno_/, { rows: [] });
      expect((await request(app).get(url)).status).toBe(200);
    });

    it("asignar y terminar exigen Turnos:edicion: con solo consulta -> 403 sin tocar la BD ni auditar", async () => {
      bd.estado.permisos = { Asistencia: ["consulta", "edicion"], Turnos: ["consulta"] };
      expect((await request(app).post(url).send(cuerpo)).status).toBe(403);
      expect((await request(app).put(`${url}/11/terminar`).send({ vigente_hasta: "2026-12-31" })).status).toBe(403);
      expect(bd.sqls()).toHaveLength(0);
      expect(bd.grupo.connect).not.toHaveBeenCalled();
      expect(registrarAccion).not.toHaveBeenCalled();
    });
  });

  describe("alta", () => {
    it("transacción con candado, existencia, turno activo y traslape ANTES del INSERT; audita ids y fechas", async () => {
      simularAlta();
      const res = await request(app).post(url).send(cuerpo);
      expect(res.status).toBe(201);
      expect(res.body.datos.id).toBe(11);

      const i = (re) => bd.indice(re);
      expect(i(/^\s*BEGIN/)).toBe(0);
      expect(i(/pg_advisory_xact_lock/)).toBeGreaterThan(i(/BEGIN/));
      expect(i(/pg_advisory_xact_lock/)).toBeLessThan(i(/daterange\(a\.vigente_desde/));
      expect(i(/daterange\(a\.vigente_desde/)).toBeLessThan(i(new RegExp(`INSERT INTO ${tabla}`)));
      expect(i(/FOR SHARE/)).toBeLessThan(i(new RegExp(`INSERT INTO ${tabla}`)));
      expect(i(/COMMIT/)).toBeGreaterThan(i(new RegExp(`INSERT INTO ${tabla}`)));
      const candado = bd.sqls().find((l) => /pg_advisory_xact_lock/.test(l.sql));
      expect(candado.params).toEqual([espacio, id]);

      const insert = bd.sqls().find((l) => new RegExp(`INSERT INTO ${tabla}`).test(l.sql));
      expect(insert.params).toEqual([id, 5, "2026-11-01", null, 5]);
      expect(bd.cliente.release).toHaveBeenCalledTimes(1);

      const [, modulo, tablaAud, regId, accion, previos, nuevos] = registrarAccion.mock.calls[0];
      expect([modulo, tablaAud, regId, accion, previos]).toEqual(["rh", tabla, 11, "INSERT", null]);
      expect(nuevos).toEqual({
        [columna]: id,
        turno_id: 5,
        vigente_desde: "2026-11-01",
        vigente_hasta: null,
      });
    });

    it("las fechas viajan como texto y la consulta de traslape compara intervalos cerrados", async () => {
      simularAlta();
      await request(app).post(url).send({ ...cuerpo, vigente_hasta: "2026-12-31" });
      const choque = bd.sqls().find((l) => /daterange\(a\.vigente_desde/.test(l.sql));
      expect(choque.sql).toMatch(/daterange\(a\.vigente_desde, a\.vigente_hasta, '\[\]'\) && daterange\(\$2::date, \$3::date, '\[\]'\)/);
      expect(choque.params).toEqual([id, "2026-11-01", "2026-12-31"]);
    });

    it("traslape -> 409 con el rango en conflicto, ROLLBACK, sin INSERT ni auditoría", async () => {
      simularAlta();
      bd.estado.reglas.unshift({
        re: /daterange\(a\.vigente_desde/,
        respuesta: { rows: [{ id: 2, vigente_desde: "2026-01-01", vigente_hasta: null }] },
      });
      const res = await request(app).post(url).send(cuerpo);
      expect(res.status).toBe(409);
      expect(res.body.mensaje).toMatch(/traslapa.*2026-01-01 a sin fecha final/);
      expect(bd.hubo(new RegExp(`INSERT INTO ${tabla}`))).toBe(false);
      expect(bd.hubo(/ROLLBACK/)).toBe(true);
      expect(bd.hubo(/COMMIT/)).toBe(false);
      expect(registrarAccion).not.toHaveBeenCalled();
    });

    it("carrera: la restricción EXCLUDE de la BD (23P01) también da 409", async () => {
      simularAlta();
      bd.estado.reglas.unshift({
        re: new RegExp(`INSERT INTO ${tabla} `),
        respuesta: Object.assign(new Error(`conflicting key ${tabla}_sin_traslape`), { code: "23P01" }),
      });
      const res = await request(app).post(url).send(cuerpo);
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).not.toMatch(/sin_traslape/);
      expect(bd.hubo(/ROLLBACK/)).toBe(true);
    });

    it(`${tipo} inexistente -> 404 sin insertar`, async () => {
      simularAlta();
      bd.estado.reglas.shift(); // sin la regla de existencia del padre
      const res = await request(app).post(url).send(cuerpo);
      expect(res.status).toBe(404);
      expect(bd.hubo(new RegExp(`INSERT INTO ${tabla}`))).toBe(false);
      expect(bd.hubo(/ROLLBACK/)).toBe(true);
    });

    it("turno inexistente -> 404; turno inactivo -> 409", async () => {
      simularAlta();
      bd.estado.reglas.splice(1, 1, { re: /FROM turnos WHERE id = \$1 FOR SHARE/, respuesta: { rows: [] } });
      expect((await request(app).post(url).send(cuerpo)).status).toBe(404);
      bd.estado.reglas.splice(1, 1, {
        re: /FROM turnos WHERE id = \$1 FOR SHARE/,
        respuesta: { rows: [{ id: 5, activo: false }] },
      });
      const res = await request(app).post(url).send(cuerpo);
      expect(res.status).toBe(409);
      expect(res.body.mensaje).toMatch(/inactivo/);
      expect(bd.hubo(new RegExp(`INSERT INTO ${tabla}`))).toBe(false);
      expect(registrarAccion).not.toHaveBeenCalled();
    });

    it.each([
      ["sin turno", { turno_id: undefined }],
      ["fecha inexistente", { vigente_desde: "2026-02-30" }],
      ["fecha como Date ISO", { vigente_desde: "2026-11-01T00:00:00Z" }],
      ["vigente_hasta anterior", { vigente_hasta: "2026-10-01" }],
      ["destino arreglo", { [columna]: [id] }],
      ["destino cero", { [columna]: 0 }],
    ])("400 sin tocar la BD: %s", async (_n, cambio) => {
      const res = await request(app).post(url).send({ ...cuerpo, ...cambio });
      expect(res.status).toBe(400);
      expect(bd.sqls()).toHaveLength(0);
      expect(registrarAccion).not.toHaveBeenCalled();
    });

    it("error inesperado -> 500 genérico", async () => {
      simularAlta();
      bd.estado.reglas.unshift({ re: /pg_advisory_xact_lock/, respuesta: new Error("SECRETO") });
      const res = await request(app).post(url).send(cuerpo);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/SECRETO/);
    });
  });

  describe("terminar", () => {
    const terminar = (id2, hasta) => request(app).put(`${url}/${id2}/terminar`).send({ vigente_hasta: hasta });
    const simular = (previo) => {
      bd.cuando(new RegExp(`SELECT id FROM ${tabla} WHERE id = \\$1 FOR UPDATE`), { rows: [{ id: 11 }] });
      let llamada = 0;
      bd.cuando(new RegExp(`FROM ${tabla} a WHERE a\\.id = \\$1`), () => ({
        rows: [llamada++ === 0 ? previo : { ...previo, vigente_hasta: "2026-12-31" }],
      }));
    };

    it.each(["x", "0", "1.5", "99999999999"])("id %s -> 400", async (x) => {
      expect((await terminar(x, "2026-12-31")).status).toBe(400);
      expect(bd.sqls()).toHaveLength(0);
    });

    it.each([[undefined], ["2026-02-30"], ["31/12/2026"], [20261231]])("vigente_hasta %j -> 400", async (h) => {
      expect((await terminar(11, h)).status).toBe(400);
      expect(bd.sqls()).toHaveLength(0);
    });

    it("inexistente -> 404 sin actualizar", async () => {
      expect((await terminar(11, "2026-12-31")).status).toBe(404);
      expect(bd.hubo(new RegExp(`UPDATE ${tabla}`))).toBe(false);
    });

    it("cierra la asignación abierta bajo FOR UPDATE y audita antes y después", async () => {
      simular(ASIGNACION);
      const res = await terminar(11, "2026-12-31");
      expect(res.status).toBe(200);
      expect(bd.indice(/FOR UPDATE/)).toBeLessThan(bd.indice(new RegExp(`UPDATE ${tabla}`)));
      const upd = bd.sqls().find((l) => new RegExp(`UPDATE ${tabla}`).test(l.sql));
      expect(upd.params).toEqual([11, "2026-12-31"]);
      const [, , tablaAud, regId, accion, previos, nuevos] = registrarAccion.mock.calls[0];
      expect([tablaAud, String(regId), accion]).toEqual([tabla, "11", "TERMINAR"]);
      expect(previos.vigente_hasta).toBeNull();
      expect(nuevos.vigente_hasta).toBe("2026-12-31");
    });

    it("hasta anterior al inicio -> 400; alargar o repetir la fecha final -> 409", async () => {
      simular(ASIGNACION);
      const antes = await terminar(11, "2026-10-31");
      expect(antes.status).toBe(400);
      bd.reiniciar();
      bd.estado.permisos = { Turnos: ["consulta", "edicion"] };
      simular({ ...ASIGNACION, vigente_hasta: "2026-12-31" });
      const igual = await terminar(11, "2026-12-31");
      expect(igual.status).toBe(409);
      expect(bd.hubo(new RegExp(`UPDATE ${tabla}`))).toBe(false);
      expect(registrarAccion).not.toHaveBeenCalled();
    });

    it("acortar una asignación con fecha final es válido", async () => {
      simular({ ...ASIGNACION, vigente_hasta: "2027-06-30" });
      expect((await terminar(11, "2026-12-31")).status).toBe(200);
    });
  });

  describe("listado", () => {
    it("filtra por destino y turno con parámetros; ids inválidos -> 400", async () => {
      bd.cuando(/FROM turno_/, { rows: [ASIGNACION] });
      const res = await request(app).get(`${url}?${columna}=${id}&turno_id=5`);
      expect(res.status).toBe(200);
      const q = bd.sqls()[0];
      expect(q.params).toEqual([id, 5]);
      expect(q.sql).toMatch(/to_char\(a\.vigente_desde, 'YYYY-MM-DD'\)/);
      expect((await request(app).get(`${url}?${columna}=abc`)).status).toBe(400);
      expect((await request(app).get(`${url}?turno_id=0`)).status).toBe(400);
    });
  });
});

describe("Turno efectivo de un empleado", () => {
  const URL = (id = 9, q = "") => `/api/asistencia/empleados/${id}/turno${q}`;
  const EMPLEADO = { id: 9, jefe_inmediato_id: 20, departamento_id: 3 };
  const FILA_ASIG = { asignacion_id: 11, turno_id: 5, vigente_desde: "2026-01-01", vigente_hasta: null };
  const simularEmpleado = (e = EMPLEADO) => {
    bd.cuando(/AT TIME ZONE 'America\/Mexico_City'/, { rows: [{ hoy: "2026-10-21" }] });
    return bd.cuando(/SELECT id, jefe_inmediato_id, departamento_id FROM empleados/, { rows: e ? [e] : [] });
  };
  const simularTurno = () => {
    bd.cuando(/FROM turnos t WHERE t\.id = \$1/, { rows: [TURNO_FILA] });
    bd.cuando(/FROM turno_dias WHERE turno_id/, { rows: [] });
  };
  const comoEmpleado = (propio) => {
    mockUser = { usuario_id: 77, rol_id: 8, rol_nombre: "rh_empleado" };
    bd.estado.permisos = { Asistencia: ["consulta"] };
    bd.cuando(/SELECT \* FROM empleados WHERE usuario_id/, { rows: propio ? [propio] : [] });
  };

  describe("acceso", () => {
    it("RH (Empleados:edicion) consulta a cualquiera", async () => {
      simularEmpleado();
      simularTurno();
      expect((await request(app).get(URL())).status).toBe(200);
    });

    it("el empleado ve su propio turno", async () => {
      comoEmpleado({ id: 9 });
      simularEmpleado();
      simularTurno();
      expect((await request(app).get(URL(9))).status).toBe(200);
    });

    it("el empleado NO ve el de otro (403) y no se lee ningún turno", async () => {
      comoEmpleado({ id: 8 });
      simularEmpleado();
      const res = await request(app).get(URL(9));
      expect(res.status).toBe(403);
      expect(bd.hubo(/turno_empleado/)).toBe(false);
    });

    it("el jefe inmediato VIGENTE ve a su subordinado directo", async () => {
      comoEmpleado({ id: 20 });
      simularEmpleado();
      simularTurno();
      expect((await request(app).get(URL(9))).status).toBe(200);
    });

    it("quien fue jefe pero ya no lo es (jefe_inmediato_id distinto) recibe 403", async () => {
      comoEmpleado({ id: 21 });
      simularEmpleado(); // el jefe vigente de 9 es 20
      expect((await request(app).get(URL(9))).status).toBe(403);
    });

    it("el jefe de un subordinado NO ve al jefe de su propio jefe ni a un par", async () => {
      comoEmpleado({ id: 20 });
      simularEmpleado({ id: 30, jefe_inmediato_id: 99, departamento_id: 3 });
      expect((await request(app).get(URL(30))).status).toBe(403);
    });

    it("el empleado que figura como su propio jefe no gana acceso a otro por eso", async () => {
      comoEmpleado({ id: 9 });
      simularEmpleado({ id: 9, jefe_inmediato_id: 9, departamento_id: 3 });
      simularTurno();
      expect((await request(app).get(URL(9))).status).toBe(200); // lo propio sigue permitido
    });

    it("empleado inexistente: no-RH 403 uniforme; RH 404", async () => {
      comoEmpleado({ id: 9 });
      simularEmpleado(null);
      expect((await request(app).get(URL(55))).status).toBe(403);
      bd.reiniciar();
      bd.estado.permisos = { Asistencia: ["consulta"], Empleados: ["edicion"] };
      simularEmpleado(null);
      mockUser = { usuario_id: 5, rol_id: 3, rol_nombre: "rh_admin" };
      expect((await request(app).get(URL(55))).status).toBe(404);
    });

    it("usuario sin empleado asociado -> 403; sin Asistencia:consulta -> 403", async () => {
      comoEmpleado(null);
      simularEmpleado();
      expect((await request(app).get(URL(9))).status).toBe(403);
      bd.estado.permisos = {};
      expect((await request(app).get(URL(9))).status).toBe(403);
    });

    it.each(["abc", "0", "1.5", "99999999999"])("empleado %s -> 400", async (x) => {
      expect((await request(app).get(URL(x))).status).toBe(400);
      expect(bd.sqls()).toHaveLength(0);
    });

    it.each(["2026-02-30", "hoy", "2026-1-1", "2026-10-21T00:00:00Z"])("fecha %s -> 400", async (f) => {
      simularEmpleado();
      expect((await request(app).get(URL(9, `?fecha=${encodeURIComponent(f)}`))).status).toBe(400);
      expect(bd.hubo(/turno_empleado/)).toBe(false);
    });
  });

  describe("resolución", () => {
    it("la asignación individual vigente gana y no se consulta el departamento", async () => {
      simularEmpleado();
      simularTurno();
      bd.cuando(/FROM turno_empleado a/, { rows: [FILA_ASIG] });
      const res = await request(app).get(URL(9, "?fecha=2026-10-21"));
      expect(res.body.datos).toMatchObject({ empleado_id: 9, fecha: "2026-10-21", origen: "empleado", asignacion_id: 11 });
      expect(res.body.datos.turno.nombre).toBe("Rayhsa");
      expect(bd.hubo(/turno_departamento/)).toBe(false);
      const q = bd.sqls().find((l) => /FROM turno_empleado a/.test(l.sql));
      expect(q.sql).toMatch(/\$2::date BETWEEN a\.vigente_desde AND COALESCE\(a\.vigente_hasta, 'infinity'::date\)/);
      expect(q.params).toEqual([9, "2026-10-21"]);
    });

    it("sin individual usa la del departamento ACTUAL del empleado", async () => {
      simularEmpleado();
      simularTurno();
      bd.cuando(/FROM empleados e\s+JOIN turno_departamento a/, { rows: [{ ...FILA_ASIG, asignacion_id: 4 }] });
      const res = await request(app).get(URL(9, "?fecha=2026-10-21"));
      expect(res.body.datos).toMatchObject({ origen: "departamento", asignacion_id: 4 });
      const q = bd.sqls().find((l) => /JOIN turno_departamento a/.test(l.sql));
      expect(q.sql).toMatch(/a\.departamento_id = e\.departamento_id/);
      expect(q.sql).toMatch(/BETWEEN a\.vigente_desde AND COALESCE\(a\.vigente_hasta, 'infinity'::date\)/);
    });

    it("sin ninguna asignación vigente devuelve turno null (no es error)", async () => {
      simularEmpleado();
      const res = await request(app).get(URL(9, "?fecha=2026-10-21"));
      expect(res.status).toBe(200);
      expect(res.body.datos).toEqual({
        empleado_id: 9,
        fecha: "2026-10-21",
        origen: null,
        asignacion_id: null,
        turno: null,
        turno_activo: null,
      });
    });

    it("un turno INACTIVO con asignación vigente sigue siendo el efectivo e informa turno_activo=false", async () => {
      simularEmpleado();
      bd.cuando(/FROM turnos t WHERE t\.id = \$1/, { rows: [{ ...TURNO_FILA, activo: false }] });
      bd.cuando(/FROM turno_dias WHERE turno_id/, { rows: [] });
      bd.cuando(/FROM turno_empleado a/, { rows: [FILA_ASIG] });
      const res = await request(app).get(URL(9, "?fecha=2020-06-01"));
      expect(res.status).toBe(200);
      expect(res.body.datos).toMatchObject({ origen: "empleado", asignacion_id: 11, turno_activo: false });
      expect(res.body.datos.turno.activo).toBe(false);
      // la resolución no filtra por turnos.activo (hace falta para recalcular días pasados)
      expect(bd.sqls().filter((l) => /FROM turno_(empleado|departamento)|JOIN turno_departamento/.test(l.sql)).every((l) => !/activo/.test(l.sql))).toBe(true);
    });

    it("turno activo -> turno_activo=true (también por departamento)", async () => {
      simularEmpleado();
      simularTurno();
      bd.cuando(/FROM empleados e\s+JOIN turno_departamento a/, { rows: [{ ...FILA_ASIG, asignacion_id: 4 }] });
      const res = await request(app).get(URL(9, "?fecha=2026-10-21"));
      expect(res.body.datos).toMatchObject({ origen: "departamento", turno_activo: true });
    });

    it("sin fecha usa hoy en America/Mexico_City calculado por la BD", async () => {
      simularEmpleado();
      const res = await request(app).get(URL(9));
      expect(res.body.datos.fecha).toBe("2026-10-21");
    });

    it("error de BD -> 500 genérico", async () => {
      simularEmpleado();
      bd.cuando(/FROM turno_empleado a/, new Error("SECRETO"));
      const res = await request(app).get(URL(9, "?fecha=2026-10-21"));
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/SECRETO/);
    });
  });

  describe("Turno.obtenerEfectivo (modelo reutilizable)", () => {
    it("usa el cliente recibido (transacción) y no el pool", async () => {
      const cliente = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      expect(await Turno.obtenerEfectivo(9, "2026-10-21", cliente)).toBeNull();
      expect(cliente.query).toHaveBeenCalledTimes(2);
      expect(bd.grupo.query).not.toHaveBeenCalled();
    });
  });
});

describe("Historial de asignaciones de un empleado", () => {
  const URL = "/api/asistencia/empleados/9/turnos";

  it("exige Turnos:consulta: el empleado, aunque sea el suyo, recibe 403", async () => {
    mockUser = { usuario_id: 77, rol_id: 8, rol_nombre: "rh_empleado" };
    bd.estado.permisos = { Asistencia: ["consulta"] };
    expect((await request(app).get(URL)).status).toBe(403);
    expect(bd.sqls()).toHaveLength(0);
  });

  it("devuelve las individuales y las del departamento actual; 404 si no existe", async () => {
    bd.cuando(/SELECT id, jefe_inmediato_id, departamento_id FROM empleados/, { rows: [{ id: 9, jefe_inmediato_id: 20, departamento_id: 3 }] });
    bd.cuando(/FROM turno_empleado a/, { rows: [{ id: 1 }] });
    bd.cuando(/FROM turno_departamento a/, { rows: [{ id: 2 }, { id: 3 }] });
    const res = await request(app).get(URL);
    expect(res.status).toBe(200);
    expect(res.body.datos).toEqual({
      empleado_id: 9,
      departamento_id: 3,
      individuales: [{ id: 1 }],
      departamento: [{ id: 2 }, { id: 3 }],
    });
    bd.reiniciar();
    bd.estado.permisos = { Turnos: ["consulta"] };
    expect((await request(app).get(URL)).status).toBe(404);
  });

  it("empleado sin departamento: lista de departamento vacía sin consultarla", async () => {
    bd.cuando(/SELECT id, jefe_inmediato_id, departamento_id FROM empleados/, { rows: [{ id: 9, jefe_inmediato_id: null, departamento_id: null }] });
    bd.cuando(/FROM turno_empleado a/, { rows: [] });
    const res = await request(app).get(URL);
    expect(res.body.datos.departamento).toEqual([]);
    expect(bd.hubo(/FROM turno_departamento/)).toBe(false);
  });
});
