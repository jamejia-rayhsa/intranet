// Resultados de Asistencia (pantalla de RH): estatus, totales, filtros de revisión, cuadrícula de la quincena,
// detalle de un día y exportación a CSV. Lógica pura (sin imports: jest evalúa el fuente). Las fechas son texto
// 'AAAA-MM-DD'; la hora local la calcula quien llama (asistenciaFechas.js) y se inyecta donde hace falta.

// --- Estatus: etiqueta, ícono (decorativo: el texto siempre acompaña) y tono (clase de color, nunca solo color) ---
export const ESTATUS = {
  puntual: { texto: 'Puntual', plural: 'Puntuales', icono: '✓', tono: 'ok' },
  retardo: { texto: 'Retardo', plural: 'Retardos', icono: '◔', tono: 'aviso' },
  falta: { texto: 'Falta', plural: 'Faltas', icono: '✗', tono: 'error' },
  salida_anticipada: { texto: 'Salida anticipada', plural: 'Salidas anticipadas', icono: '↤', tono: 'aviso' },
  incompleta: { texto: 'Marca incompleta', plural: 'Incompletas', icono: '◐', tono: 'aviso' },
  vacaciones: { texto: 'Vacaciones', plural: 'Vacaciones', icono: '☼', tono: 'info' },
  permiso: { texto: 'Permiso', plural: 'Permisos', icono: '✎', tono: 'info' },
  festivo: { texto: 'Festivo', plural: 'Festivos', icono: '★', tono: 'info' },
  descanso: { texto: 'Descanso', plural: 'Descansos', icono: '·', tono: 'neutro' },
  justificada: { texto: 'Justificada', plural: 'Justificadas', icono: '§', tono: 'ok' },
  pendiente: { texto: 'Pendiente', plural: 'Pendientes', icono: '…', tono: 'neutro' },
  sin_turno: { texto: 'Sin turno', plural: 'Sin turno', icono: '?', tono: 'neutro' },
};
export const ORDEN_TARJETAS = [
  'puntual', 'retardo', 'falta', 'salida_anticipada', 'incompleta', 'vacaciones', 'permiso', 'festivo', 'descanso', 'justificada', 'pendiente',
];
export const ESTATUS_JUSTIFICABLES = ['falta', 'retardo', 'salida_anticipada', 'incompleta'];
// Estatus que cuentan como «día laborable evaluado» (el denominador del % de puntualidad)
export const ESTATUS_EVALUADOS = ['puntual', 'retardo', 'falta', 'salida_anticipada', 'incompleta', 'justificada'];
export const FORMULA_PUNTUALIDAD =
  '% de puntualidad = días puntuales ÷ días laborables evaluados (puntuales + retardos + faltas + salidas anticipadas + incompletas + justificadas). No cuentan descansos, festivos, vacaciones, permisos ni días pendientes.';

export function infoEstatus(estatus) {
  return ESTATUS[estatus] || { texto: String(estatus || 'Sin cálculo'), plural: String(estatus || ''), icono: '?', tono: 'neutro' };
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Suma los conteos de las filas del resumen (una por empleado). */
export function totalesDeResumen(filas) {
  const t = { empleados: 0, minutos_retardo: 0, minutos_salida_anticipada: 0, sin_turno: 0 };
  for (const e of Object.keys(ESTATUS)) t[e] = 0;
  for (const f of Array.isArray(filas) ? filas : []) {
    t.empleados += 1;
    for (const e of Object.keys(ESTATUS)) t[e] += num(f[e]);
    t.minutos_retardo += num(f.minutos_retardo);
    t.minutos_salida_anticipada += num(f.minutos_salida_anticipada);
  }
  return t;
}

/** Días laborables evaluados de un conteo (fila o totales). */
export const diasEvaluados = (c) => ESTATUS_EVALUADOS.reduce((s, e) => s + num(c && c[e]), 0);

/** % de puntualidad con un decimal, o null si no hay días evaluados. */
export function porcentajePuntualidad(c) {
  const base = diasEvaluados(c);
  if (base === 0) return null;
  return Math.round((num(c.puntual) / base) * 1000) / 10;
}

export const textoPorcentaje = (p) => (p === null || p === undefined ? '—' : `${String(p).replace('.', ',')} %`);

// --- Selector de quincena / rango ---
export const MAX_DIAS_RANGO = 92;
const MS_DIA = 86400000;
const tiempo = (f) => {
  const [a, m, d] = f.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};
export function esFecha(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return a >= 1900 && a <= 2200 && f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}
export const sumar = (fecha, dias) => new Date(tiempo(fecha) + dias * MS_DIA).toISOString().slice(0, 10);
export const diasEntreFechas = (desde, hasta) => Math.round((tiempo(hasta) - tiempo(desde)) / MS_DIA) + 1;

/** Error del rango libre, o '' si es válido (tope de 92 días como el servidor). */
export function validarRangoLibre(desde, hasta) {
  if (!esFecha(desde) || !esFecha(hasta)) return 'Indica la fecha inicial y la final.';
  if (hasta < desde) return 'La fecha final no puede ser anterior a la inicial.';
  if (diasEntreFechas(desde, hasta) > MAX_DIAS_RANGO) return `El rango no puede superar ${MAX_DIAS_RANGO} días.`;
  return '';
}

export const textoPeriodo = (p) => `${p.fecha_inicio} a ${p.fecha_fin} · ${p.estado === 'cerrado' ? 'cerrada' : 'abierta'}`;

/** Quincena que contiene `hoy` (o la más reciente que empezó antes); null si no hay. `periodos` viene del más nuevo al más viejo. */
export function periodoPorOmision(periodos, hoy) {
  const lista = Array.isArray(periodos) ? periodos : [];
  return lista.find((p) => p.fecha_inicio <= hoy && hoy <= p.fecha_fin) || lista.find((p) => p.fecha_inicio <= hoy) || lista[0] || null;
}

export const AVISO_CERRADA =
  'Quincena cerrada: los días se calcularon con el turno vigente en ese momento y ya no cambian, aunque el turno se edite después. Para corregirla hay que reabrirla en Periodos.';

// --- Filtros de revisión ---
export const ATAJOS = [
  { id: 'mas_faltas', texto: 'Más faltas', ayuda: 'Empleados con faltas, de más a menos' },
  { id: 'faltas_con_marcas', texto: 'Faltas con marcas', ayuda: 'Faltas del día con alguna marca (llegó más de 30 min tarde u otra marca fuera de lo esperado)' },
  { id: 'incompletas_comida', texto: 'Incompletas por comida', ayuda: 'La última marca del día cae en la comida y no hay salida posterior' },
  { id: 'sin_marcas', texto: 'Sin ninguna marca', ayuda: 'Sin una sola marca en todo el periodo consultado' },
];
export const ORDENES = [
  { id: 'nombre', texto: 'Nombre' },
  { id: 'faltas', texto: 'Más faltas' },
  { id: 'retardos', texto: 'Más retardos' },
  { id: 'minutos_retardo', texto: 'Más minutos de retardo' },
  { id: 'incompletas', texto: 'Más incompletas' },
  { id: 'puntualidad', texto: 'Menor puntualidad' },
];

const quitarAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const nombreCompleto = (f) =>
  [f.nombre, f.apellido_paterno, f.apellido_materno].filter((x) => x && String(x).trim()).join(' ');

/**
 * Aplica búsqueda (nombre o nómina, sin acentos ni mayúsculas), estatus (empleados con al menos un día así), atajo y
 * orden. Devuelve una lista nueva. El atajo manda sobre el orden elegido solo cuando el orden es el de nombre.
 */
export function filtrarYOrdenar(filas, { texto = '', estatus = '', atajo = '', orden = 'nombre' } = {}) {
  let r = Array.isArray(filas) ? filas.slice() : [];
  const q = quitarAcentos(texto).trim();
  if (q) r = r.filter((f) => quitarAcentos(nombreCompleto(f)).includes(q) || quitarAcentos(f.numero_nomina).includes(q));
  if (estatus) r = r.filter((f) => num(f[estatus]) > 0);
  let ord = orden;
  if (atajo === 'mas_faltas') {
    r = r.filter((f) => num(f.falta) > 0);
    if (ord === 'nombre') ord = 'faltas';
  } else if (atajo === 'faltas_con_marcas') {
    r = r.filter((f) => num(f.faltas_con_marcas) > 0);
    if (ord === 'nombre') ord = 'faltas_con_marcas';
  } else if (atajo === 'incompletas_comida') {
    r = r.filter((f) => num(f.incompletas_comida) > 0);
    if (ord === 'nombre') ord = 'incompletas_comida';
  } else if (atajo === 'sin_marcas') {
    r = r.filter((f) => num(f.dias_con_marcas) === 0 && diasEvaluados(f) > 0);
  }
  const porNombre = (a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es');
  const clave = {
    faltas: (f) => num(f.falta),
    faltas_con_marcas: (f) => num(f.faltas_con_marcas),
    incompletas_comida: (f) => num(f.incompletas_comida),
    retardos: (f) => num(f.retardo),
    minutos_retardo: (f) => num(f.minutos_retardo),
    incompletas: (f) => num(f.incompleta),
  }[ord];
  if (clave) r.sort((a, b) => clave(b) - clave(a) || porNombre(a, b));
  else if (ord === 'puntualidad') {
    const p = (f) => {
      const v = porcentajePuntualidad(f);
      return v === null ? 101 : v;
    };
    r.sort((a, b) => p(a) - p(b) || porNombre(a, b));
  } else r.sort(porNombre);
  return r;
}

/** Texto para la región viva: cuántos empleados se muestran (solo cambia con el resultado del filtro). */
export function textoFiltrados(mostrados, total) {
  if (total === 0) return 'No hay empleados con resultados en el periodo.';
  if (mostrados === total) return `${total} ${total === 1 ? 'empleado' : 'empleados'}.`;
  return `${mostrados} de ${total} empleados con los filtros aplicados.`;
}

export function paginar(lista, pagina, tamano) {
  const paginasTotales = Math.max(1, Math.ceil(lista.length / tamano));
  const p = Math.min(Math.max(1, pagina), paginasTotales);
  return { filas: lista.slice((p - 1) * tamano, p * tamano), pagina: p, paginasTotales };
}

// --- Cuadrícula de la quincena ---
export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** Día de la semana ISO (1 = lunes ... 7 = domingo) de 'AAAA-MM-DD'. */
export function diaSemanaIso(fecha) {
  const d = new Date(tiempo(fecha)).getUTCDay();
  return d === 0 ? 7 : d;
}
export const esFinDeSemana = (fecha) => diaSemanaIso(fecha) >= 6;

/**
 * Celdas de una cuadrícula lunes-domingo para [desde, hasta]: rellena con celdas vacías antes y después.
 * `dias`: resultados del empleado ({fecha, estatus, ...}). Devuelve { celdas, columnas: 7 }.
 */
export function construirCuadricula(desde, hasta, dias) {
  if (!esFecha(desde) || !esFecha(hasta) || hasta < desde || diasEntreFechas(desde, hasta) > MAX_DIAS_RANGO) {
    return { celdas: [], columnas: 7 };
  }
  const porFecha = new Map((Array.isArray(dias) ? dias : []).map((d) => [d.fecha, d]));
  const celdas = [];
  for (let i = 1; i < diaSemanaIso(desde); i += 1) celdas.push({ vacia: true, clave: `v-i${i}` });
  for (let f = desde; f <= hasta; f = sumar(f, 1)) {
    celdas.push({ vacia: false, clave: f, fecha: f, dia: porFecha.get(f) || null, finDeSemana: esFinDeSemana(f), diaSemana: diaSemanaIso(f) });
  }
  let k = 0;
  while (celdas.length % 7 !== 0) {
    k += 1;
    celdas.push({ vacia: true, clave: `v-f${k}` });
  }
  return { celdas, columnas: 7 };
}

/** Texto accesible de una celda: «Lunes 2026-10-05: Falta. 12 min de retardo». */
export function etiquetaCelda(celda) {
  const NOMBRES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const base = `${NOMBRES[celda.diaSemana - 1]} ${celda.fecha}`;
  if (!celda.dia) return `${base}: sin cálculo`;
  const info = infoEstatus(celda.dia.estatus);
  const extra = [];
  if (num(celda.dia.minutos_retardo) > 0) extra.push(`${celda.dia.minutos_retardo} min de retardo`);
  if (num(celda.dia.minutos_salida_anticipada) > 0) extra.push(`${celda.dia.minutos_salida_anticipada} min de salida anticipada`);
  return `${base}: ${info.texto}${extra.length ? `. ${extra.join(', ')}` : ''}`;
}

/**
 * Siguiente celda con foco al pulsar una flecha (Inicio/Fin: extremos de la fila). `celdas` con `vacia`; `columnas` es 7
 * en pantallas anchas y 1 cuando la cuadrícula se apila. Salta las celdas vacías; no sale de la cuadrícula.
 */
export function celdaSiguiente(celdas, indice, tecla, columnas) {
  const paso = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columnas, ArrowUp: -columnas }[tecla];
  const habilitada = (i) => i >= 0 && i < celdas.length && !celdas[i].vacia;
  if (tecla === 'Home' || tecla === 'End') {
    const fila = Math.floor(indice / columnas);
    const ini = fila * columnas;
    const fin = Math.min(celdas.length - 1, ini + columnas - 1);
    if (tecla === 'Home') for (let i = ini; i <= fin; i += 1) if (habilitada(i)) return i;
    if (tecla === 'End') for (let i = fin; i >= ini; i -= 1) if (habilitada(i)) return i;
    return indice;
  }
  if (!paso) return indice;
  for (let i = indice + paso; i >= 0 && i < celdas.length; i += paso) {
    if (habilitada(i)) return i;
  }
  return indice;
}

// --- Detalle de un día ---
export const BANDERAS = {
  ultima_marca_en_comida: 'La última marca del día cae dentro de la comida y no hay una posterior: puede ser salida a comer sin regreso o salida anticipada. RH decide o justifica.',
  exceso_comida: 'La comida duró más de lo que marca el turno (solo informativo: no cambia el estatus).',
  marca_intermedia_sin_salida: 'Hay marcas sueltas de la mañana después de la entrada, pero ninguna marca de salida.',
  marcas_duplicadas: 'Hubo marcas a 60 segundos o menos una de otra: cuentan como una sola checada.',
  marca_unica: 'Solo hay una marca en todo el día.',
  marcas_fuera_de_ventana: 'Hay marcas que no se tomaron como entrada, salida ni comida.',
  salida_sin_entrada: 'Hay una marca de salida pero ninguna de entrada.',
  trabajo_en_descanso: 'Hay marcas en un día de descanso del turno (se informan, no se califican).',
  trabajo_en_festivo: 'Hay marcas en un día festivo (se informan, no se califican).',
  marcas_en_vacaciones: 'Hay marcas durante unas vacaciones aprobadas.',
  marcas_en_permiso: 'Hay marcas durante un permiso aprobado.',
  turno_inactivo: 'El turno asignado está marcado como inactivo.',
  dia_pendiente: 'El día aún no termina: el resultado es provisional.',
  nomina_duplicada: 'El número de nómina lo comparte otro empleado.',
};
export const explicarBandera = (b) => BANDERAS[b] || `Bandera técnica: ${b}`;

/** Banderas del detalle como [{clave, texto}] (arreglo vacío si no hay). */
export function banderasDelDia(dia) {
  const b = dia && dia.detalle && Array.isArray(dia.detalle.banderas) ? dia.detalle.banderas : [];
  return b.map((clave) => ({ clave, texto: explicarBandera(clave) }));
}

/** La regla que produjo el estatus: «Falta: Sin marcas en el día…» + el resto de las explicaciones. */
export function reglaDelDia(dia) {
  const ex = dia && dia.detalle && Array.isArray(dia.detalle.explicaciones) ? dia.detalle.explicaciones.filter(Boolean) : [];
  const info = infoEstatus(dia && dia.estatus);
  return { titulo: ex.length ? `${info.texto}: ${ex[0]}` : info.texto, otras: ex.slice(1) };
}

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const sumaHora = (hora, minutos) => {
  if (typeof hora !== 'string' || !/^\d{2}:\d{2}/.test(hora) || !Number.isFinite(minutos)) return '';
  return hhmm(((Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) + minutos) % 1440 + 1440) % 1440);
};

/** Datos del turno usado (snapshot) listos para mostrar: [{etiqueta, valor}]. */
export function filasDelTurno(dia) {
  if (!dia || !dia.turno_nombre) return [];
  const min = (v) => (v === null || v === undefined ? '—' : `${v} min`);
  const comida = dia.detalle && dia.detalle.comida;
  const filas = [
    { etiqueta: 'Turno', valor: `${dia.turno_nombre}${dia.origen_turno === 'empleado' ? ' (individual)' : dia.origen_turno === 'departamento' ? ' (del departamento)' : ''}` },
  ];
  if (dia.entrada_programada) {
    filas.push({ etiqueta: 'Horario', valor: `${dia.entrada_programada} a ${dia.salida_programada}${dia.cruza_medianoche ? ' (cruza la medianoche)' : ''}` });
    filas.push({ etiqueta: 'Entrada válida', valor: `hasta ${sumaHora(dia.entrada_programada, dia.ventana_entrada_despues_min)} (ventana de ${min(dia.ventana_entrada_despues_min)} después de la entrada)` });
  }
  filas.push({ etiqueta: 'Tolerancia de retardo', valor: min(dia.tolerancia_retardo_min) });
  filas.push({ etiqueta: 'Umbral de falta', valor: `más de ${min(dia.umbral_falta_min)} de retardo` });
  filas.push({ etiqueta: 'Tolerancia de salida', valor: min(dia.tolerancia_salida_min) });
  filas.push({ etiqueta: 'Ventana de salida', valor: `hasta ${min(dia.ventana_salida_despues_min)} después de la salida` });
  filas.push({ etiqueta: 'Comida', valor: `${min(dia.descanso_min)}${comida ? `; ventana ${comida.desde}-${comida.hasta}` : ''}` });
  return filas;
}

/**
 * Función de cada marca del día. `partes(iso)` -> {fecha, minutos} en hora local (inyectada). Devuelve un mapa id -> rol
 * ('entrada' | 'salida' | 'comida' | 'duplicada' | 'otra'). Las marcas usadas son [entrada, salida] (una sola:
 * entrada, salvo la bandera salida_sin_entrada).
 */
export function rolesDeMarcas(marcas, dia, partes) {
  const usadas = ((dia && dia.marcas_usadas) || []).map(String);
  const banderas = (dia && dia.detalle && dia.detalle.banderas) || [];
  const roles = {};
  let previaConservada = null;
  const comida = dia && dia.detalle && dia.detalle.comida;
  const lista = (Array.isArray(marcas) ? marcas : []).slice().sort((a, b) => new Date(a.marca_ts) - new Date(b.marca_ts));
  const minutosComida = comida ? [Number(comida.desde.slice(0, 2)) * 60 + Number(comida.desde.slice(3, 5)), Number(comida.hasta.slice(0, 2)) * 60 + Number(comida.hasta.slice(3, 5))] : null;
  for (const m of lista) {
    const id = String(m.id);
    const ms = new Date(m.marca_ts).getTime();
    const idx = usadas.indexOf(id);
    if (idx !== -1) {
      roles[id] = usadas.length === 2 ? (idx === 0 ? 'entrada' : 'salida') : banderas.includes('salida_sin_entrada') ? 'salida' : 'entrada';
      previaConservada = ms;
      continue;
    }
    if (previaConservada !== null && ms - previaConservada <= 60000) {
      roles[id] = 'duplicada';
      continue;
    }
    previaConservada = ms;
    const p = partes ? partes(m.marca_ts) : null;
    if (minutosComida && p && p.fecha === dia.fecha && p.minutos >= minutosComida[0] && p.minutos <= minutosComida[1]) roles[id] = 'comida';
    else roles[id] = 'otra';
  }
  return roles;
}
export const ROLES_MARCA = {
  entrada: 'Entrada (tomada)',
  salida: 'Salida (tomada)',
  comida: 'Comida',
  duplicada: 'Duplicada (≤ 60 s de otra)',
  otra: 'No usada',
};

/** ¿Se puede justificar / anular desde el detalle? Devuelve { justificar, anular, motivoNo } */
export function accionesDelDia({ dia, cruces, periodoEstado, puedeEscribir }) {
  const justificacion = cruces && cruces.justificacion;
  if (!dia) return { justificar: false, anular: false, motivoNo: '' };
  const cerrado = periodoEstado === 'cerrado';
  if (!puedeEscribir) return { justificar: false, anular: false, motivoNo: 'Tu rol no puede modificar la asistencia.' };
  if (cerrado) {
    return { justificar: false, anular: false, motivoNo: 'La quincena está cerrada: para justificar o anular hay que reabrirla en Periodos.' };
  }
  if (dia.estatus === 'justificada') {
    return { justificar: false, anular: Boolean(justificacion && justificacion.id), motivoNo: justificacion ? '' : 'No se encontró la justificación activa.' };
  }
  if (ESTATUS_JUSTIFICABLES.includes(dia.estatus)) return { justificar: true, anular: false, motivoNo: '' };
  return { justificar: false, anular: false, motivoNo: 'Solo se justifica una falta, un retardo, una salida anticipada o una marca incompleta.' };
}

export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 500;
/** Error del motivo de una justificación, o ''. */
export function validarMotivoJustificacion(motivo) {
  const t = String(motivo || '').trim();
  if (t.length < MOTIVO_MIN) return `El motivo es obligatorio (mínimo ${MOTIVO_MIN} caracteres).`;
  if (t.length > MOTIVO_MAX) return `El motivo no puede superar ${MOTIVO_MAX} caracteres.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t)) return 'El motivo contiene caracteres no válidos.';
  return '';
}

// --- Exportación a CSV ---
export const TOPE_FILAS_EXPORTACION = 10000;
const BOM = String.fromCharCode(0xfeff);
const INICIO_FORMULA = /^[=+\-@\t\r]/;
export function neutralizarFormula(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return INICIO_FORMULA.test(texto) ? `'${texto}` : texto;
}
export function celdaCsv(valor) {
  const t = neutralizarFormula(valor);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function armarCsv(columnas, filas, tope) {
  const usadas = filas.slice(0, tope);
  const lineas = [columnas.map((c) => celdaCsv(c.titulo)).join(',')];
  for (const f of usadas) lineas.push(columnas.map((c) => celdaCsv(f[c.clave])).join(','));
  return { texto: BOM + lineas.join('\r\n') + '\r\n', filas: usadas.length, truncado: filas.length > tope };
}

export const COLUMNAS_RESUMEN = [
  { clave: 'nomina', titulo: 'Nómina' },
  { clave: 'nombre', titulo: 'Empleado' },
  { clave: 'departamento', titulo: 'Departamento' },
  ...ORDEN_TARJETAS.map((e) => ({ clave: e, titulo: ESTATUS[e].plural })),
  { clave: 'minutos_retardo', titulo: 'Minutos de retardo' },
  { clave: 'minutos_salida_anticipada', titulo: 'Minutos de salida anticipada' },
  { clave: 'faltas_con_marcas', titulo: 'Faltas con marcas' },
  { clave: 'incompletas_comida', titulo: 'Incompletas por comida' },
  { clave: 'puntualidad', titulo: '% de puntualidad' },
];
export function construirCsvResumen(filas, tope = TOPE_FILAS_EXPORTACION) {
  const datos = (Array.isArray(filas) ? filas : []).map((f) => ({
    ...f,
    nomina: f.numero_nomina,
    nombre: nombreCompleto(f),
    departamento: f.departamento || '',
    puntualidad: textoPorcentaje(porcentajePuntualidad(f)),
  }));
  return armarCsv(COLUMNAS_RESUMEN, datos, tope);
}

export const COLUMNAS_DETALLE = [
  { clave: 'fecha', titulo: 'Fecha' },
  { clave: 'nomina', titulo: 'Nómina' },
  { clave: 'nombre', titulo: 'Empleado' },
  { clave: 'estatus', titulo: 'Estatus' },
  { clave: 'minutos_retardo', titulo: 'Minutos de retardo' },
  { clave: 'minutos_salida_anticipada', titulo: 'Minutos de salida anticipada' },
  { clave: 'primera_marca', titulo: 'Primera marca (hora de México)' },
  { clave: 'ultima_marca', titulo: 'Última marca (hora de México)' },
  { clave: 'turno', titulo: 'Turno' },
  { clave: 'periodo', titulo: 'Quincena' },
  { clave: 'regla', titulo: 'Regla aplicada' },
  { clave: 'banderas', titulo: 'Banderas' },
];
/** `hora(iso)` -> 'AAAA-MM-DD HH:MM:SS' en hora de México (inyectada). */
export function construirCsvDetalle(dias, hora, tope = TOPE_FILAS_EXPORTACION) {
  const datos = (Array.isArray(dias) ? dias : []).map((d) => ({
    fecha: d.fecha,
    nomina: d.numero_nomina,
    nombre: nombreCompleto(d),
    estatus: infoEstatus(d.estatus).texto,
    minutos_retardo: d.minutos_retardo || 0,
    minutos_salida_anticipada: d.minutos_salida_anticipada || 0,
    primera_marca: d.primera_marca ? hora(d.primera_marca) : '',
    ultima_marca: d.ultima_marca ? hora(d.ultima_marca) : '',
    turno: d.turno_nombre || '',
    periodo: d.periodo_estado ? `${d.periodo_estado}` : '',
    regla: reglaDelDia(d).titulo,
    banderas: banderasDelDia(d).map((b) => b.clave).join(' '),
  }));
  return armarCsv(COLUMNAS_DETALLE, datos, tope);
}
export const nombreArchivoResumen = (desde, hasta) => `asistencia_resumen_${desde}_a_${hasta}.csv`;
export const nombreArchivoDetalle = (desde, hasta) => `asistencia_detalle_${desde}_a_${hasta}.csv`;

/** Cuántas páginas más hay que pedir tras la primera (limite 500), con un tope de seguridad. */
export function paginasRestantes(total, limite, maximo = 30) {
  if (!Number.isFinite(total) || total <= limite) return 0;
  return Math.min(maximo - 1, Math.ceil(total / limite) - 1);
}

/** Mensaje de la lista «sin identificador». */
export const AVISO_SIN_IDENTIFICADOR =
  'Estos empleados no se analizan (no se pueden relacionar sus marcas): asigna la nómina con la plantilla de carga de empleados y luego re-vincula las marcas.';
export const MOTIVO_SIN_IDENTIFICADOR = {
  sin_numero_nomina: 'Sin número de nómina',
  nomina_duplicada: 'Nómina repetida con otro empleado',
};
