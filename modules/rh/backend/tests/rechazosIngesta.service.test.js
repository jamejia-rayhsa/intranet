jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn() } }));

const { crearRegistradorRechazos } = require("../services/rechazosIngesta.service");

const HORA = 3600000;
function montar(opciones = {}) {
  const estado = { t: 10 * HORA + 1000, escritos: [], podas: [], temporizadores: [] };
  const registrador = crearRegistradorRechazos({
    escribir: jest.fn(async (fila) => {
      estado.escritos.push(fila);
    }),
    podar: jest.fn(async (dias) => {
      estado.podas.push(dias);
    }),
    ahora: () => estado.t,
    programar: (fn, ms) => {
      const t = { fn, ms, unref: jest.fn() };
      estado.temporizadores.push(t);
      return t;
    },
    ...opciones,
  });
  const vaciar = () => new Promise((r) => setImmediate(r));
  return { estado, registrador, vaciar };
}
const evento = (extra = {}) => ({ ip: "203.0.113.7", motivo: "llave_incorrecta", prefijo: "rhk_aaaaaaaa", llaveId: 3, ...extra });

describe("rechazosIngesta.service - auditoría acotada", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("el primer rechazo de una (IP, motivo) se escribe de inmediato con la hora truncada", async () => {
    const { registrador, estado, vaciar } = montar();
    registrador.registrar(evento());
    await vaciar();
    expect(estado.escritos).toEqual([{ hora: new Date(10 * HORA), ip: "203.0.113.7", motivo: "llave_incorrecta", prefijo: "rhk_aaaaaaaa", llaveId: 3, intentos: 1 }]);
  });

  it("los siguientes en el mismo minuto NO escriben: se acumulan y un temporizador (sin retener el proceso) los vuelca", async () => {
    const { registrador, estado, vaciar } = montar();
    for (let i = 0; i < 50; i += 1) registrador.registrar(evento());
    await vaciar();
    expect(estado.escritos).toHaveLength(1);
    expect(estado.temporizadores).toHaveLength(1);
    expect(estado.temporizadores[0].unref).toHaveBeenCalled();
    estado.t += 60_000;
    estado.temporizadores[0].fn();
    await vaciar();
    expect(estado.escritos).toHaveLength(2);
    expect(estado.escritos[1].intentos).toBe(49);
  });

  it("pasado el minuto un nuevo intento escribe con lo acumulado", async () => {
    const { registrador, estado, vaciar } = montar();
    registrador.registrar(evento());
    registrador.registrar(evento());
    registrador.registrar(evento());
    estado.t += 61_000;
    registrador.registrar(evento());
    await vaciar();
    expect(estado.escritos.map((e) => e.intentos)).toEqual([1, 3]);
  });

  it("claves distintas (otra IP u otro motivo) escriben por separado", async () => {
    const { registrador, estado, vaciar } = montar();
    registrador.registrar(evento());
    registrador.registrar(evento({ ip: "203.0.113.8" }));
    registrador.registrar(evento({ motivo: "sin_llave", prefijo: null, llaveId: null }));
    await vaciar();
    expect(estado.escritos).toHaveLength(3);
  });

  it("tope de claves NUEVAS por hora: las demás se descartan (la tabla no crece con un barrido de IP)", async () => {
    const { registrador, estado, vaciar } = montar({ maxClavesPorHora: 5 });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 50; i += 1) registrador.registrar(evento({ ip: `203.0.113.${i}` }));
    await vaciar();
    expect(estado.escritos).toHaveLength(5);
    expect(registrador._estado()).toEqual({ claves: 5, descartados: 45 });
    // una clave ya vista sigue contando
    registrador.registrar(evento({ ip: "203.0.113.0" }));
    expect(registrador._estado().descartados).toBe(45);
  });

  it("al cambiar la hora vuelca lo pendiente de la hora anterior y reinicia el tope", async () => {
    const { registrador, estado, vaciar } = montar({ maxClavesPorHora: 1 });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    registrador.registrar(evento());
    registrador.registrar(evento());
    registrador.registrar(evento());
    estado.t += HORA;
    registrador.registrar(evento({ ip: "203.0.113.50" }));
    await vaciar();
    expect(estado.escritos.map((e) => [e.hora.getTime(), e.intentos])).toEqual([
      [10 * HORA, 1],
      [10 * HORA, 2],
      [11 * HORA, 1],
    ]);
  });

  it("sin IP usa 'desconocida' y recorta la IP a 45 caracteres", async () => {
    const { registrador, estado, vaciar } = montar();
    registrador.registrar(evento({ ip: null }));
    registrador.registrar(evento({ ip: "a".repeat(80), motivo: "sin_llave" }));
    await vaciar();
    expect(estado.escritos[0].ip).toBe("desconocida");
    expect(estado.escritos[1].ip).toHaveLength(45);
  });

  it("poda las filas de más de 30 días como mucho cada 6 horas", async () => {
    const { registrador, estado, vaciar } = montar();
    registrador.registrar(evento());
    registrador.registrar(evento({ ip: "203.0.113.2" }));
    await vaciar();
    expect(estado.podas).toEqual([30]);
    estado.t += 5 * HORA;
    registrador.registrar(evento({ ip: "203.0.113.3" }));
    await vaciar();
    expect(estado.podas).toEqual([30]);
    estado.t += 2 * HORA;
    registrador.registrar(evento({ ip: "203.0.113.4" }));
    await vaciar();
    expect(estado.podas).toEqual([30, 30]);
  });

  it("si escribir o podar fallan, no lanza: solo deja el mensaje en el log, sin datos de la petición", async () => {
    const { registrador, vaciar } = montar({
      escribir: jest.fn().mockRejectedValue(new Error("BD caída")),
      podar: jest.fn().mockRejectedValue(new Error("BD caída (poda)")),
    });
    expect(() => registrador.registrar(evento())).not.toThrow();
    await vaciar();
    await vaciar();
    expect(console.error).toHaveBeenCalledWith("[Ingesta] No se pudo registrar el rechazo:", "BD caída");
    expect(console.error).toHaveBeenCalledWith("[Ingesta] No se pudo podar los rechazos:", "BD caída (poda)");
  });
});
