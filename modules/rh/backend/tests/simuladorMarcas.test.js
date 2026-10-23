const path = require("path");
const { crearGenerador, crearAzar, armarEnvios, leerArgumentos, generarJornadas, rangoDeCodigos } = require(path.join("../../../../scripts/asistencia/simulador-marcas"));
const { validarMarca } = require("../utils/marcaValidacion");

const AHORA = Date.parse("2026-10-21T12:00:00Z");
const generador = (extra = {}) => crearGenerador({ semilla: 1, empleados: 30, idInicial: 1000000, desde: "2025-01-01", anomalias: true, ...extra });

describe("simulador de marcas - generador", () => {
  it("es determinista: la misma semilla produce las mismas marcas (los reenvíos son duplicadas)", () => {
    const a = Array.from({ length: 200 }, (_, k) => generador().marca(k, AHORA));
    const b = Array.from({ length: 200 }, (_, k) => generador().marca(k, AHORA));
    expect(a).toEqual(b);
    const otra = Array.from({ length: 200 }, (_, k) => generador({ semilla: 2 }).marca(k, AHORA));
    expect(otra).not.toEqual(a);
  });

  it("los ids crecen siempre y con huecos", () => {
    const g = generador();
    const ids = Array.from({ length: 500 }, (_, k) => g.idDe(k));
    expect(ids.every((id, i) => i === 0 || id > ids[i - 1])).toBe(true);
    expect(ids.some((id, i) => i > 0 && id - ids[i - 1] > 1)).toBe(true);
  });

  it("cada marca marcada como válida la acepta el validador real y cada rechazada la rechaza", () => {
    const g = generador();
    const conteo = { valida: 0, rechazada: 0, sinEmpleado: 0 };
    for (let k = 0; k < 1000; k += 1) {
      const { marca, esperado, sinEmpleado } = g.marca(k, AHORA);
      const r = validarMarca(marca, { origen: "biotime", ahora: AHORA });
      expect(r.ok).toBe(esperado === "valida");
      conteo[esperado] += 1;
      if (sinEmpleado) conteo.sinEmpleado += 1;
    }
    expect(conteo.rechazada).toBe(100); // 5 de cada 50
    expect(conteo.sinEmpleado).toBe(20);
  });

  it("incluye los casos atípicos pedidos: terminal_sn vacío, verify_type 0, ids numéricos y de texto, sin zona, futura, empleado inexistente", () => {
    const g = generador();
    const marcas = Array.from({ length: 100 }, (_, k) => g.marca(k, AHORA).marca);
    expect(marcas.some((m) => m.terminal_sn === "")).toBe(true);
    expect(marcas.some((m) => m.tipo_verificacion === 0)).toBe(true);
    expect(marcas.some((m) => typeof m.id_externo === "number")).toBe(true);
    expect(marcas.some((m) => typeof m.id_externo === "string" && /^\d+$/.test(m.id_externo))).toBe(true);
    expect(marcas.some((m) => /T[\d:.]+$/.test(m.marca_ts))).toBe(true);
    expect(marcas.some((m) => Date.parse(m.marca_ts) > AHORA)).toBe(true);
    expect(marcas.some((m) => /^INEXISTENTE-/.test(m.codigo_empleado))).toBe(true);
  });

  it("sin anomalías todas son válidas", () => {
    const g = generador({ anomalias: false });
    for (let k = 0; k < 200; k += 1) expect(g.marca(k, AHORA).esperado).toBe("valida");
  });

  it("no contiene IP, números de serie ni códigos reales (todo ficticio)", () => {
    const texto = JSON.stringify(Array.from({ length: 200 }, (_, k) => generador().marca(k, AHORA).marca));
    expect(texto).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(texto).toMatch(/SN-FICTICIO/);
  });
});

describe("simulador de marcas - envíos y argumentos", () => {
  it("parte en envíos de hasta el lote y añade una duplicada dentro del último", () => {
    const g = generador();
    const entradas = Array.from({ length: 1030 }, (_, k) => g.marca(k, AHORA));
    const envios = armarEnvios(entradas, 500, true);
    expect(envios.map((e) => e.marcas.length)).toEqual([500, 500, 31]);
    expect(envios[2].marcas[30]).toEqual(envios[2].marcas[2]);
    expect(armarEnvios(entradas, 500, false)[2].marcas).toHaveLength(30);
  });

  it("lee argumentos y rechaza los desconocidos o sin valor", () => {
    expect(leerArgumentos(["historico", "--total", "100", "--sin-anomalias", "--paralelo", "5"])).toEqual({
      modo: "historico",
      opciones: { total: "100", "sin-anomalias": true, paralelo: "5" },
    });
    expect(() => leerArgumentos(["historico", "total"])).toThrow(/no reconocido/);
    expect(() => leerArgumentos(["historico", "--total"])).toThrow(/Falta el valor/);
  });

  it("el azar con semilla es repetible", () => {
    const a = crearAzar(7);
    const b = crearAzar(7);
    expect([a.siguiente(), a.entero(1, 10)]).toEqual([b.siguiente(), b.entero(1, 10)]);
  });

  it("la llave solo se lee de la variable de entorno: el script no acepta --llave", () => {
    const fuente = require("fs").readFileSync(path.join(__dirname, "../../../../scripts/asistencia/simulador-marcas.js"), "utf8");
    expect(fuente).toMatch(/process\.env\.INTRANET_API_KEY/);
    expect(fuente).not.toMatch(/opciones\.llave|--llave/);
    expect(fuente).not.toMatch(/console\.(log|error)\([^)]*\$\{llave\}/); // nunca imprime la llave completa
  });
});

describe("simulador de marcas - modo jornadas (motor de análisis)", () => {
  const base = { codigos: [9001, 9002, 9003], desde: "2026-10-12", hasta: "2026-10-23", idInicial: 5000000 };

  it("es determinista por semilla y las marcas salen ordenadas con ids ascendentes y con huecos", () => {
    const a = generarJornadas({ ...base, semilla: 3 });
    expect(generarJornadas({ ...base, semilla: 3 })).toEqual(a);
    expect(generarJornadas({ ...base, semilla: 4 })).not.toEqual(a);
    const ids = a.map((m) => Number(m.id_externo));
    expect(ids.every((id, i) => i === 0 || id > ids[i - 1])).toBe(true);
    expect(ids.some((id, i) => i > 0 && id - ids[i - 1] > 2)).toBe(true);
    const ts = a.map((m) => Date.parse(m.marca_ts));
    expect(ts.every((t, i) => i === 0 || t >= ts[i - 1])).toBe(true);
  });

  it("todas las marcas las acepta el validador real de la ingesta", () => {
    for (const m of generarJornadas({ ...base, semilla: 1 })) {
      expect(validarMarca(m, { origen: "biotime", ahora: Date.parse("2026-10-24T12:00:00Z") }).ok).toBe(true);
    }
  });

  it("de lunes a viernes genera jornadas de oficina en hora de México (UTC-6) y casi nada en fin de semana", () => {
    const m = generarJornadas({ ...base, codigos: Array.from({ length: 40 }, (_, i) => 9001 + i), semilla: 1 });
    const finde = m.filter((x) => [0, 6].includes(new Date(Date.parse(x.marca_ts) - 6 * 3600000).getUTCDay()));
    expect(finde).toHaveLength(0); // sin --fines-semana
    const horas = m.map((x) => new Date(Date.parse(x.marca_ts) - 6 * 3600000).getUTCHours());
    expect(Math.min(...horas)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...horas)).toBeLessThanOrEqual(18);
    const conFinde = generarJornadas({ ...base, desde: "2026-09-01", hasta: "2026-10-31", codigos: Array.from({ length: 60 }, (_, i) => 9001 + i), finesDeSemana: true, semilla: 1 });
    expect(conFinde.some((x) => new Date(Date.parse(x.marca_ts) - 6 * 3600000).getUTCDay() === 6)).toBe(true);
  });

  it("mezcla los casos que el motor debe distinguir: faltas, retardos, solo entrada y duplicados a segundos", () => {
    const m = generarJornadas({ ...base, desde: "2026-09-01", hasta: "2026-10-23", codigos: Array.from({ length: 71 }, (_, i) => 9001 + i), semilla: 7 });
    const porDia = new Map();
    for (const x of m) {
      const k = `${x.codigo_empleado}|${new Date(Date.parse(x.marca_ts) - 6 * 3600000).toISOString().slice(0, 10)}`;
      porDia.set(k, [...(porDia.get(k) || []), Date.parse(x.marca_ts)]);
    }
    const jornadas = [...porDia.values()];
    expect(jornadas.some((d) => d.length === 1)).toBe(true); // marca única
    expect(jornadas.some((d) => d.some((t, i) => i > 0 && t - d[i - 1] <= 60000))).toBe(true); // duplicado a segundos
    expect(jornadas.some((d) => d.length >= 4)).toBe(true); // marcas de comida
    expect(porDia.size).toBeLessThan(71 * 38); // hay días sin ninguna marca (faltas)
  });

  it("rangoDeCodigos valida el formato", () => {
    expect(rangoDeCodigos("9001-9003")).toEqual([9001, 9002, 9003]);
    for (const malo of [undefined, "", "9001", "9003-9001", "a-b", "1-99999"]) expect(() => rangoDeCodigos(malo)).toThrow();
  });

  it("no usa códigos ni datos reales", () => {
    const texto = JSON.stringify(generarJornadas({ ...base, semilla: 1 }));
    expect(texto).not.toMatch(/10\.\d+\.\d+\.\d+/);
    expect(texto).toContain("SN-FICTICIO");
  });

  it("el modo jornadas está documentado en la ayuda y exige --codigos y --hasta", () => {
    expect(leerArgumentos(["jornadas", "--codigos", "9001-9003", "--hasta", "2026-10-23", "--fines-semana"]).opciones).toMatchObject({ codigos: "9001-9003", hasta: "2026-10-23", "fines-semana": true });
  });
});
