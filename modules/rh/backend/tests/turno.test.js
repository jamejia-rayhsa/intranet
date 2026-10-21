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

const app = express();
app.use(express.json());
app.use("/api/asistencia", require("../routes/asistencia.routes"));

const dia = (n, extra = {}) => ({ dia_semana: n, laborable: true, hora_entrada: "08:00", hora_salida: "17:00", ...extra });
const DIAS_BD = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  dia_semana: n,
  laborable: n <= 5,
  hora_entrada: n <= 5 ? "08:00" : null,
  hora_salida: n <= 5 ? "17:00" : null,
  cruza_medianoche: false,
}));
const TURNO_BD = {
  id: 5,
  nombre: "Matutino",
  descripcion: null,
  activo: true,
  tolerancia_retardo_min: 10,
  umbral_falta_min: 30,
  tolerancia_salida_min: 0,
  descanso_inicio: "13:00",
  descanso_min: 60,
  nocturno: false,
};
const CUERPO = { nombre: "Matutino", dias: [dia(1), dia(2), dia(3), dia(4), dia(5)] };

function simularTurnoExistente(turno = TURNO_BD) {
  bd.cuando(/FROM turnos t WHERE t\.id = \$1/, { rows: [turno] });
  bd.cuando(/FROM turno_dias WHERE turno_id/, { rows: DIAS_BD });
}

beforeEach(() => {
  jest.clearAllMocks();
  bd.reiniciar();
  mockUser = { usuario_id: 5, rol_id: 3, rol_nombre: "rh_admin" };
  bd.estado.permisos = { Asistencia: ["consulta", "edicion"], Turnos: ["consulta", "edicion"] };
});

describe("Turnos - permisos", () => {
  it("quien tiene Asistencia:consulta puede listar y leer turnos", async () => {
    mockUser = { usuario_id: 9, rol_id: 8, rol_nombre: "rh_empleado" };
    bd.estado.permisos = { Asistencia: ["consulta"] };
    bd.cuando(/FROM turnos t/, { rows: [TURNO_BD] });
    simularTurnoExistente();
    expect((await request(app).get("/api/asistencia/turnos")).status).toBe(200);
    expect((await request(app).get("/api/asistencia/turnos/5")).status).toBe(200);
  });

  it("sin Asistencia:consulta no se lee nada (403)", async () => {
    bd.estado.permisos = { Turnos: ["consulta", "edicion"] };
    expect((await request(app).get("/api/asistencia/turnos")).status).toBe(403);
    expect((await request(app).get("/api/asistencia/turnos/5")).status).toBe(403);
    expect(bd.sqls()).toHaveLength(0);
  });

  it.each([
    ["rh_empleado: solo Asistencia:consulta", { Asistencia: ["consulta"] }],
    ["portal_admin: Asistencia pero sin Turnos", { Asistencia: ["consulta"], Turnos: [] }],
    ["Turnos:consulta no basta para escribir", { Asistencia: ["consulta"], Turnos: ["consulta"] }],
    ["Asistencia:edicion no sustituye a Turnos:edicion", { Asistencia: ["consulta", "edicion"], Turnos: [] }],
  ])("%s -> POST/PUT/DELETE dan 403 sin tocar la BD ni auditar", async (_n, permisos) => {
    mockUser = { usuario_id: 9, rol_id: 8, rol_nombre: "portal_admin" };
    bd.estado.permisos = permisos;
    for (const [metodo, ruta] of [
      ["post", "/api/asistencia/turnos"],
      ["put", "/api/asistencia/turnos/5"],
      ["delete", "/api/asistencia/turnos/5"],
    ]) {
      const res = await request(app)[metodo](ruta).send(CUERPO);
      expect(res.status).toBe(403);
    }
    expect(bd.sqls()).toHaveLength(0);
    expect(bd.grupo.connect).not.toHaveBeenCalled();
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("super_admin escribe sin consultar permisos", async () => {
    mockUser = { usuario_id: 1, rol_id: 1, rol_nombre: "super_admin" };
    bd.estado.permisos = {};
    bd.cuando(/INSERT INTO turnos /, { rows: [{ id: 5 }] });
    simularTurnoExistente();
    expect((await request(app).post("/api/asistencia/turnos").send(CUERPO)).status).toBe(201);
  });
});

describe("Turnos - alta", () => {
  beforeEach(() => {
    bd.cuando(/INSERT INTO turnos /, { rows: [{ id: 5 }] });
    simularTurnoExistente();
  });

  it("crea el turno y su detalle en UNA transacción, audita sin datos sensibles y devuelve 201", async () => {
    const res = await request(app).post("/api/asistencia/turnos").send(CUERPO);
    expect(res.status).toBe(201);
    expect(res.body.datos.id).toBe(5);
    expect(res.body.datos.dias).toHaveLength(7);

    const sqls = bd.sqls().map((l) => l.sql.trim().split(/\s+/).slice(0, 3).join(" "));
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
    expect(bd.hubo(/ROLLBACK/)).toBe(false);
    expect(bd.cliente.release).toHaveBeenCalledTimes(1);

    // Detalle: arreglos paralelos, 7 filas, horas como texto HH:MM
    const detalle = bd.sqls().find((l) => /INSERT INTO turno_dias/.test(l.sql));
    expect(detalle.params[0]).toBe(5);
    expect(detalle.params[1]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(detalle.params[2]).toEqual([true, true, true, true, true, false, false]);
    expect(detalle.params[3]).toEqual(["08:00", "08:00", "08:00", "08:00", "08:00", null, null]);

    expect(registrarAccion).toHaveBeenCalledTimes(1);
    const [, modulo, tabla, id, accion, previos, nuevos] = registrarAccion.mock.calls[0];
    expect([modulo, tabla, id, accion, previos]).toEqual(["rh", "turnos", 5, "INSERT", null]);
    expect(nuevos.nombre).toBe("Matutino");
    expect(JSON.stringify(nuevos)).not.toMatch(/creado_por|usuario/);
  });

  it("el INSERT del turno lleva el usuario creador y los valores por omisión salen de COALESCE", async () => {
    await request(app).post("/api/asistencia/turnos").send(CUERPO);
    const insert = bd.sqls().find((l) => /INSERT INTO turnos /.test(l.sql));
    expect(insert.sql).toMatch(/COALESCE\(\$4, 10\), COALESCE\(\$5, 30\), COALESCE\(\$6, 0\)/);
    expect(insert.sql).toMatch(/COALESCE\(\$7, 60\), COALESCE\(\$8, 150\), COALESCE\(\$9, 5\), COALESCE\(\$10, 359\)/);
    expect(insert.params[12]).toBe(5);
    expect(insert.params.slice(3, 11)).toEqual([null, null, null, null, null, null, null, null]);
  });

  it.each([
    ["sin nombre", { dias: [dia(1)] }],
    ["sin días", { nombre: "A" }],
    ["hora mal formada", { nombre: "A", dias: [dia(1, { hora_entrada: "8am" })] }],
    ["entrada igual a salida", { nombre: "A", dias: [dia(1, { hora_salida: "08:00" })] }],
    ["cruza inconsistente", { nombre: "A", dias: [dia(1, { cruza_medianoche: true })] }],
    ["día repetido", { nombre: "A", dias: [dia(1), dia(1)] }],
    ["sin días laborables", { nombre: "A", dias: [{ dia_semana: 1, laborable: false }] }],
    ["umbral menor que la tolerancia", { ...CUERPO, tolerancia_retardo_min: 20, umbral_falta_min: 10 }],
    ["tolerancia negativa", { ...CUERPO, tolerancia_salida_min: -5 }],
    ["ventana negativa", { ...CUERPO, ventana_entrada_antes_min: -1 }],
    ["descanso sin inicio", { ...CUERPO, descanso_min: 60 }],
    ["descanso_inicio mal formado", { ...CUERPO, descanso_inicio: "1pm", descanso_min: 60 }],
  ])("400 sin tocar la BD: %s", async (_n, cuerpo) => {
    const res = await request(app).post("/api/asistencia/turnos").send(cuerpo);
    expect(res.status).toBe(400);
    expect(res.body.exito).toBe(false);
    expect(bd.sqls()).toHaveLength(0);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("nombre duplicado (23505) -> 409, ROLLBACK, sin auditoría", async () => {
    bd.estado.reglas.unshift({
      re: /INSERT INTO turnos /,
      respuesta: Object.assign(new Error('duplicate key "uq_turnos_nombre"'), { code: "23505" }),
    });
    const res = await request(app).post("/api/asistencia/turnos").send(CUERPO);
    expect(res.status).toBe(409);
    expect(res.body.mensaje).toBe("Ya existe un turno con ese nombre");
    expect(bd.hubo(/ROLLBACK/)).toBe(true);
    expect(bd.hubo(/COMMIT/)).toBe(false);
    expect(bd.cliente.release).toHaveBeenCalledTimes(1);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("guarda ventanas y descanso (parámetros 7..12) y los audita", async () => {
    const cuerpo = {
      ...CUERPO,
      ventana_entrada_antes_min: 60,
      ventana_entrada_despues_min: 150,
      ventana_salida_antes_min: 0,
      ventana_salida_despues_min: 359,
      descanso_inicio: "13:00",
      descanso_min: 60,
    };
    expect((await request(app).post("/api/asistencia/turnos").send(cuerpo)).status).toBe(201);
    const insert = bd.sqls().find((l) => /INSERT INTO turnos /.test(l.sql));
    expect(insert.params.slice(6, 12)).toEqual([60, 150, 0, 359, "13:00", 60]);
    expect(registrarAccion.mock.calls[0][6]).toMatchObject({ descanso_inicio: "13:00" });
  });

  it("CHECK de la BD (23514) -> 400 genérico", async () => {
    bd.estado.reglas.unshift({
      re: /INSERT INTO turno_dias/,
      respuesta: Object.assign(new Error("violates check constraint turno_dias_coherencia_check"), { code: "23514" }),
    });
    const res = await request(app).post("/api/asistencia/turnos").send(CUERPO);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/turno_dias_coherencia_check/);
  });

  it("error inesperado -> 500 genérico, sin el texto del error, con ROLLBACK", async () => {
    bd.estado.reglas.unshift({ re: /INSERT INTO turnos /, respuesta: new Error("SECRETO: relation turnos tiene clave 42") });
    const res = await request(app).post("/api/asistencia/turnos").send(CUERPO);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ exito: false, mensaje: "Error al crear el turno" });
    expect(bd.hubo(/ROLLBACK/)).toBe(true);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("una auditoría caída no rompe el 201", async () => {
    registrarAccion.mockRejectedValueOnce(new Error("auditoría caída"));
    expect((await request(app).post("/api/asistencia/turnos").send(CUERPO)).status).toBe(201);
  });
});

describe("Turnos - lectura", () => {
  it.each(["abc", "0", "-1", "1.5", "99999999999"])("GET /turnos/%s -> 400", async (id) => {
    const res = await request(app).get(`/api/asistencia/turnos/${id}`);
    expect(res.status).toBe(400);
    expect(bd.sqls()).toHaveLength(0);
  });

  it("turno inexistente -> 404", async () => {
    expect((await request(app).get("/api/asistencia/turnos/77")).status).toBe(404);
  });

  it("devuelve el turno con sus 7 días y las horas como texto", async () => {
    simularTurnoExistente();
    const res = await request(app).get("/api/asistencia/turnos/5");
    expect(res.body.datos.dias).toHaveLength(7);
    expect(res.body.datos.dias[0]).toMatchObject({ dia_semana: 1, hora_entrada: "08:00", cruza_medianoche: false });
    const sqlDias = bd.sqls().find((l) => /FROM turno_dias WHERE turno_id/.test(l.sql)).sql;
    expect(sqlDias).toMatch(/to_char\(hora_entrada, 'HH24:MI'\)/);
    expect(sqlDias).toMatch(/AS duracion_min/);
  });

  it("el listado deriva nocturno del detalle (no es columna) y filtra por activo", async () => {
    bd.cuando(/FROM turnos t/, { rows: [TURNO_BD] });
    const res = await request(app).get("/api/asistencia/turnos?activo=true");
    expect(res.status).toBe(200);
    const { sql, params } = bd.sqls()[0];
    expect(sql).toMatch(/bool_or\(d\.cruza_medianoche\)/);
    expect(sql).toMatch(/WHERE t\.activo = \$1/);
    expect(params).toEqual([true]);
  });

  it("sin filtro no agrega WHERE y un valor inválido de activo da 400", async () => {
    bd.cuando(/FROM turnos t/, { rows: [] });
    await request(app).get("/api/asistencia/turnos");
    expect(bd.sqls()[0].sql).not.toMatch(/\bWHERE t\.activo/);
    const res = await request(app).get("/api/asistencia/turnos?activo=quizas");
    expect(res.status).toBe(400);
  });

  it("error de BD -> 500 genérico sin el texto del error", async () => {
    bd.cuando(/FROM turnos t/, new Error("SECRETO de la base"));
    const res = await request(app).get("/api/asistencia/turnos");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRETO/);
  });
});

describe("Turnos - edición", () => {
  beforeEach(() => {
    bd.cuando(/SELECT id FROM turnos WHERE id = \$1 FOR UPDATE/, { rows: [{ id: 5 }] });
    simularTurnoExistente();
  });

  it("id inválido -> 400; turno inexistente -> 404 sin escribir", async () => {
    expect((await request(app).put("/api/asistencia/turnos/x").send({ activo: false })).status).toBe(400);
    bd.reiniciar();
    bd.estado.permisos = { Turnos: ["consulta", "edicion"] };
    const res = await request(app).put("/api/asistencia/turnos/5").send({ activo: false });
    expect(res.status).toBe(404);
    expect(bd.hubo(/UPDATE turnos/)).toBe(false);
  });

  it("cuerpo vacío o inválido -> 400 sin escribir", async () => {
    for (const cuerpo of [{}, { nombre: "" }, { activo: "no" }, { dias: [] }]) {
      const res = await request(app).put("/api/asistencia/turnos/5").send(cuerpo);
      expect(res.status).toBe(400);
    }
    expect(bd.hubo(/UPDATE turnos/)).toBe(false);
  });

  it("valida el umbral contra los valores ACTUALES del turno (30): tolerancia 40 -> 400", async () => {
    const res = await request(app).put("/api/asistencia/turnos/5").send({ tolerancia_retardo_min: 40 });
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/umbral/);
    expect(bd.hubo(/UPDATE turnos/)).toBe(false);
  });

  it("con umbral actual alto (60) permite subir la tolerancia a 50: la base es el turno, no los valores por omisión", async () => {
    bd.estado.reglas = bd.estado.reglas.filter((r) => !/FROM turnos t WHERE/.test(String(r.re)));
    simularTurnoExistente({ ...TURNO_BD, umbral_falta_min: 60 });
    const res = await request(app).put("/api/asistencia/turnos/5").send({ tolerancia_retardo_min: 50 });
    expect(res.status).toBe(200);
  });

  it("actualiza solo los campos enviados, bloquea la fila y audita antes/después", async () => {
    const res = await request(app).put("/api/asistencia/turnos/5").send({ activo: false, tolerancia_retardo_min: 15 });
    expect(res.status).toBe(200);
    const upd = bd.sqls().find((l) => /UPDATE turnos SET/.test(l.sql));
    expect(upd.sql).toMatch(/tolerancia_retardo_min = \$2/);
    expect(upd.sql).not.toMatch(/nombre =/);
    expect(bd.indice(/FOR UPDATE/)).toBeLessThan(bd.indice(/UPDATE turnos SET/));
    expect(bd.hubo(/DELETE FROM turno_dias/)).toBe(false); // sin `dias` no se toca el detalle
    expect(registrarAccion.mock.calls[0].slice(1, 5)).toEqual(["rh", "turnos", 5, "UPDATE"]);
    expect(registrarAccion.mock.calls[0][5]).toBeTruthy();
    expect(registrarAccion.mock.calls[0][6]).toBeTruthy();
  });

  it("con `dias` reemplaza todo el detalle dentro de la misma transacción", async () => {
    const res = await request(app).put("/api/asistencia/turnos/5").send({ dias: [dia(1), dia(2)] });
    expect(res.status).toBe(200);
    const orden = bd.sqls().map((l) => l.sql.trim().split(/\s+/).slice(0, 3).join(" "));
    expect(orden.indexOf("DELETE FROM turno_dias")).toBeGreaterThan(orden.indexOf("BEGIN"));
    expect(orden.indexOf("INSERT INTO turno_dias")).toBeGreaterThan(orden.indexOf("DELETE FROM turno_dias"));
    expect(orden.indexOf("COMMIT")).toBeGreaterThan(orden.indexOf("INSERT INTO turno_dias"));
  });

  it("nombre duplicado -> 409 con ROLLBACK", async () => {
    bd.estado.reglas.unshift({
      re: /UPDATE turnos SET/,
      respuesta: Object.assign(new Error("dup"), { code: "23505" }),
    });
    const res = await request(app).put("/api/asistencia/turnos/5").send({ nombre: "Otro" });
    expect(res.status).toBe(409);
    expect(bd.hubo(/ROLLBACK/)).toBe(true);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("si el turno desaparece entre la lectura y el bloqueo -> 404", async () => {
    bd.estado.reglas.shift(); // sin la regla del FOR UPDATE: no encuentra la fila
    const res = await request(app).put("/api/asistencia/turnos/5").send({ activo: false });
    expect(res.status).toBe(404);
    expect(bd.hubo(/UPDATE turnos SET/)).toBe(false);
  });

  it("error inesperado -> 500 genérico", async () => {
    bd.estado.reglas.unshift({ re: /UPDATE turnos SET/, respuesta: new Error("SECRETO") });
    const res = await request(app).put("/api/asistencia/turnos/5").send({ activo: false });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRETO/);
  });
});

describe("Turnos - baja", () => {
  it("id inválido -> 400; inexistente -> 404", async () => {
    expect((await request(app).delete("/api/asistencia/turnos/0")).status).toBe(400);
    expect((await request(app).delete("/api/asistencia/turnos/5")).status).toBe(404);
    expect(bd.hubo(/DELETE FROM turnos/)).toBe(false);
  });

  it("elimina y audita lo que borró", async () => {
    simularTurnoExistente();
    const res = await request(app).delete("/api/asistencia/turnos/5");
    expect(res.status).toBe(200);
    expect(bd.hubo(/DELETE FROM turnos WHERE id = \$1/)).toBe(true);
    const [, , tabla, id, accion, previos, nuevos] = registrarAccion.mock.calls[0];
    expect([tabla, id, accion, nuevos]).toEqual(["turnos", 5, "DELETE", null]);
    expect(previos.nombre).toBe("Matutino");
  });

  it("con asignaciones o asistencia calculada (23503) -> 409 que sugiere desactivar; sin auditoría", async () => {
    simularTurnoExistente();
    bd.estado.reglas.unshift({
      re: /DELETE FROM turnos/,
      respuesta: Object.assign(new Error('violates foreign key "turno_empleado_turno_id_fkey"'), { code: "23503" }),
    });
    const res = await request(app).delete("/api/asistencia/turnos/5");
    expect(res.status).toBe(409);
    expect(res.body.mensaje).toMatch(/desactívalo/);
    expect(JSON.stringify(res.body)).not.toMatch(/fkey/);
    expect(bd.hubo(/ROLLBACK/)).toBe(true);
    expect(registrarAccion).not.toHaveBeenCalled();
  });
});
