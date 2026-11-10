// Periodos de asistencia = quincenas (1-15 y 16-fin de mes). Módulo PURO, fechas 'YYYY-MM-DD'.
const { aNumeroDia, deNumeroDia, esFechaValida } = require("../../utils/diasHabiles");

function ultimoDiaDelMes(anio, mes) {
  const primeroDelSiguiente = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
  return deNumeroDia(aNumeroDia(primeroDelSiguiente) - 1);
}

/** Quincena que contiene la fecha: { inicio, fin } */
function quincenaDe(fecha) {
  if (!esFechaValida(fecha)) throw new RangeError("Fecha no válida");
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  const dia = Number(fecha.slice(8, 10));
  const mm = String(mes).padStart(2, "0");
  if (dia <= 15) return { inicio: `${anio}-${mm}-01`, fin: `${anio}-${mm}-15` };
  return { inicio: `${anio}-${mm}-16`, fin: ultimoDiaDelMes(anio, mes) };
}

/** Todas las quincenas que tocan el rango [desde, hasta] (en orden) */
function quincenasEntre(desde, hasta) {
  const lista = [];
  if (hasta < desde) return lista;
  let actual = quincenaDe(desde);
  for (;;) {
    lista.push(actual);
    if (actual.fin >= hasta) break;
    actual = quincenaDe(deNumeroDia(aNumeroDia(actual.fin) + 1));
  }
  return lista;
}

module.exports = { quincenaDe, quincenasEntre, ultimoDiaDelMes };
