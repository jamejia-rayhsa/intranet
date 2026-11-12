const Plan = require("../services/planificadorConsumoMba3");

const log = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

describe("leerConfig", () => {
  it("apagado por omisión y solo activo con CONVENIOS_MBA3_SYNC_ACTIVO=true", () => {
    expect(Plan.leerConfig({}, log()).activo).toBe(false);
    expect(Plan.leerConfig({ CONVENIOS_MBA3_SYNC_ACTIVO: "TRUE" }, log()).activo).toBe(true);
    expect(Plan.leerConfig({ CONVENIOS_MBA3_SYNC_ACTIVO: "1" }, log()).activo).toBe(false);
  });
  it("hora por omisión 3; una hora inválida avisa y usa la de omisión", () => {
    expect(Plan.leerConfig({}, log()).hora).toBe(3);
    expect(Plan.leerConfig({ CONVENIOS_MBA3_SYNC_HORA: "5" }, log()).hora).toBe(5);
    const l = log();
    expect(Plan.leerConfig({ CONVENIOS_MBA3_SYNC_HORA: "25" }, l).hora).toBe(3);
    expect(l.warn).toHaveBeenCalled();
  });
});

describe("debeEjecutar (una vez al día)", () => {
  const config = { hora: 3 };
  const ahora = new Date("2026-11-10T12:00:00Z").getTime();
  const base = { hoy_mx: "2026-11-10", hora_mx: 5, fecha_ok_mx: "2026-11-09", ultima_ejecucion: "2026-11-09T09:00:00Z" };

  it("corre cuando ya pasó la hora y no hubo vuelta exitosa hoy", () => {
    expect(Plan.debeEjecutar(base, config, ahora)).toBe(true);
  });
  it("no corre antes de la hora configurada", () => {
    expect(Plan.debeEjecutar({ ...base, hora_mx: 2 }, config, ahora)).toBe(false);
  });
  it("no repite si ya hubo una vuelta exitosa hoy (aunque el backend se reinicie)", () => {
    expect(Plan.debeEjecutar({ ...base, fecha_ok_mx: "2026-11-10" }, config, ahora)).toBe(false);
  });
  it("tras un fallo espera al menos 60 min antes de reintentar", () => {
    const hace30 = new Date(ahora - 30 * 60000).toISOString();
    const hace90 = new Date(ahora - 90 * 60000).toISOString();
    expect(Plan.debeEjecutar({ ...base, ultima_ejecucion: hace30 }, config, ahora)).toBe(false);
    expect(Plan.debeEjecutar({ ...base, ultima_ejecucion: hace90 }, config, ahora)).toBe(true);
  });
  it("sin estado no corre", () => {
    expect(Plan.debeEjecutar(null, config, ahora)).toBe(false);
  });
});

describe("crearPlanificador.revisar", () => {
  const estadoQueToca = { hoy_mx: "2026-11-10", hora_mx: 5, fecha_ok_mx: null, ultima_ejecucion: null };

  it("ejecuta la sincronización cuando toca", async () => {
    const ejecutar = jest.fn().mockResolvedValue({ consumos: { insertados: 2, actualizados: 0 }, devoluciones: {} });
    const p = Plan.crearPlanificador({ config: { hora: 3 }, obtenerEstado: async () => estadoQueToca, ejecutar, log: log() });
    await p.revisar();
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  it("no ejecuta si no toca", async () => {
    const ejecutar = jest.fn();
    const p = Plan.crearPlanificador({ config: { hora: 3 }, obtenerEstado: async () => ({ ...estadoQueToca, hora_mx: 1 }), ejecutar, log: log() });
    await p.revisar();
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it("un error no tumba el proceso y solo registra el mensaje", async () => {
    const l = log();
    const ejecutar = jest.fn().mockRejectedValue(Object.assign(new Error("MBA3: caído"), { config: { headers: { secreto: "x" } } }));
    const p = Plan.crearPlanificador({ config: { hora: 3 }, obtenerEstado: async () => estadoQueToca, ejecutar, log: l });
    await expect(p.revisar()).resolves.toBeUndefined();
    expect(l.error).toHaveBeenCalledWith(expect.stringContaining("MBA3: caído"));
    expect(JSON.stringify(l.error.mock.calls)).not.toMatch(/secreto/);
  });

  it("no solapa dos vueltas", async () => {
    let liberar;
    const ejecutar = jest.fn(() => new Promise((r) => (liberar = r)));
    const p = Plan.crearPlanificador({ config: { hora: 3 }, obtenerEstado: async () => estadoQueToca, ejecutar, log: log() });
    const primera = p.revisar();
    await Promise.resolve();
    await p.revisar();
    liberar({});
    await primera;
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });
});

describe("iniciarPlanificadorConsumoMba3", () => {
  it("apagado: no programa nada", () => {
    const r = Plan.iniciarPlanificadorConsumoMba3({ env: {}, log: log() });
    expect(r.activo).toBe(false);
  });
  it("activo: programa y se puede detener", async () => {
    const r = Plan.iniciarPlanificadorConsumoMba3({
      env: { CONVENIOS_MBA3_SYNC_ACTIVO: "true" },
      log: log(),
      obtenerEstado: async () => null,
      ejecutar: async () => ({}),
    });
    expect(r.activo).toBe(true);
    await r.detener();
  });
});
