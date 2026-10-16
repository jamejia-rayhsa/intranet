const request = require("supertest");
const express = require("express");

let mockUser;
jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, _res, next) => {
    req.user = mockUser;
    next();
  },
}));
jest.mock("../../../portal/backend/config/database", () => ({
  grupo: { query: jest.fn() },
}));
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(null),
}));

const { grupo } = require("../../../portal/backend/config/database");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");
const CalendarioLaboral = require("../models/calendarioLaboral.model");

const app = express();
app.use(express.json());
app.use("/api/calendario-laboral", require("../routes/calendario.routes"));

const FILA = {
  id: 7,
  fecha: "2026-12-31",
  tipo: "otorgado",
  nombre: "Descanso de fin de año",
  descripcion: null,
  activo: true,
};

// Permisos que concede el mock de la BD al rol del usuario ('consulta', 'edicion' o ninguno)
let mockPermisos;
// Respuestas de las consultas del controlador, en orden
let mockRespuestas;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { usuario_id: 5, rol_id: 3, rol_nombre: "rh_admin" };
  mockPermisos = ["consulta", "edicion"];
  mockRespuestas = [];
  grupo.query.mockImplementation(async (sql, params) => {
    if (/rol_opcion_permisos/.test(sql)) {
      // Misma semántica que verificarPermiso: el tipo pedido debe estar entre los aceptados
      const aceptados = params[3];
      return { rows: mockPermisos.some((t) => aceptados.includes(t)) ? [{ existe: 1 }] : [] };
    }
    const siguiente = mockRespuestas.shift();
    if (siguiente instanceof Error) throw siguiente;
    return siguiente || { rows: [] };
  });
});

const sqlsDeDatos = () => grupo.query.mock.calls.filter(([sql]) => !/rol_opcion_permisos/.test(sql));

describe("Calendario laboral - permisos", () => {
  it("un empleado con solo consulta puede leer el calendario", async () => {
    mockUser = { usuario_id: 9, rol_id: 8, rol_nombre: "rh_empleado" };
    mockPermisos = ["consulta"];
    mockRespuestas = [{ rows: [FILA] }];
    const res = await request(app).get("/api/calendario-laboral");
    expect(res.status).toBe(200);
    expect(res.body.datos).toEqual([FILA]);
  });

  it.each([
    ["POST", "post", "/api/calendario-laboral"],
    ["PUT", "put", "/api/calendario-laboral/7"],
    ["DELETE", "delete", "/api/calendario-laboral/7"],
  ])("un empleado con solo consulta no puede escribir (%s -> 403)", async (_n, metodo, ruta) => {
    mockUser = { usuario_id: 9, rol_id: 8, rol_nombre: "rh_empleado" };
    mockPermisos = ["consulta"];
    const res = await request(app)[metodo](ruta).send({ fecha: "2026-12-31", tipo: "evento", nombre: "X" });
    expect(res.status).toBe(403);
    expect(sqlsDeDatos()).toHaveLength(0);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("sin ningún permiso tampoco puede leer (403)", async () => {
    mockPermisos = [];
    const res = await request(app).get("/api/calendario-laboral");
    expect(res.status).toBe(403);
  });

  it("super_admin escribe sin consultar permisos", async () => {
    mockUser = { usuario_id: 1, rol_id: 1, rol_nombre: "super_admin" };
    mockPermisos = [];
    mockRespuestas = [{ rows: [FILA] }];
    const res = await request(app)
      .post("/api/calendario-laboral")
      .send({ fecha: "2026-12-31", tipo: "otorgado", nombre: "Descanso de fin de año" });
    expect(res.status).toBe(201);
  });
});

describe("Calendario laboral - listar", () => {
  it("devuelve las fechas como texto YYYY-MM-DD (to_char en SQL, sin desfase de zona)", async () => {
    mockRespuestas = [{ rows: [FILA] }];
    const res = await request(app).get("/api/calendario-laboral?desde=2026-01-01&hasta=2026-12-31&tipo=otorgado");
    expect(res.status).toBe(200);
    expect(res.body.datos[0].fecha).toBe("2026-12-31");
    const [sql, valores] = sqlsDeDatos()[0];
    expect(sql).toMatch(/to_char\(fecha, 'YYYY-MM-DD'\) AS fecha/);
    expect(valores).toEqual(["2026-01-01", "2026-12-31", "otorgado"]);
  });

  it("sin filtros no agrega WHERE", async () => {
    mockRespuestas = [{ rows: [] }];
    await request(app).get("/api/calendario-laboral");
    expect(sqlsDeDatos()[0][0]).not.toMatch(/WHERE/);
  });

  it.each([
    ["desde con formato inválido", "?desde=01/02/2026"],
    ["hasta con fecha inexistente", "?hasta=2026-02-30"],
    ["desde con hora", "?desde=2026-02-01T00:00:00Z"],
    ["desde posterior a hasta", "?desde=2026-12-31&hasta=2026-01-01"],
    ["tipo inválido", "?tipo=feriado"],
  ])("rechaza %s con 400", async (_n, consulta) => {
    const res = await request(app).get(`/api/calendario-laboral${consulta}`);
    expect(res.status).toBe(400);
    expect(sqlsDeDatos()).toHaveLength(0);
  });

  it("un empleado (solo consulta) no recibe fechas inactivas: el SQL filtra activo = TRUE", async () => {
    mockUser = { usuario_id: 9, rol_id: 8, rol_nombre: "rh_empleado" };
    mockPermisos = ["consulta"];
    mockRespuestas = [{ rows: [FILA] }];
    await request(app).get("/api/calendario-laboral?desde=2026-01-01");
    const [sql, valores] = sqlsDeDatos()[0];
    expect(sql).toMatch(/WHERE fecha >= \$1::date AND activo = TRUE/);
    expect(valores).toEqual(["2026-01-01"]);
  });

  it("un editor (edicion) recibe también las inactivas: sin filtro de activo", async () => {
    mockRespuestas = [{ rows: [FILA] }];
    await request(app).get("/api/calendario-laboral");
    expect(sqlsDeDatos()[0][0]).not.toMatch(/activo = TRUE/);
  });

  it("super_admin sin filas de permiso también ve las inactivas", async () => {
    mockUser = { usuario_id: 1, rol_id: 1, rol_nombre: "super_admin" };
    mockPermisos = [];
    mockRespuestas = [{ rows: [FILA] }];
    await request(app).get("/api/calendario-laboral");
    expect(sqlsDeDatos()[0][0]).not.toMatch(/activo = TRUE/);
  });

  it("si falla la consulta del permiso de edición responde 500 genérico", async () => {
    mockRespuestas = [];
    grupo.query.mockImplementation(async (sql) => {
      if (/rol_opcion_permisos/.test(sql)) {
        if (grupo.query.mock.calls.filter(([q]) => /rol_opcion_permisos/.test(q)).length >= 2) {
          throw new Error("conexion caida");
        }
        return { rows: [{ existe: 1 }] };
      }
      return { rows: [] };
    });
    const res = await request(app).get("/api/calendario-laboral");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/conexion/);
  });

  it("un fallo de la BD responde 500 genérico sin el mensaje de Postgres", async () => {
    mockRespuestas = [new Error('relation "calendario_laboral" does not exist')];
    const res = await request(app).get("/api/calendario-laboral");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|calendario_laboral/);
  });
});

describe("Calendario laboral - crear", () => {
  const valido = { fecha: "2026-12-31", tipo: "otorgado", nombre: "  Descanso de fin de año  " };

  it("crea, recorta el nombre, responde 201 y audita sin datos sensibles", async () => {
    mockRespuestas = [{ rows: [FILA] }];
    const res = await request(app).post("/api/calendario-laboral").send(valido);
    expect(res.status).toBe(201);
    expect(res.body.datos).toEqual(FILA);
    const [sql, valores] = sqlsDeDatos()[0];
    expect(sql).toMatch(/INSERT INTO calendario_laboral/);
    expect(valores).toEqual(["2026-12-31", "otorgado", "Descanso de fin de año", null, true, 5]);
    expect(registrarAccion).toHaveBeenCalledWith(
      expect.anything(), "rh", "calendario_laboral", 7, "INSERT", null,
      { fecha: "2026-12-31", tipo: "otorgado", nombre: "Descanso de fin de año", activo: true },
    );
  });

  it.each([
    ["sin fecha", { tipo: "evento", nombre: "X" }],
    ["fecha con formato distinto", { fecha: "31-12-2026", tipo: "evento", nombre: "X" }],
    ["fecha con hora", { fecha: "2026-12-31T00:00:00.000Z", tipo: "evento", nombre: "X" }],
    ["fecha inexistente (30 de febrero)", { fecha: "2026-02-30", tipo: "evento", nombre: "X" }],
    ["29 de febrero de un año no bisiesto", { fecha: "2027-02-29", tipo: "evento", nombre: "X" }],
    ["fecha numérica", { fecha: 20261231, tipo: "evento", nombre: "X" }],
    ["tipo inválido", { fecha: "2026-12-31", tipo: "feriado", nombre: "X" }],
    ["sin tipo", { fecha: "2026-12-31", nombre: "X" }],
    ["sin nombre", { fecha: "2026-12-31", tipo: "evento" }],
    ["nombre en blanco", { fecha: "2026-12-31", tipo: "evento", nombre: "   " }],
    ["nombre que no es texto", { fecha: "2026-12-31", tipo: "evento", nombre: 5 }],
    ["nombre demasiado largo", { fecha: "2026-12-31", tipo: "evento", nombre: "a".repeat(151) }],
    ["descripción demasiado larga", { fecha: "2026-12-31", tipo: "evento", nombre: "X", descripcion: "a".repeat(1001) }],
    ["activo que no es booleano", { fecha: "2026-12-31", tipo: "evento", nombre: "X", activo: "si" }],
  ])("rechaza %s con 400 y no toca la BD", async (_n, cuerpo) => {
    const res = await request(app).post("/api/calendario-laboral").send(cuerpo);
    expect(res.status).toBe(400);
    expect(res.body.exito).toBe(false);
    expect(sqlsDeDatos()).toHaveLength(0);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("acepta el 29 de febrero de un año bisiesto", async () => {
    mockRespuestas = [{ rows: [{ ...FILA, fecha: "2028-02-29" }] }];
    const res = await request(app).post("/api/calendario-laboral").send({ fecha: "2028-02-29", tipo: "evento", nombre: "X" });
    expect(res.status).toBe(201);
  });

  it("fecha+tipo duplicado responde 409 sin auditar ni filtrar el error de Postgres", async () => {
    const duplicado = Object.assign(new Error('duplicate key value violates unique constraint "calendario_laboral_fecha_tipo_key"'), { code: "23505" });
    mockRespuestas = [duplicado];
    const res = await request(app).post("/api/calendario-laboral").send(valido);
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toMatch(/constraint|duplicate key/);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("un error inesperado responde 500 genérico", async () => {
    mockRespuestas = [new Error("password authentication failed for user postgres")];
    const res = await request(app).post("/api/calendario-laboral").send(valido);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/password|postgres/);
  });

  it("si la auditoría falla igualmente responde 201", async () => {
    registrarAccion.mockRejectedValueOnce(new Error("auditoría caída"));
    mockRespuestas = [{ rows: [FILA] }];
    const res = await request(app).post("/api/calendario-laboral").send(valido);
    expect(res.status).toBe(201);
  });
});

describe("Calendario laboral - actualizar", () => {
  it("actualiza solo los campos enviados y audita antes/después", async () => {
    const nueva = { ...FILA, nombre: "Nuevo nombre" };
    mockRespuestas = [{ rows: [FILA] }, { rows: [nueva] }];
    const res = await request(app).put("/api/calendario-laboral/7").send({ nombre: "Nuevo nombre" });
    expect(res.status).toBe(200);
    const [sql, valores] = sqlsDeDatos()[1];
    expect(sql).toMatch(/SET nombre = \$1, fecha_actualizacion = NOW\(\)/);
    expect(valores).toEqual(["Nuevo nombre", 7]);
    expect(registrarAccion).toHaveBeenCalledWith(
      expect.anything(), "rh", "calendario_laboral", 7, "UPDATE",
      expect.objectContaining({ nombre: FILA.nombre }),
      expect.objectContaining({ nombre: "Nuevo nombre" }),
    );
  });

  it("no existe -> 404", async () => {
    mockRespuestas = [{ rows: [] }];
    const res = await request(app).put("/api/calendario-laboral/99").send({ nombre: "X" });
    expect(res.status).toBe(404);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("mover a una fecha+tipo ya existente -> 409", async () => {
    mockRespuestas = [{ rows: [FILA] }, Object.assign(new Error("dup"), { code: "23505" })];
    const res = await request(app).put("/api/calendario-laboral/7").send({ fecha: "2026-12-24" });
    expect(res.status).toBe(409);
  });

  it.each([
    ["id no numérico", "/api/calendario-laboral/abc", { nombre: "X" }],
    ["id cero", "/api/calendario-laboral/0", { nombre: "X" }],
    ["id fuera de INT4", "/api/calendario-laboral/99999999999", { nombre: "X" }],
    ["cuerpo vacío", "/api/calendario-laboral/7", {}],
    ["fecha inválida", "/api/calendario-laboral/7", { fecha: "2026-13-01" }],
    ["tipo inválido", "/api/calendario-laboral/7", { tipo: "otro" }],
    ["nombre en blanco", "/api/calendario-laboral/7", { nombre: "" }],
  ])("rechaza %s con 400", async (_n, ruta, cuerpo) => {
    const res = await request(app).put(ruta).send(cuerpo);
    expect(res.status).toBe(400);
    expect(sqlsDeDatos()).toHaveLength(0);
  });
});

describe("Calendario laboral - eliminar", () => {
  it("elimina, responde 200 y audita", async () => {
    mockRespuestas = [{ rows: [FILA] }];
    const res = await request(app).delete("/api/calendario-laboral/7");
    expect(res.status).toBe(200);
    expect(registrarAccion).toHaveBeenCalledWith(
      expect.anything(), "rh", "calendario_laboral", 7, "DELETE",
      expect.objectContaining({ fecha: "2026-12-31" }), null,
    );
  });

  it("no existe -> 404 sin auditar", async () => {
    mockRespuestas = [{ rows: [] }];
    const res = await request(app).delete("/api/calendario-laboral/99");
    expect(res.status).toBe(404);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("id inválido -> 400", async () => {
    const res = await request(app).delete("/api/calendario-laboral/1;DROP");
    expect(res.status).toBe(400);
    expect(sqlsDeDatos()).toHaveLength(0);
  });
});

describe("Calendario laboral - obtenerFechasNoHabiles", () => {
  it("devuelve fechas en texto de tipos oficial y otorgado activos, parametrizado", async () => {
    mockRespuestas = [{ rows: [{ fecha: "2026-12-24" }, { fecha: "2026-12-25" }] }];
    const fechas = await CalendarioLaboral.obtenerFechasNoHabiles("2026-12-01", "2026-12-31");
    expect(fechas).toEqual(["2026-12-24", "2026-12-25"]);
    const [sql, valores] = sqlsDeDatos()[0];
    expect(sql).toMatch(/activo = true/);
    expect(sql).toMatch(/to_char\(fecha, 'YYYY-MM-DD'\)/);
    expect(valores).toEqual([["oficial", "otorgado"], "2026-12-01", "2026-12-31"]);
  });

  it("usa el cliente de transacción cuando se le pasa", async () => {
    const cliente = { query: jest.fn().mockResolvedValue({ rows: [{ fecha: "2026-05-01" }] }) };
    const fechas = await CalendarioLaboral.obtenerFechasNoHabiles("2026-05-01", "2026-05-31", cliente);
    expect(fechas).toEqual(["2026-05-01"]);
    expect(grupo.query).not.toHaveBeenCalled();
  });
});

describe("Calendario laboral - tipo actividad (Día Actividad Empresa)", () => {
  const ACTIVIDAD = { id: 9, fecha: "2026-10-28", tipo: "actividad", nombre: "Inventario general", descripcion: null, activo: true };
  const cuerpo = { fecha: "2026-10-28", tipo: "actividad", nombre: "Inventario general" };
  const nombresDeSql = () => sqlsDeDatos().map(([sql]) => sql.replace(/\s+/g, " "));

  it("el modelo admite los 4 tipos y expone el tipo que bloquea", () => {
    expect(CalendarioLaboral.TIPOS_CALENDARIO).toEqual(["oficial", "otorgado", "evento", "actividad"]);
    expect(CalendarioLaboral.TIPOS_NO_HABILES).toEqual(["oficial", "otorgado"]);
    expect(CalendarioLaboral.TIPO_BLOQUEO).toBe("actividad");
  });

  it("un tipo inválido sigue dando 400 sin tocar la BD (alta, edición y filtro)", async () => {
    const alta = await request(app).post("/api/calendario-laboral").send({ ...cuerpo, tipo: "bloqueo" });
    const edicion = await request(app).put("/api/calendario-laboral/9").send({ tipo: "Actividad" });
    const filtro = await request(app).get("/api/calendario-laboral").query({ tipo: "otro" });
    expect([alta.status, edicion.status, filtro.status]).toEqual([400, 400, 400]);
    expect(sqlsDeDatos()).toHaveLength(0);
  });

  it("el filtro ?tipo=actividad es válido", async () => {
    mockRespuestas = [{ rows: [ACTIVIDAD] }];
    const res = await request(app).get("/api/calendario-laboral").query({ tipo: "actividad" });
    expect(res.status).toBe(200);
    expect(sqlsDeDatos()[0][1]).toContain("actividad");
  });

  it("POST de una actividad devuelve avisos con los conteos (aprobadas y pendientes), sin nombres", async () => {
    mockRespuestas = [{ rows: [ACTIVIDAD] }, { rows: [] }, { rows: [{ aprobadas: 2, pendientes: 1, empleado: "Secreto" }] }];
    const res = await request(app).post("/api/calendario-laboral").send(cuerpo);
    expect(res.status).toBe(201);
    expect(res.body.avisos).toEqual({ solicitudes_aprobadas: 2, solicitudes_pendientes: 1 });
    expect(JSON.stringify(res.body)).not.toMatch(/Secreto/);
    const sqls = nombresDeSql();
    expect(sqls[2]).toMatch(/FROM solicitudes_vacaciones/);
    expect(sqls[2]).toMatch(/fecha_inicial <= \$1::date AND fecha_final >= \$1::date/);
    expect(sqlsDeDatos()[2][1]).toEqual(["2026-10-28"]);
    // solo lee: ninguna escritura sobre solicitudes
    expect(sqls.some((q) => /^(UPDATE|DELETE|INSERT INTO) solicitudes_vacaciones/.test(q))).toBe(false);
  });

  it("PUT que deja la fila como actividad también devuelve avisos", async () => {
    mockRespuestas = [
      { rows: [{ ...ACTIVIDAD, tipo: "evento" }] },
      { rows: [ACTIVIDAD] },
      { rows: [] },
      { rows: [{ aprobadas: 0, pendientes: 3 }] },
    ];
    const res = await request(app).put("/api/calendario-laboral/9").send({ tipo: "actividad" });
    expect(res.status).toBe(200);
    expect(res.body.avisos).toEqual({ solicitudes_aprobadas: 0, solicitudes_pendientes: 3 });
  });

  it("los demás tipos no traen la clave avisos ni consultan solicitudes", async () => {
    mockRespuestas = [{ rows: [FILA] }];
    const res = await request(app).post("/api/calendario-laboral").send({ fecha: "2026-12-31", tipo: "otorgado", nombre: "X" });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("avisos");
    expect(nombresDeSql().some((q) => /solicitudes_vacaciones/.test(q))).toBe(false);
  });

  it("actividad en sábado o domingo: avisos en cero y sin consultar solicitudes", async () => {
    mockRespuestas = [{ rows: [{ ...ACTIVIDAD, fecha: "2026-10-31" }] }];
    const res = await request(app).post("/api/calendario-laboral").send({ ...cuerpo, fecha: "2026-10-31" });
    expect(res.body.avisos).toEqual({ solicitudes_aprobadas: 0, solicitudes_pendientes: 0 });
    expect(nombresDeSql().some((q) => /solicitudes_vacaciones/.test(q))).toBe(false);
  });

  it("actividad el mismo día de un festivo oficial: avisos en cero", async () => {
    mockRespuestas = [{ rows: [ACTIVIDAD] }, { rows: [{ fecha: "2026-10-28" }] }];
    const res = await request(app).post("/api/calendario-laboral").send(cuerpo);
    expect(res.body.avisos).toEqual({ solicitudes_aprobadas: 0, solicitudes_pendientes: 0 });
    expect(nombresDeSql().some((q) => /FROM solicitudes_vacaciones/.test(q))).toBe(false);
  });

  it("actividad inactiva: avisos en cero", async () => {
    mockRespuestas = [{ rows: [{ ...ACTIVIDAD, activo: false }] }, { rows: [] }, { rows: [{ aprobadas: 5, pendientes: 5 }] }];
    const res = await request(app).post("/api/calendario-laboral").send({ ...cuerpo, activo: false });
    expect(res.body.avisos).toEqual({ solicitudes_aprobadas: 0, solicitudes_pendientes: 0 });
    expect(nombresDeSql().some((q) => /FROM solicitudes_vacaciones/.test(q))).toBe(false);
  });

  it("si falla el cálculo del aviso, la escritura ya hecha responde 201 con avisos null y sin filtrar el error", async () => {
    mockRespuestas = [{ rows: [ACTIVIDAD] }, { rows: [] }, new Error("secreto interno de la BD")];
    const res = await request(app).post("/api/calendario-laboral").send(cuerpo);
    expect(res.status).toBe(201);
    expect(res.body.avisos).toBeNull();
    expect(JSON.stringify(res.body)).not.toMatch(/secreto/);
    expect(registrarAccion).toHaveBeenCalledTimes(1);
  });

  it("obtenerFechasBloqueadas devuelve {fecha, nombre} de actividades activas, parametrizado, y acepta cliente", async () => {
    const cliente = { query: jest.fn().mockResolvedValue({ rows: [{ fecha: "2026-10-28", nombre: "Inventario general", extra: 1 }] }) };
    const fechas = await CalendarioLaboral.obtenerFechasBloqueadas("2026-10-01", "2026-10-31", cliente);
    expect(fechas).toEqual([{ fecha: "2026-10-28", nombre: "Inventario general" }]);
    const [sql, valores] = cliente.query.mock.calls[0];
    expect(sql).toMatch(/activo = true/);
    expect(sql).toMatch(/tipo = \$1/);
    expect(sql).toMatch(/to_char\(fecha, 'YYYY-MM-DD'\)/);
    expect(valores).toEqual(["actividad", "2026-10-01", "2026-10-31"]);
    expect(grupo.query).not.toHaveBeenCalled();
  });

  it("obtenerFechasNoHabiles NO incluye las actividades", async () => {
    mockRespuestas = [{ rows: [] }];
    await CalendarioLaboral.obtenerFechasNoHabiles("2026-10-01", "2026-10-31");
    expect(sqlsDeDatos()[0][1][0]).not.toContain("actividad");
  });
});
