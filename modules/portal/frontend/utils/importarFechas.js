// Normalización de fechas del importador de archivos (Excel/CSV). Lógica pura, sin imports ni dependencias:
// los tests la cargan leyendo el fuente (ver modules/rh/tests/importarFechas.util.test.js).
//
// normalizarFecha(valor) -> { valor: 'AAAA-MM-DD' | '', error?: string }
//   - vacío (null, undefined, '' o solo espacios) -> { valor: '' } sin error.
//   - Date (SheetJS con cellDates:true): se usa la fecha calendario LOCAL de la celda, sin pasar por UTC
//     (toISOString desfasaría un día en zonas al este de UTC o con hora cercana a la medianoche).
//   - número o texto numérico: serial de Excel (sistema 1900) con parte entera de 5 o 6 dígitos; se toma la parte
//     entera y la hora se descarta. De 1 a 4 dígitos (un año suelto como 1990) -> 'fecha incompleta'.
//   - { serialExcel: n } (celda numérica con formato de fecha, ver hojaAMatriz.js): serial de Excel desde 1 (1900-01-01),
//     sin pasar por Date (el Date local desplaza un día fechas de 1939-1950 en zonas con horario histórico).
//   - texto: AAAA-MM-DD, AAAA/MM/DD, DD/MM/AAAA y DD-MM-AAAA (día primero, formato de México).
//   - lo inválido o ambiguo devuelve { valor: '', error } con un mensaje claro.

export const ANIO_MINIMO = 1900;
export const ANIO_MAXIMO = 2100;

const MS_DIA = 86400000;

function esBisiesto(anio) {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function diasEnMes(anio, mes) {
  if (mes === 2) return esBisiesto(anio) ? 29 : 28;
  return [4, 6, 9, 11].indexOf(mes) !== -1 ? 30 : 31;
}

function dosDigitos(n) {
  return (n < 10 ? '0' : '') + n;
}

function aTexto(anio, mes, dia) {
  return String(anio) + '-' + dosDigitos(mes) + '-' + dosDigitos(dia);
}

// Valida año, mes y día reales; devuelve { valor } o { valor:'', error }.
function construir(anio, mes, dia) {
  if (mes < 1 || mes > 12) return { valor: '', error: 'El mes debe estar entre 1 y 12' };
  if (anio < ANIO_MINIMO || anio > ANIO_MAXIMO) {
    return { valor: '', error: 'El año debe estar entre ' + ANIO_MINIMO + ' y ' + ANIO_MAXIMO };
  }
  if (dia < 1 || dia > diasEnMes(anio, mes)) return { valor: '', error: 'La fecha no existe en el calendario' };
  return { valor: aTexto(anio, mes, dia) };
}

// Serial de Excel (sistema 1900) -> fecha. Serial 1 = 1900-01-01; el 60 es el 29-feb-1900 que Excel cree
// bisiesto y no existió; desde el 61 la época efectiva es 1899-12-30.
export function fechaDeSerialExcel(serial) {
  if (typeof serial !== 'number' || !isFinite(serial)) return { valor: '', error: 'Número de fecha inválido' };
  const entero = Math.floor(serial);
  if (entero < 1) return { valor: '', error: 'Número de fecha de Excel fuera de rango' };
  if (entero === 60) return { valor: '', error: 'El 29 de febrero de 1900 no existe (error histórico de Excel)' };
  const base = entero < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const d = new Date(base + entero * MS_DIA);
  return construir(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function fechaDeDate(d) {
  if (isNaN(d.getTime())) return { valor: '', error: 'Fecha inválida' };
  let anio = d.getFullYear();
  let mes = d.getMonth() + 1;
  let dia = d.getDate();
  // SheetJS arrastra un desfase de segundos de la zona (medido: hasta 36 s; en algunas zonas la medianoche de la
  // celda llega como 23:59:xx del día previo). Solo se corrige lo que cae en el ÚLTIMO MINUTO del día
  // (23:59:00-23:59:59): una hora real distinta (p. ej. 23:58:59 o 18:00) conserva su día. Una celda con hora
  // 23:59:xx en una columna de fecha es indistinguible de ese desfase y se toma como el día siguiente.
  if (d.getHours() === 23 && d.getMinutes() === 59) {
    const sig = new Date(Date.UTC(anio, mes - 1, dia) + MS_DIA);
    anio = sig.getUTCFullYear();
    mes = sig.getUTCMonth() + 1;
    dia = sig.getUTCDate();
  }
  return construir(anio, mes, dia);
}

const HORA = '(?:[T ]\\d{1,2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?';
const RE_ANIO_PRIMERO = new RegExp('^(\\d{4})([-/])(\\d{1,2})\\2(\\d{1,2})' + HORA + '$');
const RE_DIA_PRIMERO = /^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/;
const RE_NUMERO = /^\d{1,6}(?:\.\d+)?$/;
const MSG_INCOMPLETA = 'fecha incompleta: usa DD/MM/AAAA o AAAA-MM-DD';

// Serial aceptado en el importador: parte entera de 5 o 6 dígitos (10000 = 1927-05-18 en adelante; los de 1900-1927
// no se admiten para no confundir un año suelto como 1990 con un serial). El rango 1900-2100 lo valida construir().
function fechaDeNumero(n) {
  if (typeof n !== 'number' || !isFinite(n) || n < 0) return { valor: '', error: 'Número de fecha inválido' };
  if (Math.floor(n) < 10000) return { valor: '', error: MSG_INCOMPLETA };
  return fechaDeSerialExcel(n);
}

export function normalizarFecha(valor) {
  if (valor === null || valor === undefined) return { valor: '' };
  if (Object.prototype.toString.call(valor) === '[object Date]') return fechaDeDate(valor);
  if (typeof valor === 'number') return fechaDeNumero(valor);
  // Celda numérica con formato de FECHA en Excel (la marca hojaAMatriz): serial exacto, aritmética pura sin Date local.
  if (valor !== null && typeof valor === 'object' && typeof valor.serialExcel === 'number') return fechaDeSerialExcel(valor.serialExcel);
  if (typeof valor !== 'string') return { valor: '', error: 'Formato de fecha no reconocido' };

  const texto = valor.trim();
  if (texto === '') return { valor: '' };

  if (RE_NUMERO.test(texto)) return fechaDeNumero(Number(texto));

  let m = RE_ANIO_PRIMERO.exec(texto);
  if (m) return construir(Number(m[1]), Number(m[3]), Number(m[4]));

  m = RE_DIA_PRIMERO.exec(texto);
  if (m) return construir(Number(m[4]), Number(m[3]), Number(m[1]));

  return { valor: '', error: 'Formato de fecha no reconocido (usa AAAA-MM-DD o DD/MM/AAAA)' };
}
