// Lógica pura del importador de archivos (solo importa importarFechas.js): lectura de la matriz de la hoja, normalización por
// tipo de columna, validación, lotes y CSV de errores. Los tests la cargan leyendo el fuente
// (modules/rh/tests/importarFilas.util.test.js); las fechas están en importarFechas.js (se concatena en el test).
//
// Convenciones de columna: { clave, etiqueta, requerido?, tipo? }. tipo:'fecha' normaliza a AAAA-MM-DD; las demás
// columnas se envían como texto (nómina, NSS, celular y CURP no se tocan). Si Excel guardó un identificador como
// NÚMERO, los ceros a la izquierda ya se perdieron en el archivo (p. ej. 0123 -> 123): hay que formatear la
// columna como texto en Excel antes de capturar.

import { normalizarFecha } from './importarFechas';

export const TAMANO_LOTE = 100;

// Número -> texto sin decimales sobrantes ni notación científica (5512345678 -> "5512345678").
export function numeroATexto(n) {
  if (!isFinite(n)) return '';
  if (Math.floor(n) === n) {
    if (Math.abs(n) < 1e21) return String(n);
    return n.toLocaleString('fullwide', { useGrouping: false });
  }
  const s = String(n);
  if (s.indexOf('e') === -1 && s.indexOf('E') === -1) return s;
  return n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
}

function fechaATexto(d) {
  if (isNaN(d.getTime())) return '';
  const r = normalizarFecha(d);
  return r.valor;
}

// Valor crudo de una celda -> texto de una columna que NO es de fecha.
export function valorATexto(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object' && typeof valor.serialExcel === 'number') return normalizarFecha(valor).valor;
  if (typeof valor === 'number') return numeroATexto(valor);
  if (Object.prototype.toString.call(valor) === '[object Date]') return fechaATexto(valor);
  if (typeof valor === 'boolean') return valor ? 'VERDADERO' : 'FALSO';
  return String(valor).trim();
}

function textoCrudo(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  return String(valor);
}

// Encabezado -> clave de comparación: sin acentos, mayúsculas, espacios ni puntuación ("No. Nómina" -> "nonomina").
export function normalizarEncabezado(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// matriz: arreglo de filas (arreglos de celdas crudas, la primera es el encabezado) tal como las da
// XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true }).
// filaEncabezado: número de fila del archivo del encabezado (1 por omisión). La primera fila de datos es la
// siguiente (fila 2). Las columnas se reconocen por etiqueta, clave o alias ({ alias: [...] }) sin importar acentos,
// mayúsculas, espacios ni puntuación.
// Devuelve { filas, encabezados: { reconocidas:[{indice, clave, etiqueta, encabezado}], ignoradas:[texto],
// faltantes:[etiqueta de columnas requeridas ausentes] } }; las filas llevan { ...columnas, _fila, __errores:[mensajes] } y se
// omiten las filas en blanco.
export function leerMatriz(matriz, columnas, filaEncabezado) {
  const base = filaEncabezado || 1;
  const mapaClaves = {};
  const registrar = function (nombre, c) {
    const k = normalizarEncabezado(nombre);
    if (k && !mapaClaves[k]) mapaClaves[k] = c;
  };
  columnas.forEach(function (c) { registrar(c.etiqueta, c); registrar(c.clave, c); });
  columnas.forEach(function (c) { (c.alias || []).forEach(function (a) { registrar(a, c); }); });

  const encabezados = { reconocidas: [], ignoradas: [], faltantes: [] };
  const encabezado = ((matriz && matriz[0]) || []).map(function (h) { return textoCrudo(h); });
  const usadas = {};
  const indices = []; // [{ indice, columna }]
  encabezado.forEach(function (h, i) {
    if (!h) return;
    const col = mapaClaves[normalizarEncabezado(h)];
    if (col && !usadas[col.clave]) {
      usadas[col.clave] = true;
      indices.push({ indice: i, columna: col });
      encabezados.reconocidas.push({ indice: i, clave: col.clave, etiqueta: col.etiqueta, encabezado: h });
    } else {
      encabezados.ignoradas.push(col ? h + ' (repetida)' : h);
    }
  });
  columnas.forEach(function (c) { if (c.requerido && !usadas[c.clave]) encabezados.faltantes.push(c.etiqueta); });

  const resultado = [];
  if (!matriz || matriz.length < 2) return { filas: resultado, encabezados: encabezados };
  for (let r = 1; r < matriz.length; r++) {
    const celdas = matriz[r] || [];
    const vacia = celdas.every(function (v) { return v === null || v === undefined || String(v).trim() === ''; });
    if (vacia) continue;

    const fila = { _fila: base + r };
    const problemas = [];
    const precision = [];
    indices.forEach(function (it) {
      const cruda = celdas[it.indice];
      const col = it.columna;
      // Número de 16 o más dígitos en una columna que no es de fecha: Excel guarda solo 15 cifras significativas, el valor ya
      // se corrompió. El backend lo omite con advertencia ('guarda la columna como Texto').
      if (col.tipo !== 'fecha' && typeof cruda === 'number' && isFinite(cruda) && Math.abs(cruda) >= 1e15) precision.push(col.clave);
      if (col.tipo === 'fecha') {
        const f = normalizarFecha(cruda);
        if (f.error) {
          fila[col.clave] = textoCrudo(cruda instanceof Date ? '' : cruda);
          problemas.push(col.etiqueta + ' inválida: ' + f.error + (fila[col.clave] ? ' (' + fila[col.clave] + ')' : ''));
        } else {
          fila[col.clave] = f.valor;
        }
      } else {
        fila[col.clave] = valorATexto(cruda);
      }
    });
    columnas.forEach(function (c) { if (fila[c.clave] === undefined) fila[c.clave] = ''; });
    fila.__errores = problemas;
    if (precision.length) fila._precision = precision;
    resultado.push(fila);
  }
  return { filas: resultado, encabezados: encabezados };
}

export function filasDesdeMatriz(matriz, columnas, filaEncabezado) {
  return leerMatriz(matriz, columnas, filaEncabezado).filas;
}

// Bytes de un CSV -> texto. UTF-8 (con o sin BOM) si es válido; si no, Windows-1252 (acentos de Excel en español).
export function decodificarTextoCsv(bytes) {
  const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let texto;
  let codificacion = 'utf-8';
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(datos);
  } catch (e) {
    texto = new TextDecoder('windows-1252').decode(datos);
    codificacion = 'windows-1252';
  }
  if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);
  return { texto: texto, codificacion: codificacion };
}

// Añade a __errores los campos requeridos vacíos (sin duplicar) y devuelve filas nuevas.
export function validarFilas(filas, columnas) {
  return filas.map(function (fila) {
    const errores = (fila.__errores || []).filter(function (e) { return e.indexOf('Falta ') !== 0; });
    columnas.forEach(function (c) {
      if (c.requerido && !fila[c.clave]) errores.push('Falta ' + c.etiqueta);
    });
    return Object.assign({}, fila, { __errores: errores });
  });
}

// Nombre para mostrar en listas de errores.
export function nombreDeFila(fila) {
  const partes = [fila.nombre, fila.apellido_paterno, fila.apellido_materno]
    .filter(function (p) { return p; });
  return partes.join(' ');
}

// Filas que se omiten antes de enviar: [{ fila, nombre, error }] y las que sí se envían (sin campos __).
export function separarFilas(filas, columnas) {
  const validadas = validarFilas(filas, columnas);
  const omitidas = [];
  const enviar = [];
  validadas.forEach(function (f) {
    if (f.__errores.length) {
      omitidas.push({ fila: f._fila, nombre: nombreDeFila(f), error: f.__errores.join('; ') });
    } else {
      const limpia = {};
      // Las celdas vacías no se envían (una fila de 40+ columnas con claves vacías pesa el doble y el lote de 100 filas
      // llegaría a rozar el límite de 100 kb del cuerpo); el backend trata la clave ausente como vacía.
      Object.keys(f).forEach(function (k) { if (k.indexOf('__') !== 0 && (k === '_fila' || f[k] !== '')) limpia[k] = f[k]; });
      enviar.push(limpia);
    }
  });
  return { enviar: enviar, omitidas: omitidas };
}

// Tope de bytes del JSON de un lote (el parser global del backend admite 100 kb por petición).
export const MAX_BYTES_LOTE = 80000;

function bytesDe(fila) {
  const texto = JSON.stringify(fila);
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(texto).length : texto.length * 3;
}

// Lotes de hasta `tamano` filas (100 por omisión) y de no más de `maxBytes` de JSON cada uno: un archivo completo
// con 40+ columnas largas se parte en más lotes en vez de recibir un 413.
export function dividirEnLotes(filas, tamano, maxBytes) {
  const n = tamano || TAMANO_LOTE;
  const tope = maxBytes || MAX_BYTES_LOTE;
  const lotes = [];
  let actual = [];
  let bytes = 0;
  filas.forEach(function (f) {
    const b = bytesDe(f) + 1;
    if (actual.length && (actual.length >= n || bytes + b > tope)) {
      lotes.push(actual);
      actual = [];
      bytes = 0;
    }
    actual.push(f);
    bytes += b;
  });
  if (actual.length) lotes.push(actual);
  return lotes;
}

export const MAX_SIN_CATALOGO = 100;
export const MAX_ADVERTENCIAS = 2000;
export const MAX_DETALLE = 500;
export const MAX_PARES_JEFES = 500;

export function resultadoVacio() {
  return {
    insertados: 0, actualizados: 0, sin_cambios: 0, duplicados: 0, errores: [], duplicados_detalle: [],
    actualizados_detalle: [], advertencias: [], advertencias_omitidas: 0, jefes_pendientes: [],
    turnos_asignados: 0, turnos_cambiados: 0, turnos_sin_cambio: 0, cuentas_vinculadas: 0, verificar: 0,
    sin_catalogo: { puestos: [], departamentos: [], ubicaciones: [] },
  };
}

// Suma por nombre (sin distinguir mayúsculas) las listas [{ nombre, filas }]; máximo MAX_SIN_CATALOGO nombres.
function sumarSinCatalogo(a, b) {
  const orden = [];
  const mapa = {};
  (a || []).concat(Array.isArray(b) ? b : []).forEach(function (it) {
    if (!it || typeof it.nombre !== 'string') return;
    const k = it.nombre.toLowerCase();
    if (!mapa[k]) {
      if (orden.length >= MAX_SIN_CATALOGO) return;
      mapa[k] = { nombre: it.nombre, filas: 0 };
      orden.push(k);
    }
    mapa[k].filas += Number(it.filas) || 0;
  });
  return orden.map(function (k) { return mapa[k]; });
}

function lista(x) { return Array.isArray(x) ? x : []; }

// Suma el resultado de un lote al acumulado (devuelve uno nuevo).
export function sumarResultados(acumulado, parcial) {
  const p = parcial || {};
  const sc = p.sin_catalogo || {};
  const prev = acumulado.sin_catalogo || { puestos: [], departamentos: [], ubicaciones: [] };
  const todasAdv = (acumulado.advertencias || []).concat(lista(p.advertencias));
  const sobran = Math.max(0, todasAdv.length - MAX_ADVERTENCIAS);
  return {
    insertados: acumulado.insertados + (Number(p.insertados) || 0),
    actualizados: (acumulado.actualizados || 0) + (Number(p.actualizados) || 0),
    sin_cambios: (acumulado.sin_cambios || 0) + (Number(p.sin_cambios) || 0),
    duplicados: acumulado.duplicados + (Number(p.duplicados) || 0),
    cuentas_vinculadas: (acumulado.cuentas_vinculadas || 0) + (Number(p.cuentas_vinculadas) || 0),
    verificar: (acumulado.verificar || 0) + (Number(p.verificar) || 0),
    turnos_asignados: (acumulado.turnos_asignados || 0) + (Number(p.turnos_asignados) || 0),
    turnos_cambiados: (acumulado.turnos_cambiados || 0) + (Number(p.turnos_cambiados) || 0),
    turnos_sin_cambio: (acumulado.turnos_sin_cambio || 0) + (Number(p.turnos_sin_cambio) || 0),
    errores: acumulado.errores.concat(lista(p.errores)),
    duplicados_detalle: acumulado.duplicados_detalle.concat(lista(p.duplicados_detalle)),
    actualizados_detalle: (acumulado.actualizados_detalle || []).concat(lista(p.actualizados_detalle)).slice(0, MAX_DETALLE),
    advertencias: todasAdv.slice(0, MAX_ADVERTENCIAS),
    advertencias_omitidas: (acumulado.advertencias_omitidas || 0) + (Number(p.advertencias_omitidas) || 0) + sobran,
    jefes_pendientes: (acumulado.jefes_pendientes || []).concat(lista(p.jefes_pendientes)),
    sin_catalogo: {
      puestos: sumarSinCatalogo(prev.puestos, sc.puestos),
      departamentos: sumarSinCatalogo(prev.departamentos, sc.departamentos),
      ubicaciones: sumarSinCatalogo(prev.ubicaciones, sc.ubicaciones),
    },
  };
}

// Suma el resultado de la segunda pasada de jefes: jefes = { asignados, sin_cambios, pendientes, no_encontrados, ciclos, conflictos }.
export function sumarJefes(jefes, parcial) {
  const p = parcial || {};
  const j = jefes || {};
  return {
    asignados: (j.asignados || 0) + (Number(p.asignados) || 0),
    sin_cambios: (j.sin_cambios || 0) + (Number(p.sin_cambios) || 0),
    pendientes: j.pendientes || 0,
    no_encontrados: (j.no_encontrados || 0) + (Number(p.no_encontrados) || 0),
    ciclos: (j.ciclos || 0) + (Number(p.ciclos) || 0),
    conflictos: (j.conflictos || 0) + (Number(p.conflictos) || 0),
    ambiguos: (j.ambiguos || 0) + (Number(p.ambiguos) || 0),
    no_activos: (j.no_activos || 0) + (Number(p.no_activos) || 0),
  };
}

// Avisos de catálogo como filas { nombre, filas, motivo } (para la vista y el CSV).
export function avisosSinCatalogo(sinCatalogo) {
  const sc = sinCatalogo || {};
  const avisos = [];
  const tipos = [
    ['departamentos', 'departamento', 'El departamento'],
    ['puestos', 'puesto', 'El puesto'],
    ['ubicaciones', 'ubicacion', 'La ubicación'],
  ];
  tipos.forEach(function (t) {
    (sc[t[0]] || []).forEach(function (d) {
      avisos.push({
        nombre: d.nombre, filas: d.filas,
        motivo: t[2] + ' "' + d.nombre + '" no existe en el catálogo: ' + d.filas + (d.filas === 1 ? ' fila no pudo asignarlo' : ' filas no pudieron asignarlo'),
      });
    });
  });
  return avisos;
}

// Los modelos antiguos devolvían { fila: <objeto>, error }; los nuevos { fila: <número>, nombre, error }.
export function numeroFilaDeError(e) {
  if (e && typeof e.fila === 'number') return e.fila;
  if (e && e.fila && typeof e.fila === 'object' && typeof e.fila._fila === 'number') return e.fila._fila;
  return '';
}

export function nombreDeError(e) {
  if (e && typeof e.nombre === 'string') return e.nombre;
  if (e && e.fila && typeof e.fila === 'object') return nombreDeFila(e.fila);
  return '';
}

function celdaCsv(valor) {
  let s = valor === null || valor === undefined ? '' : String(valor);
  // Evita que Excel interprete el texto como fórmula.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// CSV (con BOM UTF-8) de omitidas + errores + duplicados + advertencias + actualizados + avisos de catálogo:
// Tipo, Fila, Nombre, Campo, Valor recibido, Motivo. extras: { advertencias, actualizados_detalle, etiquetas: { clave: etiqueta } }.
export function construirCsvResultado(errores, duplicadosDetalle, sinCatalogo, extras) {
  const ex = extras || {};
  const etiquetas = ex.etiquetas || {};
  const lineas = [['Tipo', 'Fila', 'Nombre', 'Campo', 'Valor recibido', 'Motivo'].map(celdaCsv).join(',')];
  const linea = function (tipo, fila, nombre, campo, valor, motivo) {
    lineas.push([tipo, fila, nombre, campo, valor, motivo].map(celdaCsv).join(','));
  };
  (errores || []).forEach(function (e) { linea('Error', numeroFilaDeError(e), nombreDeError(e), '', '', e.error); });
  (duplicadosDetalle || []).forEach(function (d) { linea('Duplicado', numeroFilaDeError(d), nombreDeError(d), '', '', d.motivo); });
  (ex.advertencias || []).forEach(function (a) {
    linea('Advertencia', numeroFilaDeError(a), nombreDeError(a), etiquetas[a.campo] || a.campo || '', a.valor_recibido === null || a.valor_recibido === undefined ? '' : a.valor_recibido, a.motivo);
  });
  (ex.actualizados_detalle || []).forEach(function (a) {
    linea('Actualizado', numeroFilaDeError(a), nombreDeError(a), '', '', a.campos + (a.campos === 1 ? ' campo modificado' : ' campos modificados'));
  });
  avisosSinCatalogo(sinCatalogo).forEach(function (a) { linea('Aviso', '', a.nombre, '', '', a.motivo); });
  return '\uFEFF' + lineas.join('\r\n') + '\r\n';
}

// ─── Reintento de "otra importación en curso" (409) y repetidos entre lotes ──────────────────────────────────────────

// Esperas (ms) antes de reintentar un lote que el servidor rechazó con 409 (no se aplicó nada: reintentar es seguro).
export const ESPERAS_OCUPADO = [2000, 5000, 10000];
export const MENSAJE_OCUPADO = 'No se aplicó: otra importación en curso';

// Ejecuta `operacion` (una petición que lanza Error con .status). Con 409 espera y reintenta el MISMO lote hasta
// esperas.length veces. Devuelve { resp } si hubo respuesta, o { error, ocupado } si falló (ocupado=true: 409 persistente).
export async function enviarConReintento(operacion, esperar, esperas, alReintentar) {
  const tiempos = esperas || ESPERAS_OCUPADO;
  for (let i = 0; ; i++) {
    try {
      return { resp: await operacion() };
    } catch (err) {
      const ocupado = !!err && err.status === 409;
      if (!ocupado || i >= tiempos.length) return { error: err, ocupado: ocupado };
      if (alReintentar) alReintentar(i + 1, tiempos.length);
      await esperar(tiempos[i]);
    }
  }
}

function claveEmpleado(fila) {
  const curp = String(fila.curp || '').replace(/\s/g, '').toUpperCase();
  if (curp) return 'c:' + curp;
  const nomina = String(fila.numero_nomina || '').trim().replace(/\.0+$/, '').toLowerCase();
  return nomina ? 'n:' + nomina : '';
}

// Modo actualizar: el mismo empleado (misma CURP o, sin CURP, misma nómina) en lotes DISTINTOS se aplica una vez por lote y gana
// la última fila (dentro de un lote el servidor aplica la primera y reporta la otra como repetida). Devuelve advertencias
// { fila, nombre, campo, valor_recibido, motivo } para las apariciones que no son la última.
export function repeticionesEntreLotes(lotes) {
  const ultimo = {};
  lotes.forEach(function (lote, i) {
    lote.forEach(function (f) { const k = claveEmpleado(f); if (k) ultimo[k] = i; });
  });
  const avisos = [];
  lotes.forEach(function (lote, i) {
    lote.forEach(function (f) {
      const k = claveEmpleado(f);
      if (k && ultimo[k] > i) {
        avisos.push({ fila: f._fila, nombre: nombreDeFila(f), campo: f.curp ? 'curp' : 'numero_nomina', valor_recibido: null, motivo: 'repetido en el archivo: se aplicó la última fila' });
      }
    });
  });
  return avisos;
}
