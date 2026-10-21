const path = require("path");
const { crearGenerador, crearAzar, armarEnvios, leerArgumentos } = require(path.join("../../../../scripts/asistencia/simulador-marcas"));
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
