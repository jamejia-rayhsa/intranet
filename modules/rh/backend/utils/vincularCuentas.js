// Lógica pura de la vinculación cuenta de usuario <-> empleado (solo escribe empleados.usuario_id).
// Sin acceso a BD: la usan el modelo, el controlador y las pruebas.

const MAX_PARES_VINCULAR = 50; // lote de ejecución
const MAX_LIMITE_PAGINA = 100;
const LIMITE_PAGINA_DEFECTO = 25;
const MAX_BUSQUEDA = 100;

const ESTADOS_SUGERENCIA = {
  EXACTA: "exacta",
  VARIAS: "varias",
  SIN: "sin_coincidencia",
};

// Minúsculas, sin acentos ni signos, espacios simples. Sirve para comparar nombres y apellidos.
function normalizarNombre(texto) {
  return String(texto === null || texto === undefined ? "" : texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

// Entero positivo int4 (acepta número o cadena de dígitos); null si no lo es.
function enteroPositivo(valor) {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  if (!/^\d+$/.test(String(valor))) return null;
  const n = Number(valor);
  return Number.isSafeInteger(n) && n >= 1 && n <= 2147483647 ? n : null;
}

// Página y límite de una consulta con tope.
function normalizarPaginacion(pagina, limite) {
  const p = enteroPositivo(pagina) || 1;
  const l = Math.min(enteroPositivo(limite) || LIMITE_PAGINA_DEFECTO, MAX_LIMITE_PAGINA);
  return { pagina: Math.min(p, 100000), limite: l };
}

function normalizarBusqueda(valor) {
  if (typeof valor !== "string") return "";
  return valor.split("\u0000").join("").trim().slice(0, MAX_BUSQUEDA);
}

/**
 * Sugiere el empleado de cada cuenta por nombre. `cuentas`: [{id, nombre, apellido}], `empleados`: [{id, nombre,
 * apellido_paterno, apellido_materno}] (solo activos y sin cuenta: el llamador filtra). Reglas:
 *  - nombre normalizado igual; el apellido de la cuenta empieza por el apellido paterno del empleado (la cuenta guarda
 *    uno o los dos apellidos en una sola columna);
 *  - si hay varios candidatos, el apellido materno desempata (apellido de la cuenta == paterno + materno);
 *  - un empleado que resulta único para DOS cuentas (homónimos) deja a ambas en 'varias': nunca se sugiere un empleado
 *    que otra cuenta reclama igual de bien.
 * Devuelve Map cuentaId -> { estado, candidatos: [empleadoId] }.
 */
function sugerirCoincidencias(cuentas, empleados) {
  const porNombre = new Map();
  for (const e of empleados) {
    const k = normalizarNombre(e.nombre);
    if (!k) continue;
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push({
      id: e.id,
      paterno: normalizarNombre(e.apellido_paterno),
      completo: normalizarNombre(`${e.apellido_paterno || ""} ${e.apellido_materno || ""}`),
      tieneMaterno: Boolean(normalizarNombre(e.apellido_materno)),
    });
  }

  const resultado = new Map();
  for (const c of cuentas) {
    const ap = normalizarNombre(c.apellido);
    const mismos = porNombre.get(normalizarNombre(c.nombre)) || [];
    let candidatos = ap ? mismos.filter((e) => e.paterno && (ap === e.paterno || ap.startsWith(`${e.paterno} `))) : [];
    if (candidatos.length > 1) {
      const finos = candidatos.filter((e) => e.tieneMaterno && ap === e.completo);
      if (finos.length === 1) candidatos = finos;
    }
    if (candidatos.length === 0) resultado.set(c.id, { estado: ESTADOS_SUGERENCIA.SIN, candidatos: [] });
    else if (candidatos.length === 1) resultado.set(c.id, { estado: ESTADOS_SUGERENCIA.EXACTA, candidatos: [candidatos[0].id] });
    else resultado.set(c.id, { estado: ESTADOS_SUGERENCIA.VARIAS, candidatos: candidatos.map((e) => e.id) });
  }

  // Un mismo empleado "único" para dos cuentas: ambas pasan a ambiguas
  const reclamos = new Map();
  for (const [cuentaId, s] of resultado) {
    if (s.estado !== ESTADOS_SUGERENCIA.EXACTA) continue;
    const e = s.candidatos[0];
    if (!reclamos.has(e)) reclamos.set(e, []);
    reclamos.get(e).push(cuentaId);
  }
  for (const [empleadoId, ids] of reclamos) {
    if (ids.length < 2) continue;
    for (const cuentaId of ids) resultado.set(cuentaId, { estado: ESTADOS_SUGERENCIA.VARIAS, candidatos: [empleadoId] });
  }
  return resultado;
}

/**
 * Valida el cuerpo de POST /cuentas/vincular. Devuelve { error } o { pares:[{usuario_id, empleado_id}] }.
 * Rechaza (400) lo malformado, vacío, sobre el tope o con una cuenta o un empleado repetido en el mismo lote.
 */
function validarParesVinculacion(pares) {
  if (!Array.isArray(pares) || pares.length === 0) return { error: "No se recibieron vínculos para aplicar" };
  if (pares.length > MAX_PARES_VINCULAR) {
    return { error: `Máximo ${MAX_PARES_VINCULAR} vínculos por petición (se recibieron ${pares.length})` };
  }
  const validos = [];
  const cuentas = new Set();
  const empleados = new Set();
  for (const p of pares) {
    if (p === null || typeof p !== "object" || Array.isArray(p)) return { error: "Vínculo con formato no válido" };
    const usuario_id = enteroPositivo(p.usuario_id);
    const empleado_id = enteroPositivo(p.empleado_id);
    if (!usuario_id || !empleado_id) return { error: "Vínculo con identificadores no válidos" };
    if (cuentas.has(usuario_id)) return { error: "Una cuenta aparece más de una vez en el lote" };
    if (empleados.has(empleado_id)) return { error: "Un empleado aparece más de una vez en el lote" };
    cuentas.add(usuario_id);
    empleados.add(empleado_id);
    validos.push({ usuario_id, empleado_id });
  }
  return { pares: validos };
}

module.exports = {
  MAX_PARES_VINCULAR, MAX_LIMITE_PAGINA, LIMITE_PAGINA_DEFECTO, MAX_BUSQUEDA, ESTADOS_SUGERENCIA,
  normalizarNombre, enteroPositivo, normalizarPaginacion, normalizarBusqueda, sugerirCoincidencias, validarParesVinculacion,
};
