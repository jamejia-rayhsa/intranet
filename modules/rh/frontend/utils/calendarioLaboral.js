// modules/rh/frontend/utils/calendarioLaboral.js
// Lógica pura del calendario laboral (sin React ni DOM). Las fechas viajan SIEMPRE como texto
// 'YYYY-MM-DD'; el año/mes/día se obtienen con split y la aritmética usa Date.UTC (nunca
// new Date(texto), que interpreta en UTC y desfasa un día en zonas al oeste).
// PARIDAD: los tipos deben coincidir con TIPOS_CALENDARIO de modules/rh/backend/models/calendarioLaboral.model.js.
// Este archivo debe seguir siendo evaluable sin transpilar (lo prueba modules/rh/tests/calendarioLaboral.util.test.js).

export const TIPOS_CALENDARIO = [
  { valor: 'oficial', etiqueta: 'Oficial de ley', icono: '★', descuenta: false },
  { valor: 'otorgado', etiqueta: 'Descanso otorgado', icono: '◆', descuenta: false },
  { valor: 'evento', etiqueta: 'Evento', icono: '●', descuenta: false },
];

export const NOMBRES_MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Lunes a domingo
export const DIAS_SEMANA = [
  { corto: 'Lun', largo: 'lunes' },
  { corto: 'Mar', largo: 'martes' },
  { corto: 'Mié', largo: 'miércoles' },
  { corto: 'Jue', largo: 'jueves' },
  { corto: 'Vie', largo: 'viernes' },
  { corto: 'Sáb', largo: 'sábado' },
  { corto: 'Dom', largo: 'domingo' },
];

const ORDEN_TIPO = { oficial: 0, otorgado: 1, evento: 2 };

export function infoTipo(valor) {
  return TIPOS_CALENDARIO.find((t) => t.valor === valor) || { valor, etiqueta: valor, icono: '•', descuenta: false };
}

const pad = (n, largo) => String(n).padStart(largo, '0');

/** 'YYYY-MM-DD' -> { anio, mes (1-12), dia } o null si no es una fecha real. */
export function parsearFecha(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const [anio, mes, dia] = texto.split('-').map(Number);
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  return { anio, mes, dia };
}

export function formatearISO(anio, mes, dia) {
  return `${pad(anio, 4)}-${pad(mes, 2)}-${pad(dia, 2)}`;
}

export function esBisiesto(anio) {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

export function diasEnMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Suma días (negativos permitidos) a una fecha 'YYYY-MM-DD' y devuelve 'YYYY-MM-DD'. */
export function sumarDias(texto, dias) {
  const p = parsearFecha(texto);
  if (!p) return null;
  const f = new Date(Date.UTC(p.anio, p.mes - 1, p.dia + dias));
  return formatearISO(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}

/** Posición en la semana con lunes = 0 ... domingo = 6. */
export function indiceDiaSemana(texto) {
  const p = parsearFecha(texto);
  if (!p) return null;
  const dow = new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay(); // 0 = domingo
  return (dow + 6) % 7;
}

export function esFinDeSemana(texto) {
  const i = indiceDiaSemana(texto);
  return i === 5 || i === 6;
}

/** Fecha local de hoy como texto (el día del usuario, no el de UTC). */
export function fechaHoy(ahora = new Date()) {
  return formatearISO(ahora.getFullYear(), ahora.getMonth() + 1, ahora.getDate());
}

export function mesAnterior(anio, mes) {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

export function mesSiguiente(anio, mes) {
  return mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
}

/** Mes (anio, mes) al que pertenece una fecha 'YYYY-MM-DD'. */
export function mesDeFecha(texto) {
  const p = parsearFecha(texto);
  return p ? { anio: p.anio, mes: p.mes } : null;
}

/**
 * Cuadrícula del mes en semanas de lunes a domingo. Siempre múltiplos de 7 celdas: los días de los
 * meses vecinos que completan la primera y la última semana llevan delMes = false.
 * @returns {Array<Array<{fecha: string, dia: number, delMes: boolean, finDeSemana: boolean}>>}
 */
export function construirCuadricula(anio, mes) {
  const primero = formatearISO(anio, mes, 1);
  const ultimo = formatearISO(anio, mes, diasEnMes(anio, mes));
  const inicio = sumarDias(primero, -indiceDiaSemana(primero));
  const fin = sumarDias(ultimo, 6 - indiceDiaSemana(ultimo));
  const semanas = [];
  let actual = inicio;
  while (actual <= fin) {
    const semana = [];
    for (let i = 0; i < 7; i += 1) {
      const p = parsearFecha(actual);
      semana.push({
        fecha: actual,
        dia: p.dia,
        delMes: p.anio === anio && p.mes === mes,
        finDeSemana: i >= 5,
      });
      actual = sumarDias(actual, 1);
    }
    semanas.push(semana);
  }
  return semanas;
}

/** Rango [desde, hasta] (texto) que cubre toda la cuadrícula visible del mes. */
export function rangoCuadricula(anio, mes) {
  const semanas = construirCuadricula(anio, mes);
  return { desde: semanas[0][0].fecha, hasta: semanas[semanas.length - 1][6].fecha };
}

function compararItems(a, b) {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  const ta = ORDEN_TIPO[a.tipo] ?? 99;
  const tb = ORDEN_TIPO[b.tipo] ?? 99;
  if (ta !== tb) return ta - tb;
  return (a.id ?? 0) - (b.id ?? 0);
}

/** Ordena por fecha, tipo (oficial, otorgado, evento) e id sin mutar la entrada. */
export function ordenarItems(items) {
  return [...(items || [])].sort(compararItems);
}

/** { 'YYYY-MM-DD': [items ordenados] }. Con soloActivos descarta los inactivos. */
export function agruparPorFecha(items, { soloActivos = false } = {}) {
  const mapa = {};
  for (const item of ordenarItems(items)) {
    if (soloActivos && item.activo === false) continue;
    (mapa[item.fecha] = mapa[item.fecha] || []).push(item);
  }
  return mapa;
}

/** Items cuya fecha cae en el mes (anio, mes), ordenados. */
export function itemsDelMes(items, anio, mes, { soloActivos = false } = {}) {
  const prefijo = `${pad(anio, 4)}-${pad(mes, 2)}-`;
  return ordenarItems(items).filter(
    (i) => typeof i.fecha === 'string' && i.fecha.startsWith(prefijo) && !(soloActivos && i.activo === false),
  );
}

/** '2026-10-15' -> '15 de octubre de 2026' (sin pasar por Date). */
export function fechaLegible(texto) {
  const p = parsearFecha(texto);
  if (!p) return texto || '';
  return `${p.dia} de ${NOMBRES_MESES[p.mes - 1]} de ${p.anio}`;
}

/** '2026-10-15' -> 'jueves 15 de octubre de 2026'. */
export function fechaConDiaSemana(texto) {
  const i = indiceDiaSemana(texto);
  return i === null ? texto || '' : `${DIAS_SEMANA[i].largo} ${fechaLegible(texto)}`;
}

/** Años para el selector: alrededor del año mostrado, siempre incluyéndolo. */
export function aniosSelector(anioMostrado, anioActual, atras = 3, adelante = 5) {
  const desde = Math.min(anioActual - atras, anioMostrado);
  const hasta = Math.max(anioActual + adelante, anioMostrado);
  const anios = [];
  for (let a = desde; a <= hasta; a += 1) anios.push(a);
  return anios;
}

/**
 * Destino de una tecla de navegación en la cuadrícula (flechas, Inicio/Fin, RePág/AvPág).
 * @returns {string|null} nueva fecha o null si la tecla no navega
 */
export function destinoTecla(fecha, tecla) {
  const p = parsearFecha(fecha);
  if (!p) return null;
  switch (tecla) {
    case 'ArrowLeft': return sumarDias(fecha, -1);
    case 'ArrowRight': return sumarDias(fecha, 1);
    case 'ArrowUp': return sumarDias(fecha, -7);
    case 'ArrowDown': return sumarDias(fecha, 7);
    case 'Home': return sumarDias(fecha, -indiceDiaSemana(fecha));
    case 'End': return sumarDias(fecha, 6 - indiceDiaSemana(fecha));
    case 'PageUp':
    case 'PageDown': {
      const { anio, mes } = tecla === 'PageUp' ? mesAnterior(p.anio, p.mes) : mesSiguiente(p.anio, p.mes);
      return formatearISO(anio, mes, Math.min(p.dia, diasEnMes(anio, mes)));
    }
    default: return null;
  }
}

/** Aviso cuando no se pueden cargar los permisos del usuario (la edición queda deshabilitada). */
export const MENSAJE_ERROR_PERMISOS = 'No se pudieron cargar tus permisos; la edición del calendario no está disponible.';
/** Mensaje de respaldo cuando el listado falla sin mensaje del servidor. */
export const MENSAJE_ERROR_LISTADO = 'No se pudo cargar el calendario';

/** /auth/perfil devuelve `roles` como arreglo de nombres (no existe `rol_nombre`). */
export function esSuperAdmin(usuario) {
  return Array.isArray(usuario?.roles) && usuario.roles.includes('super_admin');
}

/**
 * Edición del calendario: super_admin o un permiso rh/Calendario de tipo 'edicion'
 * (los permisos vienen de /permisos/mis-permisos). El backend es la autoridad real.
 */
export function puedeEditarCalendario(usuario, permisos) {
  if (esSuperAdmin(usuario)) return true;
  return (Array.isArray(permisos) ? permisos : []).some(
    (p) => String(p.modulo).toLowerCase() === 'rh' && p.opcion === 'Calendario' && p.tipo === 'edicion',
  );
}

/** Quien no edita no ve las fechas inactivas. */
export function filtrarVisibles(items, puedeEditar) {
  return puedeEditar ? items : items.filter((i) => i.activo !== false);
}

/**
 * Qué hace el clic en un día: 'ninguna' (solo lectura), 'alta' (día vacío) o 'panel'
 * (día con fechas: lista con "Editar" y "Agregar otra en esta fecha").
 */
export function accionClicDia(delDia, puedeEditar) {
  if (!puedeEditar) return 'ninguna';
  return delDia.length === 0 ? 'alta' : 'panel';
}

/** Interpreta la respuesta del listado: `exito:false` es un error, no un calendario vacío. */
export function resolverListado(respuesta) {
  if (respuesta && respuesta.exito === true && Array.isArray(respuesta.datos)) {
    return { items: respuesta.datos, error: '' };
  }
  return { items: [], error: (respuesta && respuesta.mensaje) || MENSAJE_ERROR_LISTADO };
}

/**
 * Mensaje legible para errores de red o respuestas que no son JSON (p. ej. HTML de un 502 del proxy).
 * Los errores con mensaje del backend (400/404/409) se devuelven tal cual.
 */
export function mensajeErrorRed(err, porDefecto = MENSAJE_ERROR_LISTADO) {
  if (err && err.name === 'SyntaxError') {
    return 'El servidor devolvió una respuesta inesperada. Intenta de nuevo en unos minutos.';
  }
  if (err && err.name === 'TypeError') return 'No se pudo conectar con el servidor. Revisa tu conexión.';
  return (err && err.message) || porDefecto;
}

/**
 * aria-label de un día. Empieza por el número visible (WCAG 2.5.3, etiqueta en el nombre) y
 * por los nombres de las marcas visibles, en el mismo orden en que se pintan.
 */
export function etiquetaDia(fecha, items) {
  const p = parsearFecha(fecha);
  const base = fechaConDiaSemana(fecha);
  const dia = p ? String(p.dia) : '';
  if (items.length === 0) return `${dia} ${base}`.trim();
  const visibles = items.map((i) => i.nombre).join(' ');
  const detalle = items
    .map((i) => `${infoTipo(i.tipo).etiqueta}: ${i.nombre}${i.activo === false ? ' (inactivo)' : ''}`)
    .join('; ');
  return `${dia} ${visibles}. ${base}. ${detalle}`;
}
