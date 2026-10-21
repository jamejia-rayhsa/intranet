// Arranque real de modules/portal/backend/app.js como proceso hijo (sin BD: las rutas probadas no la necesitan).
// Estabilidad: puertos fuera del rango efímero (20000-29999) comprobados con listen() SIN host (igual que el hijo),
// reintento del lanzamiento si otro proceso ganó el puerto, y esperas por evento/línea de log (nunca tiempos fijos).
const { spawn } = require("child_process");
const net = require("net");
const path = require("path");
const http = require("http");

jest.setTimeout(60000);
const APP = path.resolve(__dirname, "../../../portal/backend/app.js");

const escuchar = (puerto) =>
  new Promise((resolver, rechazar) => {
    const s = net.createServer();
    s.once("error", rechazar);
    s.listen(puerto, () => resolver(s)); // sin host: igual que app.js
  });

async function puertoLibre(excluir = []) {
  for (let i = 0; i < 50; i += 1) {
    const puerto = 20000 + Math.floor(Math.random() * 10000);
    if (excluir.includes(puerto)) continue;
    try {
      const s = await escuchar(puerto);
      await new Promise((r) => s.close(r));
      return puerto;
    } catch {
      /* ocupado: otro */
    }
  }
  throw new Error("No se encontró un puerto libre");
}

function lanzar(env) {
  const hijo = spawn(process.execPath, [APP], {
    env: { PATH: process.env.PATH, POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "1", NODE_ENV: "test", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const salida = { texto: "" };
  hijo.stdout.on("data", (d) => (salida.texto += d));
  hijo.stderr.on("data", (d) => (salida.texto += d));
  const termino = new Promise((resolver) => hijo.once("exit", (codigo, senal) => resolver({ codigo, senal })));
  return { hijo, salida, termino };
}

// Espera una condición sobre el log (o la salida del proceso) sin tiempos fijos
const esperarLog = async (proceso, regex, ms = 25000) => {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (regex.test(proceso.salida.texto)) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};

/**
 * Lanza app.js con dos puertos libres nuevos; si el hijo muere por EADDRINUSE (otro proceso tomó el puerto entre la
 * comprobación y el arranque) repite hasta 3 veces con puertos distintos.
 */
async function arrancar(extraEnv = {}, { esperar = /Servidor backend escuchando/, conDedicado = true } = {}) {
  let ultimo;
  for (let intento = 0; intento < 3; intento += 1) {
    const principal = await puertoLibre();
    const dedicado = await puertoLibre([principal]);
    const env = { PORT: String(principal), ...(conDedicado ? { INGESTA_PORT: String(dedicado) } : {}), ...extraEnv };
    const proceso = { ...lanzar(env), principal, dedicado };
    const resultado = await Promise.race([esperarLog(proceso, esperar).then((ok) => (ok ? "listo" : "agotado")), proceso.termino.then(() => "salio")]);
    if (resultado === "listo") return proceso;
    if (resultado === "salio" && /EADDRINUSE/.test(proceso.salida.texto) && intento < 2) {
      ultimo = proceso;
      continue;
    }
    proceso.hijo.kill("SIGKILL");
    throw new Error(`app.js no arrancó (${resultado}): ${proceso.salida.texto.slice(-600)}`);
  }
  throw new Error(`app.js no arrancó tras 3 intentos: ${ultimo && ultimo.salida.texto.slice(-600)}`);
}

async function terminar(proceso, senal = "SIGTERM") {
  proceso.hijo.kill(senal);
  return proceso.termino;
}

const pedir = (puerto, ruta, metodo = "GET") =>
  new Promise((resolver, rechazar) => {
    const req = http.request({ host: "127.0.0.1", port: puerto, path: ruta, method: metodo, agent: false }, (res) => {
      let cuerpo = "";
      res.on("data", (d) => (cuerpo += d));
      res.on("end", () => resolver({ estado: res.statusCode, cuerpo: cuerpo ? JSON.parse(cuerpo) : null }));
    });
    req.on("error", rechazar);
    req.end();
  });
const ESTADO = "/api/asistencia/ingesta/estado";

describe("app.js - arranque con puerta de ingesta dedicada", () => {
  it("importar app.js no abre puertos (estructura para supertest)", () => {
    const fuente = require("fs").readFileSync(APP, "utf8");
    expect(fuente).toMatch(/if \(require\.main === module\) iniciar\(\);/);
    expect(fuente).not.toMatch(/^app\.listen\(/m);
  });

  it("abre los dos puertos: ingesta solo en el dedicado, 404 en el principal, SIGTERM cierra ambos con código 0", async () => {
    const p = await arrancar();
    await esperarLog(p, /Puerta de ingesta dedicada escuchando/);
    expect(p.salida.texto).toMatch(new RegExp(`Puerta de ingesta dedicada escuchando en el puerto ${p.dedicado}`));
    expect(p.salida.texto).toMatch(/el puerto principal ya no sirve la ingesta/);
    expect(p.salida.texto).not.toMatch(/INGESTA NO DISPONIBLE/);
    try {
      expect((await pedir(p.dedicado, ESTADO)).estado).toBe(401);
      expect((await pedir(p.dedicado, "/api/salud")).estado).toBe(404);
      expect((await pedir(p.dedicado, "/api/asistencia/turnos")).estado).toBe(404);
      expect((await pedir(p.principal, "/api/salud")).estado).toBe(200);
      const cerrada = await pedir(p.principal, ESTADO);
      expect(cerrada.estado).toBe(404);
      expect(cerrada.cuerpo.mensaje).toMatch(/^Ruta no encontrada: GET /);
      expect((await pedir(p.principal, "/api/asistencia/ingesta/marcas", "POST")).estado).toBe(404);
    } finally {
      const fin = await terminar(p);
      expect(fin.codigo).toBe(0);
    }
    expect(p.salida.texto).toMatch(/SIGTERM recibida/);
  });

  it("INGESTA_SOLO_PUERTO_DEDICADO=false: la ingesta funciona en ambos puertos", async () => {
    const p = await arrancar({ INGESTA_SOLO_PUERTO_DEDICADO: "false" });
    await esperarLog(p, /Puerta de ingesta dedicada escuchando/);
    try {
      expect((await pedir(p.principal, ESTADO)).estado).toBe(401);
      expect((await pedir(p.dedicado, ESTADO)).estado).toBe(401);
    } finally {
      expect((await terminar(p, "SIGINT")).codigo).toBe(0);
    }
  });

  it("sin INGESTA_PORT: un solo puerto y la ingesta en el principal", async () => {
    const p = await arrancar({}, { conDedicado: false });
    try {
      expect(p.salida.texto).not.toMatch(/Puerta de ingesta dedicada|INGESTA NO DISPONIBLE/);
      expect((await pedir(p.principal, ESTADO)).estado).toBe(401);
    } finally {
      expect((await terminar(p)).codigo).toBe(0);
    }
  });

  describe("modo degradado (la puerta dedicada falla, el portal NO se cae)", () => {
    const rapidos = { INGESTA_REINTENTO_MS: "150", INGESTA_RECORDATORIO_MS: "250" };

    it("puerto dedicado ocupado: el portal arranca y responde, la ingesta no está disponible (404), error muy visible y repetido", async () => {
      const ocupante = await escuchar(await puertoLibre());
      const dedicado = ocupante.address().port;
      try {
        const p = await arrancar({ ...rapidos, INGESTA_PORT: String(dedicado) }, { conDedicado: false });
        try {
          expect(await esperarLog(p, /INGESTA NO DISPONIBLE: no se pudo abrir la puerta de ingesta en el puerto \d+ \(EADDRINUSE\)/)).toBe(true);
          expect(p.salida.texto).toContain("====================");
          // el recordatorio periódico se repite
          expect(await esperarLog(p, /(INGESTA NO DISPONIBLE[\s\S]*){3}/)).toBe(true);
          // el portal sigue vivo y sirve todo menos la ingesta, que sigue cerrada en el principal
          expect((await pedir(p.principal, "/api/salud")).estado).toBe(200);
          const r = await pedir(p.principal, ESTADO);
          expect(r.estado).toBe(404);
          expect((await pedir(p.principal, "/api/asistencia/ingesta/marcas", "POST")).estado).toBe(404);
          expect(p.salida.texto).not.toMatch(/Puerta de ingesta dedicada escuchando/);
          expect(p.hijo.exitCode).toBeNull();
        } finally {
          expect((await terminar(p)).codigo).toBe(0);
        }
      } finally {
        ocupante.close();
      }
    });

    it("INGESTA_SOLO_PUERTO_DEDICADO=false y puerta caída: la ingesta sigue disponible en el principal", async () => {
      const ocupante = await escuchar(await puertoLibre());
      try {
        const p = await arrancar({ ...rapidos, INGESTA_SOLO_PUERTO_DEDICADO: "false", INGESTA_PORT: String(ocupante.address().port) }, { conDedicado: false });
        try {
          expect(await esperarLog(p, /INGESTA NO DISPONIBLE/)).toBe(true);
          expect(p.salida.texto).toMatch(/la ingesta sigue disponible en el puerto principal/);
          expect((await pedir(p.principal, ESTADO)).estado).toBe(401);
        } finally {
          await terminar(p);
        }
      } finally {
        ocupante.close();
      }
    });

    it("se libera el puerto antes del único reintento: la puerta se abre y el aviso se corrige", async () => {
      const ocupante = await escuchar(await puertoLibre());
      const dedicado = ocupante.address().port;
      const p = await arrancar({ INGESTA_REINTENTO_MS: "1500", INGESTA_PORT: String(dedicado) }, { conDedicado: false });
      try {
        expect(await esperarLog(p, /INGESTA NO DISPONIBLE/)).toBe(true);
        await new Promise((r) => ocupante.close(r));
        expect(await esperarLog(p, /INGESTA DISPONIBLE: la puerta dedicada se abrió en el reintento/, 4000)).toBe(true);
        expect((await pedir(dedicado, ESTADO)).estado).toBe(401);
        expect((await pedir(p.principal, ESTADO)).estado).toBe(404);
        expect((await pedir(p.principal, "/api/salud")).estado).toBe(200);
      } finally {
        expect((await terminar(p)).codigo).toBe(0);
      }
    });

    it.each([
      ["abc", /configuración inválida: INGESTA_PORT="abc" no es un puerto válido/],
      ["70000", /configuración inválida: INGESTA_PORT="70000" no es un puerto válido/],
    ])("INGESTA_PORT=%s: el portal arranca igual, ingesta no disponible y cerrada en el principal", async (valor, patron) => {
      const p = await arrancar({ INGESTA_PORT: valor }, { conDedicado: false });
      try {
        expect(await esperarLog(p, patron)).toBe(true);
        expect((await pedir(p.principal, "/api/salud")).estado).toBe(200);
        expect((await pedir(p.principal, ESTADO)).estado).toBe(404);
      } finally {
        expect((await terminar(p)).codigo).toBe(0);
      }
    });

    it("INGESTA_PORT igual al principal: el portal arranca (no se pisa el puerto) y la ingesta queda no disponible", async () => {
      let p;
      for (let i = 0; i < 3 && !p; i += 1) {
        const puerto = await puertoLibre();
        const candidato = { ...lanzar({ PORT: String(puerto), INGESTA_PORT: String(puerto) }), principal: puerto };
        const r = await Promise.race([esperarLog(candidato, /Servidor backend escuchando/).then((ok) => (ok ? "listo" : "agotado")), candidato.termino.then(() => "salio")]);
        if (r === "listo") p = candidato;
        else candidato.hijo.kill("SIGKILL");
      }
      expect(p).toBeDefined();
      try {
        expect(await esperarLog(p, /INGESTA NO DISPONIBLE: configuración inválida: INGESTA_PORT \(\d+\) no puede ser el puerto principal/)).toBe(true);
        expect((await pedir(p.principal, "/api/salud")).estado).toBe(200);
        expect((await pedir(p.principal, ESTADO)).estado).toBe(404);
      } finally {
        expect((await terminar(p)).codigo).toBe(0);
      }
    });
  });

  it("puerto principal ocupado -> código 1 (sin portal no hay nada que degradar)", async () => {
    const ocupante = await escuchar(await puertoLibre());
    try {
      const proceso = lanzar({ PORT: String(ocupante.address().port) });
      const fin = await proceso.termino;
      expect(fin.codigo).toBe(1);
      expect(proceso.salida.texto).toMatch(/No se pudo abrir el puerto .*EADDRINUSE/);
    } finally {
      ocupante.close();
    }
  });
});
