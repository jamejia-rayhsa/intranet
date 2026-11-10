// modules/comercial/backend/utils/validacion.js
// Validación de entrada compartida por los controladores de Convenios/Autorizadores. Nada de esto
// toca la base de datos: el objetivo es responder 400 con mensaje claro ANTES de que Postgres
// lance un error de tipo (22P02/22007) que el controlador convertiría en un 500 genérico.

const ID_MAX = 2147483647; // INT4 máximo de Postgres (mismo tope que vacaciones.controller.js:329)

// req.params.id / usuario_id del body: deben ser enteros positivos dentro del rango de INT4.
function idValido(valor) {
  if (valor === undefined || valor === null || valor === '') return false;
  if (typeof valor !== 'string' && typeof valor !== 'number') return false;
  // Rechaza espacios/exponentes/decimales aunque Number() los tolere (" 1" o "1e2" dan Number
  // entero válido pero no son lo que req.params.id/usuario_id deberían traer nunca).
  if (typeof valor === 'string' && !/^\d+$/.test(valor)) return false;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= ID_MAX;
}

// Fechas de cabecera (fecha_inicio, vigente_hasta): exige AAAA-MM-DD y que sea una fecha real
// (rechaza lo que Date normaliza solo, p. ej. "2026-02-30" -> 2026-03-02).
function fechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return false;
  return fecha.toISOString().slice(0, 10) === valor;
}

// Montos de línea (empaque, precio_compra, precio_venta, factor): opcionales (null/'' permitido)
// pero si vienen, deben ser números finitos >= mínimo. No acepta NaN ni strings no numéricos.
function numeroValido(valor, { permitirNulo = true, minimo = 0 } = {}) {
  if (valor === undefined || valor === null || valor === '') return permitirNulo;
  if (typeof valor !== 'number' && typeof valor !== 'string') return false;
  const n = Number(valor);
  return Number.isFinite(n) && n >= minimo;
}

module.exports = { idValido, fechaValida, numeroValido, ID_MAX };
