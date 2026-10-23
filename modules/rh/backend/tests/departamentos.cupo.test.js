const request = require("supertest");
const express = require("express");

jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, _res, next) => {
    req.user = { usuario_id: 5, rol_id: 3, rol_nombre: "rh_admin" };
    next();
  },
}));
jest.mock("../../../portal/backend/middleware/permisos.middleware", () => ({
  verificarPermiso: () => (_req, _res, next) => next(),
  tienePermiso: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../../portal/backend/config/database", () => ({
  grupo: { query: jest.fn(), connect: jest.fn() },
}));

const { grupo } = require("../../../portal/backend/config/database");

const app = express();
app.use(express.json());
app.use("/api/departamentos", require("../routes/departamentos.routes"));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("Departamentos - cupo_vacaciones", () => {
  it("el listado devuelve cupo_vacaciones (SELECT d.*)", async () => {
    grupo.query.mockResolvedValue({ rows: [{ id: 1, nombre: "TI", cupo_vacaciones: 2 }] });
    const res = await request(app).get("/api/departamentos");
    expect(res.status).toBe(200);
    expect(res.body.datos[0].cupo_vacaciones).toBe(2);
    expect(grupo.query.mock.calls[0][0]).toMatch(/SELECT d\.\*/);
  });

  it("B3: turno_actual solo se pide si el usuario tiene rh/Turnos consulta", async () => {
    const { tienePermiso } = require("../../../portal/backend/middleware/permisos.middleware");
    grupo.query.mockResolvedValue({ rows: [{ id: 1, nombre: "TI" }] });
    tienePermiso.mockResolvedValueOnce(true);
    await request(app).get("/api/departamentos");
    expect(tienePermiso).toHaveBeenLastCalledWith(expect.objectContaining({ usuario_id: 5 }), "rh", "Turnos", "consulta");
    expect(grupo.query.mock.calls[0][0]).toMatch(/turno_actual/);
    grupo.query.mockClear();
    tienePermiso.mockResolvedValueOnce(false);
    const res = await request(app).get("/api/departamentos");
    expect(res.status).toBe(200);
    expect(grupo.query.mock.calls[0][0]).not.toMatch(/turno|LATERAL/);
  });

  it("PUT actualiza el cupo con SQL parametrizado (acepta cadena numérica)", async () => {
    grupo.query.mockResolvedValue({ rows: [{ id: 1, cupo_vacaciones: 3 }] });
    const res = await request(app).put("/api/departamentos/1").send({ cupo_vacaciones: "3" });
    expect(res.status).toBe(200);
    const [sql, params] = grupo.query.mock.calls[0];
    expect(sql).toMatch(/cupo_vacaciones = \$1/);
    expect(params).toEqual([3, "1"]);
  });

  it("POST crea con el cupo indicado", async () => {
    grupo.query.mockResolvedValue({ rows: [{ id: 9, cupo_vacaciones: 4 }] });
    const res = await request(app).post("/api/departamentos").send({ nombre: "Ventas", cupo_vacaciones: 4 });
    expect(res.status).toBe(201);
    expect(grupo.query.mock.calls[0][1]).toEqual(["Ventas", null, 4]);
  });

  it("POST sin cupo conserva el INSERT original (usa el DEFAULT 1)", async () => {
    grupo.query.mockResolvedValue({ rows: [{ id: 9 }] });
    await request(app).post("/api/departamentos").send({ nombre: "Ventas" });
    expect(grupo.query.mock.calls[0][0]).not.toMatch(/cupo_vacaciones/);
  });

  it.each([[0], [-1], [1.5], ["abc"], [null], [""], [2147483648], [true]])(
    "cupo inválido %p -> 400 sin tocar la BD (PUT y POST)",
    async (cupo) => {
      const put = await request(app).put("/api/departamentos/1").send({ cupo_vacaciones: cupo });
      const post = await request(app).post("/api/departamentos").send({ nombre: "X", cupo_vacaciones: cupo });
      expect(put.status).toBe(400);
      expect(post.status).toBe(400);
      expect(put.body.exito).toBe(false);
      expect(grupo.query).not.toHaveBeenCalled();
    }
  );
});

describe("Departamentos - errores genéricos (sin error.message)", () => {
  const SECRETO = 'duplicate key value violates unique constraint "departamentos_nombre_key"';

  it.each([
    ["get", "/api/departamentos", 500, undefined],
    ["post", "/api/departamentos", 400, { nombre: "X" }],
    ["put", "/api/departamentos/1", 400, { nombre: "X" }],
    ["delete", "/api/departamentos/1", 500, undefined],
    ["post", "/api/departamentos/importar", 500, { filas: [{ nombre: "X" }] }],
  ])("%s %s -> %i sin filtrar el mensaje de Postgres", async (metodo, url, estado, cuerpo) => {
    grupo.query.mockRejectedValue(new Error(SECRETO));
    const res = await request(app)[metodo](url).send(cuerpo);
    expect(res.status).toBe(estado);
    expect(res.body.exito).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("duplicate key");
    expect(res.body.error).toBeUndefined();
  });

  it("importar: el error por fila tampoco filtra el mensaje de Postgres", async () => {
    // BD que falla en el INSERT del departamento: el lote sigue (SAVEPOINT) y la fila sale con error genérico
    const cliente = {
      release: jest.fn(),
      query: jest.fn(async (sql) => {
        if (/^INSERT INTO departamentos/.test(sql)) throw new Error(SECRETO);
        return { rows: [] };
      }),
    };
    grupo.connect.mockResolvedValue(cliente);
    grupo.query.mockResolvedValue({ rows: [{ hoy: "2026-10-22" }] });
    const res = await request(app).post("/api/departamentos/importar").send({ filas: [{ nombre: "X" }] });
    expect(res.status).toBe(200);
    expect(res.body.datos.errores).toEqual([{ fila: null, nombre: "X", error: "No se pudo guardar la fila" }]);
    expect(JSON.stringify(res.body)).not.toContain("duplicate key");
    expect(cliente.query).toHaveBeenCalledWith("COMMIT");
  });
});

describe("R-10: los logs del CRUD de departamentos no imprimen el error completo ni datos de la fila", () => {
  it.each([
    ["get", "/api/departamentos", undefined],
    ["post", "/api/departamentos", { nombre: "X" }],
    ["put", "/api/departamentos/1", { nombre: "X" }],
    ["delete", "/api/departamentos/1", undefined],
  ])("%s %s", async (metodo, url, cuerpo) => {
    const e = Object.assign(new Error('duplicate key value violates unique constraint "departamentos_nombre_key"'), {
      code: "23505", constraint: "departamentos_nombre_key", detail: "Key (nombre)=(Nombre Privado) already exists.",
    });
    grupo.query.mockRejectedValue(e);
    await request(app)[metodo](url).send(cuerpo);
    const log = console.error.mock.calls.map((c) => c.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")).join("\n");
    expect(log).toMatch(/código=23505 constraint=departamentos_nombre_key/);
    expect(log).not.toMatch(/Privado|duplicate key|detail/);
    console.error.mockClear();
  });
});

describe("Departamentos - eliminar con restricciones", () => {
  it("con turno asignado (FK turno_departamento) -> 409 con mensaje claro, no 500", async () => {
    grupo.query.mockRejectedValue(
      Object.assign(new Error("violates foreign key constraint \"turno_departamento_departamento_id_fkey\""), {
        code: "23503",
        constraint: "turno_departamento_departamento_id_fkey",
      }),
    );
    const res = await request(app).delete("/api/departamentos/3");
    expect(res.status).toBe(409);
    expect(res.body.exito).toBe(false);
    expect(res.body.mensaje).toMatch(/turnos asignados/);
    expect(JSON.stringify(res.body)).not.toMatch(/fkey|violates/);
  });

  it("con empleados (otra FK) -> 409 con mensaje distinto", async () => {
    grupo.query.mockRejectedValue(
      Object.assign(new Error("violates foreign key constraint \"empleados_departamento_id_fkey\""), {
        code: "23503",
        constraint: "empleados_departamento_id_fkey",
      }),
    );
    const res = await request(app).delete("/api/departamentos/3");
    expect(res.status).toBe(409);
    expect(res.body.mensaje).toMatch(/empleados/);
  });

  it("otros errores siguen siendo 500 genérico; el borrado normal y el 404 no cambian", async () => {
    grupo.query.mockRejectedValue(new Error("SECRETO"));
    const res = await request(app).delete("/api/departamentos/3");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ exito: false, mensaje: "Error al eliminar departamento" });
    grupo.query.mockReset();
    grupo.query.mockResolvedValue({ rows: [] });
    expect((await request(app).delete("/api/departamentos/3")).status).toBe(404);
    grupo.query.mockResolvedValue({ rows: [{ id: 3 }] });
    expect((await request(app).delete("/api/departamentos/3")).status).toBe(200);
  });
});
