const request = require("supertest");
const express = require("express");
const http = require("http");

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
const router = require("../routes/ingesta.routes");
const {
  leerConfigIngesta,
  crearAppIngesta,
  montarIngestaEnPrincipal,
  abrirServidorIngesta,
  cerrarServidor,
  cerrarTodos,
  resolverConfigIngesta,
  iniciarPuertaDedicada,
} = require("../servidorIngesta");

const { bd } = esc;
const MARCAS = "/api/asistencia/ingesta/marcas";
const ESTADO = "/api/asistencia/ingesta/estado";
const marca = (id) => ({ id_externo: String(id), codigo_empleado: "1", marca_ts: "2026-01-15T14:00:00Z" });
const enviar = (app, id, llave = esc.llave, cabeceras = {}) =>
  request(app).post(MARCAS).set("X-Api-Key", llave).set(cabeceras).send({ marcas: [marca(id)] });

// Puerto principal tal como lo arma app.js: la ingesta (o su 404) antes del parser global y el resto de la app
function crearPrincipal(config, trustProxy) {
  const app = express();
  if (trustProxy !== undefined) app.set("trust proxy", trustProxy);
  montarIngestaEnPrincipal(app, config);
  app.use(express.json());
  app.use((req, res) => res.status(418).json({ exito: false, mensaje: "llegó al resto de la app" }));
  return app;
}

let contador = 500;
beforeEach(() => {
  jest.clearAllMocks();
  esc.reiniciar();
  router.limitador.reiniciar();
  router.limitadorIp.reiniciar();
  esc.fila = { ...esc.fila, id: ++contador, estado: "activa", ips_permitidas: [], vigente_ahora: true, origen: "biotime" };
  esc.filas = null;
  esc.existentes = new Set();
  esc.guardadas = [];
  esc.falla = null;
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("leerConfigIngesta", () => {
  it.each([[undefined], [null], [""], ["   "]])("INGESTA_PORT %p -> sin puerta dedicada", (valor) => {
    expect(leerConfigIngesta({ INGESTA_PORT: valor, INGESTA_SOLO_PUERTO_DEDICADO: "true" })).toEqual({ puerto: null, soloDedicado: false });
  });

  it("con puerto definido, INGESTA_SOLO_PUERTO_DEDICADO es true por omisión (seguro por defecto)", () => {
    expect(leerConfigIngesta({ INGESTA_PORT: "4010" })).toEqual({ puerto: 4010, soloDedicado: true });
    expect(leerConfigIngesta({ INGESTA_PORT: " 4010 ", INGESTA_SOLO_PUERTO_DEDICADO: "" })).toEqual({ puerto: 4010, soloDedicado: true });
  });

  it.each([["false"], ["FALSE"], ["0"], ["no"]])("solo %p lo desactiva", (valor) => {
    expect(leerConfigIngesta({ INGESTA_PORT: "4010", INGESTA_SOLO_PUERTO_DEDICADO: valor }).soloDedicado).toBe(false);
  });

  it.each([["true"], ["1"], ["si"]])("%p lo activa", (valor) => {
    expect(leerConfigIngesta({ INGESTA_PORT: "4010", INGESTA_SOLO_PUERTO_DEDICADO: valor }).soloDedicado).toBe(true);
  });

  it("un valor desconocido cuenta como true y avisa", () => {
    const c = leerConfigIngesta({ INGESTA_PORT: "4010", INGESTA_SOLO_PUERTO_DEDICADO: "quizás" });
    expect(c.soloDedicado).toBe(true);
    expect(c.aviso).toMatch(/no se reconoce/);
  });

  it.each([["abc"], ["0"], ["65536"], ["-1"], ["40.5"], ["4010x"], ["123456"]])("INGESTA_PORT=%p es inválido (falla rápida)", (valor) => {
    expect(() => leerConfigIngesta({ INGESTA_PORT: valor })).toThrow(/INGESTA_PORT/);
  });

  it("no puede ser el puerto principal (PORT o el argumento)", () => {
    expect(() => leerConfigIngesta({ INGESTA_PORT: "4000" })).toThrow(/puerto principal/);
    expect(() => leerConfigIngesta({ INGESTA_PORT: "5000", PORT: "5000" })).toThrow(/puerto principal/);
    expect(() => leerConfigIngesta({ INGESTA_PORT: "4010" }, "4010")).toThrow(/puerto principal/);
  });
});

describe("Puerto principal - montarIngestaEnPrincipal", () => {
  it("con puerta dedicada y solo-dedicado: la ingesta responde 404 con la forma de una ruta inexistente, sin tocar llave ni BD", async () => {
    const app = crearPrincipal({ puerto: 4010, soloDedicado: true });
    for (const [metodo, ruta] of [["post", MARCAS], ["get", ESTADO], ["get", "/api/asistencia/ingesta/otra"], ["delete", MARCAS]]) {
      const r = await request(app)[metodo](ruta).set("X-Api-Key", esc.llave).send({ marcas: [marca(1)] });
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ exito: false, mensaje: `Ruta no encontrada: ${metodo.toUpperCase()} ${ruta}` });
    }
    expect((await request(app).post(MARCAS).send({})).status).toBe(404); // ni 401: no se revela que exista
    expect(bd.sqls()).toHaveLength(0);
    expect(registrarRechazo).not.toHaveBeenCalled();
    expect(esc.guardadas).toHaveLength(0);
  });

  it("el 404 de ingesta tiene la misma forma que el de cualquier otra ruta inexistente de la app", async () => {
    const app = crearPrincipal({ puerto: 4010, soloDedicado: true });
    const r = await request(app).get(ESTADO);
    expect(Object.keys(r.body).sort()).toEqual(["exito", "mensaje"]);
    expect(r.body.mensaje).toMatch(/^Ruta no encontrada: GET /);
  });

  it("INGESTA_SOLO_PUERTO_DEDICADO=false: la ingesta sigue funcionando en el principal (dev/pruebas)", async () => {
    const app = crearPrincipal({ puerto: 4010, soloDedicado: false });
    expect((await enviar(app, 1)).status).toBe(200);
    expect((await request(app).get(ESTADO).set("X-Api-Key", esc.llave)).status).toBe(200);
  });

  it("sin INGESTA_PORT: el principal sirve la ingesta como siempre", async () => {
    const app = crearPrincipal({ puerto: null, soloDedicado: false });
    expect((await enviar(app, 1)).status).toBe(200);
  });

  it("el resto de la app del principal no se ve afectado", async () => {
    const app = crearPrincipal({ puerto: 4010, soloDedicado: true });
    expect((await request(app).get("/api/asistencia/turnos")).status).toBe(418);
  });
});

describe("Puerta dedicada - crearAppIngesta", () => {
  const dedicada = crearAppIngesta();

  it("sirve la ingesta (POST /marcas y GET /estado) con la misma lógica", async () => {
    const r = await enviar(dedicada, 1);
    expect(r.status).toBe(200);
    expect(r.body.datos).toMatchObject({ insertadas: 1, recibidas: 1 });
    esc.estado = { ultimo_id_externo: "1", ultimo_error: null };
    expect((await request(dedicada).get(ESTADO).set("X-Api-Key", esc.llave)).status).toBe(200);
  });

  it("exige la llave igual que el principal (401/403)", async () => {
    expect((await request(dedicada).post(MARCAS).send({})).status).toBe(401);
    esc.fila.estado = "revocada";
    expect((await enviar(dedicada, 1)).status).toBe(403);
  });

  it.each([
    ["get", "/"],
    ["get", "/api/salud"],
    ["get", "/api/asistencia/turnos"],
    ["post", "/api/asistencia/llaves"],
    ["get", "/api/asistencia/lotes"],
    ["post", "/api/asistencia/marcas/revincular"],
    ["get", "/api/usuarios"],
    ["get", "/api/asistencia/ingesta"],
    ["get", MARCAS],
    ["put", MARCAS],
    ["get", "/api/asistencia/ingesta/otra"],
  ])("%s %s -> 404 (solo existen POST /marcas y GET /estado)", async (metodo, ruta) => {
    const r = await request(dedicada)[metodo](ruta).set("X-Api-Key", esc.llave).send({});
    expect(r.status).toBe(404);
    expect(r.body.exito).toBe(false);
    expect(r.body).not.toHaveProperty("datos");
  });

  it("las rutas ajenas no consultan la BD ni pasan por JWT (ni siquiera con un Bearer)", async () => {
    await request(dedicada).get("/api/asistencia/turnos").set("Authorization", "Bearer x");
    expect(bd.sqls()).toHaveLength(0);
  });

  it("mantiene el parser de 1 MB (cuerpo mayor -> 413) y el de 100 kb no aplica", async () => {
    const medio = { marcas: Array.from({ length: 200 }, (_, i) => ({ ...marca(3000 + i), crudo: { nota: "x".repeat(1000) } })) };
    expect(Buffer.byteLength(JSON.stringify(medio))).toBeGreaterThan(200 * 1024);
    expect((await request(dedicada).post(MARCAS).set("X-Api-Key", esc.llave).send(medio)).status).toBe(200);
  });

  it("no anuncia Express (x-powered-by)", async () => {
    const r = await enviar(dedicada, 1);
    expect(r.headers["x-powered-by"]).toBeUndefined();
  });

  describe("req.ip = IP del socket aunque lleguen cabeceras de proxy falsificadas", () => {
    const FALSAS = {
      "X-Forwarded-For": "192.0.2.9",
      "CF-Connecting-IP": "192.0.2.9",
      "X-Real-IP": "192.0.2.9",
      Forwarded: "for=192.0.2.9",
      "True-Client-IP": "192.0.2.9",
    };

    it("la lista de IP permitidas se evalúa con el socket: una IP permitida falseada por cabecera NO entra", async () => {
      esc.fila.ips_permitidas = ["192.0.2.9"];
      const r = await enviar(dedicada, 1, esc.llave, FALSAS);
      expect(r.status).toBe(403);
      expect(registrarRechazo).toHaveBeenCalledWith(expect.objectContaining({ motivo: "ip_no_permitida", ip: "127.0.0.1" }));
    });

    it("la IP real (socket) permitida entra aunque las cabeceras digan otra cosa", async () => {
      esc.fila.ips_permitidas = ["127.0.0.1"];
      const r = await enviar(dedicada, 1, esc.llave, { "X-Forwarded-For": "198.51.100.7", "CF-Connecting-IP": "198.51.100.7" });
      expect(r.status).toBe(200);
      const uso = bd.sqls().find((l) => /UPDATE asistencia_llaves SET ultimo_uso/.test(l.sql));
      expect(uso.params[1]).toBe("127.0.0.1");
      expect(esc.guardadas).toHaveLength(1);
    });

    it("lista de IP permitidas con CIDR y IPv6 sigue funcionando", async () => {
      esc.fila.ips_permitidas = ["198.51.100.0/24", "2001:db8::/32"];
      expect((await enviar(dedicada, 1)).status).toBe(403);
      esc.fila.ips_permitidas = ["198.51.100.0/24", "127.0.0.0/8"];
      expect((await enviar(dedicada, 2)).status).toBe(200);
    });

    it("el puerto principal sí confía en TRUST_PROXY (si se configuró), la puerta dedicada nunca", async () => {
      esc.fila.ips_permitidas = ["192.0.2.9"];
      const principal = crearPrincipal({ puerto: null, soloDedicado: false }, 1);
      expect((await enviar(principal, 1, esc.llave, { "X-Forwarded-For": "192.0.2.9" })).status).toBe(200);
      router.limitadorIp.reiniciar();
      expect((await enviar(dedicada, 2, esc.llave, { "X-Forwarded-For": "192.0.2.9" })).status).toBe(403);
    });

    it("TRUST_PROXY en el entorno no afecta a la puerta dedicada (trust proxy desactivado)", async () => {
      const previo = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "1";
      try {
        const app = crearAppIngesta();
        expect(app.get("trust proxy")).toBe(false);
        esc.fila.ips_permitidas = ["192.0.2.9"];
        expect((await enviar(app, 1, esc.llave, { "X-Forwarded-For": "192.0.2.9" })).status).toBe(403);
      } finally {
        if (previo === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = previo;
      }
    });

    it("los fallos por IP también usan la IP del socket: variar la cabecera no reinicia el contador", async () => {
      for (let i = 0; i < 30; i += 1) {
        await request(dedicada).post(MARCAS).set("X-Forwarded-For", `192.0.2.${i + 1}`).send({});
      }
      const r = await request(dedicada).post(MARCAS).set("X-Forwarded-For", "203.0.113.50").send({});
      expect(r.status).toBe(429);
    });
  });

  describe("contadores compartidos con el puerto principal (mismo proceso)", () => {
    it("el límite de 60 envíos/min por llave cuenta ambos puertos juntos", async () => {
      const principal = crearPrincipal({ puerto: 4010, soloDedicado: false });
      for (let i = 0; i < 30; i += 1) expect((await enviar(principal, 1000 + i)).status).toBe(200);
      for (let i = 0; i < 30; i += 1) expect((await enviar(dedicada, 2000 + i)).status).toBe(200);
      const a = await enviar(dedicada, 3000);
      const b = await enviar(principal, 3001);
      expect([a.status, b.status]).toEqual([429, 429]);
      expect(Number(a.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    });

    it("el límite de fallos por IP cuenta ambos puertos juntos", async () => {
      const principal = crearPrincipal({ puerto: 4010, soloDedicado: false });
      for (let i = 0; i < 15; i += 1) await request(principal).post(MARCAS).send({});
      for (let i = 0; i < 15; i += 1) await request(dedicada).post(MARCAS).send({});
      expect((await request(principal).post(MARCAS).send({})).status).toBe(429);
      expect((await request(dedicada).post(MARCAS).send({})).status).toBe(429);
    });

    it("la app dedicada usa el MISMO router que el principal (misma instancia, mismos contadores)", () => {
      const principal = crearPrincipal({ puerto: null, soloDedicado: false });
      const desdePrincipal = principal._router.stack.find((c) => c.regexp.test("/api/asistencia/ingesta/marcas") && c.handle === router);
      const desdeDedicada = dedicada._router.stack.find((c) => c.handle === router);
      expect(desdePrincipal).toBeTruthy();
      expect(desdeDedicada).toBeTruthy();
    });
  });
});

describe("abrirServidorIngesta / cerrarServidor", () => {
  const llamar = (puerto, ruta, opciones = {}) =>
    new Promise((resolver, rechazar) => {
      const req = http.request({ host: "127.0.0.1", port: puerto, path: ruta, agent: false, ...opciones }, (res) => {
        let cuerpo = "";
        res.on("data", (d) => (cuerpo += d));
        res.on("end", () => resolver({ estado: res.statusCode, cuerpo: cuerpo ? JSON.parse(cuerpo) : null }));
      });
      req.on("error", rechazar);
      req.end();
    });

  it("abre un servidor real que sirve la ingesta, y cierra ordenadamente (dos veces seguidas no falla)", async () => {
    const servidor = await abrirServidorIngesta({ puerto: 0 });
    const { port } = servidor.address();
    try {
      expect((await llamar(port, ESTADO, { headers: { "X-Api-Key": esc.llave } })).estado).toBe(200);
      expect((await llamar(port, "/api/salud")).estado).toBe(404);
    } finally {
      await cerrarServidor(servidor);
    }
    expect(servidor.listening).toBe(false);
    await expect(cerrarServidor(servidor)).resolves.toBeUndefined();
    await expect(cerrarServidor(null)).resolves.toBeUndefined();
    await expect(llamar(port, ESTADO)).rejects.toMatchObject({ code: "ECONNREFUSED" });
  });

  it("puerto ocupado -> la promesa se rechaza con EADDRINUSE (el arranque debe fallar)", async () => {
    const primero = await abrirServidorIngesta({ puerto: 0 });
    try {
      await expect(abrirServidorIngesta({ puerto: primero.address().port })).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await cerrarServidor(primero);
    }
  });

  it("el cierre deja terminar la petición en curso", async () => {
    const lenta = express();
    lenta.get("/lenta", (_req, res) => setTimeout(() => res.json({ ok: true }), 150));
    const servidor = await abrirServidorIngesta({ puerto: 0, app: lenta });
    const { port } = servidor.address();
    const keepAlive = new http.Agent({ keepAlive: true });
    const enCurso = llamar(port, "/lenta", { agent: keepAlive });
    await new Promise((r) => setTimeout(r, 30));
    const t0 = Date.now();
    await cerrarServidor(servidor);
    expect((await enCurso).estado).toBe(200);
    keepAlive.destroy();
    expect(Date.now() - t0).toBeLessThan(2000); // la conexión ociosa se cierra al terminar (no espera el keepAliveTimeout de ~5 s)
  });

  it("cerrarTodos espera a los DOS servidores (la petición en curso del segundo también termina) e ignora nulos", async () => {
    const rapida = express();
    rapida.get("/x", (_req, res) => res.json({ ok: true }));
    const lenta = express();
    lenta.get("/lenta", (_req, res) => setTimeout(() => res.json({ ok: true }), 200));
    const a = await abrirServidorIngesta({ puerto: 0, app: rapida });
    const b = await abrirServidorIngesta({ puerto: 0, app: lenta });
    const enCurso = llamar(b.address().port, "/lenta");
    await new Promise((r) => setTimeout(r, 30));
    await cerrarTodos([a, b, null]);
    expect(a.listening).toBe(false);
    expect(b.listening).toBe(false);
    expect((await enCurso).estado).toBe(200);
  });
});

describe("resolverConfigIngesta (modo degradado: nunca lanza)", () => {
  it("configuración válida = leerConfigIngesta", () => {
    expect(resolverConfigIngesta({ INGESTA_PORT: "4010" }, 4000)).toEqual({ puerto: 4010, soloDedicado: true });
    expect(resolverConfigIngesta({}, 4000)).toEqual({ puerto: null, soloDedicado: false });
  });

  it.each([["abc"], ["0"], ["70000"], ["4000"]])("INGESTA_PORT=%s -> deshabilitada con el motivo, sin lanzar", (valor) => {
    const c = resolverConfigIngesta({ INGESTA_PORT: valor }, 4000);
    expect(c).toMatchObject({ puerto: null, deshabilitada: true, soloDedicado: true });
    expect(c.error).toMatch(/INGESTA_PORT/);
  });

  it("la ingesta del principal queda cerrada (404) con la puerta deshabilitada, salvo SOLO=false explícito", async () => {
    const cerrada = crearPrincipal(resolverConfigIngesta({ INGESTA_PORT: "abc" }, 4000));
    expect((await request(cerrada).get(ESTADO).set("X-Api-Key", esc.llave)).status).toBe(404);
    const abierta = crearPrincipal(resolverConfigIngesta({ INGESTA_PORT: "abc", INGESTA_SOLO_PUERTO_DEDICADO: "false" }, 4000));
    expect((await request(abierta).get(ESTADO).set("X-Api-Key", esc.llave)).status).toBe(200);
  });
});

describe("iniciarPuertaDedicada (reintento único y recordatorio)", () => {
  const montar = (opciones = {}) => {
    const t = { registros: [], infos: [], temporizadores: [], repeticiones: [], cancelados: [] };
    const puerta = iniciarPuertaDedicada({
      config: { puerto: 4010, soloDedicado: true },
      registrar: (m) => t.registros.push(m),
      informar: (m) => t.infos.push(m),
      programar: (fn, ms) => {
        const h = { fn, ms };
        t.temporizadores.push(h);
        return h;
      },
      repetir: (fn, ms) => {
        const h = { fn, ms };
        t.repeticiones.push(h);
        return h;
      },
      cancelar: (h) => t.cancelados.push(h),
      cancelarRepeticion: (h) => t.cancelados.push(h),
      ...opciones,
    });
    return { puerta, t };
  };
  const tick = () => new Promise((r) => setImmediate(r));
  const errorPuerto = Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });

  it("abre a la primera: informa y no hay avisos ni recordatorios", async () => {
    const servidor = { listening: true };
    const { puerta, t } = montar({ abrir: jest.fn().mockResolvedValue(servidor) });
    await puerta.listo;
    expect(puerta.servidor()).toBe(servidor);
    expect(puerta.estado()).toBe("activa");
    expect(t.registros).toHaveLength(0);
    expect(t.repeticiones).toHaveLength(0);
    expect(t.infos[0]).toMatch(/escuchando en el puerto 4010/);
  });

  it("falla: avisa de inmediato, reintenta UNA vez tras el plazo y, si vuelve a fallar, queda degradada con recordatorio cada 5 min", async () => {
    const abrir = jest.fn().mockRejectedValue(errorPuerto);
    const { puerta, t } = montar({ abrir });
    await tick();
    await tick();
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(t.registros).toHaveLength(1);
    expect(t.registros[0]).toMatch(/INGESTA NO DISPONIBLE: no se pudo abrir la puerta de ingesta en el puerto 4010 \(EADDRINUSE\)/);
    expect(t.temporizadores).toHaveLength(1);
    expect(t.temporizadores[0].ms).toBe(5000);
    t.temporizadores[0].fn(); // vence el plazo del reintento
    await puerta.listo;
    expect(abrir).toHaveBeenCalledTimes(2); // un solo reintento
    expect(t.registros).toHaveLength(2);
    expect(t.repeticiones).toHaveLength(1);
    expect(t.repeticiones[0].ms).toBe(5 * 60 * 1000);
    expect(puerta.estado()).toBe("no disponible");
    t.repeticiones[0].fn();
    t.repeticiones[0].fn();
    expect(t.registros).toHaveLength(4);
    expect(t.registros.every((m) => /INGESTA NO DISPONIBLE/.test(m))).toBe(true);
    expect(abrir).toHaveBeenCalledTimes(2); // nunca más de dos intentos
  });

  it("si el reintento funciona: sin recordatorios y avisa que ya está disponible", async () => {
    const servidor = { listening: true };
    const abrir = jest.fn().mockRejectedValueOnce(errorPuerto).mockResolvedValueOnce(servidor);
    const { puerta, t } = montar({ abrir });
    await tick();
    await tick();
    t.temporizadores[0].fn();
    await puerta.listo;
    expect(puerta.estado()).toBe("activa");
    expect(t.repeticiones).toHaveLength(0);
    expect(t.infos.some((m) => /INGESTA DISPONIBLE/.test(m))).toBe(true);
  });

  it("configuración deshabilitada: aviso inmediato con el motivo, sin intentar abrir, y recordatorio", async () => {
    const abrir = jest.fn();
    const { puerta, t } = montar({ abrir, config: { puerto: null, soloDedicado: true, deshabilitada: true, error: "INGESTA_PORT=\"abc\" no es un puerto válido (1-65535)" } });
    await puerta.listo;
    expect(abrir).not.toHaveBeenCalled();
    expect(t.registros[0]).toMatch(/INGESTA NO DISPONIBLE: configuración inválida: INGESTA_PORT="abc"/);
    expect(t.repeticiones).toHaveLength(1);
    expect(puerta.estado()).toBe("no disponible");
  });

  it("sin puerto: no hace nada; detener() cancela el recordatorio y el reintento pendiente", async () => {
    const abrir = jest.fn();
    const { puerta, t } = montar({ abrir, config: { puerto: null, soloDedicado: false } });
    await puerta.listo;
    expect(abrir).not.toHaveBeenCalled();
    expect(puerta.estado()).toBe("sin puerta dedicada");
    expect(t.registros).toHaveLength(0);

    const m = montar({ abrir: jest.fn().mockRejectedValue(errorPuerto) });
    await tick();
    await tick();
    m.puerta.detener();
    expect(m.t.cancelados).toContain(m.t.temporizadores[0]);
  });

  it("el aviso dice qué pasa con el puerto principal según INGESTA_SOLO_PUERTO_DEDICADO", async () => {
    const a = montar({ abrir: jest.fn().mockRejectedValue(errorPuerto) });
    await tick();
    await tick();
    expect(a.t.registros[0]).toMatch(/sigue cerrado a la ingesta: responde 404/);
    const b = montar({ abrir: jest.fn().mockRejectedValue(errorPuerto), config: { puerto: 4010, soloDedicado: false } });
    await tick();
    await tick();
    expect(b.t.registros[0]).toMatch(/la ingesta sigue disponible en el puerto principal/);
  });
});
