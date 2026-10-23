// Parámetros del módulo de asistencia (tabla asistencia_parametros, clave/valor). Definición, valores iniciales y
// validación de rangos. Módulo PURO: la lectura y escritura en BD están en motorAsistencia.js.
const { esFechaValida } = require("../../utils/diasHabiles");

const DEFINICION = {
  analisis_desde: { tipo: "fecha", minimo: "2020-01-01", defecto: "2026-09-01", editable: true },
  cierre_automatico_desde: { tipo: "fecha", minimo: "2020-01-01", defecto: "2026-10-16", editable: true },
  dias_cierre: { tipo: "entero", minimo: 0, maximo: 30, defecto: 3, editable: true },
  margen_dia_completo_min: { tipo: "entero", minimo: 0, maximo: 720, defecto: 120, editable: true },
  version_motor: { tipo: "entero", minimo: 1, maximo: 32767, defecto: 1, editable: false },
  ventana_seguridad_dias: { tipo: "entero", minimo: 0, maximo: 31, defecto: 7, editable: true },
  barrido_completo_horas: { tipo: "entero", minimo: 1, maximo: 168, defecto: 24, editable: true },
  // Ventana de comida GLOBAL (HH:MM, inclusive en ambos extremos, a nivel de minuto). Duración = descanso_min del turno.
  comida_desde: { tipo: "hora", defecto: "13:00", editable: true },
  comida_hasta: { tipo: "hora", defecto: "16:00", editable: true },
};
const PATRON_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const aMinutos = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const CLAVES = Object.keys(DEFINICION);
const FECHA_MAXIMA = "2100-12-31";

/**
 * Valida un valor. Devuelve { ok:true, valor } (valor tipado) o { ok:false, mensaje }.
 * Solo se aceptan enteros decimales sin signo ni separadores (nada de "1e2" o "3.0").
 */
function validarParametro(clave, bruto) {
  const def = DEFINICION[clave];
  if (!def) return { ok: false, mensaje: `Parámetro desconocido: ${String(clave).slice(0, 40)}` };
  if (!def.editable) return { ok: false, mensaje: `El parámetro ${clave} no se puede modificar` };
  if (def.tipo === "hora") {
    if (typeof bruto !== "string" || !PATRON_HORA.test(bruto)) return { ok: false, mensaje: `${clave} debe ser una hora válida HH:MM` };
    return { ok: true, valor: bruto };
  }
  if (def.tipo === "fecha") {
    if (typeof bruto !== "string" || !esFechaValida(bruto)) {
      return { ok: false, mensaje: `${clave} debe ser una fecha válida AAAA-MM-DD` };
    }
    if (bruto < def.minimo || bruto > FECHA_MAXIMA) {
      return { ok: false, mensaje: `${clave} debe estar entre ${def.minimo} y ${FECHA_MAXIMA}` };
    }
    return { ok: true, valor: bruto };
  }
  const texto = typeof bruto === "number" ? String(bruto) : bruto;
  if (typeof texto !== "string" || !/^\d{1,6}$/.test(texto)) {
    return { ok: false, mensaje: `${clave} debe ser un entero entre ${def.minimo} y ${def.maximo}` };
  }
  const n = Number(texto);
  if (n < def.minimo || n > def.maximo) {
    return { ok: false, mensaje: `${clave} debe ser un entero entre ${def.minimo} y ${def.maximo}` };
  }
  return { ok: true, valor: n };
}

/**
 * La ventana de comida debe cumplir desde < hasta con los valores resultantes (los enviados + los vigentes).
 * @returns {string|null} mensaje de error o null
 */
function validarVentanaComida(cambios, actuales) {
  if (!("comida_desde" in cambios) && !("comida_hasta" in cambios)) return null;
  const desde = cambios.comida_desde ?? actuales.comida_desde;
  const hasta = cambios.comida_hasta ?? actuales.comida_hasta;
  return aMinutos(desde) < aMinutos(hasta) ? null : "comida_desde debe ser anterior a comida_hasta";
}

/** Filas {clave, valor} -> objeto tipado; las claves ausentes o corruptas toman el valor por defecto */
function interpretarParametros(filas) {
  const resultado = {};
  for (const clave of CLAVES) resultado[clave] = DEFINICION[clave].defecto;
  for (const fila of filas || []) {
    const def = DEFINICION[fila.clave];
    if (!def) continue;
    if (def.tipo === "hora") {
      if (PATRON_HORA.test(String(fila.valor))) resultado[fila.clave] = fila.valor;
    } else if (def.tipo === "fecha") {
      if (esFechaValida(fila.valor)) resultado[fila.clave] = fila.valor;
    } else if (/^\d{1,6}$/.test(String(fila.valor))) {
      const n = Number(fila.valor);
      if (n >= def.minimo && n <= def.maximo) resultado[fila.clave] = n;
    }
  }
  // una ventana de comida corrupta (desde >= hasta) vuelve a los valores por omisión
  if (aMinutos(resultado.comida_desde) >= aMinutos(resultado.comida_hasta)) {
    resultado.comida_desde = DEFINICION.comida_desde.defecto;
    resultado.comida_hasta = DEFINICION.comida_hasta.defecto;
  }
  return resultado;
}

module.exports = { DEFINICION, CLAVES, validarParametro, validarVentanaComida, interpretarParametros };
