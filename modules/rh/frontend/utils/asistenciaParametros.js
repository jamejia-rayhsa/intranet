// Parámetros del motor de asistencia: descripción, validación y texto de impacto. Lógica pura (sin imports).
// El servidor valida de nuevo (PUT /parametros); aquí se evita el viaje y se explica cada regla.
export const PARAMETROS = [
  { clave: 'comida_desde', etiqueta: 'Comida: desde', tipo: 'hora', grupo: 'Comida', ayuda: 'Inicio de la ventana de comida (HH:MM). Las marcas dentro de la ventana son de comida: nunca entrada ni salida. Debe ser anterior a «Comida: hasta».' },
  { clave: 'comida_hasta', etiqueta: 'Comida: hasta', tipo: 'hora', grupo: 'Comida', ayuda: 'Fin de la ventana de comida (HH:MM), inclusive. La salida es la última marca posterior.' },
  { clave: 'dias_cierre', etiqueta: 'Días para el cierre automático', tipo: 'entero', minimo: 0, maximo: 30, grupo: 'Cierre', ayuda: 'Días que esperan las quincenas terminadas antes de cerrarse solas (margen para marcas tardías de terminales sin red). Entero de 0 a 30.' },
  { clave: 'cierre_automatico_desde', etiqueta: 'Cierre automático desde', tipo: 'fecha', grupo: 'Cierre', ayuda: 'Solo las quincenas que terminan en esta fecha o después se cierran solas; las anteriores las cierra RH a mano.' },
  { clave: 'margen_dia_completo_min', etiqueta: 'Margen para calificar el día (min)', tipo: 'entero', minimo: 0, maximo: 720, grupo: 'Cálculo', ayuda: 'Minutos después de la salida programada a partir de los cuales el día se califica; antes queda «pendiente». Entero de 0 a 720.' },
  { clave: 'analisis_desde', etiqueta: 'Analizar desde', tipo: 'fecha', grupo: 'Cálculo', ayuda: 'Primer día que se analiza; lo anterior no se califica. Un cambio puede dejar días sin calificar o calificar días nuevos.' },
  { clave: 'ventana_seguridad_dias', etiqueta: 'Ventana de seguridad (días)', tipo: 'entero', minimo: 0, maximo: 31, grupo: 'Planificador', ayuda: 'Cada vuelta recalcula además los últimos N días de todos los empleados. Entero de 0 a 31.' },
  { clave: 'barrido_completo_horas', etiqueta: 'Barrido completo cada (horas)', tipo: 'entero', minimo: 1, maximo: 168, grupo: 'Planificador', ayuda: 'Cada cuántas horas se recalculan por completo las quincenas abiertas. Entero de 1 a 168.' },
];
export const CLAVE_ANALISIS = 'analisis_desde';
export const FRASE_REFORZADA = 'CAMBIAR';
export const TEXTO_IMPACTO_COMIDA =
  'Cambiar la ventana de comida recalcula SOLO las quincenas abiertas; las cerradas conservan el valor con el que se calcularon.';
export const TEXTO_IMPACTO_ANALISIS =
  'Cambiar «Analizar desde» altera qué días se califican en las quincenas abiertas: los anteriores a la nueva fecha dejan de calificarse y los posteriores se calculan. Las quincenas cerradas no cambian.';

const esFecha = (valor) => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};
const minutosDe = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_MIN = '2020-01-01';
const FECHA_MAX = '2100-12-31';

/** Error de un valor (texto del campo), o ''. */
export function validarValor(def, valor) {
  const t = String(valor === null || valor === undefined ? '' : valor).trim();
  if (t === '') return 'Este valor es obligatorio.';
  if (def.tipo === 'hora') return HORA.test(t) ? '' : 'Usa una hora válida HH:MM (por ejemplo 13:00).';
  if (def.tipo === 'fecha') {
    if (!esFecha(t)) return 'Usa una fecha válida AAAA-MM-DD.';
    return t < FECHA_MIN || t > FECHA_MAX ? `La fecha debe estar entre ${FECHA_MIN} y ${FECHA_MAX}.` : '';
  }
  if (!/^\d{1,6}$/.test(t)) return `Usa un número entero entre ${def.minimo} y ${def.maximo}.`;
  const n = Number(t);
  return n < def.minimo || n > def.maximo ? `Debe estar entre ${def.minimo} y ${def.maximo}.` : '';
}

/** Errores de todos los valores editados { clave: mensaje }, incluida la regla desde < hasta de la comida. */
export function validarTodo(valores) {
  const errores = {};
  for (const def of PARAMETROS) {
    const e = validarValor(def, valores[def.clave]);
    if (e) errores[def.clave] = e;
  }
  if (!errores.comida_desde && !errores.comida_hasta && minutosDe(String(valores.comida_desde).trim()) >= minutosDe(String(valores.comida_hasta).trim())) {
    errores.comida_hasta = '«Comida: hasta» debe ser posterior a «Comida: desde».';
  }
  return errores;
}

const normalizar = (def, valor) => {
  const t = String(valor === null || valor === undefined ? '' : valor).trim();
  return def.tipo === 'entero' ? String(Number(t)) : t;
};

/** Cambios respecto de los valores guardados: { clave: valorNuevo (entero como número) } solo de lo que cambió. */
export function cambiosDe(originales, valores) {
  const cambios = {};
  for (const def of PARAMETROS) {
    if (!(def.clave in valores)) continue;
    const nuevo = normalizar(def, valores[def.clave]);
    if (nuevo !== normalizar(def, originales[def.clave])) cambios[def.clave] = def.tipo === 'entero' ? Number(nuevo) : nuevo;
  }
  return cambios;
}

export const requiereConfirmacionReforzada = (cambios) => Object.prototype.hasOwnProperty.call(cambios, CLAVE_ANALISIS);

/** Textos de impacto de los cambios, sin repetir. */
export function textosDeImpacto(cambios) {
  const textos = [];
  if ('comida_desde' in cambios || 'comida_hasta' in cambios) textos.push(TEXTO_IMPACTO_COMIDA);
  if (CLAVE_ANALISIS in cambios) textos.push(TEXTO_IMPACTO_ANALISIS);
  if ('dias_cierre' in cambios || 'cierre_automatico_desde' in cambios) {
    textos.push('El cierre automático aplica a partir de la siguiente vuelta del motor; las quincenas ya cerradas no se vuelven a abrir.');
  }
  if ('margen_dia_completo_min' in cambios) textos.push('El margen cambia cuándo se califica un día: los días recientes pueden pasar de «pendiente» a calificados (o al revés).');
  if ('ventana_seguridad_dias' in cambios || 'barrido_completo_horas' in cambios) textos.push('Cambia la frecuencia con la que el planificador recalcula; no modifica las quincenas cerradas.');
  return textos;
}

/** ¿El texto escrito confirma el cambio reforzado? (sin distinguir mayúsculas ni espacios) */
export const fraseCorrecta = (texto) => String(texto || '').trim().toUpperCase() === FRASE_REFORZADA;

/** Valores del servidor ([{clave, valor, descripcion}]) -> objeto de textos para los campos. */
export function valoresIniciales(lista) {
  const v = {};
  for (const p of Array.isArray(lista) ? lista : []) v[p.clave] = String(p.valor);
  return v;
}
