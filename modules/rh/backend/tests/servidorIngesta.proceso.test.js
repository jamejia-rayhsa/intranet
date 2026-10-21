// Arranque real de modules/portal/backend/app.js como proceso hijo (sin BD: las rutas probadas no la necesitan).
const { spawn } = require("child_process");
const net = require("net");
const path = require("path");
const http = require("http");

jest.setTimeout(40000);
const APP = path.resolve(__dirname, "../../../portal/backend/app.js");

const puertoLibre = () =>
  new Promise((resolver) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolver(port));
    });
  });

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

const esperar = async (condicion, ms = 15000) => {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (condicion()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

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

describe("app.js - arranque con puerta de ingesta dedicada", () => {
  it("importar app.js no abre puertos (estructura para supertest)", () => {
    const fuente = require("fs").readFileSync(APP, "utf8");
    expect(fuente).toMatch(/if \(require\.main === module\) iniciar\(\);/);
    expect(fuente).not.toMatch(/^app\.listen\(/m);
  });

  it("abre los dos puertos: ingesta solo en el dedicado, 404 en el principal, SIGTERM cierra ambos con código 0", async () => {
    const [principal, dedicado] = [await puertoLibre(), await puertoLibre()];
    const { hijo, salida, termino } = lanzar({ PORT: String(principal), INGESTA_PORT: String(dedicado) });
    try {
      expect(await esperar(() => /Servidor backend escuchando/.test(salida.texto))).toBe(true);
      expect(salida.texto).toMatch(new RegExp(`Puerta de ingesta dedicada escuchando en el puerto ${dedicado}`));
      expect(salida.texto).toMatch(/el puerto principal ya no sirve la ingesta/);

      // dedicado: la ingesta existe (sin llave -> 401 sin tocar la BD); el resto de la API no
      expect((await pedir(dedicado, "/api/asistencia/ingesta/estado")).estado).toBe(401);
      expect((await pedir(dedicado, "/api/salud")).estado).toBe(404);
      expect((await pedir(dedicado, "/api/asistencia/turnos")).estado).toBe(404);
      // principal: la API normal sí, la ingesta no (404 con la forma de ruta inexistente)
      expect((await pedir(principal, "/api/salud")).estado).toBe(200);
      const cerrada = await pedir(principal, "/api/asistencia/ingesta/estado");
      expect(cerrada.estado).toBe(404);
      expect(cerrada.cuerpo.mensaje).toMatch(/^Ruta no encontrada: GET /);
      expect((await pedir(principal, "/api/asistencia/ingesta/marcas", "POST")).estado).toBe(404);
    } finally {
      hijo.kill("SIGTERM");
    }
    const fin = await termino;
    expect(fin.codigo).toBe(0);
    expect(salida.texto).toMatch(/SIGTERM recibida/);
    await expect(pedir(dedicado, "/api/asistencia/ingesta/estado")).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await expect(pedir(principal, "/api/salud")).rejects.toMatchObject({ code: "ECONNREFUSED" });
  });

  it("INGESTA_SOLO_PUERTO_DEDICADO=false: la ingesta funciona en ambos puertos", async () => {
    const [principal, dedicado] = [await puertoLibre(), await puertoLibre()];
    const { hijo, salida, termino } = lanzar({ PORT: String(principal), INGESTA_PORT: String(dedicado), INGESTA_SOLO_PUERTO_DEDICADO: "false" });
    try {
      expect(await esperar(() => /Servidor backend escuchando/.test(salida.texto))).toBe(true);
      expect((await pedir(principal, "/api/asistencia/ingesta/estado")).estado).toBe(401);
      expect((await pedir(dedicado, "/api/asistencia/ingesta/estado")).estado).toBe(401);
    } finally {
      hijo.kill("SIGINT");
    }
    expect((await termino).codigo).toBe(0);
  });

  it("sin INGESTA_PORT: un solo puerto y la ingesta en el principal", async () => {
    const principal = await puertoLibre();
    const { hijo, salida, termino } = lanzar({ PORT: String(principal) });
    try {
      expect(await esperar(() => /Servidor backend escuchando/.test(salida.texto))).toBe(true);
      expect(salida.texto).not.toMatch(/Puerta de ingesta dedicada/);
      expect((await pedir(principal, "/api/asistencia/ingesta/estado")).estado).toBe(401);
    } finally {
      hijo.kill("SIGTERM");
    }
    expect((await termino).codigo).toBe(0);
  });

  it("puerto dedicado ocupado (EADDRINUSE) -> mensaje claro y salida con código 1 SIN abrir el principal", async () => {
    const ocupante = net.createServer();
    await new Promise((r) => ocupante.listen(0, r));
    const dedicado = ocupante.address().port;
    const principal = await puertoLibre();
    try {
      const { salida, termino } = lanzar({ PORT: String(principal), INGESTA_PORT: String(dedicado) });
      const fin = await termino;
      expect(fin.codigo).toBe(1);
      expect(salida.texto).toMatch(new RegExp(`No se pudo abrir la puerta de ingesta en el puerto ${dedicado}: EADDRINUSE`));
      expect(salida.texto).not.toMatch(/Servidor backend escuchando/);
      await expect(pedir(principal, "/api/salud")).rejects.toMatchObject({ code: "ECONNREFUSED" });
    } finally {
      ocupante.close();
    }
  });

  it("puerto principal ocupado -> código 1", async () => {
    const ocupante = net.createServer();
    await new Promise((r) => ocupante.listen(0, r));
    try {
      const { salida, termino } = lanzar({ PORT: String(ocupante.address().port), INGESTA_PORT: String(await puertoLibre()) });
      expect((await termino).codigo).toBe(1);
      expect(salida.texto).toMatch(/No se pudo abrir el puerto .*EADDRINUSE/);
    } finally {
      ocupante.close();
    }
  });

  it.each([
    ["abc", "no es un puerto válido"],
    ["70000", "no es un puerto válido"],
  ])("INGESTA_PORT=%s -> configuración inválida, código 1", async (valor, texto) => {
    const { salida, termino } = lanzar({ PORT: String(await puertoLibre()), INGESTA_PORT: valor });
    expect((await termino).codigo).toBe(1);
    expect(salida.texto).toMatch(new RegExp(`Configuración inválida.*${texto}`));
  });

  it("INGESTA_PORT igual al principal -> código 1", async () => {
    const p = await puertoLibre();
    const { salida, termino } = lanzar({ PORT: String(p), INGESTA_PORT: String(p) });
    expect((await termino).codigo).toBe(1);
    expect(salida.texto).toMatch(/no puede ser el puerto principal/);
  });
});
