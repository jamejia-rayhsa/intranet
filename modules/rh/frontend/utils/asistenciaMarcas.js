// Marcas de Asistencia: filtros, parámetros de consulta y exportación a CSV. Lógica pura (sin imports: jest evalúa
// el fuente). Los instantes se muestran en hora de México con Intl en asistenciaFechas.js; aquí el CSV recibe ya
// las partes formateadas por el llamador para no depender de otro archivo.
export const TOPE_FILAS_CSV = 5000;
export const LIMITE_PAGINA = 50;
export const LIMITE_PAGINA_CSV = 500;

const BOM = String.fromCharCode(0xfeff);
const INICIO_FORMULA = /^[=+\-@\t\r]/;

/**
 * Neutraliza la inyección de fórmulas de hoja de cálculo: un texto que empieza con = + - @ (o tabulador / retorno)
 * se antepone con una comilla simple para que Excel/LibreOffice lo traten como texto.
 */
export function neutralizarFormula(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return INICIO_FORMULA.test(texto) ? `'${texto}` : texto;
}

/** Escapa una celda CSV (RFC 4180): comillas dobles si trae coma, comilla, salto de línea o retorno. */
export function escaparCeldaCsv(valor) {
  const texto = neutralizarFormula(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export const COLUMNAS_CSV = [
  { clave: 'fecha_local', titulo: 'Fecha (hora de México)' },
  { clave: 'hora_local', titulo: 'Hora (hora de México)' },
  { clave: 'instante_utc', titulo: 'Instante UTC' },
  { clave: 'codigo_empleado', titulo: 'Código' },
  { clave: 'empleado_nombre', titulo: 'Empleado vinculado' },
  { clave: 'estado_marca', titulo: 'Estado (crudo)' },
  { clave: 'tipo_verificacion', titulo: 'Tipo de verificación (crudo)' },
  { clave: 'terminal_alias', titulo: 'Terminal' },
  { clave: 'terminal_sn', titulo: 'Serie de la terminal' },
  { clave: 'id_externo', titulo: 'Id externo' },
];

/**
 * CSV con BOM UTF-8 y saltos CRLF. `filas`: objetos con las claves de COLUMNAS_CSV (ya con fecha/hora local
 * calculadas). Cada celda pasa por escaparCeldaCsv (neutraliza fórmulas). Se corta en TOPE_FILAS_CSV.
 * @returns {{texto: string, filas: number, truncado: boolean}}
 */
export function construirCsv(filas, tope = TOPE_FILAS_CSV) {
  const usadas = filas.slice(0, tope);
  const lineas = [COLUMNAS_CSV.map((c) => escaparCeldaCsv(c.titulo)).join(',')];
  for (const fila of usadas) lineas.push(COLUMNAS_CSV.map((c) => escaparCeldaCsv(fila[c.clave])).join(','));
  return { texto: BOM + lineas.join('\r\n') + '\r\n', filas: usadas.length, truncado: filas.length > tope };
}

export function nombreArchivoCsv(desde, hasta) {
  return `marcas_${desde}_a_${hasta}.csv`;
}

export const FILTROS_INICIALES = { buscar: '', codigo: '', terminal: '', vinculadas: 'todas', desde: '', hasta: '' };

/** Filtros de la pantalla -> parámetros de GET /api/asistencia/marcas (omite los vacíos). */
export function parametrosMarcas(filtros, { pagina = 1, limite = LIMITE_PAGINA, contar = true } = {}) {
  const p = new URLSearchParams();
  p.set('desde', filtros.desde);
  p.set('hasta', filtros.hasta);
  p.set('pagina', String(pagina));
  p.set('limite', String(limite));
  if (!contar) p.set('contar', 'false');
  for (const clave of ['buscar', 'codigo', 'terminal']) {
    const valor = (filtros[clave] || '').trim();
    if (valor) p.set(clave, valor);
  }
  if (filtros.vinculadas === 'si' || filtros.vinculadas === 'no') p.set('vinculadas', filtros.vinculadas);
  return p.toString();
}

/** Etiqueta del estado de vinculación de una marca. */
export const etiquetaVinculo = (marca) => (marca.empleado_id ? 'Vinculada' : 'Sin empleado');

/** 'N-M de T' para la paginación. */
export function textoRango(pagina, limite, enPagina, total) {
  if (!enPagina) return '0 resultados';
  const ini = (pagina - 1) * limite + 1;
  const fin = ini + enPagina - 1;
  return total === null || total === undefined ? `${ini}-${fin}` : `${ini}-${fin} de ${total}`;
}

/** Resumen de la re-vinculación para anunciar en aria-live. */
export function textoResultadoRevincular(r) {
  const v = Number(r.vinculadas) || 0;
  const p = Number(r.pendientes) || 0;
  return `Se vincularon ${v} ${v === 1 ? 'marca' : 'marcas'}; ${p} ${p === 1 ? 'sigue' : 'siguen'} sin empleado.`;
}

/**
 * Marca del servidor -> fila del CSV. `convertir(iso)` devuelve { fecha, hora, utc } (hora local de México y
 * el mismo instante en UTC) o null si el instante no es válido; la inyecta el llamador (asistenciaFechas.js).
 */
export function filaParaCsv(marca, convertir) {
  const c = convertir(marca.marca_ts) || { fecha: '', hora: '', utc: '' };
  return {
    fecha_local: c.fecha,
    hora_local: c.hora,
    instante_utc: c.utc,
    codigo_empleado: marca.codigo_empleado,
    empleado_nombre: marca.empleado_id ? marca.empleado_nombre : '',
    estado_marca: marca.estado_marca,
    tipo_verificacion: marca.tipo_verificacion,
    terminal_alias: marca.terminal_alias,
    terminal_sn: marca.terminal_sn,
    id_externo: marca.id_externo,
  };
}
