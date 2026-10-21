#!/usr/bin/env node
/* eslint-disable no-console */
// Simulador de la interfaz con BioTime: genera marcas FICTICIAS y las envía al endpoint de ingesta
// (POST /api/asistencia/ingesta/marcas) con la llave X-Api-Key. Sin dependencias (Node >= 18, fetch nativo).
// Uso y ejemplos: docs/asistencia/simulador-marcas.md. Contrato: docs/asistencia/contrato-ingesta-marcas.md.
//
//   INTRANET_API_KEY=rhk_... node scripts/asistencia/simulador-marcas.js historico --total 20000
//   INTRANET_API_KEY=rhk_... node scripts/asistencia/simulador-marcas.js incremental --ciclos 3 --por-ciclo 120
//
// La llave SOLO se lee de la variable de entorno (nunca como argumento: quedaría en el historial del shell).

const MAX_POR_ENVIO = 500;

function ayuda() {
  console.log(`Simulador de marcas de asistencia (datos ficticios)

Uso: INTRANET_API_KEY=<llave> node scripts/asistencia/simulador-marcas.js <modo> [opciones]

Modos
  historico     carga histórica: --total marcas en lotes de --lote, en orden ascendente de id
  incremental   ciclos como los de la interfaz: GET /estado -> lee el cursor -> envía las marcas nuevas
                (retrocede --retroceso ids para demostrar que los duplicados no hacen daño)
  estado        solo consulta GET /estado

Variables de entorno
  INTRANET_API_KEY   (obligatoria) llave de ingesta
  INTRANET_URL       URL base (por omisión http://localhost:4000)

Opciones comunes
  --lote N           marcas por envío, 1..${MAX_POR_ENVIO} (por omisión ${MAX_POR_ENVIO})
  --semilla N        semilla del generador: la misma semilla produce los MISMOS datos (idempotencia)
  --sin-anomalias    solo marcas válidas (por omisión se mezclan casos atípicos y erróneos)
  --empleados N      cuántos códigos de empleado ficticios (1..N) usa (por omisión 30)
  --id-inicial N     primer id_externo posible (por omisión 1000000)
  --desde AAAA-MM-DD fecha de la primera marca (por omisión 2025-01-01)
  --pausa-ms N       espera entre envíos (por omisión 0)
  --silencioso       solo el resumen final

historico
  --total N          marcas a generar (por omisión 20000)
  --paralelo N       N trabajadores envían EXACTAMENTE los mismos lotes a la vez (prueba de concurrencia)
  --repetir N        repite cada lote N veces seguidas (prueba de reintento idempotente)

incremental
  --ciclos N         número de ciclos (por omisión 3)
  --por-ciclo N      marcas nuevas por ciclo (por omisión 120)
  --intervalo-s N    espera entre ciclos (por omisión 0; la interfaz real usa 900)
  --retroceso N      ids que se retroceden respecto del cursor (por omisión 300)
`);
}

// --- generador pseudoaleatorio con semilla (mulberry32): mismos datos con la misma semilla ---
function crearAzar(semilla) {
  let a = semilla >>> 0;
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    siguiente,
    entero: (min, max) => min + Math.floor(siguiente() * (max - min + 1)),
    elegir: (lista) => lista[Math.floor(siguiente() * lista.length)],
  };
}

function leerArgumentos(argv) {
  const [modo, ...resto] = argv;
  const opciones = {};
  for (let i = 0; i < resto.length; i += 1) {
    const arg = resto[i];
    if (!arg.startsWith("--")) throw new Error(`Argumento no reconocido: ${arg}`);
    const nombre = arg.slice(2);
    if (["sin-anomalias", "silencioso", "ayuda"].includes(nombre)) {
      opciones[nombre] = true;
    } else {
      const valor = resto[i + 1];
      if (valor === undefined || valor.startsWith("--")) throw new Error(`Falta el valor de --${nombre}`);
      opciones[nombre] = valor;
      i += 1;
    }
  }
  return { modo, opciones };
}

const numero = (valor, porOmision, { min = 0, max = Number.MAX_SAFE_INTEGER, nombre } = {}) => {
  if (valor === undefined) return porOmision;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`--${nombre} debe ser un entero entre ${min} y ${max}`);
  return n;
};

// --- generación de marcas ---
// Un "mundo" determinista: el id k produce siempre la misma marca (la semilla se mezcla con el id), de modo
// que un reenvío o un retroceso del cursor produce marcas idénticas (duplicadas).
function crearGenerador({ semilla, empleados, idInicial, desde, anomalias }) {
  const base = Date.parse(`${desde}T12:00:00Z`);
  const sedes = ["SEDE-A", "SEDE-B", "SEDE-C"];
  const terminales = ["SN-FICTICIO-001", "SN-FICTICIO-002", "SN-FICTICIO-003"];
  const codigos = Array.from({ length: empleados }, (_, i) => String(i + 1));

  // El id k-ésimo del mundo: crece con huecos (como iclock_transaction)
  const idDe = (k) => idInicial + k * 2 + Math.floor(k / 7) * 3;

  function marcaValida(k, ahoraMs) {
    const azar = crearAzar((semilla * 2654435761 + k) >>> 0);
    const id = idDe(k);
    const marcaMs = Math.min(base + k * 61_000 + azar.entero(0, 59_000), ahoraMs - 60_000);
    const sede = azar.elegir(sedes);
    const marca = {
      id_externo: azar.siguiente() < 0.5 ? String(id) : id, // número o texto: ambos válidos
      codigo_empleado: azar.siguiente() < 0.1 ? `${azar.elegir(codigos)} ` : azar.elegir(codigos),
      marca_ts: new Date(marcaMs).toISOString(),
      subida_ts: new Date(marcaMs + azar.entero(1, 3600) * 1000).toISOString(),
      estado_marca: azar.siguiente() < 0.98 ? "0" : azar.entero(1, 5),
      tipo_verificacion: 15,
      terminal_sn: azar.elegir(terminales),
      terminal_alias: sede,
      area_externa: sede,
      crudo: { work_code: "0", source: 1, is_attendance: null },
    };
    return marca;
  }

  // Casos atípicos que la intranet debe ACEPTAR y casos erróneos que debe RECHAZAR, repartidos por posición
  function marca(k, ahoraMs) {
    const m = marcaValida(k, ahoraMs);
    if (!anomalias) return { marca: m, esperado: "valida" };
    const rol = k % 50;
    switch (rol) {
      case 3:
        return { marca: { ...m, terminal_sn: "", terminal_alias: "", area_externa: "" }, esperado: "valida" }; // cadena vacía: válida
      case 7:
        return { marca: { ...m, tipo_verificacion: 0, crudo: { work_code: "0", source: 2 } }, esperado: "valida" }; // verify_type 0
      case 11:
        return { marca: { ...m, codigo_empleado: `INEXISTENTE-${k}` }, esperado: "valida", sinEmpleado: true };
      case 13:
        return { marca: { ...m, subida_ts: null, estado_marca: null }, esperado: "valida" };
      case 17:
        return { marca: { ...m, marca_ts: m.marca_ts.replace("Z", "") }, esperado: "rechazada" }; // sin zona horaria
      case 23:
        return { marca: { ...m, marca_ts: new Date(ahoraMs + 3 * 86_400_000).toISOString() }, esperado: "rechazada" }; // futura
      case 29:
        return { marca: { ...m, codigo_empleado: "   " }, esperado: "rechazada" };
      case 37:
        return { marca: { ...m, id_externo: "no-numerico" }, esperado: "rechazada" };
      case 41:
        return { marca: { ...m, crudo: { nota: "x".repeat(3000) } }, esperado: "rechazada" }; // crudo > 2 KB
      default:
        return { marca: m, esperado: "valida" };
    }
  }

  return { idDe, marca, codigos };
}

// --- cliente HTTP con la política de reintento del contrato ---
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function crearCliente({ url, llave, silencioso }) {
  const base = url.replace(/\/+$/, "");
  const estadisticas = { envios: 0, reintentos: 0, esperas429: 0, errores: [] };

  async function pedir(metodo, ruta, cuerpo) {
    const esperas = [5000, 30000, 120000];
    for (let intento = 0; ; intento += 1) {
      let res;
      try {
        res = await fetch(`${base}${ruta}`, {
          method: metodo,
          headers: { "X-Api-Key": llave, "Content-Type": "application/json" },
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        });
      } catch (error) {
        if (intento >= esperas.length) throw new Error(`Sin respuesta del servidor: ${error.message}`);
        estadisticas.reintentos += 1;
        if (!silencioso) console.log(`  red caída (${error.message}); reintento en ${esperas[intento] / 1000} s`);
        await dormir(esperas[intento]);
        continue;
      }
      if (res.status === 429) {
        const seg = Math.max(1, Number(res.headers.get("retry-after")) || 1);
        estadisticas.esperas429 += 1;
        if (!silencioso) console.log(`  429: espero ${seg} s (Retry-After)`);
        await dormir(seg * 1000);
        continue;
      }
      if (res.status >= 500) {
        if (intento >= esperas.length) throw new Error(`El servidor respondió ${res.status} tras ${esperas.length} reintentos`);
        estadisticas.reintentos += 1;
        if (!silencioso) console.log(`  ${res.status}: reintento en ${esperas[intento] / 1000} s`);
        await dormir(esperas[intento]);
        continue;
      }
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { estado: res.status, json };
    }
  }

  return {
    estadisticas,
    estado: () => pedir("GET", "/api/asistencia/ingesta/estado"),
    enviar: (marcas) => {
      estadisticas.envios += 1;
      return pedir("POST", "/api/asistencia/ingesta/marcas", { origen: "biotime", marcas });
    },
  };
}

function sumar(total, datos) {
  for (const campo of ["recibidas", "insertadas", "duplicadas", "rechazadas", "sin_empleado"]) total[campo] += datos[campo] || 0;
}
const totalVacio = () => ({ recibidas: 0, insertadas: 0, duplicadas: 0, rechazadas: 0, sin_empleado: 0 });

// Parte una lista en envíos y, como lo haría la interfaz, repite alguna marca dentro del mismo envío
function armarEnvios(entradas, lote, anomalias) {
  const envios = [];
  for (let i = 0; i < entradas.length; i += lote) {
    const grupo = entradas.slice(i, i + lote).map((e) => e.marca);
    if (anomalias && grupo.length > 10 && grupo.length < lote) grupo.push({ ...grupo[2] }); // duplicada dentro del mismo envío
    envios.push({ marcas: grupo, esperadas: entradas.slice(i, i + lote) });
  }
  return envios;
}

async function enviarLote(cliente, marcas, etiqueta, silencioso) {
  const t0 = process.hrtime.bigint();
  const { estado, json } = await cliente.enviar(marcas);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (estado !== 200 || !json || json.exito !== true) {
    throw new Error(`${etiqueta}: respuesta ${estado} ${json && json.mensaje ? `(${json.mensaje})` : ""}`);
  }
  if (!silencioso) {
    const d = json.datos;
    console.log(
      `  ${etiqueta}: lote ${d.lote_id} recibidas=${d.recibidas} insertadas=${d.insertadas} duplicadas=${d.duplicadas} rechazadas=${d.rechazadas} sin_empleado=${d.sin_empleado} cursor=${d.ultimo_id_externo} (${ms.toFixed(0)} ms)`,
    );
  }
  return { datos: json.datos, ms };
}

async function modoHistorico(cliente, o) {
  const total = numero(o.total, 20000, { min: 1, max: 5_000_000, nombre: "total" });
  const lote = numero(o.lote, MAX_POR_ENVIO, { min: 1, max: MAX_POR_ENVIO, nombre: "lote" });
  const paralelo = numero(o.paralelo, 1, { min: 1, max: 50, nombre: "paralelo" });
  const repetir = numero(o.repetir, 1, { min: 1, max: 20, nombre: "repetir" });
  const pausa = numero(o["pausa-ms"], 0, { nombre: "pausa-ms" });
  const gen = o.generador;
  const ahoraMs = Date.now();
  const entradas = Array.from({ length: total }, (_, k) => gen.marca(k, ahoraMs));
  const envios = armarEnvios(entradas, lote, !o["sin-anomalias"]);
  const esperadas = {
    rechazadas: entradas.filter((e) => e.esperado === "rechazada").length,
    sinEmpleado: entradas.filter((e) => e.sinEmpleado).length,
  };

  console.log(`Carga histórica: ${total} marcas en ${envios.length} envíos de hasta ${lote}${paralelo > 1 ? `, ${paralelo} trabajadores simultáneos` : ""}`);
  const t0 = Date.now();
  const totales = totalVacio();
  const tiempos = [];
  const trabajador = async (n) => {
    const propios = totalVacio();
    for (let i = 0; i < envios.length; i += 1) {
      for (let r = 0; r < repetir; r += 1) {
        const etiqueta = `[${paralelo > 1 ? `t${n} ` : ""}${i + 1}/${envios.length}${repetir > 1 ? ` rep${r + 1}` : ""}]`;
        const { datos, ms } = await enviarLote(cliente, envios[i].marcas, etiqueta, o.silencioso);
        sumar(propios, datos);
        tiempos.push(ms);
        if (pausa) await dormir(pausa);
      }
    }
    return propios;
  };
  const resultados = await Promise.all(Array.from({ length: paralelo }, (_, n) => trabajador(n + 1)));
  for (const r of resultados) for (const k of Object.keys(totales)) totales[k] += r[k];
  const seg = (Date.now() - t0) / 1000;
  tiempos.sort((a, b) => a - b);
  const p = (q) => tiempos[Math.min(tiempos.length - 1, Math.floor(tiempos.length * q))].toFixed(0);

  console.log("\nResumen");
  console.log(`  total enviado (suma de respuestas): ${JSON.stringify(totales)}`);
  console.log(`  esperado por envío único: rechazadas=${esperadas.rechazadas} sin_empleado≈${esperadas.sinEmpleado}`);
  console.log(`  tiempo: ${seg.toFixed(1)} s (${(total / seg).toFixed(0)} marcas/s); por envío p50=${p(0.5)} ms p95=${p(0.95)} ms máx=${p(1)} ms`);
  console.log(`  reintentos=${cliente.estadisticas.reintentos} esperas429=${cliente.estadisticas.esperas429}`);
  const estado = await cliente.estado();
  console.log(`  estado del cursor: ${JSON.stringify(estado.json && estado.json.datos)}`);
  return 0;
}

async function modoIncremental(cliente, o) {
  const ciclos = numero(o.ciclos, 3, { min: 1, max: 1000, nombre: "ciclos" });
  const porCiclo = numero(o["por-ciclo"], 120, { min: 1, max: 100000, nombre: "por-ciclo" });
  const lote = numero(o.lote, MAX_POR_ENVIO, { min: 1, max: MAX_POR_ENVIO, nombre: "lote" });
  const intervalo = numero(o["intervalo-s"], 0, { nombre: "intervalo-s" });
  const retroceso = numero(o.retroceso, 300, { nombre: "retroceso" });
  const gen = o.generador;

  for (let ciclo = 1; ciclo <= ciclos; ciclo += 1) {
    console.log(`\nCiclo ${ciclo}/${ciclos}`);
    const { estado, json } = await cliente.estado();
    if (estado !== 200) throw new Error(`GET /estado respondió ${estado}`);
    const cursor = json.datos.ultimo_id_externo === null ? null : Number(json.datos.ultimo_id_externo);
    console.log(`  cursor de la intranet: ${cursor === null ? "ninguno (carga completa)" : cursor}`);
    // Primer índice del mundo cuyo id supera (cursor - retroceso)
    let k = 0;
    const desdeId = cursor === null ? 0 : Math.max(0, cursor - retroceso);
    while (gen.idDe(k) <= desdeId) k += 1;
    const ahoraMs = Date.now();
    const entradas = Array.from({ length: porCiclo + (cursor === null ? 0 : Math.min(retroceso, 150)) }, (_, i) => gen.marca(k + i, ahoraMs));
    const envios = armarEnvios(entradas, lote, !o["sin-anomalias"]);
    const totales = totalVacio();
    for (let i = 0; i < envios.length; i += 1) {
      const { datos } = await enviarLote(cliente, envios[i].marcas, `[${i + 1}/${envios.length}]`, o.silencioso);
      sumar(totales, datos);
    }
    console.log(`  ciclo ${ciclo}: ${JSON.stringify(totales)}`);
    if (ciclo < ciclos && intervalo > 0) await dormir(intervalo * 1000);
  }
  const estado = await cliente.estado();
  console.log(`\nEstado final: ${JSON.stringify(estado.json && estado.json.datos)}`);
  return 0;
}

async function main() {
  const { modo, opciones } = leerArgumentos(process.argv.slice(2));
  if (!modo || modo === "--ayuda" || modo === "ayuda" || opciones.ayuda) {
    ayuda();
    return 0;
  }
  const llave = process.env.INTRANET_API_KEY;
  if (!llave) throw new Error("Define la variable de entorno INTRANET_API_KEY (la llave de ingesta)");
  const url = process.env.INTRANET_URL || "http://localhost:4000";
  const cliente = crearCliente({ url, llave, silencioso: Boolean(opciones.silencioso) });

  if (modo === "estado") {
    const { estado, json } = await cliente.estado();
    console.log(estado, JSON.stringify(json, null, 2));
    return estado === 200 ? 0 : 1;
  }
  if (!["historico", "incremental"].includes(modo)) throw new Error(`Modo desconocido: ${modo} (usa historico, incremental o estado)`);

  opciones.generador = crearGenerador({
    semilla: numero(opciones.semilla, 1, { nombre: "semilla" }),
    empleados: numero(opciones.empleados, 30, { min: 1, max: 100000, nombre: "empleados" }),
    idInicial: numero(opciones["id-inicial"], 1000000, { nombre: "id-inicial" }),
    desde: opciones.desde || "2025-01-01",
    anomalias: !opciones["sin-anomalias"],
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opciones.desde || "2025-01-01")) throw new Error("--desde debe ser AAAA-MM-DD");
  console.log(`Destino: ${url} (llave ${llave.slice(0, 12)}…)`);
  return modo === "historico" ? modoHistorico(cliente, opciones) : modoIncremental(cliente, opciones);
}

if (require.main === module) {
  main().then(
    (codigo) => process.exit(codigo),
    (error) => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    },
  );
}

module.exports = { crearAzar, crearGenerador, armarEnvios, leerArgumentos };
