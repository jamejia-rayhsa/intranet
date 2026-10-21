const request = require("supertest");
const express = require("express");

jest.mock("../../../portal/backend/config/database", () => {
  const { crearEscenario } = require("./fakeIngesta");
  const esc = crearEscenario();
  return { grupo: esc.bd.grupo, __esc: esc };
});
jest.mock("../services/rechazosIngesta.service", () => ({
  registrarRechazo: jest.fn(),
  crearRegistradorRechazos: jest.fn(),
}));

const { __esc: esc } = require("../../../portal/backend/config/database");
const { registrarRechazo } = require("../services/rechazosIngesta.service");
const { generarLlave } = require("../utils/llaveIngesta");
const router = require("../routes/ingesta.routes");

const { bd } = esc;
const MARCAS = "/api/asistencia/ingesta/marcas";
const ESTADO = "/api/asistencia/ingesta/estado";

// Igual que app.js: la ingesta va ANTES del parser global de 100 kb
function crearApp(trustProxy) {
  const app = express();
  if (trustProxy !== undefined) app.set("trust proxy", trustProxy);
  app.use("/api/asistencia/ingesta", router);
  app.use(express.json());
  app.use((req, res) => res.status(418).json({ exito: false, mensaje: "llegó al resto de la app" }));
  return app;
}
const app = crearApp();

let contadorLlave = 100;
const marca = (id, extra = {}) => ({
  id_externo: String(id),
  codigo_empleado: "1",
  marca_ts: "2026-01-15T14:00:00Z",
  ...extra,
});
const enviar = (cuerpo, { llave = esc.llave, aplicacion = app, encabezados = {} } = {}) =>
  request(aplicacion)
    .post(MARCAS)
    .set("X-Api-Key", llave)
    .set(encabezados)
    .send(cuerpo);
const lotes = () => bd.sqls().filter((l) => /INSERT INTO asistencia_marcas/.test(l.sql));
let espiaError;
let espiaLog;
let espiaWarn;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  esc.reiniciar();
  router.limitador.reiniciar();
  esc.fila = { ...esc.fila, id: ++contadorLlave, estado: "activa", ips_permitidas: [], vigente_ahora: true, origen: "biotime" };
  esc.filas = null;
  esc.empleados = [];
  esc.existentes = new Set();
  esc.guardadas = [];
  esc.cursor = "1000622";
  esc.estado = null;
  esc.totalMarcas = 0;
  esc.falla = null;
  espiaError = jest.spyOn(console, "error").mockImplementation(() => {});
  espiaLog = jest.spyOn(console, "log").mockImplementation(() => {});
  espiaWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("Ingesta - autenticación por llave", () => {
  const RECHAZO_GENERICO_401 = { exito: false, mensaje: "Llave de acceso no válida" };
  const RECHAZO_GENERICO_403 = { exito: false, mensaje: "Acceso denegado" };

  it("sin X-Api-Key -> 401 genérico, auditado como sin_llave y sin consultar la BD", async () => {
    const r = await request(app).post(MARCAS).send({ marcas: [marca(1)] });
    expect(r.status).toBe(401);
    expect(r.body).toEqual(RECHAZO_GENERICO_401);
    expect(registrarRechazo).toHaveBeenCalledWith(expect.objectContaining({ motivo: "sin_llave" }));
    expect(bd.sqls()).toHaveLength(0);
  });

  it.each([
    ["vacía", ""],
    ["demasiado corta", "rhk_12345678_abc"],
    ["sin prefijo rhk_", `xyz_${"a".repeat(8)}_${"B".repeat(43)}`],
    ["prefijo no hexadecimal", `rhk_zzzzzzzz_${"B".repeat(43)}`],
    ["secreto con caracteres inválidos", `rhk_0123abcd_${"B".repeat(42)}!`],
    ["con un espacio en medio", `rhk_0123abcd_${"B".repeat(20)} ${"B".repeat(22)}`],
  ])("llave mal formada (%s) -> 401 sin consultar la BD", async (_nombre, llave) => {
    const r = await request(app).post(MARCAS).set("X-Api-Key", llave).send({ marcas: [marca(1)] });
    expect(r.status).toBe(401);
    expect(r.body).toEqual(RECHAZO_GENERICO_401);
    if (llave !== "") expect(registrarRechazo).toHaveBeenCalledWith(expect.objectContaining({ motivo: "llave_malformada" }));
    expect(bd.sqls()).toHaveLength(0);
  });

  it("no acepta la llave en Authorization: Bearer (solo X-Api-Key)", async () => {
    const r = await request(app).post(MARCAS).set("Authorization", `Bearer ${esc.llave}`).send({ marcas: [marca(1)] });
    expect(r.status).toBe(401);
    expect(registrarRechazo).toHaveBeenCalledWith(expect.objectContaining({ motivo: "sin_llave" }));
  });

  it("prefijo inexistente y hash incorrecto responden EXACTAMENTE lo mismo (no se sabe cuál falló)", async () => {
    const ajena = generarLlave();
    const desconocida = await enviar({ marcas: [marca(1)] }, { llave: ajena.llave });
    const otroSecreto = `${esc.prefijo}_${"A".repeat(43)}`;
    const incorrecta = await enviar({ marcas: [marca(1)] }, { llave: otroSecreto });
    expect(desconocida.status).toBe(401);
    expect(incorrecta.status).toBe(401);
    expect(desconocida.body).toEqual(RECHAZO_GENERICO_401);
    expect(incorrecta.body).toEqual(desconocida.body);
    expect(registrarRechazo).toHaveBeenCalledWith(expect.objectContaining({ motivo: "llave_desconocida" }));
    expect(registrarRechazo).toHaveBeenCalledWith(expect.objectContaining({ motivo: "llave_incorrecta" }));
    expect(esc.guardadas).toHaveLength(0);
  });

  it("llave revocada -> 403 genérico (mismo cuerpo que IP no permitida) y no guarda nada", async () => {
    esc.fila.estado = "revocada";
    const r = await enviar({ marcas: [marca(1)] });
    expect(r.status).toBe(403);
    expect(r.body).toEqual(RECHAZO_GENERICO_403);
    expect(registrarRechazo).toHaveBeenCalledWith(expect.objectContaining({ motivo: "llave_revocada", llaveId: esc.fila.id }));
    expect(bd.hubo(/INSERT INTO asistencia_marcas|BEGIN/)).toBe(false);
  });

  it("llave vencida o aún no vigente (vigente_ahora=false) -> 403", async () => {
    esc.fila.vigente_ahora = false;
    const r = await enviar({ marcas: [marca(1)] });
    expect(r.status).toBe(403);
    expect(r.body).toEqual(RECHAZO_GENERICO_403);
    expect(registrarRechazo).toHaveBeenCalledWith(expect.objectContaining({ motivo: "llave_fuera_de_vigencia" }));
  });

  it("la vigencia se evalúa con el reloj de la BD (la consulta usa NOW() sobre desde y hasta)", async () => {
    await enviar({ marcas: [marca(1)] });
    const consulta = bd.sqls().find((l) => /FROM asistencia_llaves WHERE prefijo/.test(l.sql)).sql;
    expect(consulta).toMatch(/vigente_desde <= NOW\(\) AND \(vigente_hasta IS NULL OR vigente_hasta > NOW\(\)\)/);
  });

  it("IP fuera de la lista -> 403; dentro (IP y CIDR) -> 200; lista vacía -> cualquiera", async () => {
    esc.fila.ips_permitidas = ["10.99.99.99"];
    let r = await enviar({ marcas: [marca(1)] });
    expect(r.status).toBe(403);
    expect(r.body).toEqual(RECHAZO_GENERICO_403);
    expect(registrarRechazo).toHaveBeenCalledWith(expect.objectContaining({ motivo: "ip_no_permitida" }));

    esc.fila.ips_permitidas = ["10.99.99.99", "127.0.0.0/8"];
    r = await enviar({ marcas: [marca(1)] });
    expect(r.status).toBe(200);

    esc.fila.ips_permitidas = [];
    r = await enviar({ marcas: [marca(2)] });
    expect(r.status).toBe(200);
  });

  it("sin TRUST_PROXY, X-Forwarded-For se IGNORA (no sirve para falsear la IP)", async () => {
    esc.fila.ips_permitidas = ["10.99.99.99"];
    const r = await enviar({ marcas: [marca(1)] }, { encabezados: { "X-Forwarded-For": "10.99.99.99" } });
    expect(r.status).toBe(403);
    expect(registrarRechazo).toHaveBeenCalledWith(expect.objectContaining({ motivo: "ip_no_permitida", ip: "127.0.0.1" }));
  });

  it("con un proxy de confianza se usa la IP que ese proxy añadió; lo que escribe el cliente a la izquierda no cuenta", async () => {
    const detras = crearApp(1);
    esc.fila.ips_permitidas = ["10.99.99.99"];
    // el cliente envía "10.99.99.99" por delante; el proxy añade la IP real (8.8.8.8) al final
    let r = await enviar({ marcas: [marca(1)] }, { aplicacion: detras, encabezados: { "X-Forwarded-For": "10.99.99.99, 8.8.8.8" } });
    expect(r.status).toBe(403);
    expect(registrarRechazo).toHaveBeenLastCalledWith(expect.objectContaining({ ip: "8.8.8.8" }));
    // la IP real que añade el proxy sí está en la lista
    r = await enviar({ marcas: [marca(1)] }, { aplicacion: detras, encabezados: { "X-Forwarded-For": "10.99.99.99" } });
    expect(r.status).toBe(200);
  });

  it("solape de rotación: la llave anterior y la nueva valen a la vez; al vencer la anterior solo vale la nueva", async () => {
    const nueva = generarLlave();
    const anterior = { ...esc.fila };
    const filaNueva = { ...anterior, id: anterior.id + 1000, prefijo: nueva.prefijo, hash_llave: nueva.hash };
    esc.filas = [anterior, filaNueva];
    expect((await enviar({ marcas: [marca(1)] })).status).toBe(200);
    expect((await enviar({ marcas: [marca(2)] }, { llave: nueva.llave })).status).toBe(200);
    anterior.vigente_ahora = false; // venció el solape
    expect((await enviar({ marcas: [marca(3)] })).status).toBe(403);
    expect((await enviar({ marcas: [marca(3)] }, { llave: nueva.llave })).status).toBe(200);
  });

  it("actualiza ultimo_uso (con la IP) sin esperar a la BD: aunque el UPDATE nunca termine, la respuesta llega", async () => {
    bd.cuando(/UPDATE asistencia_llaves SET ultimo_uso/, () => new Promise(() => {}));
    esc.fila.id = ++contadorLlave;
    const r = await enviar({ marcas: [marca(1)] });
    expect(r.status).toBe(200);
    const upd = bd.sqls().find((l) => /UPDATE asistencia_llaves SET ultimo_uso/.test(l.sql));
    expect(upd.params).toEqual([esc.fila.id, "127.0.0.1"]);
  });

  it("si el UPDATE de ultimo_uso falla, la petición sigue (200) y el log no lleva la llave", async () => {
    esc.fila.id = ++contadorLlave;
    esc.falla = { re: /UPDATE asistencia_llaves SET ultimo_uso/, error: new Error("fallo del UPDATE") };
    const r = await enviar({ marcas: [marca(1)] });
    expect(r.status).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(espiaError).toHaveBeenCalledWith("[Ingesta] No se pudo actualizar ultimo_uso:", "fallo del UPDATE");
  });

  it("ultimo_uso se actualiza a lo más una vez cada 30 s por llave", async () => {
    esc.fila.id = ++contadorLlave;
    await enviar({ marcas: [marca(1)] });
    await enviar({ marcas: [marca(2)] });
    await enviar({ marcas: [marca(3)] });
    expect(bd.sqls().filter((l) => /UPDATE asistencia_llaves SET ultimo_uso/.test(l.sql))).toHaveLength(1);
  });

  it("un rechazo no actualiza ultimo_uso", async () => {
    esc.fila.estado = "revocada";
    await enviar({ marcas: [marca(1)] });
    expect(bd.hubo(/UPDATE asistencia_llaves SET ultimo_uso/)).toBe(false);
  });

  it("si la BD falla al buscar la llave -> 500 genérico sin texto SQL", async () => {
    esc.falla = { re: /FROM asistencia_llaves WHERE prefijo/, error: new Error('relation "asistencia_llaves" does not exist: SELECT hash_llave') };
    const r = await enviar({ marcas: [marca(1)] });
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ exito: false, mensaje: "Error interno del servidor" });
    expect(JSON.stringify(r.body)).not.toMatch(/relation|SELECT|hash_llave/);
  });

  it("si auditar el rechazo lanza, igualmente responde 401", async () => {
    registrarRechazo.mockImplementationOnce(() => {
      throw new Error("auditoría caída");
    });
    const r = await request(app).post(MARCAS).send({ marcas: [marca(1)] });
    expect(r.status).toBe(401);
  });

  it("la llave solo sirve para estas dos rutas: otra ruta de la ingesta o método -> 404; no se evalúa fuera del montaje", async () => {
    expect((await request(app).get("/api/asistencia/ingesta/otra").set("X-Api-Key", esc.llave)).status).toBe(404);
    expect((await request(app).delete(MARCAS).set("X-Api-Key", esc.llave)).status).toBe(404);
    expect((await request(app).get(MARCAS).set("X-Api-Key", esc.llave)).status).toBe(404);
    // una ruta fuera del montaje (el resto de la app) no ve req.llave
    const fuera = await request(app).get("/api/asistencia/turnos").set("X-Api-Key", esc.llave);
    expect(fuera.status).toBe(418);
  });
});

describe("Ingesta - límites del envío", () => {
  it("más de 500 marcas -> 400; exactamente 500 -> 200", async () => {
    const quinientas = Array.from({ length: 500 }, (_, i) => marca(2000 + i));
    const ok = await enviar({ marcas: quinientas });
    expect(ok.status).toBe(200);
    expect(ok.body.datos.recibidas).toBe(500);
    router.limitador.reiniciar();
    const demasiadas = await enviar({ marcas: [...quinientas, marca(9999)] });
    expect(demasiadas.status).toBe(400);
    expect(demasiadas.body.mensaje).toMatch(/500/);
  });

  it.each([
    ["marcas vacía", { marcas: [] }],
    ["marcas ausente", { origen: "biotime" }],
    ["marcas no es lista", { marcas: { a: 1 } }],
    ["marcas es texto", { marcas: "x" }],
    ["el cuerpo es una lista", []],
    ["el cuerpo es un número", 5],
  ])("%s -> 400 sin tocar la BD", async (_nombre, cuerpo) => {
    const r = await request(app).post(MARCAS).set("X-Api-Key", esc.llave).set("Content-Type", "application/json").send(JSON.stringify(cuerpo));
    expect(r.status).toBe(400);
    expect(r.body.exito).toBe(false);
    expect(bd.hubo(/INSERT INTO asistencia_sync_lotes|BEGIN/)).toBe(false);
  });

  it("cuerpo de más de 100 kb (límite del parser global) pero menos de 1 MB -> 200: el parser global no lo corta", async () => {
    const relleno = "x".repeat(1500);
    const marcas = Array.from({ length: 200 }, (_, i) => marca(3000 + i, { crudo: { nota: relleno.slice(0, 1000) } }));
    const cuerpo = JSON.stringify({ marcas });
    expect(Buffer.byteLength(cuerpo)).toBeGreaterThan(200 * 1024);
    const r = await request(app).post(MARCAS).set("X-Api-Key", esc.llave).set("Content-Type", "application/json").send(cuerpo);
    expect(r.status).toBe(200);
    expect(r.body.datos.insertadas).toBe(200);
  });

  it("cuerpo de más de 1 MB -> 413 sin guardar nada ni crear lote", async () => {
    const enorme = JSON.stringify({ marcas: [marca(1, { crudo: { nota: "y".repeat(1100 * 1024) } })] });
    // El servidor responde 413 sin leer todo el cuerpo: el cliente puede ver EPIPE/ECONNRESET según la carga de
    // la máquina (no es un fallo de la ingesta); se reintenta hasta 5 veces solo ante esos errores de socket.
    let r;
    for (let intento = 0; intento < 5 && !r; intento += 1) {
      try {
        r = await request(app).post(MARCAS).set("X-Api-Key", esc.llave).set("Content-Type", "application/json").send(enorme);
      } catch (error) {
        if (!["EPIPE", "ECONNRESET"].includes(error.code)) throw error;
        router.limitador.reiniciar();
      }
    }
    expect(r.status).toBe(413);
    expect(r.body.exito).toBe(false);
    expect(bd.hubo(/INSERT INTO asistencia_sync_lotes|BEGIN/)).toBe(false);
  });

  it("JSON inválido -> 400 'JSON inválido' y el texto recibido no vuelve en la respuesta", async () => {
    const r = await request(app).post(MARCAS).set("X-Api-Key", esc.llave).set("Content-Type", "application/json").send('{"marcas": [SECRETO');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ exito: false, mensaje: "JSON inválido" });
  });

  it("Content-Type que no es JSON -> 400 (el cuerpo no se interpreta)", async () => {
    const r = await request(app).post(MARCAS).set("X-Api-Key", esc.llave).set("Content-Type", "text/plain").send("hola");
    expect(r.status).toBe(400);
  });

  it("charset no admitido -> 415 genérico", async () => {
    const r = await request(app).post(MARCAS).set("X-Api-Key", esc.llave).set("Content-Type", "application/json; charset=latin1").send("{}");
    expect(r.status).toBe(415);
    expect(r.body.exito).toBe(false);
  });

  it("origen distinto al de la llave -> 400; ausente o null -> el de la llave", async () => {
    for (const origen of ["otro", "BioTime", "", 5, ["biotime"]]) {
      const r = await enviar({ origen, marcas: [marca(1)] });
      expect(r.status).toBe(400);
      expect(r.body.mensaje).toMatch(/origen/);
    }
    expect((await enviar({ marcas: [marca(1)] })).status).toBe(200);
    expect((await enviar({ origen: null, marcas: [marca(2)] })).status).toBe(200);
    expect((await enviar({ origen: "biotime", marcas: [marca(3)] })).status).toBe(200);
  });

  it("los campos que llena el servidor (id, lote_id, empleado_id, fecha_importacion) se ignoran si vienen", async () => {
    esc.empleados = [{ numero_nomina: "1", id: 11, coincidencias: 1 }];
    const r = await enviar({ marcas: [marca(1, { id: 5, lote_id: 9, empleado_id: 999, fecha_importacion: "2020-01-01T00:00:00Z" })] });
    expect(r.status).toBe(200);
    expect(esc.guardadas[0]).toMatchObject({ loteId: 812, empleado_id: 11 });
    const sql = lotes()[0].sql;
    expect(sql).toMatch(/\$2\s*FROM unnest/);
  });
});

describe("Ingesta - rate limit (60 envíos por minuto por llave)", () => {
  it("el envío 61 en un minuto -> 429 con Retry-After; otra llave no se ve afectada", async () => {
    for (let i = 0; i < 60; i += 1) {
      const r = await enviar({ marcas: [marca(5000 + i)] });
      expect(r.status).toBe(200);
    }
    const bloqueado = await enviar({ marcas: [marca(6000)] });
    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(Number(bloqueado.headers["retry-after"])).toBeLessThanOrEqual(60);
    expect(bloqueado.body.exito).toBe(false);
    expect(esc.existentes.has("6000")).toBe(false); // no se procesó

    const nueva = generarLlave();
    esc.filas = [esc.fila, { ...esc.fila, id: esc.fila.id + 1000, prefijo: nueva.prefijo, hash_llave: nueva.hash }];
    expect((await enviar({ marcas: [marca(6001)] }, { llave: nueva.llave })).status).toBe(200);
  });

  it("pasado el minuto vuelve a aceptar; las consultas de estado tienen su propio contador", async () => {
    const reloj = jest.spyOn(Date, "now");
    const t0 = 1_800_000_000_000;
    reloj.mockReturnValue(t0);
    for (let i = 0; i < 60; i += 1) await enviar({ marcas: [marca(7000 + i)] });
    expect((await enviar({ marcas: [marca(7100)] })).status).toBe(429);
    expect((await request(app).get(ESTADO).set("X-Api-Key", esc.llave)).status).toBe(200);
    reloj.mockReturnValue(t0 + 61_000);
    expect((await enviar({ marcas: [marca(7100)] })).status).toBe(200);
  });

  it("un rechazo por llave inválida no consume el cupo de la llave real", async () => {
    for (let i = 0; i < 70; i += 1) await request(app).post(MARCAS).set("X-Api-Key", `${esc.prefijo}_${"Z".repeat(43)}`).send({});
    expect((await enviar({ marcas: [marca(1)] })).status).toBe(200);
  });
});

describe("Ingesta - envío válido, éxito parcial e idempotencia", () => {
  it("respuesta con la forma del contrato v1", async () => {
    esc.empleados = [{ numero_nomina: "1", id: 11, coincidencias: 1 }];
    const r = await enviar({ origen: "biotime", marcas: [marca(1000123, { subida_ts: "2026-01-15T14:00:02Z" }), marca(1000124, { codigo_empleado: "999" })] });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      exito: true,
      datos: {
        lote_id: 812,
        recibidas: 2,
        insertadas: 2,
        duplicadas: 0,
        rechazadas: 0,
        sin_empleado: 1,
        ultimo_id_externo: "1000622",
        rechazos: [],
      },
    });
  });

  it("éxito parcial: lo válido se guarda y lo inválido va a rechazos con índice, id_externo y motivo", async () => {
    const r = await enviar({
      marcas: [marca(10), marca(11, { marca_ts: "2026-01-15T14:00:00" }), marca(12), { codigo_empleado: "1", marca_ts: "2026-01-15T14:00:00Z" }, "no soy objeto"],
    });
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ recibidas: 5, insertadas: 2, duplicadas: 0, rechazadas: 3 });
    expect(r.body.datos.rechazos).toEqual([
      { indice: 1, id_externo: "11", motivo: "marca_ts sin zona horaria" },
      { indice: 3, id_externo: null, motivo: "id_externo es obligatorio" },
      { indice: 4, id_externo: null, motivo: "la marca no es un objeto" },
    ]);
    expect([...esc.existentes].sort()).toEqual(["10", "12"]);
    expect(r.body.datos.insertadas + r.body.datos.duplicadas + r.body.datos.rechazadas).toBe(r.body.datos.recibidas);
  });

  it("rechazos: máximo 50 en la lista, pero rechazadas cuenta todas", async () => {
    const malas = Array.from({ length: 60 }, (_, i) => marca(100 + i, { marca_ts: "mañana" }));
    const r = await enviar({ marcas: [...malas, marca(1)] });
    expect(r.body.datos.rechazadas).toBe(60);
    expect(r.body.datos.rechazos).toHaveLength(50);
    expect(r.body.datos.rechazos[49].indice).toBe(49);
    expect(r.body.datos.insertadas).toBe(1);
  });

  it("todas inválidas: 200 sin INSERT de marcas pero con lote 'ok' y cursor sin cambios de marcas", async () => {
    const r = await enviar({ marcas: [marca(1, { marca_ts: "x" })] });
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ insertadas: 0, rechazadas: 1 });
    expect(bd.hubo(/INSERT INTO asistencia_marcas/)).toBe(false);
    expect(bd.hubo(/UPDATE asistencia_sync_lotes SET estatus = 'ok'/)).toBe(true);
  });

  it("idempotencia: reenviar el mismo envío devuelve todo como duplicadas", async () => {
    const cuerpo = { marcas: [marca(20), marca(21), marca(22)] };
    const primero = await enviar(cuerpo);
    expect(primero.body.datos).toMatchObject({ insertadas: 3, duplicadas: 0 });
    const segundo = await enviar(cuerpo);
    expect(segundo.status).toBe(200);
    expect(segundo.body.datos).toMatchObject({ insertadas: 0, duplicadas: 3, rechazadas: 0 });
    expect(esc.guardadas).toHaveLength(3);
  });

  it("usa INSERT ... ON CONFLICT (origen, id_externo) DO NOTHING en un solo INSERT por lote", async () => {
    await enviar({ marcas: [marca(30), marca(31)] });
    expect(lotes()).toHaveLength(1);
    expect(lotes()[0].sql).toMatch(/ON CONFLICT \(origen, id_externo\) DO NOTHING\s+RETURNING id_externo, empleado_id/);
  });

  it("duplicados dentro del mismo envío: se guarda una y la otra cuenta como duplicada (no como rechazo)", async () => {
    const r = await enviar({ marcas: [marca(40), marca(41), marca(40), marca("00040"), marca(40, { marca_ts: "2026-02-01T10:00:00Z" })] });
    expect(r.body.datos).toMatchObject({ recibidas: 5, insertadas: 2, duplicadas: 3, rechazadas: 0 });
    expect(lotes()[0].params[2]).toEqual(["40", "41"]);
    // la primera aparición gana
    expect(lotes()[0].params[5]).toEqual(["2026-01-15T14:00:00.000Z", "2026-01-15T14:00:00.000Z"]);
  });

  it("una marca válida repetida después de una inválida con el mismo id sí se guarda", async () => {
    const r = await enviar({ marcas: [marca(50, { marca_ts: "mal" }), marca(50)] });
    expect(r.body.datos).toMatchObject({ insertadas: 1, rechazadas: 1, duplicadas: 0 });
  });

  it("inserta siempre en orden ascendente numérico de id_externo (evita interbloqueos entre envíos que se traslapan)", async () => {
    await enviar({ marcas: [marca(100), marca(9), marca(25), marca(1000000), marca(30)] });
    expect(lotes()[0].params[2]).toEqual(["9", "25", "30", "100", "1000000"]);
    expect(lotes()[0].sql).toMatch(/ORDER BY t\.orden/);
  });

  it("guarda los campos opcionales tal cual: cadena vacía se conserva, ausente es NULL, estado y verificación como texto", async () => {
    await enviar({
      marcas: [
        marca(60, { terminal_sn: "", terminal_alias: "", area_externa: "", estado_marca: "0", tipo_verificacion: 0, crudo: { work_code: "0", source: 2 } }),
        marca(61, { estado_marca: 3, tipo_verificacion: 15 }),
        marca(62),
      ],
    });
    const p = lotes()[0].params;
    expect(p[2]).toEqual(["60", "61", "62"]);
    expect(p[7]).toEqual(["0", "3", null]); // estado_marca
    expect(p[8]).toEqual(["0", "15", null]); // tipo_verificacion
    expect(p[9]).toEqual(["", null, null]); // terminal_sn
    expect(p[10]).toEqual(["", null, null]); // terminal_alias
    expect(p[11]).toEqual(["", null, null]); // area_externa
    expect(JSON.parse(p[12][0])).toEqual({ work_code: "0", source: 2 });
    expect(p[12][1]).toBeNull();
  });

  it("la hora se guarda en UTC aunque llegue con desplazamiento", async () => {
    await enviar({ marcas: [marca(70, { marca_ts: "2026-01-15T08:00:00-06:00" })] });
    expect(lotes()[0].params[5]).toEqual(["2026-01-15T14:00:00.000Z"]);
  });
});

describe("Ingesta - vinculación de empleado_id por numero_nomina", () => {
  const vinculos = () => lotes()[0].params[4];

  it("una sola coincidencia -> se vincula; ninguna -> NULL y se cuenta como sin_empleado", async () => {
    esc.empleados = [{ numero_nomina: "1", id: 11, coincidencias: 1 }];
    const r = await enviar({ marcas: [marca(80), marca(81, { codigo_empleado: "2" })] });
    expect(vinculos()).toEqual([11, null]);
    expect(r.body.datos).toMatchObject({ insertadas: 2, sin_empleado: 1 });
  });

  it("varias coincidencias (numero_nomina repetido) -> NULL y sin_empleado: no se adivina", async () => {
    esc.empleados = [{ numero_nomina: "1", id: 11, coincidencias: 2 }];
    const r = await enviar({ marcas: [marca(82)] });
    expect(vinculos()).toEqual([null]);
    expect(r.body.datos.sin_empleado).toBe(1);
  });

  it("comparación de texto exacta: el código '007' NO coincide con el empleado '7' (ni al revés); sin normalizar ceros", async () => {
    esc.empleados = [{ numero_nomina: "7", id: 77, coincidencias: 1 }, { numero_nomina: "0123", id: 123, coincidencias: 1 }];
    const r = await enviar({ marcas: [marca(83, { codigo_empleado: "007" }), marca(84, { codigo_empleado: "123" }), marca(85, { codigo_empleado: "0123" })] });
    expect(vinculos()).toEqual([null, null, 123]);
    expect(r.body.datos.sin_empleado).toBe(2);
    // la consulta de empleados es por igualdad exacta (sin lower/trim/cast sobre la columna)
    const consulta = bd.sqls().find((l) => /FROM empleados WHERE numero_nomina = ANY/.test(l.sql)).sql;
    expect(consulta).toMatch(/WHERE numero_nomina = ANY\(\$1::text\[\]\) GROUP BY numero_nomina/);
    expect(consulta).not.toMatch(/lower|upper|trim|numero_nomina::|cast/i);
  });

  it("el código se recorta de espacios (trim) antes de comparar y de guardar", async () => {
    esc.empleados = [{ numero_nomina: "1", id: 11, coincidencias: 1 }];
    await enviar({ marcas: [marca(86, { codigo_empleado: "  1\t" })] });
    expect(vinculos()).toEqual([11]);
    expect(lotes()[0].params[3]).toEqual(["1"]);
  });

  it("sin_empleado cuenta solo las marcas GUARDADAS (una duplicada sin empleado no se cuenta otra vez)", async () => {
    esc.existentes = new Set(["87"]);
    const r = await enviar({ marcas: [marca(87, { codigo_empleado: "9" }), marca(88, { codigo_empleado: "9" })] });
    expect(r.body.datos).toMatchObject({ insertadas: 1, duplicadas: 1, sin_empleado: 1 });
  });

  it("solo busca empleados cuando hay marcas válidas, y una vez por envío (códigos únicos)", async () => {
    await enviar({ marcas: [marca(90), marca(91), marca(92, { codigo_empleado: "2" })] });
    const consultas = bd.sqls().filter((l) => /FROM empleados WHERE numero_nomina = ANY/.test(l.sql));
    expect(consultas).toHaveLength(1);
    expect(consultas[0].params[0].sort()).toEqual(["1", "2"]);
  });
});

describe("Ingesta - lote, estado y transacción", () => {
  it("registra el lote (llave, ip, hash del cuerpo, conteos) y lo pasa a 'ok' con insertadas/duplicadas/sin_empleado", async () => {
    esc.existentes = new Set(["101"]);
    await enviar({ marcas: [marca(100), marca(101), marca(102, { marca_ts: "x" })] });
    const alta = bd.sqls().find((l) => /INSERT INTO asistencia_sync_lotes/.test(l.sql));
    expect(alta.sql).toMatch(/'en_curso'/);
    expect(alta.params[0]).toBe("biotime");
    expect(alta.params[1]).toBe("127.0.0.1");
    expect(alta.params[2]).toBe(3); // recibidas
    expect(alta.params[3]).toBe(1); // rechazadas
    expect(alta.params[4]).toMatch(/^[0-9a-f]{64}$/);
    expect(alta.params[5]).toBe(esc.fila.id); // llave_id
    expect(alta.sql).toMatch(/VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, 'en_curso'\)/); // llave_id viaja en $6, no en NULL
    const ok = bd.sqls().find((l) => /UPDATE asistencia_sync_lotes SET estatus = 'ok'/.test(l.sql));
    expect(ok.params).toEqual([812, 1, 1, 1]);
  });

  it("el cursor se actualiza con el mayor id, la mayor marca_ts y la mayor subida_ts del envío (GREATEST, atómico)", async () => {
    await enviar({
      marcas: [
        marca(110, { marca_ts: "2026-01-15T10:00:00Z", subida_ts: "2026-01-15T10:00:05Z" }),
        marca(130, { marca_ts: "2026-01-16T10:00:00Z" }),
        marca(120, { marca_ts: "2026-01-14T10:00:00Z", subida_ts: "2026-01-16T10:00:05Z" }),
      ],
    });
    const estado = bd.sqls().find((l) => /INSERT INTO asistencia_sync_estado .*RETURNING ultimo_id_externo/s.test(l.sql));
    expect(estado.params).toEqual(["biotime", "2026-01-16T10:00:00.000Z", "130", "2026-01-16T10:00:05.000Z", 812]);
    expect(estado.sql).toMatch(/GREATEST\(asistencia_sync_estado\.ultimo_id_externo, EXCLUDED\.ultimo_id_externo\)/);
    expect(estado.sql).toMatch(/GREATEST\(asistencia_sync_estado\.ultima_marca_ts, EXCLUDED\.ultima_marca_ts\)/);
    expect(estado.sql).toMatch(/GREATEST\(asistencia_sync_estado\.ultima_subida_ts, EXCLUDED\.ultima_subida_ts\)/);
    expect(estado.sql).toMatch(/ultima_sincronizacion = NOW\(\), ultimo_error = NULL/);
  });

  it("ultimo_id_externo de la respuesta es el que la BD tiene guardado (puede ser mayor que el del envío)", async () => {
    esc.cursor = "5000000";
    const r = await enviar({ marcas: [marca(1)] });
    expect(r.body.datos.ultimo_id_externo).toBe("5000000");
  });

  it("todo en UNA transacción y UN cliente: BEGIN -> lote -> empleados -> marcas -> lote ok -> estado -> COMMIT; sin consultas por el pool", async () => {
    bd.grupo.connect.mockClear();
    await enviar({ marcas: [marca(140)] });
    expect(bd.grupo.connect).toHaveBeenCalledTimes(1);
    const sqls = bd.sqls().map((l) => l.sql.replace(/\s+/g, " "));
    const orden = [/^BEGIN/, /INSERT INTO asistencia_sync_lotes/, /FROM empleados/, /INSERT INTO asistencia_marcas/, /UPDATE asistencia_sync_lotes SET estatus = 'ok'/, /INSERT INTO asistencia_sync_estado/, /^COMMIT/];
    let desde = 0;
    for (const re of orden) {
      const i = sqls.findIndex((s, idx) => idx >= desde && re.test(s));
      expect(i).toBeGreaterThanOrEqual(desde);
      desde = i + 1;
    }
    expect(bd.cliente.release).toHaveBeenCalledTimes(1);
    // las consultas de datos van por el cliente de la transacción, no por el pool (solo la llave usa el pool)
    const porPool = bd.grupo.query.mock.calls.map((c) => c[0]).join(" ");
    expect(porPool).not.toMatch(/asistencia_marcas|asistencia_sync|empleados/);
  });

  it("si algo falla: ROLLBACK, sin COMMIT, lote 'error' con mensaje genérico y ultimo_error; 500 genérico sin SQL", async () => {
    esc.falla = { re: /INSERT INTO asistencia_marcas/, error: Object.assign(new Error('duplicate key value violates unique constraint "x" DETAIL: Key (id_externo)=(555)'), { code: "23505" }) };
    const r = await enviar({ marcas: [marca(150)] });
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ exito: false, mensaje: "Error interno al procesar el envío" });
    expect(JSON.stringify(r.body)).not.toMatch(/duplicate|constraint|DETAIL|555|SELECT|INSERT/);
    const sqls = bd.sqls().map((l) => l.sql.replace(/\s+/g, " "));
    expect(sqls.some((s) => /^ROLLBACK/.test(s))).toBe(true);
    expect(sqls.some((s) => /^COMMIT/.test(s))).toBe(false);
    const idxRollback = sqls.findIndex((s) => /^ROLLBACK/.test(s));
    const fallo = bd.sqls().find((l) => /INSERT INTO asistencia_sync_lotes .*'error'/s.test(l.sql));
    expect(fallo.params[6]).toBe("Error interno al procesar el envío");
    expect(bd.sqls().indexOf(fallo)).toBeGreaterThan(idxRollback);
    const ultimoError = bd.sqls().find((l) => /ultimo_error = EXCLUDED/.test(l.sql));
    expect(ultimoError.params).toEqual(["biotime", "Error interno al procesar el envío"]);
    expect(bd.cliente.release).toHaveBeenCalledTimes(1);
  });

  it("el 500 es genérico también en NODE_ENV=development (nunca error.message)", async () => {
    const previo = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      esc.falla = { re: /FROM empleados/, error: new Error("password authentication failed for user postgres") };
      const r = await enviar({ marcas: [marca(151)] });
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toMatch(/password|postgres|detalle/);
    } finally {
      process.env.NODE_ENV = previo;
    }
  });

  it("si el ROLLBACK también falla, el cliente se libera con ese error (se descarta la conexión)", async () => {
    esc.falla = { re: /INSERT INTO asistencia_marcas|^ROLLBACK/, error: new Error("conexión perdida") };
    const r = await enviar({ marcas: [marca(152)] });
    expect(r.status).toBe(500);
    expect(bd.cliente.release).toHaveBeenCalledTimes(1);
    expect(bd.cliente.release.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("si falla el registro del fallo, igualmente se responde 500 y se libera el cliente", async () => {
    esc.falla = { re: /INSERT INTO asistencia_marcas|INSERT INTO asistencia_sync_lotes .*'error'/s, error: new Error("otra caída") };
    const r = await enviar({ marcas: [marca(153)] });
    expect(r.status).toBe(500);
    expect(bd.cliente.release).toHaveBeenCalledTimes(1);
  });

  it("si el COMMIT falla -> 500 genérico", async () => {
    esc.falla = { re: /^COMMIT/, error: new Error("could not serialize") };
    const r = await enviar({ marcas: [marca(154)] });
    expect(r.status).toBe(500);
    expect(r.body.mensaje).toBe("Error interno al procesar el envío");
  });
});

describe("Ingesta - errores imprevistos del router", () => {
  const manejador = router.stack[router.stack.length - 1].handle;
  const respuesta = () => {
    const res = { estado: null, cuerpo: null };
    res.status = (n) => {
      res.estado = n;
      return res;
    };
    res.json = (c) => {
      res.cuerpo = c;
      return res;
    };
    return res;
  };

  it("un error no previsto responde 500 genérico, sin message ni detalle, ni en development", () => {
    const previo = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const res = respuesta();
      manejador(new Error("password=SECRETO en SELECT * FROM x"), {}, res, () => {});
      expect(res.estado).toBe(500);
      expect(res.cuerpo).toEqual({ exito: false, mensaje: "Error interno del servidor" });
    } finally {
      process.env.NODE_ENV = previo;
    }
  });

  it("errores 4xx del parser: 400 genérico (JSON inválido, otros) y 413 sin texto del error", () => {
    let res = respuesta();
    manejador(Object.assign(new Error("Unexpected token S in JSON"), { type: "entity.parse.failed", status: 400 }), {}, res, () => {});
    expect([res.estado, res.cuerpo.mensaje]).toEqual([400, "JSON inválido"]);
    res = respuesta();
    manejador(Object.assign(new Error("request aborted"), { status: 400, type: "request.aborted" }), {}, res, () => {});
    expect([res.estado, res.cuerpo.mensaje]).toEqual([400, "Petición no válida"]);
    res = respuesta();
    manejador(Object.assign(new Error("request entity too large"), { type: "entity.too.large", status: 413 }), {}, res, () => {});
    expect(res.estado).toBe(413);
    expect(JSON.stringify(res.cuerpo)).not.toMatch(/entity/);
  });
});

describe("Ingesta - GET /estado", () => {
  it("devuelve el cursor del origen de la llave con la forma del contrato", async () => {
    esc.estado = {
      ultimo_id_externo: "1000622",
      ultima_marca_ts: new Date("2026-01-15T20:00:00Z"),
      ultima_subida_ts: new Date("2026-01-15T20:00:02Z"),
      ultimo_exito: new Date("2026-01-15T20:15:00Z"),
      ultimo_error: null,
    };
    esc.totalMarcas = 100000;
    const r = await request(app).get(ESTADO).set("X-Api-Key", esc.llave);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      exito: true,
      datos: {
        origen: "biotime",
        ultimo_id_externo: "1000622",
        ultima_marca_ts: "2026-01-15T20:00:00Z",
        ultima_subida_ts: "2026-01-15T20:00:02Z",
        ultimo_exito: "2026-01-15T20:15:00Z",
        ultimo_error: null,
        total_marcas: 100000,
      },
    });
    const consulta = bd.sqls().find((l) => /FROM asistencia_sync_estado WHERE origen/.test(l.sql));
    expect(consulta.params).toEqual(["biotime"]);
    expect(consulta.sql).toMatch(/ultima_sincronizacion AS ultimo_exito/);
  });

  it("sin marcas todavía: ultimo_id_externo null y total 0 (carga completa)", async () => {
    const r = await request(app).get(ESTADO).set("X-Api-Key", esc.llave);
    expect(r.status).toBe(200);
    expect(r.body.datos).toEqual({
      origen: "biotime",
      ultimo_id_externo: null,
      ultima_marca_ts: null,
      ultima_subida_ts: null,
      ultimo_exito: null,
      ultimo_error: null,
      total_marcas: 0,
    });
  });

  it("muestra el último error genérico del cursor", async () => {
    esc.estado = { ultimo_id_externo: "5", ultimo_error: "Error interno al procesar el envío" };
    const r = await request(app).get(ESTADO).set("X-Api-Key", esc.llave);
    expect(r.body.datos.ultimo_error).toBe("Error interno al procesar el envío");
  });

  it("exige llave: sin ella 401; revocada 403", async () => {
    expect((await request(app).get(ESTADO)).status).toBe(401);
    esc.fila.estado = "revocada";
    expect((await request(app).get(ESTADO).set("X-Api-Key", esc.llave)).status).toBe(403);
  });

  it("fallo de BD -> 500 genérico", async () => {
    esc.falla = { re: /FROM asistencia_sync_estado WHERE origen/, error: new Error('relation "asistencia_sync_estado" does not exist') };
    const r = await request(app).get(ESTADO).set("X-Api-Key", esc.llave);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/relation/);
  });
});

describe("Ingesta - la llave nunca se expone", () => {
  it("no aparece en respuestas, logs, parámetros de BD ni en lo que se audita (solo su hash/prefijo)", async () => {
    esc.falla = null;
    const respuestas = [
      await enviar({ marcas: [marca(160)] }),
      await request(app).get(ESTADO).set("X-Api-Key", esc.llave),
      await enviar({ marcas: [] }),
      await enviar({ origen: "x", marcas: [marca(1)] }),
      await request(app).post(MARCAS).set("X-Api-Key", `${esc.prefijo}_${"A".repeat(43)}`).send({}),
    ];
    esc.falla = { re: /INSERT INTO asistencia_marcas/, error: new Error("falló con la llave") };
    respuestas.push(await enviar({ marcas: [marca(161)] }));
    const secreto = esc.llave.split("_")[2];
    const todo = JSON.stringify([
      respuestas.map((r) => [r.body, r.headers]),
      espiaError.mock.calls,
      espiaLog.mock.calls,
      espiaWarn.mock.calls,
      registrarRechazo.mock.calls,
      bd.estado.llamadas.map((l) => l.params),
    ]);
    expect(todo).not.toContain(esc.llave);
    expect(todo).not.toContain(secreto);
  });
});
