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

// matriz: arreglo de filas (arreglos de celdas crudas, la primera es el encabezado) tal como las da
// XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true }).
// filaEncabezado: número de fila del archivo del encabezado (1 por omisión). La primera fila de datos es la
// siguiente (fila 2). Devuelve filas con { ...columnas, _fila, __errores:[mensajes] } y omite las filas en blanco.
export function filasDesdeMatriz(matriz, columnas, filaEncabezado) {
  const base = filaEncabezado || 1;
  if (!matriz || matriz.length < 2) return [];

  const mapaClaves = {};
  columnas.forEach(function (c) {
    mapaClaves[String(c.etiqueta).toLowerCase()] = c;
    mapaClaves[String(c.clave).toLowerCase()] = c;
  });

  const encabezado = matriz[0].map(function (h) { return textoCrudo(h).toLowerCase(); });
  const indices = []; // [{ indice, columna }]
  encabezado.forEach(function (h, i) {
    const col = mapaClaves[h];
    if (col) indices.push({ indice: i, columna: col });
  });

  const resultado = [];
  for (let r = 1; r < matriz.length; r++) {
    const celdas = matriz[r] || [];
    const vacia = celdas.every(function (v) { return v === null || v === undefined || String(v).trim() === ''; });
    if (vacia) continue;

    const fila = { _fila: base + r };
    const problemas = [];
    indices.forEach(function (it) {
      const cruda = celdas[it.indice];
      const col = it.columna;
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
    resultado.push(fila);
  }
  return resultado;
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
      Object.keys(f).forEach(function (k) { if (k.indexOf('__') !== 0) limpia[k] = f[k]; });
      enviar.push(limpia);
    }
  });
  return { enviar: enviar, omitidas: omitidas };
}

export function dividirEnLotes(filas, tamano) {
  const n = tamano || TAMANO_LOTE;
  const lotes = [];
  for (let i = 0; i < filas.length; i += n) lotes.push(filas.slice(i, i + n));
  return lotes;
}

export function resultadoVacio() {
  return { insertados: 0, duplicados: 0, errores: [], duplicados_detalle: [] };
}

// Suma el resultado de un lote al acumulado (devuelve uno nuevo).
export function sumarResultados(acumulado, parcial) {
  const p = parcial || {};
  return {
    insertados: acumulado.insertados + (Number(p.insertados) || 0),
    duplicados: acumulado.duplicados + (Number(p.duplicados) || 0),
    errores: acumulado.errores.concat(Array.isArray(p.errores) ? p.errores : []),
    duplicados_detalle: acumulado.duplicados_detalle.concat(Array.isArray(p.duplicados_detalle) ? p.duplicados_detalle : []),
  };
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

// CSV (con BOM UTF-8) de omitidas + errores + duplicados: Tipo, Fila, Nombre, Motivo.
export function construirCsvResultado(errores, duplicadosDetalle) {
  const lineas = [['Tipo', 'Fila', 'Nombre', 'Motivo'].map(celdaCsv).join(',')];
  (errores || []).forEach(function (e) {
    lineas.push([celdaCsv('Error'), celdaCsv(numeroFilaDeError(e)), celdaCsv(nombreDeError(e)), celdaCsv(e.error)].join(','));
  });
  (duplicadosDetalle || []).forEach(function (d) {
    lineas.push([celdaCsv('Duplicado'), celdaCsv(numeroFilaDeError(d)), celdaCsv(nombreDeError(d)), celdaCsv(d.motivo)].join(','));
  });
  return '﻿' + lineas.join('\r\n') + '\r\n';
}
