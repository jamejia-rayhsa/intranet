// Regresión del agotamiento del pool (Fase 4, hallazgo alto): dentro de una transacción de
// vacaciones NINGUNA consulta puede pedir otra conexión al pool. Aquí el pool es de 10 conexiones
// como el real y el modelo Empleado es el REAL (no un mock); si algo dentro de la transacción usa
// el pool en vez del cliente, con >= 11 solicitudes simultáneas todo queda esperando y la prueba
// falla por tiempo (no se cuelga).
const request = require("supertest");
const express = require("express");

let mockUser;
jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, _res, next) => {
    req.user = mockUser;
    next();
  },
}));
jest.mock("../../../portal/backend/middleware/permisos.middleware", () => ({
  verificarPermiso: () => (_req, _res, next) => next(),
  tienePermiso: jest.fn(async () => true), // RH: puede crear/aprobar por otros
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

const app = express();
app.use(express.json());
app.use("/vacaciones", require("../routes/vacaciones.routes"));

const TAMANO_POOL = 10;
const tick = () => new Promise((r) => setImmediate(r));

// ---------- Pool simulado de capacidad fija ----------
let libres;
let esperandoConexion;
let maximoEnUso;
let bloqueos;
let siguienteId;
let solicitudes;

function tomarConexion() {
  if (libres > 0) {
    libres -= 1;
    maximoEnUso = Math.max(maximoEnUso, TAMANO_POOL - libres);
    return Promise.resolve();
  }
  return new Promise((resolver) => esperandoConexion.push(resolver));
}
function devolverConexion() {
  const siguiente = esperandoConexion.shift();
  if (siguiente) {
    maximoEnUso = Math.max(maximoEnUso, TAMANO_POOL - libres);
    siguiente();
  } else {
    libres += 1;
  }
}
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

// Respuesta mínima según la tabla consultada; lo que importa es QUIÉN pide conexión y los candados
async function ejecutar(dueno, sql, p = []) {
  await tick();
  const s = sql.replace(/\s+/g, " ").trim();
  if (s === "BEGIN") return { rows: [] };
  if (s === "COMMIT" || s === "ROLLBACK") {
    liberar(dueno);
    return { rows: [] };
  }
  if (s.includes("pg_advisory_xact_lock")) {
    await adquirir(`emp${p[1]}`, dueno);
    return { rows: [] };
  }
  if (s.includes("FROM departamentos") && s.includes("FOR UPDATE")) {
    await adquirir(`dep${p[0]}`, dueno);
    return { rows: [{ id: p[0], cupo_vacaciones: 50 }] };
  }
  if (s.includes("FROM empleados e")) {
    return {
      rows: [
        {
          id: Number(p[0]),
          nombre: "Emp",
          apellido_paterno: `N${p[0]}`,
          departamento_id: 1,
          departamento: "Ventas",
          fecha_ingreso: "2015-01-01",
          jefe_inmediato_id: null,
        },
      ],
    };
  }
  if (s.includes("FROM calendario_laboral")) return { rows: [] };
  if (s.includes("FROM tabla_calculo_vacaciones")) return { rows: [{ dias_vacaciones: 20 }] };
  if (s.includes("SUM(dias_a_disfrutar)")) return { rows: [{ total: 0 }] };
  if (s.includes("COUNT(*) FROM solicitudes_vacaciones")) return { rows: [{ count: "0" }] };
  if (s.includes("generate_series")) return { rows: [] };
  if (s.startsWith("INSERT INTO solicitudes_vacaciones")) {
    const fila = { id: siguienteId++, empleado_id: p[0], estatus: "pendiente", departamento_id: p[21] };
    solicitudes.push(fila);
    return { rows: [fila] };
  }
  if (s.includes("SELECT empleado_id FROM solicitudes_vacaciones")) {
    const f = solicitudes.find((x) => x.id === Number(p[0]));
    return { rows: f ? [{ empleado_id: f.empleado_id }] : [] };
  }
  if (s.includes("FROM solicitudes_vacaciones WHERE id = $1 FOR UPDATE")) {
    await adquirir(`sol${p[0]}`, dueno);
    const f = solicitudes.find((x) => x.id === Number(p[0]));
    return {
      rows: f
        ? [{ ...f, fecha_inicial_txt: "2026-10-19", fecha_final_txt: "2026-10-19", periodo: 2026, dias_a_disfrutar: 1 }]
        : [],
    };
  }
  if (s.startsWith("UPDATE solicitudes_vacaciones")) {
    const f = solicitudes.find((x) => x.id === Number(p[4]));
    if (!f || f.estatus !== "pendiente") return { rows: [] };
    f.estatus = p[0];
    return { rows: [{ ...f }] };
  }
  return { rows: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  libres = TAMANO_POOL;
  esperandoConexion = [];
  maximoEnUso = 0;
  bloqueos = new Map();
  siguienteId = 1;
  solicitudes = [];
  mockUser = { usuario_id: 1, rol_nombre: "rh_admin" };
  let cliente = 0;
  // pool.query toma una conexión solo mientras dura la consulta; connect() la retiene hasta release()
  grupo.query.mockImplementation(async (sql, p) => {
    await tomarConexion();
    try {
      return await ejecutar("pool", sql, p);
    } finally {
      devolverConexion();
    }
  });
  grupo.connect.mockImplementation(async () => {
    await tomarConexion();
    const id = `cliente${++cliente}`;
    return {
      query: (sql, p) => ejecutar(id, sql, p),
      release: () => {
        liberar(id);
        devolverConexion();
      },
    };
  });
});
afterEach(() => jest.restoreAllMocks());

// Si algo se congela, falla en 4 s en vez de colgar la suite
const conLimite = (promesa) => {
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error("INTERBLOQUEO: no terminó")), 4000);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
};

const enviarCrear = (n, base = 1000) =>
  Promise.all(
    Array.from({ length: n }, (_, i) =>
      request(app)
        .post("/vacaciones")
        .send({ empleado_id: base + i, fecha_inicial: "2026-10-19", fecha_final: "2026-10-19" }),
    ),
  );

describe("Vacaciones - pool de conexiones (Empleado real, pool de 10)", () => {
  it.each([10, 11, 20, 30])("%i creaciones simultáneas del mismo departamento terminan", async (n) => {
    const respuestas = await conLimite(enviarCrear(n));
    expect(respuestas.map((r) => r.status)).toEqual(Array(n).fill(201));
    expect(solicitudes).toHaveLength(n);
    expect(maximoEnUso).toBeLessThanOrEqual(TAMANO_POOL);
  }, 8000);

  it("cada transacción usa UNA sola conexión: nada pide el pool con la transacción abierta", async () => {
    await conLimite(enviarCrear(1));
    // 1 connect() para la transacción; el resto de consultas del recorrido van por el cliente
    expect(grupo.connect).toHaveBeenCalledTimes(1);
    const consultasDelPool = grupo.query.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, " ").trim());
    expect(consultasDelPool.filter((q) => q.includes("FROM empleados e"))).toHaveLength(0);
  });

  it("15 aprobaciones simultáneas (mismo departamento, empleados distintos) terminan", async () => {
    for (let i = 0; i < 15; i += 1) {
      solicitudes.push({ id: siguienteId++, empleado_id: 2000 + i, estatus: "pendiente", departamento_id: 1 });
    }
    const respuestas = await conLimite(
      Promise.all(solicitudes.map((s) => request(app).put(`/vacaciones/${s.id}/responder`).send({ estatus: "aprobado" }))),
    );
    expect(respuestas.map((r) => r.status)).toEqual(Array(15).fill(200));
    expect(maximoEnUso).toBeLessThanOrEqual(TAMANO_POOL);
  }, 8000);

  it("mezcla de creaciones y aprobaciones cruzadas (empleado -> solicitud -> departamento) sin interbloqueo", async () => {
    for (let i = 0; i < 12; i += 1) {
      solicitudes.push({ id: siguienteId++, empleado_id: 3000 + i, estatus: "pendiente", departamento_id: 1 });
    }
    const aprobar = solicitudes.map((s) => request(app).put(`/vacaciones/${s.id}/responder`).send({ estatus: "aprobado" }));
    // Creaciones del mismo empleado cuya solicitud se está aprobando
    const crear = Array.from({ length: 12 }, (_, i) =>
      request(app).post("/vacaciones").send({ empleado_id: 3000 + i, fecha_inicial: "2026-11-02", fecha_final: "2026-11-02" }),
    );
    const respuestas = await conLimite(Promise.all([...aprobar, ...crear]));
    respuestas.forEach((r) => expect([200, 201, 409]).toContain(r.status));
  }, 8000);
});
