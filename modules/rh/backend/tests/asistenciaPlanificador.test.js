/* eslint-env jest */
const { leerConfigPlanificador, crearPlanificador, iniciarPlanificadorAsistencia } = require("../services/asistencia/planificador");

const logSilencioso = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

// Reloj falso: los temporizadores se disparan a mano
function relojFalso() {
  const pendientes = [];
  return {
    setTimeoutFn: jest.fn((fn, ms) => {
      const t = { fn, ms, cancelado: false, unref: jest.fn() };
      pendientes.push(t);
      return t;
    }),
    clearTimeoutFn: jest.fn((t) => {
      if (t) t.cancelado = true;
    }),
    activos: () => pendientes.filter((t) => !t.cancelado),
    async disparar(ms) {
      const t = pendientes.find((x) => !x.cancelado && x.ms === ms);
      if (!t) throw new Error(`sin temporizador de ${ms}`);
      t.cancelado = true;
      await t.fn();
    },
    pendientes,
  };
}

describe("planificador: configuración", () => {
  it("apagado por omisión y solo ASISTENCIA_MOTOR_ACTIVO=true lo activa", () => {
    const log = logSilencioso();
    expect(leerConfigPlanificador({}, log).activo).toBe(false);
    for (const v of ["false", "0", "1", "si", "yes", "", " "]) expect(leerConfigPlanificador({ ASISTENCIA_MOTOR_ACTIVO: v }, log).activo).toBe(false);
    expect(leerConfigPlanificador({ ASISTENCIA_MOTOR_ACTIVO: "true" }, log).activo).toBe(true);
    expect(leerConfigPlanificador({ ASISTENCIA_MOTOR_ACTIVO: " TRUE " }, log).activo).toBe(true);
  });

  it("intervalo de 15 min por omisión; valores inválidos vuelven al defecto con aviso", () => {
    const log = logSilencioso();
    expect(leerConfigPlanificador({}, log).intervaloMs).toBe(15 * 60000);
    expect(leerConfigPlanificador({ ASISTENCIA_MOTOR_INTERVALO_MIN: "5" }, log).intervaloMs).toBe(5 * 60000);
    for (const malo of ["0", "-3", "abc", "1441", "1.5", "1e2"]) {
      expect(leerConfigPlanificador({ ASISTENCIA_MOTOR_INTERVALO_MIN: malo }, log).intervaloMs).toBe(15 * 60000);
    }
    expect(log.warn).toHaveBeenCalled();
  });

  it("tiempo máximo (10 min) y retraso inicial (30 s) configurables", () => {
    const log = logSilencioso();
    expect(leerConfigPlanificador({}, log)).toMatchObject({ tiempoMaxMs: 10 * 60000, retrasoInicialMs: 30000 });
    expect(leerConfigPlanificador({ ASISTENCIA_MOTOR_TIEMPO_MAX_MIN: "2", ASISTENCIA_MOTOR_RETRASO_INICIAL_S: "0" }, log)).toMatchObject({ tiempoMaxMs: 120000, retrasoInicialMs: 0 });
  });
});

describe("planificador: arranque, vueltas y parada", () => {
  it("no programa nada hasta iniciar() y después programa la primera vuelta con el retraso inicial", () => {
    const reloj = relojFalso();
    const p = crearPlanificador({ ejecutar: jest.fn(), intervaloMs: 900000, tiempoMaxMs: 600000, retrasoInicialMs: 30000, log: logSilencioso(), ...reloj });
    expect(reloj.setTimeoutFn).not.toHaveBeenCalled();
    p.iniciar();
    expect(reloj.setTimeoutFn).toHaveBeenCalledTimes(1);
    expect(reloj.pendientes[0].ms).toBe(30000);
    expect(reloj.pendientes[0].unref).toHaveBeenCalled(); // no retiene el proceso
  });

  it("cada vuelta ejecuta el motor con el tiempo máximo y reprograma la siguiente al intervalo", async () => {
    const reloj = relojFalso();
    const ejecutar = jest.fn().mockResolvedValue({ tipo: "incremental", estado: "ok", dias_evaluados: 3 });
    const p = crearPlanificador({ ejecutar, intervaloMs: 900000, tiempoMaxMs: 600000, retrasoInicialMs: 10, log: logSilencioso(), ...reloj });
    p.iniciar();
    await reloj.disparar(10);
    expect(ejecutar).toHaveBeenCalledWith({ tiempoMaxMs: 600000 });
    await reloj.disparar(900000);
    expect(ejecutar).toHaveBeenCalledTimes(2);
    expect(p.estado()).toMatchObject({ vueltas: 2, errores: 0 });
  });

  it("un error del motor se registra SIN el texto del error y no detiene el planificador", async () => {
    const reloj = relojFalso();
    const log = logSilencioso();
    const error = Object.assign(new Error("fila con datos personales: CURP XXXX"), { code: "23505" });
    const ejecutar = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ tipo: "incremental", estado: "ok" });
    const p = crearPlanificador({ ejecutar, intervaloMs: 900000, tiempoMaxMs: 600000, retrasoInicialMs: 10, log, ...reloj });
    p.iniciar();
    await reloj.disparar(10);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.error.mock.calls)).not.toMatch(/CURP|datos personales/);
    expect(log.error.mock.calls[0][0]).toMatch(/23505/);
    await reloj.disparar(900000); // reintenta en la siguiente vuelta
    expect(p.estado()).toMatchObject({ errores: 1, vueltas: 1 });
  });

  it("un error síncrono tampoco lo tumba", async () => {
    const reloj = relojFalso();
    const p = crearPlanificador({ ejecutar: () => { throw new TypeError("x"); }, intervaloMs: 1000, tiempoMaxMs: 1000, retrasoInicialMs: 1, log: logSilencioso(), ...reloj });
    p.iniciar();
    await expect(reloj.disparar(1)).resolves.toBeUndefined();
    expect(reloj.activos().some((t) => t.ms === 1000)).toBe(true);
  });

  it("vuelta omitida por el candado (otra réplica) se cuenta y no es error", async () => {
    const reloj = relojFalso();
    const p = crearPlanificador({ ejecutar: jest.fn().mockResolvedValue({ omitida: true, motivo: "candado" }), intervaloMs: 1000, tiempoMaxMs: 1000, retrasoInicialMs: 1, log: logSilencioso(), ...reloj });
    p.iniciar();
    await reloj.disparar(1);
    expect(p.estado()).toMatchObject({ omitidas: 1, errores: 0 });
  });

  it("no empalma vueltas: si la anterior sigue en curso la omite", async () => {
    const reloj = relojFalso();
    const log = logSilencioso();
    let terminar;
    const ejecutar = jest.fn(() => new Promise((r) => { terminar = r; }));
    const p = crearPlanificador({ ejecutar, intervaloMs: 1000, tiempoMaxMs: 5000, retrasoInicialMs: 1, log, ...reloj });
    p.iniciar();
    const primera = reloj.disparar(1); // queda esperando al motor
    await Promise.resolve();
    await p.vuelta(); // segunda vuelta mientras la primera sigue
    expect(ejecutar).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalled();
    terminar({ tipo: "incremental", estado: "ok" });
    await primera;
  });

  it("detener() cancela el temporizador, espera la vuelta en curso y no reprograma", async () => {
    const reloj = relojFalso();
    let terminar;
    const ejecutar = jest.fn(() => new Promise((r) => { terminar = r; }));
    const p = crearPlanificador({ ejecutar, intervaloMs: 1000, tiempoMaxMs: 5000, retrasoInicialMs: 1, log: logSilencioso(), ...reloj });
    p.iniciar();
    const vuelta = reloj.disparar(1);
    await Promise.resolve();
    let detenido = false;
    const parada = p.detener(10000).then(() => { detenido = true; });
    await Promise.resolve();
    expect(detenido).toBe(false); // espera a la vuelta en curso
    terminar({ tipo: "incremental", estado: "ok" });
    await vuelta;
    await parada;
    expect(detenido).toBe(true);
    expect(p.activo()).toBe(false);
    expect(reloj.activos().filter((t) => t.ms === 1000)).toHaveLength(0);
  });

  it("detener() sin vuelta en curso cancela lo programado", async () => {
    const reloj = relojFalso();
    const p = crearPlanificador({ ejecutar: jest.fn(), intervaloMs: 1000, tiempoMaxMs: 1000, retrasoInicialMs: 5, log: logSilencioso(), ...reloj });
    p.iniciar();
    await p.detener();
    expect(reloj.activos()).toHaveLength(0);
    expect(p.activo()).toBe(false);
  });

  it("una vuelta que excede el tiempo máximo + gracia se registra y el candado evita el empalme", async () => {
    const reloj = relojFalso();
    const log = logSilencioso();
    const p = crearPlanificador({ ejecutar: () => new Promise(() => {}), intervaloMs: 1000, tiempoMaxMs: 5000, retrasoInicialMs: 1, log, ...reloj });
    p.iniciar();
    const vuelta = reloj.disparar(1);
    await Promise.resolve();
    await reloj.disparar(65000); // tiempoMax + 60 s de gracia
    await vuelta;
    expect(log.error).toHaveBeenCalledWith(expect.stringMatching(/excedió el tiempo máximo/));
    expect(reloj.activos().some((t) => t.ms === 1000)).toBe(true);
  });
});

describe("planificador: arranque desde el entorno", () => {
  it("apagado: no crea nada ni consulta el motor", async () => {
    const crear = jest.fn();
    const r = iniciarPlanificadorAsistencia({ env: {}, log: logSilencioso(), crear });
    expect(crear).not.toHaveBeenCalled();
    expect(r.activo).toBe(false);
    await expect(r.detener()).resolves.toBeUndefined();
  });

  it("activo: crea el planificador con la configuración del entorno y lo inicia", () => {
    const iniciar = jest.fn();
    const crear = jest.fn(() => ({ iniciar, detener: jest.fn() }));
    const ejecutar = jest.fn();
    const r = iniciarPlanificadorAsistencia({
      env: { ASISTENCIA_MOTOR_ACTIVO: "true", ASISTENCIA_MOTOR_INTERVALO_MIN: "5", ASISTENCIA_MOTOR_TIEMPO_MAX_MIN: "3", ASISTENCIA_MOTOR_RETRASO_INICIAL_S: "0" },
      log: logSilencioso(), crear, ejecutar,
    });
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ intervaloMs: 300000, tiempoMaxMs: 180000, retrasoInicialMs: 0, ejecutar }));
    expect(iniciar).toHaveBeenCalledTimes(1);
    expect(r.activo).toBe(true);
  });
});

describe("planificador: integración con app.js", () => {
  const fs = require("fs");
  const path = require("path");
  const app = fs.readFileSync(path.join(__dirname, "../../../portal/backend/app.js"), "utf8");

  it("se inicia SOLO dentro de iniciar() (no al importar el módulo) y se detiene en el apagado", () => {
    const antes = app.slice(0, app.indexOf("async function iniciar()"));
    expect(antes).not.toMatch(/iniciarPlanificadorAsistencia\(/);
    const cuerpo = app.slice(app.indexOf("async function iniciar()"), app.indexOf("if (require.main === module)"));
    expect(cuerpo).toMatch(/iniciarPlanificadorAsistencia\(\{ env: process\.env \}\)/);
    expect(cuerpo).toMatch(/planificadorAsistencia\.detener\(\)/);
    expect(cuerpo.indexOf("planificadorAsistencia.detener()")).toBeLessThan(cuerpo.indexOf("await cerrarTodos"));
  });

  it("un fallo al iniciar el planificador no tumba el portal (try/catch sin process.exit)", () => {
    const bloque = app.slice(app.indexOf("let planificadorAsistencia"), app.indexOf("// Cierre ordenado"));
    expect(bloque).toMatch(/try \{[\s\S]*\} catch/);
    expect(bloque).not.toMatch(/process\.exit/);
  });

  it("importar app.js no activa el planificador aunque el entorno lo pida", () => {
    const previo = process.env.ASISTENCIA_MOTOR_ACTIVO;
    process.env.ASISTENCIA_MOTOR_ACTIVO = "true";
    const espia = jest.fn(() => ({ detener: async () => {} }));
    jest.isolateModules(() => {
      jest.doMock("../services/asistencia/planificador", () => ({ iniciarPlanificadorAsistencia: espia }));
      jest.doMock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn().mockResolvedValue({ rows: [] }), connect: jest.fn() }, probarConexion: jest.fn() }));
      jest.doMock("../../../portal/backend/services/storage.service", () => ({ asegurarBuckets: jest.fn().mockResolvedValue() }));
      require("../../../portal/backend/app");
    });
    expect(espia).not.toHaveBeenCalled();
    process.env.ASISTENCIA_MOTOR_ACTIVO = previo;
    if (previo === undefined) delete process.env.ASISTENCIA_MOTOR_ACTIVO;
  });
});

describe("compose", () => {
  const fs = require("fs");
  const path = require("path");
  const leer = (f) => fs.readFileSync(path.join(__dirname, "../../../../", f), "utf8");

  it("el motor está apagado por omisión en dev y encendido en staging y prod (con comentario)", () => {
    expect(leer("docker-compose.dev.yml")).toMatch(/ASISTENCIA_MOTOR_ACTIVO: \$\{ASISTENCIA_MOTOR_ACTIVO:-false\}/);
    for (const f of ["docker-compose.staging.yml", "docker-compose.prod.yml"]) {
      const c = leer(f);
      expect(c).toMatch(/ASISTENCIA_MOTOR_ACTIVO: \$\{ASISTENCIA_MOTOR_ACTIVO:-true\}/);
      expect(c).toMatch(/# Motor de análisis de asistencia/);
      expect(c).toMatch(/ASISTENCIA_MOTOR_INTERVALO_MIN: \$\{ASISTENCIA_MOTOR_INTERVALO_MIN:-15\}/);
    }
  });
});
