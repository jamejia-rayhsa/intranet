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
  // Bloquea las vacaciones de todos en esa fecha (si es día hábil)
  { valor: 'actividad', etiqueta: 'Día Actividad Empresa', icono: '■', descuenta: false, bloquea: true },
];

/** Texto de ayuda de cada tipo (modal y pantalla del calendario). */
export const AYUDA_TIPOS = {
  oficial: 'Festivo de ley: no es día hábil y no descuenta del saldo.',
  otorgado: 'Descanso concedido por la empresa: no es día hábil y no descuenta del saldo.',
  evento: 'Informativo: no descuenta ni bloquea.',
  actividad: 'Bloquea las vacaciones para todos: nadie puede solicitar ni aprobar vacaciones que incluyan esta fecha si es un día hábil (lunes a viernes).',
};

/** Texto del aviso de «bloquea las vacaciones» que acompaña al tipo 'actividad'. */
export function ayudaDelTipo(valor) {
  return AYUDA_TIPOS[valor] || '';
}

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

const ORDEN_TIPO = { oficial: 0, otorgado: 1, evento: 2, actividad: 3 };

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

/** Ordena por fecha, tipo (oficial, otorgado, evento, actividad) e id sin mutar la entrada. */
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

// ---------------------------------------------------------------------------------------------
// Formulario de vacaciones (Fase 4). La regla de días hábiles vive SOLO en el backend
// (GET /api/vacaciones/disponibilidad); aquí únicamente se da formato y se pinta lo que responde.
// ---------------------------------------------------------------------------------------------

/** Códigos de conflicto de /disponibilidad (paridad con vacaciones.controller.js). */
export const MENSAJES_CONFLICTO = {
  SIN_DIAS_HABILES: 'El rango elegido no incluye días hábiles.',
  TRASLAPE: 'Ya tienes una solicitud de vacaciones que se traslapa con estas fechas.',
  SALDO_INSUFICIENTE: 'No tienes suficientes días disponibles para este rango.',
  CUPO_LLENO: 'El cupo de vacaciones de tu departamento está lleno en alguna de estas fechas.',
  ACTIVIDAD_EMPRESA: 'Alguna de estas fechas es un Día Actividad Empresa: las vacaciones están bloqueadas para todos.',
};
export const MENSAJE_CONFLICTO_GENERICO = 'No se puede solicitar este rango de fechas.';
export const MENSAJE_ERROR_DISPONIBILIDAD = 'No se pudo calcular la disponibilidad. Intenta de nuevo.';

/** Mensaje del conflicto: el del backend; si falta, el de respaldo por código. null si no hay conflicto. */
export function mensajeConflicto(conflicto) {
  if (!conflicto) return null;
  const texto = typeof conflicto.mensaje === 'string' ? conflicto.mensaje.trim() : '';
  return texto || MENSAJES_CONFLICTO[conflicto.codigo] || MENSAJE_CONFLICTO_GENERICO;
}

/** '1 día hábil' / '3 días hábiles'. */
export function textoDiasHabiles(n) {
  return `${n} ${n === 1 ? 'día hábil' : 'días hábiles'}`;
}

/** Rango completo y en orden (texto 'YYYY-MM-DD'); la validación de fondo la hace el backend. */
export function rangoCompleto(inicio, fin) {
  return parsearFecha(inicio) !== null && parsearFecha(fin) !== null && fin >= inicio;
}

/** Año (número) de una fecha 'YYYY-MM-DD' válida leído del texto; null si no es válida. */
export function anioDeTexto(texto) {
  return parsearFecha(texto) !== null ? Number(String(texto).slice(0, 4)) : null;
}

/**
 * Nota cuando el rango cruza de año: el servidor descuenta del periodo del año de la fecha inicial.
 * Devuelve null si no cruza o el rango no es válido.
 */
export function notaCruceDeAnio(inicio, fin) {
  if (!rangoCompleto(inicio, fin)) return null;
  const anioInicio = anioDeTexto(inicio);
  if (anioInicio === anioDeTexto(fin)) return null;
  return `Tus fechas cruzan de año: los días se descuentan del periodo ${anioInicio} (el año de la fecha inicial).`;
}

/** ¿La fecha de regreso (opcional) es válida respecto a la fecha final? Vacía = válida. */
export function regresoValido(fechaFinal, fechaRegreso) {
  if (!fechaRegreso) return true;
  return parsearFecha(fechaRegreso) !== null && fechaRegreso >= fechaFinal;
}

/**
 * Interpreta la respuesta de /disponibilidad para mostrarla.
 * quedarian = saldo - días hábiles (puede ser negativo: entonces hay conflicto SALDO_INSUFICIENTE).
 */
export function resumirDisponibilidad(datos, saldoRespaldo = null) {
  const d = datos || {};
  const dias = Number.isFinite(d.dias_habiles) ? d.dias_habiles : 0;
  const saldo = Number.isFinite(d.saldo) ? d.saldo : (Number.isFinite(saldoRespaldo) ? saldoRespaldo : null);
  const noHabiles = ordenarItems(Array.isArray(d.dias_no_habiles) ? d.dias_no_habiles : [])
    .map((i) => ({ ...i, etiquetaTipo: infoTipo(i.tipo).etiqueta, icono: infoTipo(i.tipo).icono }));
  const eventos = ordenarItems(Array.isArray(d.eventos) ? d.eventos : []);
  const bloqueadas = ordenarItems(Array.isArray(d.fechas_bloqueadas) ? d.fechas_bloqueadas : []);
  return {
    dias,
    saldo,
    quedarian: saldo === null ? null : saldo - dias,
    noHabiles,
    eventos,
    bloqueadas,
    cupo: d.cupo === undefined ? undefined : d.cupo,
    conflicto: d.conflicto ? { codigo: d.conflicto.codigo, mensaje: mensajeConflicto(d.conflicto) } : null,
  };
}

/**
 * Estado del botón Enviar: bloqueado sin rango, mientras carga la disponibilidad, si falló o si hay conflicto.
 * @param {{estado: string, resumen: object|null}} disp estado: 'ocioso' | 'cargando' | 'listo' | 'error'
 */
export function envioBloqueado(disp, enviando = false) {
  if (enviando) return true;
  if (!disp || disp.estado !== 'listo') return true;
  return Boolean(disp.resumen && disp.resumen.conflicto);
}

/** Es una fecha en la que se puede fijar un extremo del rango (hábil, con cupo y no bloqueada). */
export function esSeleccionable(celda) {
  return !celda.lleno && !celda.bloqueado && !celda.noHabil && !celda.finDeSemana;
}

/**
 * Efecto de elegir un día en el calendario: sin inicio, o con rango ya completo, empieza uno nuevo;
 * con solo inicio, una fecha anterior lo reemplaza y una posterior fija el final.
 */
export function siguienteSeleccion(actual, fecha) {
  const inicio = actual && actual.inicio ? actual.inicio : '';
  const fin = actual && actual.fin ? actual.fin : '';
  if (!inicio || fin || fecha < inicio) return { inicio: fecha, fin: '' };
  return { inicio, fin: fecha };
}

function indexarOcupacion(ocupacion) {
  const o = ocupacion || {};
  const llenas = new Set(Array.isArray(o.fechas_llenas) ? o.fechas_llenas : []);
  const noHabiles = {};
  for (const i of ordenarItems(Array.isArray(o.dias_no_habiles) ? o.dias_no_habiles : [])) {
    if (!noHabiles[i.fecha]) noHabiles[i.fecha] = i;
  }
  const eventos = {};
  for (const e of ordenarItems(Array.isArray(o.eventos) ? o.eventos : [])) {
    (eventos[e.fecha] = eventos[e.fecha] || []).push(e.nombre);
  }
  // Días Actividad Empresa: si hay varias en la misma fecha se juntan los nombres
  const bloqueadas = {};
  for (const b of ordenarItems(Array.isArray(o.fechas_bloqueadas) ? o.fechas_bloqueadas : [])) {
    bloqueadas[b.fecha] = bloqueadas[b.fecha] ? `${bloqueadas[b.fecha]}, ${b.nombre}` : b.nombre;
  }
  return { llenas, noHabiles, eventos, bloqueadas };
}

/**
 * Aria-label de un día del calendario de ocupación: empieza por el número visible (WCAG 2.5.3).
 */
export function etiquetaDiaOcupacion(celda) {
  // Empieza por el texto visible en el mismo orden en que se pinta (número y "Cupo lleno"): WCAG 2.5.3
  const visible = `${celda.dia}${celda.lleno ? ' Cupo lleno' : ''}${celda.bloqueado ? ` Bloqueado: ${celda.bloqueado}` : ''}`;
  const partes = [visible, fechaConDiaSemana(celda.fecha)];
  if (celda.bloqueado) partes.push('Las vacaciones están bloqueadas para todos en esta fecha');
  if (celda.noHabil) partes.push(`Día no hábil, ${celda.noHabil.etiquetaTipo}: ${celda.noHabil.nombre}`);
  else if (celda.finDeSemana) partes.push('Fin de semana, día no hábil');
  for (const nombre of celda.eventos) partes.push(`Evento: ${nombre}`);
  if (celda.esInicio) partes.push('Fecha inicial elegida');
  if (celda.esFin) partes.push('Fecha final elegida');
  else if (celda.enRango) partes.push('Dentro del rango elegido');
  return partes.join('. ');
}

/**
 * Mes del calendario de ocupación: cuadrícula con las marcas de cupo lleno, no hábil y evento,
 * y el rango elegido. Fechas siempre como texto. Con solo `inicio` se destaca ese día.
 * @returns {Array<Array<object>>} semanas de celdas
 */
export function construirMesOcupacion(anio, mes, ocupacion, { inicio = '', fin = '', hoy = '' } = {}) {
  const { llenas, noHabiles, eventos, bloqueadas } = indexarOcupacion(ocupacion);
  const hayRango = rangoCompleto(inicio, fin);
  return construirCuadricula(anio, mes).map((semana) =>
    semana.map((c) => {
      const noHabilItem = noHabiles[c.fecha] || null;
      const celda = {
        ...c,
        lleno: llenas.has(c.fecha),
        noHabil: noHabilItem
          ? { tipo: noHabilItem.tipo, nombre: noHabilItem.nombre, etiquetaTipo: infoTipo(noHabilItem.tipo).etiqueta, icono: infoTipo(noHabilItem.tipo).icono }
          : null,
        eventos: eventos[c.fecha] || [],
        bloqueado: bloqueadas[c.fecha] || null,
        esHoy: c.fecha === hoy,
        esInicio: Boolean(inicio) && c.fecha === inicio,
        esFin: hayRango && c.fecha === fin,
        enRango: hayRango && c.fecha >= inicio && c.fecha <= fin,
      };
      celda.seleccionable = esSeleccionable(celda);
      celda.etiqueta = etiquetaDiaOcupacion(celda);
      return celda;
    }),
  );
}

/** Marcas del mes mostrado para la lista de texto: [{fecha, clase: 'lleno'|'bloqueado'|'no-habil'|'evento', texto}]. */
export function detalleMesOcupacion(anio, mes, ocupacion) {
  const { llenas, noHabiles, eventos, bloqueadas } = indexarOcupacion(ocupacion);
  const prefijo = `${pad(anio, 4)}-${pad(mes, 2)}-`;
  const filas = [];
  for (const f of llenas) if (f.startsWith(prefijo)) filas.push({ fecha: f, clase: 'lleno', texto: 'Cupo lleno' });
  for (const [f, nombre] of Object.entries(bloqueadas)) {
    if (f.startsWith(prefijo)) filas.push({ fecha: f, clase: 'bloqueado', texto: `Bloqueado: ${nombre}` });
  }
  for (const [f, i] of Object.entries(noHabiles)) {
    if (f.startsWith(prefijo)) filas.push({ fecha: f, clase: 'no-habil', texto: `${infoTipo(i.tipo).etiqueta}: ${i.nombre}` });
  }
  for (const [f, nombres] of Object.entries(eventos)) {
    if (f.startsWith(prefijo)) for (const n of nombres) filas.push({ fecha: f, clase: 'evento', texto: `Evento: ${n}` });
  }
  const orden = { lleno: 0, bloqueado: 1, 'no-habil': 2, evento: 3 };
  return filas.sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : orden[a.clase] - orden[b.clase]));
}

// ---------------------------------------------------------------------------------------------
// Día Actividad Empresa: aviso de solicitudes afectadas al guardar la fecha en el calendario.
// ---------------------------------------------------------------------------------------------

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Texto del aviso que devuelve POST/PUT del calendario cuando el tipo es 'actividad'
 * (`avisos: {solicitudes_aprobadas, solicitudes_pendientes}`). Solo conteos, sin nombres.
 * Devuelve null si no hay aviso que mostrar (otros tipos) y un texto de respaldo si el servidor no
 * pudo calcularlo (avisos null).
 */
export function mensajeAvisosActividad(avisos) {
  if (avisos === null) {
    return 'La fecha se guardó, pero no se pudo calcular cuántas solicitudes de vacaciones incluyen ese día. Revisa el listado de vacaciones.';
  }
  if (!avisos || typeof avisos !== 'object') return null;
  const aprobadas = Number.isInteger(avisos.solicitudes_aprobadas) ? avisos.solicitudes_aprobadas : 0;
  const pendientes = Number.isInteger(avisos.solicitudes_pendientes) ? avisos.solicitudes_pendientes : 0;
  if (aprobadas === 0 && pendientes === 0) {
    return 'Ninguna solicitud de vacaciones, aprobada o pendiente, incluye esta fecha.';
  }
  const partes = [];
  if (aprobadas > 0) partes.push(plural(aprobadas, 'solicitud aprobada', 'solicitudes aprobadas'));
  if (pendientes > 0) partes.push(plural(pendientes, 'solicitud pendiente', 'solicitudes pendientes'));
  return (
    `Atención: hay ${partes.join(' y ')} de vacaciones que incluyen esta fecha. No se modificaron: ` +
    'las aprobadas se conservan y las pendientes no se podrán aprobar mientras la fecha siga bloqueada. RH decide qué hacer con ellas.'
  );
}
