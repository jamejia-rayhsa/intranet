const request = require("supertest");
const express = require("express");

let mockUser;
jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, res, next) => {
    if (!mockUser) return res.status(401).json({ exito: false, mensaje: "sin token" });
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
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({ registrarAccion: jest.fn() }));

const { __bd: bd } = require("../../../portal/backend/config/database");
const Auditoria = require("../../../auditoria/backend/models/auditoria.model");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");
const { hashLlave } = require("../utils/llaveIngesta");

const app = express();
app.use(express.json());
app.use("/api/asistencia", require("../routes/asistencia.routes"));

const URL = "/api/asistencia/llaves";
const LLAVE = /^rhk_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/;
let tienda; // filas de asistencia_llaves simuladas
let espiaError;
let espiaLog;

const sinHash = (fila) => {
  const copia = { ...fila };
  delete copia.hash_llave;
  return copia;
};
const publica = (f) => ({
  ...sinHash(f),
  estado_efectivo: f.estado === "revocada" ? "revocada" : f.vence_pasado ? "vencida" : "activa",
});

function instalarBD() {
  let siguiente = 1;
  bd.cuando(/INSERT INTO asistencia_llaves /, (_sql, p) => {
    const fila = {
      id: siguiente++,
      nombre: p[0],
      origen: p[1],
      prefijo: p[2],
      hash_llave: p[3],
      estado: "activa",
      vigente_desde: "2026-10-21T10:00:00.000Z",
      vigente_hasta: p[5],
      ips_permitidas: p[4],
      ultimo_uso: null,
      ultima_ip: null,
      reemplaza_a: p[7],
      creado_por: p[6],
      fecha_creacion: "2026-10-21T10:00:00.000Z",
      fecha_actualizacion: "2026-10-21T10:00:00.000Z",
      revocada_por: null,
      fecha_revocacion: null,
    };
    tienda.push(fila);
    return { rows: [publica(fila)] };
  });
  bd.cuando(/FROM asistencia_llaves WHERE id = \$1/, (_sql, p) => {
    const f = tienda.find((x) => x.id === p[0]);
    return { rows: f ? [publica(f)] : [] };
  });
  bd.cuando(/FROM asistencia_llaves ORDER BY id DESC/, () => ({ rows: [...tienda].reverse().map(publica) }));
  bd.cuando(/UPDATE asistencia_llaves\s+SET vigente_hasta = LEAST/, (_sql, p) => {
    const f = tienda.find((x) => x.id === p[0]);
    f.vigente_hasta = `en ${p[1]} s`;
    return { rows: [publica(f)] };
  });
  bd.cuando(/SET estado = 'revocada'/, (_sql, p) => {
    const f = tienda.find((x) => x.id === p[0] && x.estado === "activa");
    if (!f) return { rows: [] };
    Object.assign(f, { estado: "revocada", revocada_por: p[1], fecha_revocacion: "2026-10-21T11:00:00.000Z" });
    return { rows: [publica(f)] };
  });
  bd.cuando(/SET ips_permitidas = \$2::text\[\]/, (_sql, p) => {
    const f = tienda.find((x) => x.id === p[0] && x.estado === "activa");
    if (!f) return { rows: [] };
    f.ips_permitidas = p[1];
    return { rows: [publica(f)] };
  });
  bd.cuando(/FROM asistencia_sync_lotes l LEFT JOIN asistencia_llaves/, (_sql, p) => ({ rows: [{ id: 3, estatus: "ok", limite: p[0] }] }));
  bd.cuando(/WITH unicos AS/, () => ({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 }));
  bd.cuando(/COUNT\(\*\) AS total FROM asistencia_marcas WHERE empleado_id IS NULL/, () => ({ rows: [{ total: "7" }] }));
}

beforeEach(() => {
  jest.clearAllMocks();
  bd.reiniciar();
  tienda = [];
  instalarBD();
  mockUser = { usuario_id: 5, rol_id: 3, rol_nombre: "rh_admin" };
  bd.estado.permisos = { Ingesta: ["consulta", "edicion"] };
  espiaError = jest.spyOn(console, "error").mockImplementation(() => {});
  espiaLog = jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const crear = async (cuerpo = { nombre: "BioTime planta" }) => request(app).post(URL).send(cuerpo);

describe("Llaves de ingesta - permisos", () => {
  const rutas = [
    ["get", URL, "consulta"],
    ["get", "/api/asistencia/lotes", "consulta"],
    ["post", URL, "edicion"],
    ["post", `${URL}/1/rotar`, "edicion"],
    ["post", `${URL}/1/revocar`, "edicion"],
    ["put", `${URL}/1/ips`, "edicion"],
    ["post", "/api/asistencia/marcas/revincular", "edicion"],
  ];

  it.each(rutas)("%s %s sin ningún permiso de Ingesta -> 403 y sin tocar la BD (portal_admin, rh_empleado)", async (metodo, ruta) => {
    for (const rol of ["portal_admin", "rh_empleado"]) {
      mockUser = { usuario_id: 9, rol_id: 8, rol_nombre: rol };
      bd.estado.permisos = { Asistencia: ["consulta"], Turnos: ["consulta", "edicion"], Empleados: ["consulta", "edicion"] };
      const r = await request(app)[metodo](ruta).send({ nombre: "x", ips_permitidas: [] });
      expect(r.status).toBe(403);
    }
    expect(bd.hubo(/asistencia_llaves|asistencia_sync_lotes|asistencia_marcas/)).toBe(false);
    expect(Auditoria.crear).not.toHaveBeenCalled();
  });

  it.each(rutas.filter((r) => r[2] === "edicion"))("%s %s con solo Ingesta:consulta -> 403", async (metodo, ruta) => {
    bd.estado.permisos = { Ingesta: ["consulta"] };
    const r = await request(app)[metodo](ruta).send({ nombre: "x", ips_permitidas: [] });
    expect(r.status).toBe(403);
    expect(Auditoria.crear).not.toHaveBeenCalled();
  });

  it("Ingesta:consulta lista las llaves y los lotes", async () => {
    bd.estado.permisos = { Ingesta: ["consulta"] };
    expect((await request(app).get(URL)).status).toBe(200);
    expect((await request(app).get("/api/asistencia/lotes")).status).toBe(200);
  });

  it("super_admin pasa sin filas de permiso; sin sesión -> 401", async () => {
    mockUser = { usuario_id: 1, rol_id: 1, rol_nombre: "super_admin" };
    bd.estado.permisos = {};
    expect((await crear()).status).toBe(201);
    mockUser = null;
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it("el permiso de Turnos o Asistencia:edicion NO basta para administrar llaves (opción propia)", async () => {
    bd.estado.permisos = { Turnos: ["edicion"], Asistencia: ["edicion"] };
    expect((await crear()).status).toBe(403);
  });
});

describe("Llaves de ingesta - crear", () => {
  it("devuelve la llave en claro UNA vez (formato, 32 bytes) y guarda solo su hash", async () => {
    const r = await crear({ nombre: "  BioTime planta  ", ips_permitidas: ["10.0.0.5"] });
    expect(r.status).toBe(201);
    expect(r.headers["cache-control"]).toBe("no-store");
    const { llave, ...fila } = r.body.datos;
    expect(llave).toMatch(LLAVE);
    expect(fila).toMatchObject({ id: 1, nombre: "BioTime planta", origen: "biotime", estado: "activa", prefijo: llave.slice(0, 12), ips_permitidas: ["10.0.0.5"], creado_por: 5 });
    expect(fila).not.toHaveProperty("hash_llave");
    expect(r.body.aviso).toMatch(/no se vuelve a mostrar/);
    // BD: hash y prefijo, nunca la llave
    const insert = bd.sqls().find((l) => /INSERT INTO asistencia_llaves /.test(l.sql));
    expect(insert.params[2]).toBe(llave.slice(0, 12));
    expect(insert.params[3]).toBe(hashLlave(llave));
    expect(JSON.stringify(insert.params)).not.toContain(llave);
    expect(tienda[0].hash_llave).toBe(hashLlave(llave));
  });

  it("es transaccional (con SAVEPOINT por si el prefijo choca) y sin vencimiento por omisión", async () => {
    await crear();
    const sqls = bd.sqls().map((l) => l.sql.replace(/\s+/g, " "));
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.some((s) => /^SAVEPOINT alta_llave/.test(s))).toBe(true);
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
    expect(bd.sqls().find((l) => /INSERT INTO asistencia_llaves /.test(l.sql)).params[5]).toBeNull();
  });

  it("si el prefijo choca (23505) genera otra llave y reintenta; tras 5 choques -> 500 genérico", async () => {
    let intentos = 0;
    bd.estado.reglas.unshift({
      re: /INSERT INTO asistencia_llaves /,
      respuesta: () => {
        intentos += 1;
        if (intentos < 3) throw Object.assign(new Error('duplicate key value violates unique constraint "asistencia_llaves_prefijo_key"'), { code: "23505" });
        return { rows: [{ id: 1, nombre: "x", prefijo: "p", estado: "activa" }] };
      },
    });
    expect((await crear()).status).toBe(201);
    expect(intentos).toBe(3);
    // cada choque revierte solo el SAVEPOINT (la transacción sigue viva) y se genera una llave distinta
    const sqls = bd.sqls().map((l) => l.sql.replace(/\s+/g, " "));
    expect(sqls.filter((s) => s === "ROLLBACK TO SAVEPOINT alta_llave")).toHaveLength(2);
    expect(sqls.filter((s) => s === "RELEASE SAVEPOINT alta_llave")).toHaveLength(1);
    const hashes = bd.sqls().filter((l) => /INSERT INTO asistencia_llaves /.test(l.sql)).map((l) => l.params[3]);
    expect(new Set(hashes).size).toBe(3);

    intentos = -100;
    const r = await crear();
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ exito: false, mensaje: "Error al crear la llave" });
    expect(JSON.stringify(r.body)).not.toMatch(/duplicate|constraint/);
  });

  it("vigente_hasta futuro con zona se acepta y se guarda en UTC", async () => {
    const r = await crear({ nombre: "con vencimiento", vigente_hasta: "2099-01-01T00:00:00-06:00" });
    expect(r.status).toBe(201);
    expect(bd.sqls().find((l) => /INSERT INTO asistencia_llaves /.test(l.sql)).params[5]).toBe("2099-01-01T06:00:00.000Z");
  });

  it.each([
    ["sin nombre", {}],
    ["nombre vacío", { nombre: "   " }],
    ["nombre no texto", { nombre: 5 }],
    ["nombre largo", { nombre: "n".repeat(101) }],
    ["nombre con salto de línea", { nombre: "a\nb" }],
    ["nombre con NUL", { nombre: "a\u0000b" }],
    ["origen no admitido", { nombre: "x", origen: "otro" }],
    ["origen no texto", { nombre: "x", origen: 5 }],
    ["ips no es lista", { nombre: "x", ips_permitidas: "10.0.0.5" }],
    ["ip inválida", { nombre: "x", ips_permitidas: ["10.0.0.256"] }],
    ["demasiadas ip", { nombre: "x", ips_permitidas: Array.from({ length: 21 }, (_, i) => `10.0.0.${i + 1}`) }],
    ["vigente_hasta pasado", { nombre: "x", vigente_hasta: "2020-01-01T00:00:00Z" }],
    ["vigente_hasta sin zona", { nombre: "x", vigente_hasta: "2099-01-01T00:00:00" }],
    ["vigente_hasta basura", { nombre: "x", vigente_hasta: "mañana" }],
  ])("400: %s (sin crear nada ni auditar)", async (_n, cuerpo) => {
    const r = await crear(cuerpo);
    expect(r.status).toBe(400);
    expect(r.body.exito).toBe(false);
    expect(bd.hubo(/INSERT INTO asistencia_llaves/)).toBe(false);
    expect(Auditoria.crear).not.toHaveBeenCalled();
  });

  it("un cuerpo que no es objeto (lista) se trata como vacío -> 400 por nombre", async () => {
    const r = await request(app).post(URL).send([1, 2]);
    expect(r.status).toBe(400);
  });
});

describe("Llaves de ingesta - listar", () => {
  it("solo expone prefijo, nombre, estado, vigencia, último uso e IP; jamás la llave ni el hash", async () => {
    const a = await crear({ nombre: "A" });
    await crear({ nombre: "B", ips_permitidas: ["10.0.0.5"] });
    const r = await request(app).get(URL);
    expect(r.status).toBe(200);
    expect(r.body.datos.map((x) => x.nombre)).toEqual(["B", "A"]);
    for (const fila of r.body.datos) {
      expect(fila).toEqual(expect.objectContaining({ prefijo: expect.stringMatching(/^rhk_[0-9a-f]{8}$/), estado: "activa", estado_efectivo: "activa", ips_permitidas: expect.any(Array) }));
      expect(fila).toHaveProperty("ultimo_uso");
      expect(fila).toHaveProperty("vigente_desde");
      expect(fila).toHaveProperty("vigente_hasta");
      expect(fila).not.toHaveProperty("hash_llave");
      expect(fila).not.toHaveProperty("llave");
    }
    expect(JSON.stringify(r.body)).not.toContain(a.body.datos.llave);
    expect(JSON.stringify(r.body)).not.toContain(hashLlave(a.body.datos.llave));
    const consulta = bd.sqls().find((l) => /FROM asistencia_llaves ORDER BY id DESC/.test(l.sql)).sql;
    expect(consulta).not.toMatch(/hash_llave/);
  });
});

describe("Llaves de ingesta - rotar", () => {
  it("crea la llave nueva (con los mismos datos) y fija la vigencia de la anterior: solape de 24 h por omisión", async () => {
    const original = await crear({ nombre: "BioTime", ips_permitidas: ["10.0.0.5"] });
    const r = await request(app).post(`${URL}/1/rotar`).send({});
    expect(r.status).toBe(201);
    expect(r.headers["cache-control"]).toBe("no-store");
    const { llave, anterior, ...nueva } = r.body.datos;
    expect(llave).toMatch(LLAVE);
    expect(llave).not.toBe(original.body.datos.llave);
    expect(nueva).toMatchObject({ id: 2, nombre: "BioTime", ips_permitidas: ["10.0.0.5"], reemplaza_a: 1, estado: "activa" });
    expect(anterior).toEqual({ id: 1, prefijo: original.body.datos.prefijo, vigente_hasta: `en ${24 * 3600} s` });
    expect(tienda).toHaveLength(2);
    expect(tienda[1].hash_llave).toBe(hashLlave(llave));
    const acotar = bd.sqls().find((l) => /SET vigente_hasta = LEAST/.test(l.sql));
    expect(acotar.params).toEqual([1, 24 * 3600]);
    expect(acotar.sql).toMatch(/LEAST\(COALESCE\(vigente_hasta, 'infinity'::timestamptz\)/); // nunca amplía un vencimiento más corto
  });

  it("solape configurable (horas) y 0 = la anterior termina ya", async () => {
    await crear();
    await request(app).post(`${URL}/1/rotar`).send({ solape_horas: 48 });
    expect(bd.sqls().filter((l) => /SET vigente_hasta = LEAST/.test(l.sql)).pop().params).toEqual([1, 48 * 3600]);
    await request(app).post(`${URL}/2/rotar`).send({ solape_horas: 0 });
    expect(bd.sqls().filter((l) => /SET vigente_hasta = LEAST/.test(l.sql)).pop().params).toEqual([2, 0]);
    await request(app).post(`${URL}/3/rotar`).send({ solape_horas: 0.5 });
    expect(bd.sqls().filter((l) => /SET vigente_hasta = LEAST/.test(l.sql)).pop().params).toEqual([3, 1800]);
  });

  it("puede renombrar y cambiar las IP de la llave nueva sin tocar las de la anterior", async () => {
    await crear({ nombre: "Vieja", ips_permitidas: ["10.0.0.5"] });
    const r = await request(app).post(`${URL}/1/rotar`).send({ nombre: "Nueva", ips_permitidas: ["10.0.0.6"] });
    expect(r.status).toBe(201);
    expect(tienda[1]).toMatchObject({ nombre: "Nueva", ips_permitidas: ["10.0.0.6"] });
    expect(tienda[0]).toMatchObject({ nombre: "Vieja", ips_permitidas: ["10.0.0.5"] });
  });

  it("la lectura de la anterior se bloquea (FOR UPDATE) y todo va en una transacción", async () => {
    await crear();
    bd.reiniciar();
    instalarBD();
    bd.estado.permisos = { Ingesta: ["consulta", "edicion"] };
    await request(app).post(`${URL}/1/rotar`).send({});
    const sqls = bd.sqls().map((l) => l.sql.replace(/\s+/g, " "));
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.find((s) => /FROM asistencia_llaves WHERE id = \$1/.test(s))).toMatch(/FOR UPDATE$/);
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
  });

  it("404 si no existe; 409 si está revocada o vencida (solo se rota una llave activa y vigente)", async () => {
    expect((await request(app).post(`${URL}/99/rotar`).send({})).status).toBe(404);
    await crear();
    await crear();
    await request(app).post(`${URL}/1/revocar`).send({});
    expect((await request(app).post(`${URL}/1/rotar`).send({})).status).toBe(409);
    tienda[1].vence_pasado = true;
    expect((await request(app).post(`${URL}/2/rotar`).send({})).status).toBe(409);
    expect(tienda).toHaveLength(2); // no se creó ninguna llave
  });

  it.each([
    ["solape negativo", { solape_horas: -1 }],
    ["solape mayor al máximo", { solape_horas: 721 }],
    ["solape texto", { solape_horas: "24" }],
    ["solape infinito", { solape_horas: null }],
    ["nombre vacío", { nombre: " " }],
    ["ips inválidas", { ips_permitidas: ["x"] }],
  ])("400: %s (sin crear nada)", async (_n, cuerpo) => {
    await crear();
    const antes = tienda.length;
    const r = await request(app).post(`${URL}/1/rotar`).send(cuerpo);
    expect(r.status).toBe(400);
    expect(tienda).toHaveLength(antes);
  });

  it("id inválido -> 400", async () => {
    for (const id of ["0", "abc", "-1", "1.5", "99999999999"]) {
      expect((await request(app).post(`${URL}/${id}/rotar`).send({})).status).toBe(400);
    }
  });

  it("si algo falla a mitad, ROLLBACK y 500 genérico", async () => {
    await crear();
    bd.estado.reglas.unshift({ re: /SET vigente_hasta = LEAST/, respuesta: () => { throw new Error('relation "x" does not exist'); } });
    const r = await request(app).post(`${URL}/1/rotar`).send({});
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ exito: false, mensaje: "Error al rotar la llave" });
    expect(bd.sqls().some((l) => /^ROLLBACK$/.test(l.sql))).toBe(true);
    expect(Auditoria.crear).toHaveBeenCalledTimes(1); // solo el alta inicial
  });
});

describe("Llaves de ingesta - revocar y editar IP", () => {
  it("revoca al instante, registra quién y cuándo; una segunda vez -> 409; inexistente -> 404", async () => {
    await crear();
    const r = await request(app).post(`${URL}/1/revocar`).send({});
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ id: 1, estado: "revocada", revocada_por: 5, estado_efectivo: "revocada" });
    expect(r.body.datos).not.toHaveProperty("hash_llave");
    expect((await request(app).post(`${URL}/1/revocar`).send({})).status).toBe(409);
    expect((await request(app).post(`${URL}/99/revocar`).send({})).status).toBe(404);
    expect((await request(app).post(`${URL}/x/revocar`).send({})).status).toBe(400);
  });

  it("la revocación es un UPDATE directo a la BD (sin caché: el middleware consulta la fila en cada petición)", async () => {
    await crear();
    await request(app).post(`${URL}/1/revocar`).send({});
    const upd = bd.sqls().find((l) => /SET estado = 'revocada'/.test(l.sql));
    expect(upd.sql).toMatch(/fecha_revocacion = NOW\(\)/);
    expect(upd.sql).toMatch(/WHERE id = \$1 AND estado = 'activa'/);
  });

  it("edita las IP permitidas (vacía = sin restricción) y valida el formato", async () => {
    await crear({ nombre: "x", ips_permitidas: ["10.0.0.5"] });
    let r = await request(app).put(`${URL}/1/ips`).send({ ips_permitidas: ["10.0.0.0/24", "2001:db8::/32"] });
    expect(r.status).toBe(200);
    expect(r.body.datos.ips_permitidas).toEqual(["10.0.0.0/24", "2001:db8::/32"]);
    r = await request(app).put(`${URL}/1/ips`).send({ ips_permitidas: [] });
    expect(r.status).toBe(200);
    expect(tienda[0].ips_permitidas).toEqual([]);
    for (const malo of [undefined, "10.0.0.1", ["10.0.0.1/33"], ["10.0.0.0/0"], [5], ["a", "b"]]) {
      expect((await request(app).put(`${URL}/1/ips`).send({ ips_permitidas: malo })).status).toBe(400);
    }
    expect(tienda[0].ips_permitidas).toEqual([]);
  });

  it("editar IP: 404 si no existe y 409 si la llave está revocada", async () => {
    expect((await request(app).put(`${URL}/9/ips`).send({ ips_permitidas: [] })).status).toBe(404);
    await crear();
    await request(app).post(`${URL}/1/revocar`).send({});
    expect((await request(app).put(`${URL}/1/ips`).send({ ips_permitidas: [] })).status).toBe(409);
  });

  it("fallo de BD -> 500 genérico", async () => {
    bd.estado.reglas.unshift({ re: /FROM asistencia_llaves WHERE id/, respuesta: () => { throw new Error("password authentication failed"); } });
    for (const [metodo, ruta] of [["post", `${URL}/1/revocar`], ["put", `${URL}/1/ips`]]) {
      const r = await request(app)[metodo](ruta).send({ ips_permitidas: [] });
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toMatch(/password/);
    }
  });
});

describe("Llaves de ingesta - auditoría y secreto", () => {
  it("audita crear, rotar, revocar y editar IP con el usuario, sin la llave ni el hash", async () => {
    const c = await crear({ nombre: "A" });
    const rot = await request(app).post(`${URL}/1/rotar`).send({ solape_horas: 12 });
    await request(app).put(`${URL}/2/ips`).send({ ips_permitidas: ["10.0.0.9"] });
    await request(app).post(`${URL}/1/revocar`).send({});
    const acciones = Auditoria.crear.mock.calls.map(([d]) => [d.accion, d.registro_id, d.usuario_id, d.modulo, d.tabla]);
    expect(acciones).toEqual([
      ["CREAR_LLAVE", "1", 5, "rh", "asistencia_llaves"],
      ["ROTAR_LLAVE", "2", 5, "rh", "asistencia_llaves"],
      ["EDITAR_IPS_LLAVE", "2", 5, "rh", "asistencia_llaves"],
      ["REVOCAR_LLAVE", "1", 5, "rh", "asistencia_llaves"],
    ]);
    const auditado = JSON.stringify(Auditoria.crear.mock.calls);
    for (const secreto of [c.body.datos.llave, rot.body.datos.llave, hashLlave(c.body.datos.llave), hashLlave(rot.body.datos.llave)]) {
      expect(auditado).not.toContain(secreto);
      expect(auditado).not.toContain(secreto.slice(13));
    }
    expect(auditado).not.toContain("hash_llave");
    // lo que SÍ se audita: identificación y vigencia
    const rotada = Auditoria.crear.mock.calls[1][0];
    expect(rotada.valores_nuevos).toMatchObject({ solape_horas: 12, nueva: { id: 2, prefijo: rot.body.datos.prefijo } });
    expect(rotada.valores_previos).toMatchObject({ id: 1, prefijo: c.body.datos.prefijo });
  });

  it("la auditoría guarda la IP que resolvió Express recortada a 45: una X-Forwarded-For larga no la pierde ni la falsea", async () => {
    await request(app).post(URL).set("X-Forwarded-For", "1.1.1.1, ".repeat(20)).set("User-Agent", "pruebas/1.0").send({ nombre: "A" });
    const datos = Auditoria.crear.mock.calls[0][0];
    expect(datos.ip_origen).toBe("127.0.0.1"); // sin trust proxy: la del socket
    expect(datos.ip_origen.length).toBeLessThanOrEqual(45);
    expect(datos.user_agent).toBe("pruebas/1.0");
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("si la auditoría falla, la operación igualmente responde y el log no lleva la llave", async () => {
    Auditoria.crear.mockRejectedValueOnce(new Error("auditoría caída"));
    const r = await crear();
    expect(r.status).toBe(201);
    expect(espiaError).toHaveBeenCalledWith("[Llaves] Error al registrar auditoría:", "auditoría caída");
    expect(JSON.stringify(espiaError.mock.calls)).not.toContain(r.body.datos.llave);
  });

  it("la llave en claro solo aparece en la respuesta de crear/rotar: ni en el listado posterior, ni en logs, ni en los parámetros de la BD", async () => {
    const c = await crear({ nombre: "A" });
    const rot = await request(app).post(`${URL}/1/rotar`).send({});
    const posteriores = [await request(app).get(URL), await request(app).post(`${URL}/1/revocar`).send({}), await request(app).put(`${URL}/2/ips`).send({ ips_permitidas: [] }), await request(app).get("/api/asistencia/lotes")];
    for (const llave of [c.body.datos.llave, rot.body.datos.llave]) {
      expect(JSON.stringify(posteriores.map((r) => r.body))).not.toContain(llave);
      expect(JSON.stringify([espiaError.mock.calls, espiaLog.mock.calls])).not.toContain(llave);
      expect(JSON.stringify(bd.estado.llamadas.map((l) => l.params))).not.toContain(llave);
    }
  });
});

describe("Lotes y re-vinculación de marcas", () => {
  it("GET /lotes devuelve los últimos lotes; limite validado (1..200)", async () => {
    let r = await request(app).get("/api/asistencia/lotes");
    expect(r.status).toBe(200);
    expect(bd.sqls().find((l) => /asistencia_sync_lotes l LEFT JOIN/.test(l.sql)).params).toEqual([50, null]);
    r = await request(app).get("/api/asistencia/lotes?limite=10");
    expect(bd.sqls().filter((l) => /asistencia_sync_lotes l LEFT JOIN/.test(l.sql)).pop().params[0]).toBe(10);
    for (const malo of ["0", "201", "abc", "-1", "1.5"]) {
      expect((await request(app).get(`/api/asistencia/lotes?limite=${malo}`)).status).toBe(400);
    }
  });

  it("POST /marcas/revincular devuelve vinculadas y pendientes y audita solo si vinculó algo", async () => {
    const r = await request(app).post("/api/asistencia/marcas/revincular").send({});
    expect(r.status).toBe(200);
    expect(r.body.datos).toEqual({ vinculadas: 2, pendientes: 7 });
    const vincular = bd.sqls().find((l) => /WITH unicos AS/.test(l.sql));
    expect(vincular.params).toEqual([5000]);
    // solo huérfanas, solo numero_nomina con UNA coincidencia, por lotes y sin esperar filas bloqueadas
    expect(vincular.sql).toMatch(/GROUP BY numero_nomina HAVING COUNT\(\*\) = 1/);
    expect(vincular.sql).toMatch(/WHERE m\.empleado_id IS NULL/);
    expect(vincular.sql).toMatch(/JOIN unicos u ON u\.numero_nomina = m\.codigo_empleado/);
    expect(vincular.sql).toMatch(/ORDER BY m\.id LIMIT \$1\s+FOR UPDATE OF m SKIP LOCKED/);
    expect(vincular.sql).toMatch(/SET empleado_id = c\.empleado_id/);
    expect(vincular.sql).not.toMatch(/SET (?!empleado_id)\w+ =/); // la marca original no se toca
    expect(Auditoria.crear.mock.calls[0][0]).toMatchObject({ accion: "REVINCULAR_MARCAS", tabla: "asistencia_marcas" });

    Auditoria.crear.mockClear();
    bd.estado.reglas.unshift({ re: /WITH unicos AS/, respuesta: { rows: [], rowCount: 0 } });
    await request(app).post("/api/asistencia/marcas/revincular").send({ limite: 10 });
    expect(Auditoria.crear).not.toHaveBeenCalled();
  });

  it("revincular valida el límite (1..50000) y no hay 500 con texto SQL", async () => {
    for (const malo of [0, 50001, "x", -5, 1.5]) {
      expect((await request(app).post("/api/asistencia/marcas/revincular").send({ limite: malo })).status).toBe(400);
    }
    bd.estado.reglas.unshift({ re: /WITH unicos AS/, respuesta: () => { throw new Error('deadlock detected: SELECT * FROM asistencia_marcas'); } });
    const r = await request(app).post("/api/asistencia/marcas/revincular").send({});
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/deadlock|SELECT/);
  });
});
