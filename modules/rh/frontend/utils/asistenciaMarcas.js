// Marcas de Asistencia: filtros, parámetros de consulta y exportación a CSV. Lógica pura (sin imports: jest evalúa
// el fuente). Los instantes se muestran en hora de México con Intl en asistenciaFechas.js; aquí el CSV recibe ya
// las partes formateadas por el llamador para no depender de otro archivo.
export const TOPE_FILAS_CSV = 5000;
export const LIMITE_PAGINA = 50;
export const LIMITE_PAGINA_CSV = 500;
export const MAX_PAGINAS_CSV = 12; // corta cualquier bucle (5 000 filas / 500 = 10 páginas + 1 de comprobación)

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
  { clave: 'vinculada', titulo: 'Vinculada a un empleado' },
  { clave: 'estado_marca', titulo: 'Estado (crudo)' },
  { clave: 'tipo_verificacion', titulo: 'Tipo de verificación (crudo)' },
  { clave: 'terminal_alias', titulo: 'Terminal' },
  { clave: 'terminal_sn', titulo: 'Serie de la terminal' },
  { clave: 'id_externo', titulo: 'Id externo' },
];

/**
 * Decisión de privacidad: el CSV NO lleva el nombre del empleado (solo el código, que es su número de nómina, y si la
 * marca está vinculada): el archivo sale del sistema y no queda controlado. El nombre se ve en la pantalla.
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
export function parametrosMarcas(filtros, { pagina = 1, limite = LIMITE_PAGINA, contar = true, porClave = false, antesId = null } = {}) {
  const p = new URLSearchParams();
  p.set('desde', filtros.desde);
  p.set('hasta', filtros.hasta);
  if (porClave) {
    // Exportación por clave: id descendente y `antes_id` = id de la última marca recibida (sin OFFSET)
    p.set('orden', 'id');
    if (antesId) p.set('antes_id', String(antesId));
  }
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
    vinculada: marca.empleado_id ? 'Sí' : 'No',
    estado_marca: marca.estado_marca,
    tipo_verificacion: marca.tipo_verificacion,
    terminal_alias: marca.terminal_alias,
    terminal_sn: marca.terminal_sn,
    id_externo: marca.id_externo,
  };
}

/**
 * Recoge las marcas a exportar paginando por clave. `pedir(antesId)` devuelve un arreglo de marcas (id descendente,
 * con `id`); se pide la página siguiente con el id de la última recibida, así las marcas que entran durante la
 * exportación (ids mayores) no desplazan ni repiten filas. Se detiene al pasar el tope (+1 fila para saber si hubo más).
 */
export async function recolectarPorClave(pedir, { limite = LIMITE_PAGINA_CSV, tope = TOPE_FILAS_CSV, maxPaginas = MAX_PAGINAS_CSV } = {}) {
  const filas = [];
  const vistos = new Set();
  let antesId = null;
  for (let i = 0; i < maxPaginas && filas.length <= tope; i += 1) {
    const lote = await pedir(antesId);
    for (const m of lote) {
      if (!vistos.has(String(m.id))) {
        vistos.add(String(m.id));
        filas.push(m);
      }
    }
    if (lote.length < limite) break;
    antesId = lote[lote.length - 1].id;
  }
  return filas;
}
