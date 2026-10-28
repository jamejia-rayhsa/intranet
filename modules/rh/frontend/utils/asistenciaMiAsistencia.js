// «Mi asistencia» y «Mi equipo»: lógica pura (sin imports: jest evalúa el fuente). Redacta en lenguaje de persona lo que el
// motor calculó, decide los estados vacíos y arma las filas del equipo. Las horas ya vienen en hora de México: quien llama
// inyecta `hora(iso) -> 'HH:MM'` (asistenciaFechas.horaLocal). Las fechas son texto 'AAAA-MM-DD'.
// El servidor es la autoridad de lo que se calificó: aquí solo se EXPLICA, nunca se vuelve a calcular un estatus.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const minutos = (n) => plural(n, 'minuto', 'minutos');

const esFecha = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** '2026-09-01' -> '1 de septiembre de 2026' ('' si no es una fecha). */
export function fechaLegible(fecha) {
  if (!esFecha(fecha)) return '';
  const [a, m, d] = fecha.split('-').map(Number);
  if (m < 1 || m > 12) return '';
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** Nombre del día de la semana de 'AAAA-MM-DD' ('lunes'...). Aritmética UTC: sin desfase de zona. */
export function nombreDelDia(fecha) {
  if (!esFecha(fecha)) return '';
  const [a, m, d] = fecha.split('-').map(Number);
  return NOMBRES_DIA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

const hhmmMasMinutos = (hora, min) => {
  if (typeof hora !== 'string' || !/^\d{2}:\d{2}/.test(hora) || !Number.isFinite(Number(min))) return '';
  const t = (((Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) + Number(min)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------------------------------------------- avisos
export const AVISO_ABIERTA = 'Quincena abierta: tus resultados pueden cambiar.';
export const AVISO_CERRADA = 'Quincena cerrada: resultado definitivo.';
export const AVISO_ABIERTA_EQUIPO = 'Quincena abierta: los resultados de tu equipo pueden cambiar.';
export const AVISO_CERRADA_EQUIPO = 'Quincena cerrada: resultado definitivo.';
export const AVISO_MOTOR = 'El sistema se actualiza cada 15 minutos aproximadamente: lo de hoy puede cambiar durante el día.';
export const AYUDA_CONTACTAR_RH = 'Si algo no cuadra, avisa a RH: ellos pueden revisarlo y justificarlo.';

/** Aviso del estado del periodo: { tono, texto } (tono 'info' para abierta, 'ok' para cerrada). */
export function avisoDelPeriodo(estado, { equipo = false } = {}) {
  if (estado === 'cerrado') return { tono: 'ok', texto: equipo ? AVISO_CERRADA_EQUIPO : AVISO_CERRADA };
  return { tono: 'info', texto: equipo ? AVISO_ABIERTA_EQUIPO : AVISO_ABIERTA };
}

export const mensajeAnalisisDesde = (analisisDesde) =>
  `El análisis de asistencia empieza el ${fechaLegible(analisisDesde) || 'día que RH indique'}, así que los días anteriores no se califican.`;

// ---------------------------------------------------------------------------------------------------- estado de la cuenta
export const MSG_SIN_VINCULO = 'Tu cuenta no está vinculada a un empleado. Avisa a RH para que la vinculen y puedas ver tu asistencia.';
export const MSG_SIN_NOMINA = 'Tu registro aún no tiene número de nómina, así que tus marcas no se pueden relacionar: avisa a RH.';
export const MSG_NOMINA_COMPARTIDA = 'Tu número de nómina coincide con otro registro, así que tus marcas no se pueden atribuir con seguridad: avisa a RH.';
export const MSG_SIN_TURNO = 'Todavía no tienes un turno asignado, por eso tus días no se califican como falta. Avisa a RH para que te lo asignen.';

/**
 * Qué decir del estado de la cuenta del usuario a partir de GET /mi-contexto.
 * @returns {{bloquea:boolean, tipo:string, mensaje:string}|null} null si todo está en orden. `bloquea`: no hay nada que
 *   mostrar hasta que RH lo corrija.
 */
export function estadoDeCuenta(contexto) {
  if (!contexto || !contexto.vinculado || !contexto.empleado) return { bloquea: true, tipo: 'sin_vinculo', mensaje: MSG_SIN_VINCULO };
  const e = contexto.empleado;
  if (!e.tiene_nomina) return { bloquea: true, tipo: 'sin_nomina', mensaje: MSG_SIN_NOMINA };
  if (e.nomina_compartida) return { bloquea: true, tipo: 'nomina_compartida', mensaje: MSG_NOMINA_COMPARTIDA };
  if (!e.turno) return { bloquea: false, tipo: 'sin_turno', mensaje: MSG_SIN_TURNO };
  return null;
}

/** ¿Es jefe vigente? (el servidor lo decide; aquí solo se lee de forma segura) */
export const esJefe = (contexto) => Boolean(contexto && contexto.es_jefe);

// -------------------------------------------------------------------------------------------------------------- quincenas
/**
 * Quincenas que el empleado puede consultar: desde el inicio del análisis hasta la actual, de la más nueva a la más vieja.
 * Si la quincena actual aún no existe en el servidor (el motor la crea al correr) se agrega la de `periodoActual`.
 */
export function quincenasVisibles(periodos, analisisDesde, hoy, periodoActual = null) {
  let lista = (Array.isArray(periodos) ? periodos : []).filter(
    (p) => p && esFecha(p.fecha_inicio) && p.fecha_inicio <= hoy && (!esFecha(analisisDesde) || p.fecha_fin >= analisisDesde),
  );
  if (periodoActual && esFecha(periodoActual.fecha_inicio) && !lista.some((p) => p.fecha_inicio === periodoActual.fecha_inicio)) {
    lista = lista.concat([{ id: null, fecha_inicio: periodoActual.fecha_inicio, fecha_fin: periodoActual.fecha_fin, estado: periodoActual.estado || 'abierto' }]);
  }
  return lista.slice().sort((a, b) => (a.fecha_inicio < b.fecha_inicio ? 1 : a.fecha_inicio > b.fecha_inicio ? -1 : 0));
}

/** La quincena que contiene `hoy`; si no hay, la más reciente. */
export function quincenaPorOmision(quincenas, hoy) {
  const lista = Array.isArray(quincenas) ? quincenas : [];
  return lista.find((p) => p.fecha_inicio <= hoy && hoy <= p.fecha_fin) || lista[0] || null;
}

/** Clave estable del selector (el id puede faltar si la quincena aún no existe en el servidor). */
export const claveQuincena = (p) => p.fecha_inicio;

export const textoQuincena = (p, hoy) => {
  const actual = hoy && p.fecha_inicio <= hoy && hoy <= p.fecha_fin;
  return `${p.fecha_inicio} a ${p.fecha_fin} · ${p.estado === 'cerrado' ? 'cerrada' : 'abierta'}${actual ? ' (actual)' : ''}`;
};

// -------------------------------------------------------------------------------------------------------------- tarjetas
const ESTATUS_CONTEO = [
  'puntual', 'retardo', 'falta', 'salida_anticipada', 'incompleta', 'vacaciones', 'permiso', 'festivo', 'descanso', 'justificada', 'pendiente', 'sin_turno',
];

/**
 * Cuenta los días de una quincena en el formato de una fila del resumen (un campo por estatus), listo para
 * porcentajePuntualidad / totalesDeResumen de asistenciaResultados.js.
 */
export function contarDias(dias) {
  const c = { dias: 0, minutos_retardo: 0, minutos_salida_anticipada: 0, dias_con_marcas: 0 };
  for (const e of ESTATUS_CONTEO) c[e] = 0;
  for (const d of Array.isArray(dias) ? dias : []) {
    if (!d) continue;
    c.dias += 1;
    if (ESTATUS_CONTEO.includes(d.estatus)) c[d.estatus] += 1;
    if (d.estatus === 'retardo' || d.estatus === 'justificada') c.minutos_retardo += num(d.minutos_retardo);
    c.minutos_salida_anticipada += num(d.minutos_salida_anticipada);
    if (d.primera_marca) c.dias_con_marcas += 1;
  }
  return c;
}

// ------------------------------------------------------------------------------------------------------ día sin resultado
/**
 * Por qué un día no tiene resultado (la cuadrícula lo marca «sin cálculo»): mensaje claro y qué hacer.
 * @param {{fecha:string, hoy:string, analisisDesde:string, contexto:object|null, persona?:'yo'|'equipo', tieneNomina?:boolean}} p
 */
export function mensajeSinResultado({ fecha, hoy, analisisDesde, contexto, persona = 'yo', tieneNomina = true }) {
  const yo = persona !== 'equipo';
  if (esFecha(analisisDesde) && fecha < analisisDesde) return mensajeAnalisisDesde(analisisDesde);
  if (esFecha(hoy) && fecha > hoy) return 'Este día todavía no llega: se califica cuando termina la jornada.';
  if (yo) {
    const cuenta = estadoDeCuenta(contexto);
    if (cuenta && cuenta.bloquea) return cuenta.mensaje;
  } else if (!tieneNomina) {
    return 'Esta persona no tiene número de nómina, así que sus marcas no se pueden relacionar y no se analiza. Avisa a RH.';
  }
  if (fecha === hoy) return 'Hoy todavía no tiene resultado: se calcula en unos minutos, el sistema se actualiza cada 15 minutos aproximadamente.';
  return 'Este día no tiene un resultado calculado. Si crees que debería tenerlo, avisa a RH.';
}

// -------------------------------------------------------------------------------------------------- redacción del detalle
const ETIQUETA = {
  puntual: 'puntual', retardo: 'retardo', falta: 'falta', salida_anticipada: 'salida anticipada', incompleta: 'marca incompleta',
  vacaciones: 'vacaciones', permiso: 'permiso', festivo: 'festivo', descanso: 'descanso', justificada: 'justificada', pendiente: 'pendiente', sin_turno: 'sin turno',
};

const BANDERAS_CLARAS = {
  marcas_duplicadas: 'Algunas marcas estaban a menos de un minuto una de otra: cuentan como una sola checada.',
  marca_unica: 'Solo hay una marca en todo el día.',
  marcas_fuera_de_ventana: 'Hay marcas que no se tomaron como entrada, salida ni comida.',
  salida_sin_entrada: 'Hay una marca de salida pero ninguna de entrada.',
  trabajo_en_descanso: 'Hay marcas en un día de descanso: se muestran, pero no cambian el resultado.',
  trabajo_en_festivo: 'Hay marcas en un día festivo: se muestran, pero no cambian el resultado.',
  marcas_en_vacaciones: 'Hay marcas durante unas vacaciones aprobadas: se muestran, pero no cambian el resultado.',
  marcas_en_permiso: 'Hay marcas durante un permiso aprobado: se muestran, pero no cambian el resultado.',
};

/**
 * Explica un día en lenguaje de persona. `persona`: 'yo' (segunda persona: «Llegaste a las 08:14») o 'equipo' (tercera:
 * «Llegó a las 08:14»). `datos` es la respuesta de GET /resultados/dia ({dia, marcas, cruces}).
 * @returns {{frase:string, explicaciones:string[], horario:string, comida:string, marcas:Array<{hora:string, etiqueta:string, rol:string, instante:string}>,
 *   cruce:string, justificacion:null|{motivo:string, quien:string}, original:string, revisar:string[], ayuda:string}}
 */
export function redactarDia({ dia, marcas = [], cruces = {}, hora, persona = 'yo' }) {
  const yo = persona !== 'equipo';
  const v = (segunda, tercera) => (yo ? segunda : tercera);
  const d = dia || {};
  const det = d.detalle || {};
  const banderas = Array.isArray(det.banderas) ? det.banderas : [];
  const hh = typeof hora === 'function' ? hora : (x) => String(x);
  const lista = Array.isArray(marcas) ? marcas : [];
  const deRol = (rol) => lista.filter((m) => m.rol === rol);
  const entrada = deRol('entrada')[0] || null;
  const salida = deRol('salida').slice(-1)[0] || null;
  const comida = deRol('comida');
  const hEntrada = entrada ? hh(entrada.marca_ts) : '';
  const hSalida = salida ? hh(salida.marca_ts) : '';
  const progEntrada = d.entrada_programada || '';
  const progSalida = d.salida_programada || '';
  const tarde = num(det.minutos_tarde);
  const antes = num(det.minutos_antes_salida);
  const tolRetardo = num(d.tolerancia_retardo_min);
  const tolSalida = num(d.tolerancia_salida_min);
  const umbral = num(d.umbral_falta_min);
  const ultima = lista.length ? lista[lista.length - 1] : null;
  const explicaciones = [];
  let frase = '';

  const llegada = () => (progEntrada ? `${v('Tu', 'Su')} horario de entrada es a las ${progEntrada}` : `${v('Tu', 'Su')} entrada estaba programada`);

  switch (d.estatus) {
    case 'puntual': {
      const partes = [];
      if (entrada) partes.push(`${v('Llegaste', 'Llegó')} a las ${hEntrada}`);
      if (salida) partes.push(`${entrada ? 'y ' : ''}${v('saliste', 'salió')} a las ${hSalida}`);
      frase = `${partes.length ? `${partes.join(' ')}. ` : ''}Todo está dentro del horario y de la tolerancia, por eso cuenta como puntual.`;
      break;
    }
    case 'retardo': {
      frase = `${llegada()} y ${v('llegaste', 'llegó')} a las ${hEntrada || '—'}${tarde > 0 ? ` (${minutos(tarde)} tarde)` : ''}. La tolerancia es de ${minutos(tolRetardo)}, por eso cuenta como retardo de ${minutos(num(d.minutos_retardo) || tarde)}.`;
      if (num(d.minutos_salida_anticipada) > 0) {
        explicaciones.push(`Además ${v('saliste', 'salió')} ${minutos(num(d.minutos_salida_anticipada))} antes de la hora de salida${progSalida ? ` (${progSalida})` : ''}.`);
      }
      break;
    }
    case 'salida_anticipada': {
      frase = `${v('Saliste', 'Salió')} a las ${hSalida || '—'}, ${minutos(num(d.minutos_salida_anticipada) || antes)} antes de la hora de salida${progSalida ? ` (${progSalida})` : ''}. La tolerancia de salida es de ${minutos(tolSalida)}, por eso cuenta como salida anticipada.`;
      break;
    }
    case 'falta': {
      if (!entrada && lista.length === 0) {
        frase = `No hay marca de entrada ni ninguna otra marca este día, por eso cuenta como falta.`;
      } else if (!entrada) {
        const limite = hhmmMasMinutos(progEntrada, d.ventana_entrada_despues_min);
        frase = `No hay marca de entrada${limite ? ` hasta las ${limite}` : ' dentro del horario permitido'}, por eso cuenta como falta.`;
        const primera = lista[0];
        if (primera) explicaciones.push(`${v('Tu', 'Su')} primera marca del día fue a las ${hh(primera.marca_ts)}, fuera del tiempo para registrar la entrada.`);
      } else {
        frase = `${llegada()} y ${v('llegaste', 'llegó')} a las ${hEntrada} (${minutos(tarde)} tarde). Pasados ${minutos(umbral)} de retraso ya no cuenta como retardo sino como falta.`;
      }
      break;
    }
    case 'incompleta': {
      if (banderas.includes('ultima_marca_en_comida') && ultima) {
        frase = `${v('Tu', 'Su')} última marca fue a las ${hh(ultima.marca_ts)}, dentro del horario de comida; si ${v('saliste', 'salió')} a comer y no ${v('regresaste', 'regresó')} a checar, o ${v('te retiraste', 'se retiró')} temprano, RH puede revisarlo.`;
      } else if (banderas.includes('marca_intermedia_sin_salida')) {
        frase = `${v('Checaste', 'Checó')} la entrada a las ${hEntrada || '—'} y después hay marcas sueltas, pero ninguna marca de salida, por eso la jornada queda incompleta. RH puede revisarlo.`;
      } else {
        frase = `Hay marca de entrada${hEntrada ? ` (${hEntrada})` : ''} pero no hay marca de salida, por eso la jornada queda incompleta. RH puede revisarlo.`;
      }
      break;
    }
    case 'vacaciones':
      frase = cruces.vacaciones
        ? `${v('Tienes', 'Tiene')} vacaciones aprobadas del ${cruces.vacaciones.fecha_inicial} al ${cruces.vacaciones.fecha_final}, por eso este día no se califica.`
        : `${v('Tienes', 'Tiene')} vacaciones aprobadas este día, por eso no se califica.`;
      break;
    case 'permiso':
      frase = cruces.permiso
        ? `${v('Tienes', 'Tiene')} un permiso aprobado${cruces.permiso.tipo ? ` (${cruces.permiso.tipo})` : ''} del ${cruces.permiso.fecha_inicio} al ${cruces.permiso.fecha_fin}, por eso este día no se califica.`
        : `${v('Tienes', 'Tiene')} un permiso aprobado este día, por eso no se califica.`;
      break;
    case 'festivo':
      frase = cruces.festivo
        ? `Es día festivo o de descanso otorgado por la empresa (${cruces.festivo.nombre}), por eso no se califica.`
        : 'Es día festivo o de descanso otorgado por la empresa, por eso no se califica.';
      break;
    case 'descanso':
      frase = `Es ${v('tu', 'su')} día de descanso según ${v('tu', 'su')} turno, por eso no se califica.`;
      break;
    case 'sin_turno':
      frase = yo
        ? 'No tienes un turno asignado este día, así que no se califica como falta. Avisa a RH para que te lo asignen.'
        : 'Esta persona no tiene un turno asignado este día, así que no se califica como falta. Avisa a RH para que se lo asignen.';
      break;
    case 'pendiente': {
      frase = 'El día aún no termina, por eso el resultado es provisional.';
      if (entrada) explicaciones.push(`${v('Tu', 'Su')} primera marca fue a las ${hEntrada}.`);
      else if (lista.length === 0) explicaciones.push('Todavía no hay marcas.');
      if (det.calculo_provisional && ETIQUETA[det.calculo_provisional]) {
        explicaciones.push(`Con lo registrado hasta ahora contaría como ${ETIQUETA[det.calculo_provisional]}, pero puede cambiar.`);
      }
      break;
    }
    case 'justificada':
      frase = 'RH justificó este día, por eso no cuenta en contra.';
      break;
    default:
      frase = 'Este día no tiene un resultado calculado.';
  }

  // Lo que habría sido sin la justificación
  let original = '';
  if (d.estatus === 'justificada' && det.calculo_original && ETIQUETA[det.calculo_original.estatus]) {
    const o = det.calculo_original;
    const extra = num(o.minutos_retardo) > 0 ? ` de ${minutos(num(o.minutos_retardo))}` : num(o.minutos_salida_anticipada) > 0 ? ` de ${minutos(num(o.minutos_salida_anticipada))}` : '';
    original = `Sin la justificación habría contado como ${ETIQUETA[o.estatus]}${extra}.`;
  }

  // Horario del turno ese día
  let horario = '';
  if (d.turno_nombre) {
    horario = progEntrada
      ? `${v('Tu', 'Su')} horario ese día: ${progEntrada} a ${progSalida} (turno ${d.turno_nombre})${d.cruza_medianoche ? ', termina después de la medianoche' : ''}.`
      : `${v('Tu', 'Su')} turno: ${d.turno_nombre}. Ese día no es laborable.`;
  }

  // Comida: duración con dos o más marcas
  let textoComida = '';
  const ventana = det.comida && det.comida.desde ? ` (la comida puede tomarse entre las ${det.comida.desde} y las ${det.comida.hasta})` : '';
  if (comida.length >= 2) {
    const total = num(det.minutos_comida);
    const horas = comida.map((m) => hh(m.marca_ts));
    const marcasTexto = comida.length === 2 ? `de ${horas[0]} a ${horas[1]}` : `marcas a las ${horas.join(', ')}, de la primera a la última`;
    textoComida = `${v('Tu', 'Su')} comida duró ${minutos(total)} (${marcasTexto}).`;
    if (num(det.exceso_comida_min) > 0) {
      textoComida += ` Son ${minutos(num(det.exceso_comida_min))} más de los ${num(d.descanso_min)} que marca ${v('tu', 'su')} turno; es solo informativo y no cambia el resultado.`;
    } else if (num(d.descanso_min) > 0) {
      textoComida += ` ${v('Tu', 'Su')} turno marca ${minutos(num(d.descanso_min))} de comida.`;
    }
  } else if (comida.length === 1 && !banderas.includes('ultima_marca_en_comida')) {
    textoComida = `Hay una sola marca de comida (${hh(comida[0].marca_ts)}): no se puede saber cuánto duró${ventana}.`;
  }

  // Cruces con otros registros (el resultado ya lo explica la frase; aquí solo lo que no se dijo)
  const cruce = [];
  if (cruces.vacaciones && d.estatus !== 'vacaciones') cruce.push(`Hay vacaciones aprobadas del ${cruces.vacaciones.fecha_inicial} al ${cruces.vacaciones.fecha_final}.`);
  if (cruces.permiso && d.estatus !== 'permiso') cruce.push(`Hay un permiso aprobado del ${cruces.permiso.fecha_inicio} al ${cruces.permiso.fecha_fin}.`);
  if (cruces.festivo && d.estatus !== 'festivo') cruce.push(`Es festivo: ${cruces.festivo.nombre}.`);

  // Motivo de la justificación: lo ve el empleado y su jefe; el nombre de quien la hizo solo lo ve RH (los demás leen «RH»)
  const j = cruces.justificacion;
  const justificacion = j && j.motivo ? { motivo: String(j.motivo), quien: j.creado_por_nombre ? String(j.creado_por_nombre) : 'RH' } : null;

  const revisar = banderas.filter((b) => BANDERAS_CLARAS[b]).map((b) => BANDERAS_CLARAS[b]);

  return {
    frase,
    explicaciones,
    horario,
    comida: textoComida,
    marcas: lista.map((m) => ({ hora: hh(m.marca_ts), instante: m.marca_ts, rol: m.rol || 'otra', etiqueta: etiquetaMarca(m.rol) })),
    cruce: cruce.join(' '),
    justificacion,
    original,
    revisar,
    ayuda: AYUDA_CONTACTAR_RH,
  };
}

/** Cómo se usó una marca, en palabras de persona. */
export function etiquetaMarca(rol) {
  const t = {
    entrada: 'Entrada',
    salida: 'Salida',
    comida: 'Comida',
    duplicada: 'Repetida (a menos de un minuto de otra)',
    otra: 'Marca que no se usó para calificar',
  };
  return t[rol] || t.otra;
}

// ------------------------------------------------------------------------------------------------------------ Mi equipo
// Íconos y tonos: los mismos de ESTATUS en asistenciaResultados.js (una prueba lo verifica)
const VISUAL = {
  puntual: { tono: 'ok', icono: '✓' },
  retardo: { tono: 'aviso', icono: '◔' },
  falta: { tono: 'error', icono: '✗' },
  salida_anticipada: { tono: 'aviso', icono: '↤' },
  incompleta: { tono: 'aviso', icono: '◐' },
  vacaciones: { tono: 'info', icono: '☼' },
  permiso: { tono: 'info', icono: '✎' },
  festivo: { tono: 'info', icono: '★' },
  descanso: { tono: 'neutro', icono: '·' },
  justificada: { tono: 'ok', icono: '§' },
  pendiente: { tono: 'neutro', icono: '…' },
  sin_turno: { tono: 'neutro', icono: '?' },
  ya_checo: { tono: 'ok', icono: '●' },
  aun_no_checa: { tono: 'neutro', icono: '…' },
  sin_marca_hoy: { tono: 'aviso', icono: '○' },
  sin_nomina: { tono: 'aviso', icono: '?' },
  sin_resultado: { tono: 'neutro', icono: '…' },
};
export const VISUAL_HOY = VISUAL;

const aMinutos = (hhmm) => (typeof hhmm === 'string' && /^\d{2}:\d{2}/.test(hhmm) ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);

/**
 * Estado de HOY de un subordinado a partir de la fila de GET /mi-equipo/hoy (lo que el motor ya guardó + las marcas de hoy).
 * `hora(iso)` -> 'HH:MM'; `ahoraMin` = minutos desde la medianoche (hora de México) del momento de la consulta.
 * @returns {{clave:string, etiqueta:string, texto:string, tono:string, icono:string}}
 */
export function estadoHoyEquipo(f, { hora, ahoraMin = null } = {}) {
  const hh = typeof hora === 'function' ? hora : (x) => String(x);
  const sal = (clave, etiqueta, texto) => ({ clave, etiqueta, texto, ...VISUAL[clave] });
  if (!f || !f.tiene_nomina) return sal('sin_nomina', 'Sin nómina', 'Sin nómina: no se analiza. Avisa a RH para que se registre su número de nómina.');
  const marcas = num(f.marcas_hoy);
  const primera = f.primera_marca || f.primera_hoy;
  const ultima = f.ultima_marca || f.ultima_hoy;
  const checo = primera ? `Ya checó a las ${hh(primera)}` : '';
  switch (f.dia_estatus) {
    case 'pendiente': {
      if (marcas > 0 || primera) {
        const ult = ultima && ultima !== primera ? `; su última marca fue a las ${hh(ultima)}` : '';
        return sal('ya_checo', 'Ya checó', `${checo || 'Ya checó'}${ult}.`);
      }
      const entrada = f.entrada_programada ? ` Su entrada es a las ${f.entrada_programada}.` : '';
      const salida = aMinutos(f.salida_programada);
      if (ahoraMin !== null && salida !== null && ahoraMin > salida) {
        return sal('sin_marca_hoy', 'Sin marcas', `No registró ninguna marca hoy. El día se califica en unos minutos.`);
      }
      return sal('aun_no_checa', 'Aún no checa', `Aún no checa.${entrada}`);
    }
    case 'puntual':
      return sal('puntual', 'Puntual', `Puntual${primera ? `: entró a las ${hh(primera)}` : ''}.`);
    case 'retardo':
      return sal('retardo', 'Retardo', `Retardo de ${minutos(num(f.minutos_retardo))}${primera ? ` (entró a las ${hh(primera)})` : ''}.`);
    case 'falta':
      return sal('falta', 'Falta', primera ? `Falta (su primera marca fue a las ${hh(primera)}, fuera del tiempo de entrada).` : 'Falta: no hay marca de entrada.');
    case 'salida_anticipada':
      return sal('salida_anticipada', 'Salida anticipada', `Salió ${minutos(num(f.minutos_salida_anticipada))} antes de su hora de salida.`);
    case 'incompleta':
      return sal('incompleta', 'Marca incompleta', f.ultima_marca_en_comida && ultima
        ? `Marca incompleta: su última marca fue a las ${hh(ultima)}, dentro de la comida.`
        : 'Marca incompleta: falta alguna marca (por ejemplo la de salida).');
    case 'vacaciones': return sal('vacaciones', 'Vacaciones', 'De vacaciones.');
    case 'permiso': return sal('permiso', 'Permiso', 'Con permiso aprobado.');
    case 'festivo': return sal('festivo', 'Festivo', 'Día festivo.');
    case 'descanso': return sal('descanso', 'Descanso', 'Día de descanso.');
    case 'justificada': return sal('justificada', 'Justificada', 'RH justificó el día.');
    case 'sin_turno': return sal('sin_turno', 'Sin turno', 'Sin turno asignado: no se califica. Avisa a RH.');
    default:
      if (marcas > 0 && primera) return sal('ya_checo', 'Ya checó', `${checo}. Su resultado aún no se calcula.`);
      return sal('sin_resultado', 'Sin resultado', 'Todavía no hay resultado de hoy: el sistema se actualiza cada 15 minutos aproximadamente.');
  }
}

/** Resumen corto del panel «Hoy»: «5 personas: 3 ya checaron, 1 aún no checa, 1 de vacaciones». */
export function resumenHoy(estados) {
  const lista = Array.isArray(estados) ? estados : [];
  if (lista.length === 0) return 'No hay personas en tu equipo.';
  const cuenta = (clave) => lista.filter((e) => e.clave === clave).length;
  const partes = [];
  const checaron = lista.filter((e) => ['ya_checo', 'puntual', 'retardo', 'salida_anticipada', 'incompleta'].includes(e.clave)).length;
  if (checaron) partes.push(`${checaron} ${checaron === 1 ? 'ya checó' : 'ya checaron'}`);
  if (cuenta('aun_no_checa')) partes.push(`${cuenta('aun_no_checa')} aún no ${cuenta('aun_no_checa') === 1 ? 'checa' : 'checan'}`);
  if (cuenta('falta') + cuenta('sin_marca_hoy')) partes.push(`${cuenta('falta') + cuenta('sin_marca_hoy')} sin marcas o con falta`);
  const fuera = cuenta('vacaciones') + cuenta('permiso') + cuenta('festivo') + cuenta('descanso') + cuenta('justificada');
  if (fuera) partes.push(`${fuera} ${fuera === 1 ? 'no trabaja hoy' : 'no trabajan hoy'}`);
  if (cuenta('sin_nomina')) partes.push(`${cuenta('sin_nomina')} sin nómina`);
  return `${plural(lista.length, 'persona', 'personas')}${partes.length ? `: ${partes.join(', ')}` : ''}.`;
}

/**
 * Une la lista del equipo (GET /mi-equipo/hoy: todos los directos, también quien no tiene nómina) con el resumen de la
 * quincena (GET /resumen?equipo=1: solo quienes tienen días calculados). Los que están en el resumen y no en la lista
 * (dados de baja dentro del rango) se agregan marcados `de_baja`. Cada fila lleva `sin_nomina` y `hoy`.
 */
export function combinarEquipo(equipoHoy, resumen, opciones = {}) {
  const porId = new Map((Array.isArray(resumen) ? resumen : []).map((r) => [r.empleado_id, r]));
  const filas = [];
  const vistos = new Set();
  for (const e of Array.isArray(equipoHoy) ? equipoHoy : []) {
    vistos.add(e.empleado_id);
    const r = porId.get(e.empleado_id) || {};
    filas.push({
      ...contarVacio(),
      ...r,
      empleado_id: e.empleado_id,
      nombre: e.nombre,
      apellido_paterno: e.apellido_paterno,
      apellido_materno: e.apellido_materno,
      numero_nomina: e.numero_nomina,
      sin_nomina: !e.tiene_nomina,
      de_baja: e.estatus === 'baja',
      hoy: estadoHoyEquipo(e, opciones),
    });
  }
  for (const r of Array.isArray(resumen) ? resumen : []) {
    if (vistos.has(r.empleado_id)) continue;
    filas.push({ ...contarVacio(), ...r, sin_nomina: false, de_baja: true, hoy: null });
  }
  return filas;
}

function contarVacio() {
  const c = { dias: 0, minutos_retardo: 0, minutos_salida_anticipada: 0, dias_con_marcas: 0, faltas_con_marcas: 0, incompletas_comida: 0 };
  for (const e of ESTATUS_CONTEO) c[e] = 0;
  return c;
}

/** Texto de una tarjeta de persona del equipo: «2 faltas, 1 retardo» o «Sin incidencias». */
export function incidenciasDeFila(f) {
  const partes = [];
  if (num(f.falta) > 0) partes.push(plural(num(f.falta), 'falta', 'faltas'));
  if (num(f.retardo) > 0) partes.push(plural(num(f.retardo), 'retardo', 'retardos'));
  if (num(f.incompleta) > 0) partes.push(plural(num(f.incompleta), 'marca incompleta', 'marcas incompletas'));
  if (num(f.salida_anticipada) > 0) partes.push(plural(num(f.salida_anticipada), 'salida anticipada', 'salidas anticipadas'));
  return partes.length ? partes.join(', ') : 'Sin incidencias';
}

export const MSG_NO_ES_JEFE = 'Esta pantalla es para quien tiene personal a su cargo, y hoy no tienes subordinados directos registrados. Si crees que es un error, avisa a RH.';
export const MSG_EQUIPO_ACOTADO = 'Aquí solo aparecen las personas que te reportan directamente (no las de tus subordinados ni tus compañeros).';

// -------------------------------------------------------------------------------------- filtros de la tabla del equipo
export const nombrePersona = (f) => [f.nombre, f.apellido_paterno, f.apellido_materno].filter((x) => x && String(x).trim()).join(' ');

export const ATAJOS_EQUIPO = [
  { id: 'mas_faltas', texto: 'Más faltas', ayuda: 'Quien tiene faltas, de más a menos' },
  { id: 'mas_retardos', texto: 'Más retardos', ayuda: 'Quien tiene retardos, de más a menos' },
  { id: 'incompletas', texto: 'Marcas incompletas', ayuda: 'Quien tiene días con marca incompleta, de más a menos' },
  { id: 'sin_marcas', texto: 'Sin ninguna marca', ayuda: 'Quien no tiene ni una marca en toda la quincena' },
];

const EVALUADOS = ['puntual', 'retardo', 'falta', 'salida_anticipada', 'incompleta', 'justificada'];
const quitarAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Filtra por nombre/nómina (sin acentos ni mayúsculas) y por atajo; ordena por nombre o, con atajo, de más a menos.
 * «Sin ninguna marca» exige días evaluados (quien no tiene nómina no se analiza y no entra: aparece con su aviso).
 */
export function filtrarEquipo(filas, { texto = '', atajo = '' } = {}) {
  let r = Array.isArray(filas) ? filas.slice() : [];
  const q = quitarAcentos(texto).trim();
  if (q) r = r.filter((f) => quitarAcentos(nombrePersona(f)).includes(q) || quitarAcentos(f.numero_nomina).includes(q));
  const porNombre = (a, b) => nombrePersona(a).localeCompare(nombrePersona(b), 'es');
  const clave = { mas_faltas: 'falta', mas_retardos: 'retardo', incompletas: 'incompleta' }[atajo];
  if (clave) {
    r = r.filter((f) => num(f[clave]) > 0);
    r.sort((a, b) => num(b[clave]) - num(a[clave]) || porNombre(a, b));
  } else if (atajo === 'sin_marcas') {
    r = r.filter((f) => !f.sin_nomina && num(f.dias_con_marcas) === 0 && EVALUADOS.reduce((s, e) => s + num(f[e]), 0) > 0);
    r.sort(porNombre);
  } else {
    r.sort(porNombre);
  }
  return r;
}

/** Texto de la región viva de la tabla: solo cambia con el resultado del filtro. */
export function textoEquipoFiltrado(mostrados, total) {
  if (total === 0) return 'No hay personas en tu equipo.';
  if (mostrados === total) return `${plural(total, 'persona', 'personas')} en tu equipo.`;
  return `${mostrados} de ${total} personas con el filtro aplicado.`;
}
