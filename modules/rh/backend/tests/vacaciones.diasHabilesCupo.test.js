// Vacaciones Fase 4: días hábiles, cupo por departamento, aprobación con revalidación y
// endpoints de vista previa. La BD es un simulador con estado y bloqueos FOR UPDATE por
// conexión (los SQL reales se validan aparte contra Postgres).
const request = require("supertest");
const express = require("express");

let mockUser;
let mockEdicion;
jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, _res, next) => {
    req.user = mockUser;
    next();
  },
}));
jest.mock("../../../portal/backend/middleware/permisos.middleware", () => ({
  verificarPermiso: () => (_req, _res, next) => next(),
  tienePermiso: jest.fn(async () => mockEdicion),
}));
jest.mock("../models/empleado.model", () => ({
  obtenerPorUsuarioId: jest.fn(),
  obtenerPorId: jest.fn(),
}));
jest.mock("../services/notificacion.service", () => ({
  notificarNuevoPermiso: jest.fn().mockResolvedValue(),
  notificarPermisoAprobado: jest.fn().mockResolvedValue(),
  notificarPermisoRechazado: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../../portal/backend/config/database", () => ({
  grupo: { query: jest.fn(), connect: jest.fn() },
}));

const { grupo } = require("../../../portal/backend/config/database");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");
const Empleado = require("../models/empleado.model");

const app = express();
app.use(express.json());
app.use("/vacaciones", require("../routes/vacaciones.routes"));

// ---------- Simulador de BD ----------
let estado;
let log;
let bloqueos;
let siguienteCliente;

const diasEntre = (a, b) => {
  const salida = [];
  for (let t = Date.parse(a); t <= Date.parse(b); t += 86400000) {
    salida.push(new Date(t).toISOString().slice(0, 10));
  }
  return salida;
};
const traslapan = (s, i, f) => s.fecha_inicial_txt <= f && s.fecha_final_txt >= i;
const esperar = () => new Promise((r) => setImmediate(r));

async function adquirir(clave, dueno) {
  const b = bloqueos.get(clave) || { dueno: null, cola: [] };
  bloqueos.set(clave, b);
  if (b.dueno === null || b.dueno === dueno) {
    b.dueno = dueno;
    return;
  }
  await new Promise((resolver) => b.cola.push({ dueno, resolver }));
}
function liberar(dueno) {
  for (const b of bloqueos.values()) {
    if (b.dueno !== dueno) continue;
    const siguiente = b.cola.shift();
    b.dueno = siguiente ? siguiente.dueno : null;
    if (siguiente) siguiente.resolver();
  }
}

async function consulta(dueno, sql, p = []) {
  const s = sql.replace(/\s+/g, " ").trim();
  log.push({ dueno, sql: s, p });
  if (/^(BEGIN)$/.test(s)) return { rows: [] };
  if (/^(COMMIT|ROLLBACK)$/.test(s)) {
    liberar(dueno);
    return { rows: [] };
  }
  if (/pg_advisory_xact_lock/.test(s)) {
    await adquirir(`emp${p[1]}`, dueno);
    return { rows: [] };
  }
  if (/^SELECT empleado_id FROM solicitudes_vacaciones WHERE id = \$1$/.test(s)) {
    const fila = estado.solicitudes.find((x) => x.id === Number(p[0]));
    return { rows: fila ? [{ empleado_id: fila.empleado_id }] : [] };
  }
  if (/FROM departamentos WHERE id = \$1 FOR UPDATE/.test(s)) {
    await adquirir(`dep${p[0]}`, dueno);
    const d = estado.departamentos[p[0]];
    return { rows: d ? [{ id: p[0], cupo_vacaciones: d.cupo }] : [] };
  }
  if (/SELECT cupo_vacaciones FROM departamentos/.test(s)) {
    const d = estado.departamentos[p[0]];
    return { rows: d ? [{ cupo_vacaciones: d.cupo }] : [] };
  }
  if (/FROM calendario_laboral/.test(s)) {
    if (/SELECT DISTINCT/.test(s)) {
      const fechas = estado.calendario
        .filter((c) => c.activo && ["oficial", "otorgado"].includes(c.tipo) && c.fecha >= p[1] && c.fecha <= p[2])
        .map((c) => ({ fecha: c.fecha }));
      return { rows: fechas };
    }
    return { rows: estado.calendario.filter((c) => c.activo && c.fecha >= p[0] && c.fecha <= p[1]) };
  }
  if (/^SELECT \* FROM solicitudes_vacaciones WHERE id = \$1$/.test(s)) {
    const fila = estado.solicitudes.find((x) => x.id === Number(p[0]));
    return { rows: fila ? [{ ...fila }] : [] };
  }
  if (/FROM solicitudes_vacaciones WHERE id = \$1 FOR UPDATE/.test(s)) {
    await adquirir(`sol${p[0]}`, dueno);
    const fila = estado.solicitudes.find((x) => x.id === Number(p[0]));
    return { rows: fila ? [{ ...fila }] : [] };
  }
  if (/FROM solicitudes_vacaciones s CROSS JOIN LATERAL/.test(s)) {
    const [dep, desde, hasta, excluir] = p;
    const cuenta = new Map();
    estado.solicitudes
      .filter((x) => x.estatus === "aprobado" && x.departamento_id === dep && x.id !== excluir)
      .forEach((x) => {
        diasEntre(x.fecha_inicial_txt, x.fecha_final_txt)
          .filter((d) => d >= desde && d <= hasta)
          .forEach((d) => cuenta.set(d, (cuenta.get(d) || 0) + 1));
      });
    // Lectura instantánea y respuesta tardía: sin bloqueo, la 2.ª transacción vería datos viejos
    const filas = [...cuenta].map(([fecha, ocupados]) => ({ fecha, ocupados }));
    await esperar();
    await esperar();
    return { rows: filas };
  }
  if (/SELECT COUNT\(\*\) FROM solicitudes_vacaciones/.test(s)) {
    const [emp, fin, ini, excluir] = p;
    const n = estado.solicitudes.filter(
      (x) =>
        x.empleado_id === Number(emp) &&
        ["pendiente", "aprobado"].includes(x.estatus) &&
        x.id !== excluir &&
        traslapan(x, ini, fin),
    ).length;
    // Lectura instantánea, respuesta tardía (igual que la ocupación): sin candado la carrera se ve
    await esperar();
    await esperar();
    return { rows: [{ count: String(n) }] };
  }
  if (/SUM\(dias_a_disfrutar\)/.test(s)) {
    const total = estado.solicitudes
      .filter((x) => x.empleado_id === Number(p[0]) && x.periodo === p[1] && x.estatus === "aprobado")
      .reduce((a, x) => a + x.dias_a_disfrutar, 0);
    await esperar();
    await esperar();
    return { rows: [{ total }] };
  }
  if (/FROM tabla_calculo_vacaciones/.test(s)) return { rows: [{ dias_vacaciones: estado.diasPeriodo }] };
  if (/^INSERT INTO solicitudes_vacaciones/.test(s)) {
    if (estado.fallarInsert) throw new Error("secreto interno de la BD");
    const fila = {
      id: estado.siguienteId++,
      empleado_id: p[0],
      fecha_inicial: p[11],
      fecha_final: p[12],
      fecha_inicial_txt: p[11],
      fecha_final_txt: p[12],
      periodo: p[14],
      dias_a_disfrutar: p[18],
      departamento_id: p[21],
      estatus: "pendiente",
    };
    estado.solicitudes.push(fila);
    return { rows: [fila] };
  }
  if (/^UPDATE solicitudes_vacaciones/.test(s)) {
    const fila = estado.solicitudes.find((x) => x.id === Number(p[4]));
    if (!fila || fila.estatus !== "pendiente") return { rows: [] };
    fila.estatus = p[0];
    return { rows: [{ ...fila }] };
  }
  throw new Error(`SQL no simulado: ${s.slice(0, 80)}`);
}

const sqls = () => log.map((l) => l.sql);
const hubo = (patron) => sqls().some((s) => patron.test(s));

function solicitudAprobada(extra) {
  return {
    id: estado.siguienteId++,
    empleado_id: 99,
    departamento_id: 1,
    estatus: "aprobado",
    periodo: 2026,
    dias_a_disfrutar: 3,
    ...extra,
  };
}
function pendiente(extra) {
  return solicitudAprobada({ estatus: "pendiente", empleado_id: 10, ...extra });
}
const con = (inicio, fin) => ({
  fecha_inicial: inicio,
  fecha_final: fin,
  fecha_inicial_txt: inicio,
  fecha_final_txt: fin,
});

const EMPLEADO = {
  id: 10,
  usuario_id: 5,
  nombre: "Ana",
  apellido_paterno: "Prueba",
  numero_nomina: "N10",
  departamento: "Ventas",
  departamento_id: 1,
  fecha_ingreso: "2020-03-15",
  jefe_inmediato_id: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  log = [];
  bloqueos = new Map();
  siguienteCliente = 0;
  estado = {
    departamentos: { 1: { cupo: 1 }, 2: { cupo: 2 } },
    calendario: [],
    solicitudes: [],
    siguienteId: 100,
    diasPeriodo: 12,
    fallarInsert: false,
  };
  mockUser = { usuario_id: 5, rol_nombre: "rh_empleado" };
  mockEdicion = false;
  Empleado.obtenerPorUsuarioId.mockImplementation(async () => ({ ...EMPLEADO }));
  Empleado.obtenerPorId.mockImplementation(async (id) =>
    Number(id) === 10 ? { ...EMPLEADO } : Number(id) === 11 ? { ...EMPLEADO, id: 11, usuario_id: 6 } : undefined,
  );
  grupo.query.mockImplementation((sql, p) => consulta("pool", sql, p));
  grupo.connect.mockImplementation(async () => {
    const id = `cliente${++siguienteCliente}`;
    return { query: (sql, p) => consulta(id, sql, p), release: jest.fn() };
  });
});
afterEach(() => jest.restoreAllMocks());

const crear = (cuerpo) => request(app).post("/vacaciones").send(cuerpo);

describe("Vacaciones - crear: validación (400)", () => {
  it.each([
    ["sin fechas", {}],
    ["formato inválido", { fecha_inicial: "19/10/2026", fecha_final: "2026-10-20" }],
    ["fecha inexistente", { fecha_inicial: "2027-02-29", fecha_final: "2027-03-02" }],
    ["fin anterior al inicio", { fecha_inicial: "2026-10-20", fecha_final: "2026-10-19" }],
    ["rango mayor a 366 días", { fecha_inicial: "2026-01-01", fecha_final: "2027-01-02" }],
    ["fecha de regreso inválida", { fecha_inicial: "2026-10-19", fecha_final: "2026-10-20", fecha_regreso: "mañana" }],
  ])("%s -> 400 sin tocar la BD", async (_n, cuerpo) => {
    const res = await crear(cuerpo);
    expect(res.status).toBe(400);
    expect(res.body.exito).toBe(false);
    expect(hubo(/BEGIN/)).toBe(false);
  });

  it("0 días hábiles (sábado y domingo) -> 400 y ROLLBACK", async () => {
    const res = await crear({ fecha_inicial: "2026-10-17", fecha_final: "2026-10-18" });
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/hábil/);
    expect(hubo(/^ROLLBACK$/)).toBe(true);
    expect(hubo(/INSERT/)).toBe(false);
  });

  it("rango solo de festivos y fin de semana -> 400", async () => {
    estado.calendario.push({ fecha: "2026-11-16", tipo: "oficial", nombre: "Revolución", activo: true });
    const res = await crear({ fecha_inicial: "2026-11-14", fecha_final: "2026-11-16" });
    expect(res.status).toBe(400);
  });

  it("saldo insuficiente (días hábiles > pendientes) -> 400", async () => {
    estado.diasPeriodo = 2;
    const res = await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-23" });
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/Días pendientes: 2, días solicitados: 5/);
  });
});

describe("Vacaciones - crear: éxito y cupo", () => {
  it("201: guarda días hábiles (festivo en medio no cuenta), departamento_id y periodo del texto", async () => {
    estado.calendario.push({ fecha: "2026-10-21", tipo: "otorgado", nombre: "Puente", activo: true });
    const res = await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-23" });
    expect(res.status).toBe(201);
    expect(res.body.datos).toMatchObject({ dias_a_disfrutar: 4, departamento_id: 1, periodo: 2026 });
    expect(sqls()[0]).toBe("BEGIN");
    expect(hubo(/departamentos WHERE id = \$1 FOR UPDATE/)).toBe(true);
    expect(sqls().at(-1)).toBe("COMMIT");
    expect(registrarAccion).toHaveBeenCalledWith(expect.anything(), "rh", "solicitudes_vacaciones", "100", "INSERT", null, expect.any(Object));
  });

  it("un evento no descuenta el día", async () => {
    estado.calendario.push({ fecha: "2026-10-21", tipo: "evento", nombre: "Inventario", activo: true });
    const res = await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-23" });
    expect(res.body.datos.dias_a_disfrutar).toBe(5);
  });

  it("periodo de enero 2027 sale del texto (no del huso horario)", async () => {
    const res = await crear({ fecha_inicial: "2027-01-04", fecha_final: "2027-01-05" });
    expect(res.status).toBe(201);
    expect(res.body.datos.periodo).toBe(2027);
  });

  it("cupo 1 lleno: 409 con la primera fecha llena y el cupo, sin nombres de compañeros", async () => {
    estado.solicitudes.push(solicitudAprobada({ nombre: "Compañero Secreto", ...con("2026-10-21", "2026-10-22") }));
    const res = await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-23" });
    expect(res.status).toBe(409);
    expect(res.body.mensaje).toMatch(/21\/10\/2026/);
    expect(res.body.mensaje).toMatch(/1 persona a la vez/);
    expect(JSON.stringify(res.body)).not.toMatch(/Compañero|Secreto|99/);
    expect(estado.solicitudes).toHaveLength(1);
    expect(hubo(/^ROLLBACK$/)).toBe(true);
  });

  it("audita el rechazo por cupo sin datos de compañeros", async () => {
    estado.solicitudes.push(solicitudAprobada({ nombre: "Compañero Secreto", empleado_id: 99, ...con("2026-10-21", "2026-10-22") }));
    await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-23" });
    expect(registrarAccion).toHaveBeenCalledTimes(1);
    const [, modulo, tabla, id, accion, previos, nuevos] = registrarAccion.mock.calls[0];
    expect([modulo, tabla, id, accion, previos]).toEqual(["rh", "solicitudes_vacaciones", "nueva", "RECHAZO_CUPO", null]);
    expect(nuevos).toEqual({
      operacion: "crear",
      empleado_id: 10,
      departamento_id: 1,
      fecha_inicial: "2026-10-19",
      fecha_final: "2026-10-23",
      fecha_llena: "2026-10-21",
      cupo: 1,
    });
    expect(JSON.stringify(nuevos)).not.toMatch(/Compañero|99/);
  });

  it("cupo 1 con una aprobada solo en fin de semana no bloquea (solo cuentan días hábiles)", async () => {
    estado.solicitudes.push(solicitudAprobada(con("2026-10-17", "2026-10-18")));
    const res = await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" });
    expect(res.status).toBe(201);
  });

  it("cupo 1 y la aprobada termina el día anterior: justo cabe", async () => {
    estado.solicitudes.push(solicitudAprobada(con("2026-10-12", "2026-10-16")));
    expect((await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" })).status).toBe(201);
  });

  it("cupo 2 con una aprobada: cabe; con dos aprobadas: 409", async () => {
    EMPLEADO.departamento_id = 2;
    try {
      estado.solicitudes.push(solicitudAprobada({ departamento_id: 2, ...con("2026-10-19", "2026-10-23") }));
      expect((await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" })).status).toBe(201);
      estado.solicitudes.push(solicitudAprobada({ departamento_id: 2, empleado_id: 98, ...con("2026-10-20", "2026-10-21") }));
      const res = await crear({ fecha_inicial: "2026-10-26", fecha_final: "2026-10-26" });
      expect(res.status).toBe(201); // otra semana
      const lleno = await crear({ fecha_inicial: "2026-10-21", fecha_final: "2026-10-21" });
      expect(lleno.status).toBe(409);
      expect(lleno.body.mensaje).toMatch(/2 personas a la vez/);
    } finally {
      EMPLEADO.departamento_id = 1;
    }
  });

  it("las pendientes de compañeros no cuentan para el cupo", async () => {
    estado.solicitudes.push(solicitudAprobada({ estatus: "pendiente", ...con("2026-10-19", "2026-10-23") }));
    expect((await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" })).status).toBe(201);
  });

  it("aprobadas de OTRO departamento no cuentan", async () => {
    estado.solicitudes.push(solicitudAprobada({ departamento_id: 2, ...con("2026-10-19", "2026-10-23") }));
    expect((await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" })).status).toBe(201);
  });

  it("departamento NULL: sin cupo, sin bloqueo de departamento ni consulta de ocupación", async () => {
    Empleado.obtenerPorId.mockImplementation(async () => ({ ...EMPLEADO, departamento_id: null, departamento: null }));
    estado.solicitudes.push(solicitudAprobada({ departamento_id: null, ...con("2026-10-19", "2026-10-23") }));
    const res = await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" });
    expect(res.status).toBe(201);
    expect(res.body.datos.departamento_id).toBeNull();
    expect(hubo(/FROM departamentos/)).toBe(false);
    expect(hubo(/CROSS JOIN LATERAL/)).toBe(false);
  });

  it("traslape propio -> 409", async () => {
    estado.solicitudes.push(pendiente(con("2026-10-20", "2026-10-21")));
    const res = await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" });
    expect(res.status).toBe(409);
    expect(res.body.mensaje).toMatch(/pendiente o aprobada/);
  });

  it("error interno -> 500 genérico, sin error.message", async () => {
    estado.fallarInsert = true;
    const res = await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secreto/);
    expect(res.body.error).toBeUndefined();
    expect(hubo(/^ROLLBACK$/)).toBe(true);
  });

  it("dos creaciones simultáneas de dos empleados del mismo departamento con cupo 1: solo una pasa", async () => {
    mockEdicion = true; // RH crea por otros
    Empleado.obtenerPorId.mockImplementation(async (id) => ({ ...EMPLEADO, id: Number(id) }));
    // Las solicitudes pendientes no cuentan para el cupo, así que se aprueba la primera
    // y la segunda creación (después) ya ve el cupo lleno.
    const a = await request(app).post("/vacaciones").send({ empleado_id: 10, fecha_inicial: "2026-10-19", fecha_final: "2026-10-19" });
    estado.solicitudes.find((x) => x.id === a.body.datos.id).estatus = "aprobado";
    estado.solicitudes.find((x) => x.id === a.body.datos.id).departamento_id = 1;
    const b = await request(app).post("/vacaciones").send({ empleado_id: 11, fecha_inicial: "2026-10-19", fecha_final: "2026-10-19" });
    expect([a.status, b.status]).toEqual([201, 409]);
  });
});

const responder = (id, cuerpo) => request(app).put(`/vacaciones/${id}/responder`).send(cuerpo);

describe("Vacaciones - responder", () => {
  beforeEach(() => {
    mockEdicion = true; // RH
    // Quien autoriza es RH y NO el solicitante (nadie responde lo propio)
    Empleado.obtenerPorUsuarioId.mockImplementation(async () => ({ ...EMPLEADO, id: 99, usuario_id: 5 }));
  });

  it("aprueba: bloquea solicitud y departamento antes de contar, guarda y hace COMMIT", async () => {
    const sol = pendiente(con("2026-10-19", "2026-10-23"));
    estado.solicitudes.push(sol);
    const res = await responder(sol.id, { estatus: "aprobado" });
    expect(res.status).toBe(200);
    expect(sol.estatus).toBe("aprobado");
    const orden = sqls();
    const iSol = orden.findIndex((s) => /solicitudes_vacaciones WHERE id = \$1 FOR UPDATE/.test(s));
    const iDep = orden.findIndex((s) => /departamentos WHERE id = \$1 FOR UPDATE/.test(s));
    const iCuenta = orden.findIndex((s) => /CROSS JOIN LATERAL/.test(s));
    expect(iSol).toBeGreaterThan(0);
    expect(iDep).toBeGreaterThan(iSol);
    expect(iCuenta).toBeGreaterThan(iDep);
    expect(orden.at(-1)).toBe("COMMIT");
  });

  it("no recalcula los días guardados (solicitud antigua de 5 días naturales con 3 hábiles)", async () => {
    const sol = pendiente({ dias_a_disfrutar: 7, ...con("2026-10-19", "2026-10-25") });
    estado.solicitudes.push(sol);
    const res = await responder(sol.id, { estatus: "aprobado" });
    expect(res.status).toBe(200);
    expect(sol.dias_a_disfrutar).toBe(7);
  });

  it("guardia de estado: si ya no está pendiente -> 409", async () => {
    const sol = pendiente({ estatus: "aprobado", ...con("2026-10-19", "2026-10-23") });
    estado.solicitudes.push(sol);
    const res = await responder(sol.id, { estatus: "rechazado", motivo_rechazo: "x" });
    expect(res.status).toBe(409);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("solicitud inexistente -> 404 (RH pasa el middleware)", async () => {
    expect((await responder(9999, { estatus: "aprobado" })).status).toBe(404);
  });

  it("rechazar exige motivo y no revalida cupo ni saldo", async () => {
    const sol = pendiente(con("2026-10-19", "2026-10-23"));
    estado.solicitudes.push(sol, solicitudAprobada(con("2026-10-19", "2026-10-23")));
    expect((await responder(sol.id, { estatus: "rechazado" })).status).toBe(400);
    const res = await responder(sol.id, { estatus: "rechazado", motivo_rechazo: "Cobertura" });
    expect(res.status).toBe(200);
    expect(sol.estatus).toBe("rechazado");
    expect(hubo(/CROSS JOIN LATERAL/)).toBe(false);
    expect(hubo(/SUM\(dias_a_disfrutar\)/)).toBe(false);
  });

  it("cupo lleno al aprobar: 409, queda pendiente y se audita sin datos de compañeros", async () => {
    const sol = pendiente(con("2026-10-19", "2026-10-23"));
    estado.solicitudes.push(sol, solicitudAprobada({ nombre: "Compañero Secreto", ...con("2026-10-22", "2026-10-22") }));
    const res = await responder(sol.id, { estatus: "aprobado" });
    expect(res.status).toBe(409);
    expect(res.body.mensaje).toMatch(/22\/10\/2026/);
    expect(res.body.mensaje).toMatch(/cupo/);
    expect(sol.estatus).toBe("pendiente");
    expect(hubo(/^UPDATE/)).toBe(false);
    const [, , , id, accion, , nuevos] = registrarAccion.mock.calls[0];
    expect([id, accion]).toEqual([String(sol.id), "RECHAZO_CUPO"]);
    expect(nuevos).toMatchObject({ operacion: "aprobar", fecha_llena: "2026-10-22", cupo: 1, departamento_id: 1 });
    expect(JSON.stringify(registrarAccion.mock.calls[0].slice(1))).not.toMatch(/Compañero|Secreto/);
  });

  it("la propia solicitud no cuenta contra su cupo", async () => {
    const sol = pendiente(con("2026-10-19", "2026-10-19"));
    estado.solicitudes.push(sol);
    expect((await responder(sol.id, { estatus: "aprobado" })).status).toBe(200);
  });

  it("traslape propio al aprobar -> 409", async () => {
    const sol = pendiente(con("2026-10-19", "2026-10-21"));
    estado.solicitudes.push(sol, pendiente(con("2026-10-21", "2026-10-22")));
    const res = await responder(sol.id, { estatus: "aprobado" });
    expect(res.status).toBe(409);
    expect(sol.estatus).toBe("pendiente");
  });

  it("saldo insuficiente al aprobar (otras aprobadas lo agotaron) -> 409", async () => {
    estado.diasPeriodo = 4;
    const sol = pendiente({ dias_a_disfrutar: 3, ...con("2026-11-02", "2026-11-04") });
    estado.solicitudes.push(sol, solicitudAprobada({ empleado_id: 10, departamento_id: 1, dias_a_disfrutar: 3, ...con("2026-10-05", "2026-10-07") }));
    const res = await responder(sol.id, { estatus: "aprobado" });
    expect(res.status).toBe(409);
    expect(res.body.mensaje).toMatch(/Días pendientes: 1/);
  });

  it("solicitud antigua sin departamento_id usa el del empleado actual", async () => {
    const sol = pendiente({ departamento_id: null, ...con("2026-10-19", "2026-10-20") });
    estado.solicitudes.push(sol, solicitudAprobada(con("2026-10-20", "2026-10-20")));
    const res = await responder(sol.id, { estatus: "aprobado" });
    expect(res.status).toBe(409);
    expect(log.find((l) => /departamentos WHERE id = \$1 FOR UPDATE/.test(l.sql)).p).toEqual([1]);
  });

  it("solicitud sin departamento_id y empleado sin departamento: sin cupo", async () => {
    Empleado.obtenerPorId.mockImplementation(async () => ({ ...EMPLEADO, departamento_id: null }));
    const sol = pendiente({ departamento_id: null, ...con("2026-10-19", "2026-10-20") });
    estado.solicitudes.push(sol, solicitudAprobada({ departamento_id: null, ...con("2026-10-19", "2026-10-20") }));
    expect((await responder(sol.id, { estatus: "aprobado" })).status).toBe(200);
    expect(hubo(/departamentos/)).toBe(false);
  });

  it("carrera: dos aprobaciones concurrentes solapadas con cupo 1 -> solo una pasa", async () => {
    const a = pendiente({ empleado_id: 10, ...con("2026-10-19", "2026-10-21") });
    const b = pendiente({ empleado_id: 11, ...con("2026-10-21", "2026-10-23") });
    estado.solicitudes.push(a, b);
    const [ra, rb] = await Promise.all([
      responder(a.id, { estatus: "aprobado" }),
      responder(b.id, { estatus: "aprobado" }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    expect(estado.solicitudes.filter((x) => x.estatus === "aprobado")).toHaveLength(1);
    expect(estado.solicitudes.filter((x) => x.estatus === "pendiente")).toHaveLength(1);
  });

  it("carrera: dos aprobaciones de la MISMA solicitud -> una 200 y otra 409", async () => {
    const a = pendiente(con("2026-10-19", "2026-10-21"));
    estado.solicitudes.push(a);
    const [r1, r2] = await Promise.all([
      responder(a.id, { estatus: "aprobado" }),
      responder(a.id, { estatus: "aprobado" }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  });

  it("error interno -> 500 genérico", async () => {
    const sol = pendiente(con("2026-10-19", "2026-10-21"));
    estado.solicitudes.push(sol);
    grupo.connect.mockRejectedValueOnce(new Error("secreto interno de la BD"));
    const res = await responder(sol.id, { estatus: "aprobado" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secreto/);
  });
});

describe("Vacaciones - periodo, fecha de regreso y bloqueo por empleado", () => {
  const sumas = () => log.filter((l) => /SUM\(dias_a_disfrutar\)/.test(l.sql));

  it.each([2035, "2035", 2027, -1, "abc"])(
    "el periodo del cuerpo (%j) se ignora: siempre el año de fecha_inicial",
    async (periodoFalso) => {
      const res = await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20", periodo: periodoFalso });
      expect(res.status).toBe(201);
      expect(res.body.datos.periodo).toBe(2026);
      expect(sumas().length).toBeGreaterThan(0);
      sumas().forEach((l) => expect(l.p[1]).toBe(2026));
    },
  );

  it("solicitud que cruza de año con periodo falso: saldo y periodo del año de inicio (2026)", async () => {
    const res = await crear({ fecha_inicial: "2026-12-28", fecha_final: "2027-01-04", periodo: 2035 });
    expect(res.status).toBe(201);
    expect(res.body.datos.periodo).toBe(2026);
    sumas().forEach((l) => expect(l.p[1]).toBe(2026));
  });

  it("fecha_regreso anterior a fecha_final -> 400 sin tocar la BD; igual o posterior se acepta", async () => {
    const mal = await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-21", fecha_regreso: "2026-10-20" });
    expect(mal.status).toBe(400);
    expect(mal.body.mensaje).toMatch(/regreso/);
    expect(hubo(/BEGIN/)).toBe(false);
    expect((await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-21", fecha_regreso: "2026-10-21" })).status).toBe(201);
    expect((await crear({ fecha_inicial: "2026-10-26", fecha_final: "2026-10-27", fecha_regreso: "2026-10-28" })).status).toBe(201);
  });

  it.each(["abc", "1;DROP", "0", "-3", "1.5", "99999999999"])(
    "empleado_id inválido (%s) -> 400 antes de la transacción",
    async (id) => {
      mockEdicion = true;
      const res = await crear({ empleado_id: id, fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" });
      expect(res.status).toBe(400);
      expect(hubo(/BEGIN/)).toBe(false);
    },
  );

  it("crear: el candado del empleado es lo primero tras BEGIN, antes que el del departamento", async () => {
    await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" });
    const orden = sqls();
    const iEmp = orden.findIndex((q) => q.includes("pg_advisory_xact_lock"));
    const iDep = orden.findIndex((q) => /FROM departamentos/.test(q) && q.includes("FOR UPDATE"));
    expect(orden[0]).toBe("BEGIN");
    expect(iEmp).toBe(1);
    expect(iDep).toBeGreaterThan(iEmp);
  });

  it("crear lee al empleado y su departamento DENTRO de la transacción (con el cliente, no con el pool)", async () => {
    await crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" });
    const llamadas = Empleado.obtenerPorId.mock.calls;
    expect(llamadas.length).toBeGreaterThan(0);
    llamadas.forEach(([, cliente]) => expect(cliente).toBeDefined());
  });

  it("aprobar: candado de empleado -> solicitud -> departamento; rechazar no toma candado de empleado", async () => {
    mockEdicion = true;
    Empleado.obtenerPorUsuarioId.mockImplementation(async () => ({ ...EMPLEADO, id: 99, usuario_id: 5 })); // RH != solicitante
    const sol = pendiente(con("2026-10-19", "2026-10-20"));
    estado.solicitudes.push(sol);
    await responder(sol.id, { estatus: "aprobado" });
    const orden = sqls();
    const iEmp = orden.findIndex((q) => q.includes("pg_advisory_xact_lock"));
    const iSol = orden.findIndex((q) => q.includes("FROM solicitudes_vacaciones WHERE id = $1 FOR UPDATE"));
    const iDep = orden.findIndex((q) => /FROM departamentos/.test(q) && q.includes("FOR UPDATE"));
    expect(iEmp).toBeGreaterThan(0);
    expect(iSol).toBeGreaterThan(iEmp);
    expect(iDep).toBeGreaterThan(iSol);

    log.length = 0;
    const otra = pendiente(con("2026-11-02", "2026-11-03"));
    estado.solicitudes.push(otra);
    await responder(otra.id, { estatus: "rechazado", motivo_rechazo: "x" });
    expect(sqls().some((q) => q.includes("pg_advisory_xact_lock"))).toBe(false);
  });

  describe("empleado SIN departamento (serializado por el candado del empleado)", () => {
    beforeEach(() => {
      Empleado.obtenerPorUsuarioId.mockImplementation(async () => ({ ...EMPLEADO, departamento_id: null, departamento: null }));
      Empleado.obtenerPorId.mockImplementation(async () => ({ ...EMPLEADO, departamento_id: null, departamento: null }));
    });

    it("doble envío simultáneo del mismo rango: una 201 y el resto 409 (sin solapadas)", async () => {
      estado.diasPeriodo = 22;
      const respuestas = await Promise.all(
        Array.from({ length: 5 }, () => crear({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-23" })),
      );
      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(respuestas.filter((r) => r.status === 409)).toHaveLength(4);
      expect(estado.solicitudes).toHaveLength(1);
    });

    it("dos aprobaciones simultáneas que juntas superan el saldo: una 200 y una 409", async () => {
      mockEdicion = true;
      Empleado.obtenerPorUsuarioId.mockImplementation(async () => ({ ...EMPLEADO, id: 99, usuario_id: 5 })); // RH != solicitante
      estado.diasPeriodo = 22;
      const a = pendiente({ departamento_id: null, dias_a_disfrutar: 15, ...con("2026-10-05", "2026-10-23") });
      const b = pendiente({ departamento_id: null, dias_a_disfrutar: 15, ...con("2026-11-02", "2026-11-20") });
      estado.solicitudes.push(a, b);
      const [ra, rb] = await Promise.all([
        responder(a.id, { estatus: "aprobado" }),
        responder(b.id, { estatus: "aprobado" }),
      ]);
      expect([ra.status, rb.status].sort()).toEqual([200, 409]);
      const disfrutados = estado.solicitudes
        .filter((x) => x.estatus === "aprobado")
        .reduce((t, x) => t + x.dias_a_disfrutar, 0);
      expect(disfrutados).toBeLessThanOrEqual(22);
    });
  });
});

describe("Vacaciones - responder: guardia de estado y fallos posteriores al COMMIT", () => {
  beforeEach(() => {
    mockEdicion = true;
    // Quien autoriza es RH y NO el solicitante (nadie responde lo propio)
    Empleado.obtenerPorUsuarioId.mockImplementation(async () => ({ ...EMPLEADO, id: 99, usuario_id: 5 }));
  });

  it("guardia de estado aislada: si el UPDATE ya no encuentra la solicitud pendiente -> 409", async () => {
    // La lectura previa del controlador "pasa" (aún pendiente) pero otra transacción ya la cambió
    const sol = pendiente(con("2026-10-19", "2026-10-20"));
    estado.solicitudes.push(sol);
    const SolicitudVacaciones = require("../models/solicitudVacaciones.model");
    jest.spyOn(SolicitudVacaciones, "obtenerParaResponder").mockImplementation(async () => {
      const copia = { ...sol, estatus: "pendiente" };
      sol.estatus = "rechazado"; // el otro usuario gana entre la lectura y el UPDATE
      return copia;
    });
    const res = await responder(sol.id, { estatus: "aprobado" });
    expect(res.status).toBe(409);
    expect(sol.estatus).toBe("rechazado");
    expect(registrarAccion).not.toHaveBeenCalled();
    expect(sqls()).toContain("ROLLBACK");
  });

  it("falla de la lectura del empleado DESPUÉS del COMMIT: 200 igual y auditoría UPDATE registrada", async () => {
    const sol = pendiente(con("2026-10-19", "2026-10-20"));
    estado.solicitudes.push(sol);
    Empleado.obtenerPorId.mockImplementation(async () => {
      if (sqls().includes("COMMIT")) throw new Error("falla tras el commit");
      return { ...EMPLEADO };
    });
    const res = await responder(sol.id, { estatus: "aprobado" });
    expect(res.status).toBe(200);
    expect(sol.estatus).toBe("aprobado");
    expect(registrarAccion).toHaveBeenCalledWith(expect.anything(), "rh", "solicitudes_vacaciones", String(sol.id), "UPDATE", expect.anything(), expect.anything());
    expect(console.error).toHaveBeenCalled();
  });

  it("falla de la notificación o de la auditoría tras el COMMIT: 200 igual", async () => {
    const sol = pendiente(con("2026-10-19", "2026-10-20"));
    estado.solicitudes.push(sol);
    Empleado.obtenerPorId.mockImplementation(async () => ({ ...EMPLEADO, usuario_correo: "a@b.c" }));
    require("../services/notificacion.service").notificarPermisoAprobado.mockRejectedValueOnce(new Error("n8n caído"));
    registrarAccion.mockRejectedValueOnce(new Error("auditoría caída"));
    const res = await responder(sol.id, { estatus: "aprobado" });
    expect(res.status).toBe(200);
    expect(res.body.exito).toBe(true);
  });
});

describe("Vacaciones - GET /disponibilidad", () => {
  const consultar = (q) => request(app).get("/vacaciones/disponibilidad").query(q);

  it("devuelve días hábiles, no hábiles, eventos, fechas llenas, cupo, saldo y sin conflicto", async () => {
    estado.calendario.push(
      { fecha: "2026-10-21", tipo: "oficial", nombre: "Festivo", activo: true },
      { fecha: "2026-10-22", tipo: "evento", nombre: "Inventario", activo: true },
      { fecha: "2026-10-23", tipo: "otorgado", nombre: "Descanso", activo: false },
    );
    estado.solicitudes.push(solicitudAprobada({ nombre: "Compañero Secreto", ...con("2026-10-26", "2026-10-26") }));
    const res = await consultar({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-23" });
    expect(res.status).toBe(200);
    expect(res.body.datos).toEqual({
      dias_habiles: 4,
      dias_no_habiles: [{ fecha: "2026-10-21", tipo: "oficial", nombre: "Festivo" }],
      eventos: [{ fecha: "2026-10-22", nombre: "Inventario" }],
      fechas_llenas: [],
      cupo: 1,
      saldo: 12,
      conflicto: null,
    });
  });

  it("marca fechas llenas y el conflicto CUPO_LLENO sin nombres", async () => {
    estado.solicitudes.push(solicitudAprobada({ nombre: "Compañero Secreto", ...con("2026-10-20", "2026-10-21") }));
    const res = await consultar({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-23" });
    expect(res.body.datos.fechas_llenas).toEqual(["2026-10-20", "2026-10-21"]);
    expect(res.body.datos.conflicto.codigo).toBe("CUPO_LLENO");
    expect(res.body.datos.conflicto.mensaje).toMatch(/20\/10\/2026/);
    expect(JSON.stringify(res.body)).not.toMatch(/Compañero|Secreto|empleado_id|\b99\b/);
  });

  it("conflictos SIN_DIAS_HABILES, TRASLAPE y SALDO_INSUFICIENTE", async () => {
    let res = await consultar({ fecha_inicial: "2026-10-17", fecha_final: "2026-10-18" });
    expect(res.body.datos.conflicto.codigo).toBe("SIN_DIAS_HABILES");
    estado.solicitudes.push(pendiente(con("2026-10-19", "2026-10-19")));
    res = await consultar({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" });
    expect(res.body.datos.conflicto.codigo).toBe("TRASLAPE");
    estado.solicitudes.length = 0;
    estado.diasPeriodo = 2;
    res = await consultar({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-23" });
    expect(res.body.datos.conflicto.codigo).toBe("SALDO_INSUFICIENTE");
    expect(res.body.datos.saldo).toBe(2);
  });

  it("empleado sin departamento: cupo null y sin fechas llenas", async () => {
    Empleado.obtenerPorUsuarioId.mockResolvedValue({ ...EMPLEADO, departamento_id: null });
    const res = await consultar({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-23" });
    expect(res.body.datos.cupo).toBeNull();
    expect(res.body.datos.fechas_llenas).toEqual([]);
  });

  it.each([
    [{}],
    [{ fecha_inicial: "2026-10-19" }],
    [{ fecha_inicial: "2026-10-20", fecha_final: "2026-10-19" }],
    [{ fecha_inicial: "2026-01-01", fecha_final: "2027-01-02" }],
    [{ fecha_inicial: "2026-02-30", fecha_final: "2026-03-02" }],
  ])("parámetros inválidos %j -> 400", async (q) => {
    expect((await consultar(q)).status).toBe(400);
  });

  it("usuario sin empleado: 403 (middleware); RH sin empleado propio y sin empleado_id -> 404", async () => {
    Empleado.obtenerPorUsuarioId.mockResolvedValue(undefined);
    expect((await consultar({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" })).status).toBe(403);
    mockEdicion = true;
    expect((await consultar({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" })).status).toBe(404);
  });

  it("empleado_id ajeno sin permiso -> 403; con permiso RH usa ese empleado", async () => {
    expect((await consultar({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20", empleado_id: 11 })).status).toBe(403);
    mockEdicion = true;
    const res = await consultar({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20", empleado_id: 11 });
    expect(res.status).toBe(200);
  });

  it("la consulta de ocupación solo selecciona fecha y conteo (nunca nombres ni ids)", async () => {
    await consultar({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" });
    const sql = log.find((l) => /CROSS JOIN LATERAL/.test(l.sql)).sql;
    expect(sql).toMatch(/^SELECT to_char\(d\.dia, 'YYYY-MM-DD'\) AS fecha, COUNT\(\*\)::int AS ocupados/);
    expect(sql).not.toMatch(/nombre|apellido|empleado_id\s*,|numero_nomina/i);
  });

  it("500 genérico sin error.message", async () => {
    grupo.query.mockRejectedValueOnce(new Error("secreto interno de la BD"));
    const res = await consultar({ fecha_inicial: "2026-10-19", fecha_final: "2026-10-20" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secreto/);
  });
});

describe("Vacaciones - GET /ocupacion", () => {
  const consultar = (q) => request(app).get("/vacaciones/ocupacion").query(q);

  it("devuelve solo fechas_llenas, no hábiles y eventos", async () => {
    estado.calendario.push(
      { fecha: "2026-10-21", tipo: "oficial", nombre: "Festivo", activo: true },
      { fecha: "2026-10-22", tipo: "evento", nombre: "Inventario", activo: true },
    );
    estado.solicitudes.push(solicitudAprobada({ nombre: "Compañero Secreto", ...con("2026-10-19", "2026-10-21") }));
    const res = await consultar({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.datos).sort()).toEqual(["dias_no_habiles", "eventos", "fechas_llenas"]);
    // el 21 es festivo: no es "día hábil lleno"
    expect(res.body.datos.fechas_llenas).toEqual(["2026-10-19", "2026-10-20"]);
    expect(res.body.datos.dias_no_habiles).toEqual([{ fecha: "2026-10-21", tipo: "oficial", nombre: "Festivo" }]);
    expect(res.body.datos.eventos).toEqual([{ fecha: "2026-10-22", nombre: "Inventario" }]);
    expect(JSON.stringify(res.body)).not.toMatch(/Compañero|Secreto/);
  });

  it("acepta exactamente 366 días y rechaza 367 o sin parámetros", async () => {
    expect((await consultar({ desde: "2028-01-01", hasta: "2028-12-31" })).status).toBe(200);
    expect((await consultar({ desde: "2028-01-01", hasta: "2029-01-01" })).status).toBe(400);
    expect((await consultar({})).status).toBe(400);
    expect((await consultar({ desde: "2026-10-05", hasta: "2026-10-01" })).status).toBe(400);
  });

  it("empleado sin departamento: sin fechas llenas", async () => {
    Empleado.obtenerPorUsuarioId.mockResolvedValue({ ...EMPLEADO, departamento_id: null });
    estado.solicitudes.push(solicitudAprobada(con("2026-10-19", "2026-10-21")));
    const res = await consultar({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(res.body.datos.fechas_llenas).toEqual([]);
  });
});
