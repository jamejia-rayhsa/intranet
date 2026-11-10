#!/usr/bin/env node
/**
 * Migración ÚNICA del CSV de convenios de compra ya existentes (export crudo de Excel) a
 * `comercial_convenios` + `comercial_convenio_productos` (Fase 1 de "Convenios de compra").
 * NO es un importador reutilizable desde la UI: es un script de un solo uso, mismo espíritu que
 * scripts/migrar-usuarios-supabase.js (--dry-run, idempotente, reporte claro, continúa ante errores).
 *
 * Uso:
 *   node scripts/comercial/importar-convenios-historicos.js --dry-run --creado-por-correo=admin@rayhsa.com.mx
 *   node scripts/comercial/importar-convenios-historicos.js --creado-por-usuario-id=1 [--archivo=ruta.csv] [--reporte=ruta.txt]
 *
 * Variables: POSTGRES_HOST/PORT/DB/USER/PASSWORD (mismo pool `grupo` del backend del portal).
 *
 * Reglas de negocio completas (agrupación por folio+cliente, exclusión de líneas CANCELADO,
 * estatus autorizado/cancelado, reparación conservadora de fechas, etc.) en el encargo original
 * y documentadas con el detalle de las decisiones tomadas en memory/code-notes.md
 * ("Convenios de compra Fase 3: carga histórica del CSV").
 */
const fs = require('fs');
const path = require('path');

const RUTA_CSV_DEFECTO = path.resolve(
  __dirname,
  '../../modules/comercial/backend/seeds/convenios-historicos-2026-10-22.csv',
);

// ---------------------------------------------------------------------------
// CSV: parser RFC4180 propio (sin dependencia nueva). Soporta comillas con comas y SALTOS DE
// LÍNEA embebidos (varias celdas de COMENTARIOS/CLIENTE del archivo real los tienen, ej. folio 54
// y 57) y comillas dobles escapadas ("" dentro de un campo entrecomillado), aunque este archivo en
// particular no usa esa última forma.
function parseCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  let i = 0;
  const len = texto.length;
  while (i < len) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        entreComillas = false;
        i++;
        continue;
      }
      campo += c;
      i++;
      continue;
    }
    if (c === '"') {
      entreComillas = true;
      i++;
      continue;
    }
    if (c === ',') {
      fila.push(campo);
      campo = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
      i++;
      continue;
    }
    campo += c;
    i++;
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

const COLUMNAS_REQUERIDAS = [
  'FOLIOS',
  'MARCA',
  'MODELO',
  'Fecha',
  'CLIENTE',
  'EMPAQUE',
  'U.M',
  'VENDEDOR',
  'AUTORIZACION',
  'CONSUMO',
  'COMENTARIOS',
  '$ DE COMPRA',
  '$ DE VENTA',
  'FACTOR',
  'VIGENCIA',
  'OBSERVACIONES',
  'Clave Cliente',
  'Clave Vendedor',
  'Codigo Producto',
  'Clave MBA3',
];

// Construye nombre de columna (trim) -> índice. Robusto a reordenar columnas del export; si falta
// alguna de las que el negocio necesita, falla con un mensaje claro en vez de leer basura.
function construirIndiceColumnas(header) {
  const idx = {};
  header.forEach((h, i) => {
    const t = (h || '').toString().trim();
    if (t && !(t in idx)) idx[t] = i;
  });
  const faltantes = COLUMNAS_REQUERIDAS.filter((c) => !(c in idx));
  if (faltantes.length) {
    throw new Error(`El CSV no tiene las columnas esperadas: ${faltantes.join(', ')}`);
  }
  return idx;
}

function campo(fila, idx, nombre) {
  const i = idx[nombre];
  if (i === undefined || i === null) return '';
  return (fila[i] || '').toString();
}

function normalizarTexto(s) {
  return (s || '').toString().trim().replace(/\s+/g, ' ');
}

function normalizarClave(s) {
  return normalizarTexto(s).toLowerCase();
}

// ---------------------------------------------------------------------------
// Fechas DD/MM/AAAA (formato único usado en Fecha y, cuando aplica, en VIGENCIA/OBSERVACIONES).
// Lógica pura duplicada intencionalmente de modules/portal/frontend/utils/importarFechas.js (ese
// archivo es ESM de frontend, este script es CommonJS de backend/scripts: no se puede `require()`
// directo). Aquí solo hace falta DD/MM/AAAA con reparación de año de 3 dígitos, no todo el resto
// de formatos que soporta el importador de Excel.
function esBisiesto(anio) {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}
function diasEnMes(anio, mes) {
  if (mes === 2) return esBisiesto(anio) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}
function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

// Años reales presentes en el archivo (todas las fechas son de diciembre 2025 a octubre 2026):
// únicos candidatos válidos para reparar un año de 3 dígitos.
const ANIOS_CONOCIDOS = new Set(['2025', '2026']);

function parseFechaDDMMAAAA(valor) {
  const t = (valor || '').toString().trim();
  if (!t) return { error: 'fecha vacía' };
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{3,4})$/);
  if (!m) return { error: `formato de fecha no reconocido: "${t}" (se esperaba DD/MM/AAAA)` };
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const yStr = m[3];
  let anio;
  if (yStr.length === 4) {
    anio = Number(yStr);
  } else {
    // Año de 3 dígitos (ej. "226" de "20/08/226"): probar insertar un '0' en cada posición y
    // aceptar SOLO si el resultado es uno de los años que de verdad aparecen en el archivo, y
    // solo si hay una única posición que lo logra. Si no, no se inventa nada.
    const candidatos = new Set();
    for (let pos = 0; pos <= yStr.length; pos++) {
      const reparado = yStr.slice(0, pos) + '0' + yStr.slice(pos);
      if (ANIOS_CONOCIDOS.has(reparado)) candidatos.add(reparado);
    }
    if (candidatos.size !== 1) {
      return {
        error: `año de 3 dígitos "${yStr}" no se pudo reparar con confianza (fecha "${t}")`,
      };
    }
    anio = Number([...candidatos][0]);
  }
  if (mes < 1 || mes > 12) return { error: `mes inválido en fecha "${t}"` };
  if (dia < 1 || dia > diasEnMes(anio, mes)) return { error: `día inválido en fecha "${t}"` };
  return { valor: `${anio}-${pad2(mes)}-${pad2(dia)}` };
}

// Serial de fecha de Excel (sistema 1900), SOLO para el caso confirmado de VIGENCIA="46112"
// (folio 61). Nunca se usa a ciegas: solo se acepta si el año resultante cae en un rango sensato
// (2000-2099); fuera de eso se trata como no resuelto (ver calcularEstatusYVigencia).
function fechaDeSerialExcelConRango(serial) {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const entero = Math.floor(serial);
  if (entero === 60) return null; // 29-feb-1900 no existió (error histórico de Excel)
  const MS_DIA = 86400000;
  const base = entero < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const d = new Date(base + entero * MS_DIA);
  const anio = d.getUTCFullYear();
  if (anio < 2000 || anio > 2099) return null;
  return `${anio}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// ---------------------------------------------------------------------------
// Montos/factor: quita $, comas de miles y espacios; "-" (con o sin espacios) o vacío -> NULL.
function parseMonto(valor) {
  const t = (valor || '').toString().trim();
  if (!t) return { valor: null };
  if (/^-+$/.test(t)) return { valor: null };
  const limpio = t.replace(/\$/g, '').replace(/,/g, '').trim();
  if (!limpio || /^-+$/.test(limpio)) return { valor: null };
  const n = Number(limpio);
  if (!Number.isFinite(n)) {
    return { valor: null, advertencia: `no se pudo interpretar como número: "${t}"` };
  }
  return { valor: n };
}

// ---------------------------------------------------------------------------
// CONSUMO: texto libre inconsistente. Se toma el PRIMER número "suelto" (no pegado a una letra
// que lo precede, para no confundir la talla de "T8 144" con el 8 de "T8") como cantidad_periodica
// (en un rango como "100-120" el primer número ya es el menor); BIMESTRAL/TRIMESTRAL fijan el
// periodo, cualquier otro caso usa 'mensual' por defecto. Sin ningún número -> 0 + advertencia.
const PATRON_NUMERO_SUELTO = /(?<![A-Za-zÁÉÍÓÚÑáéíóúñ])\d+(?:[.,]\d+)?/;

// Palabra "MES"/"MESES" como palabra completa (no dentro de BIMESTRAL/TRIMESTRAL, que no tienen
// ese límite de palabra ahí: "BIMESTRAL" no tiene un \b entre "BI" y "MES").
const PATRON_MESES = /\bMES(ES)?\b/;

function parseConsumo(textoOriginal) {
  const t = (textoOriginal || '').toString().trim();
  if (!t) {
    return { cantidad: 0, periodo: 'mensual', advertencia: 'CONSUMO vacío: se usó cantidad 0 y periodo mensual por defecto' };
  }
  const mayus = t.toUpperCase();
  let periodo = 'mensual';
  let advertenciaPeriodo;
  if (/BIMESTRAL/.test(mayus)) periodo = 'bimestral';
  else if (/TRIMESTRAL/.test(mayus)) periodo = 'trimestral';
  else if (PATRON_MESES.test(mayus)) {
    // R-P3-5 (folio 91, "20-30 meses"): este texto describe una DURACIÓN en meses, no una cantidad
    // periódica real confirmada (no es lo mismo que "48" o "10 BIMESTRAL", que sí dan una cifra por
    // periodo). No se inventa un periodo con la misma confianza que esos casos: se deja 'mensual'
    // (el valor más conservador que ya existe en el catálogo de periodos), pero SIEMPRE con
    // advertencia explícita y visible en el reporte para revisión manual, nunca en silencio.
    advertenciaPeriodo = `CONSUMO="${t}" describe una duración en meses, no una cantidad periódica confirmada; se usó periodo 'mensual' por ser el valor más conservador disponible — requiere revisión manual.`;
  }

  const m = t.match(PATRON_NUMERO_SUELTO);
  if (!m) {
    return {
      cantidad: 0,
      periodo,
      advertencia: advertenciaPeriodo || `CONSUMO sin ningún número reconocible: "${t}" — se usó cantidad 0`,
    };
  }
  // R-P3-10: una coma seguida de exactamente 3 dígitos se trata como separador de miles ("1,200" ->
  // 1200, igual que parseMonto); cualquier otra cantidad de dígitos tras la coma se trata como punto
  // decimal ("1,5" -> 1.5), para no leer "1,5" como "15" por error.
  let numeroTexto = m[0];
  if (numeroTexto.includes(',')) {
    const digitosTrasComa = numeroTexto.split(',')[1].length;
    numeroTexto = digitosTrasComa === 3 ? numeroTexto.replace(',', '') : numeroTexto.replace(',', '.');
  }
  const cantidad = Number(numeroTexto);
  const resultado = { cantidad, periodo };
  if (advertenciaPeriodo) resultado.advertencia = advertenciaPeriodo;
  return resultado;
}

function esLineaCancelada(codigoProducto, claveMba3) {
  const c = (codigoProducto || '').toString().trim().toUpperCase();
  const d = (claveMba3 || '').toString().trim().toUpperCase();
  return c === 'CANCELADO' || d === 'CANCELADO';
}

// ---------------------------------------------------------------------------
// Procesamiento por fila. Solo una Fecha irreparable convierte la fila en "fila de error" (no
// participa en ningún convenio); el resto de problemas quedan como advertencias en la fila, que
// sigue agrupándose normalmente.
function esFilaVacia(fila, idx) {
  return !campo(fila, idx, 'FOLIOS').trim() && !campo(fila, idx, 'CLIENTE').trim() && !campo(fila, idx, 'MARCA').trim();
}

function procesarFila(fila, idx, numeroFila) {
  const folioOrigen = campo(fila, idx, 'FOLIOS').trim();
  const fechaRaw = campo(fila, idx, 'Fecha').trim();
  const fechaResultado = parseFechaDDMMAAAA(fechaRaw);
  if (fechaResultado.error) {
    return { error: `Registro ${numeroFila} (folio ${folioOrigen || '?'}): Fecha inválida — ${fechaResultado.error}` };
  }

  const advertencias = [];

  const consumo = parseConsumo(campo(fila, idx, 'CONSUMO'));
  if (consumo.advertencia) advertencias.push(consumo.advertencia);

  const compra = parseMonto(campo(fila, idx, '$ DE COMPRA'));
  if (compra.advertencia) advertencias.push(`$ DE COMPRA ${compra.advertencia}`);
  const venta = parseMonto(campo(fila, idx, '$ DE VENTA'));
  if (venta.advertencia) advertencias.push(`$ DE VENTA ${venta.advertencia}`);
  const factor = parseMonto(campo(fila, idx, 'FACTOR'));
  if (factor.advertencia) advertencias.push(`FACTOR ${factor.advertencia}`);

  // Decisión del humano [2026-10-23]: la columna del Excel con cabecera suelta "16.10.26" (una de
  // las "columnas de fecha al final" que se ignoraban antes) SÍ tiene inventario histórico real en
  // 193/197 filas (verificado); el valor varía entre líneas de un mismo folio+cliente (ej. folios
  // 27, 28, 53, 54, 63), así que es un dato POR LÍNEA DE PRODUCTO, no por convenio completo. Se
  // reutiliza parseMonto (mismo formato: comas de miles, "-"/vacío -> sin dato) y se agrega al
  // texto de `observaciones` del convenio en construirConvenio(), no a una columna nueva (así lo
  // pidió el humano). campo() ya devuelve '' sin reventar si esta columna no existiera en el CSV.
  const inventarioHistoricoResultado = parseMonto(campo(fila, idx, '16.10.26'));
  if (inventarioHistoricoResultado.advertencia) {
    advertencias.push(`Inv. al día (histórico, columna "16.10.26"): ${inventarioHistoricoResultado.advertencia}`);
  }

  const empaqueTxt = campo(fila, idx, 'EMPAQUE').trim();
  let empaque = null;
  if (empaqueTxt) {
    const n = Number(empaqueTxt.replace(/,/g, ''));
    if (Number.isFinite(n)) empaque = n;
    else advertencias.push(`EMPAQUE no numérico: "${empaqueTxt}"`);
  }

  const productoCodigoRaw = campo(fila, idx, 'Codigo Producto').trim();
  const productoDescripcionRaw = campo(fila, idx, 'Clave MBA3').trim();
  const cancelada = esLineaCancelada(productoCodigoRaw, productoDescripcionRaw);

  let productoDescripcion = productoDescripcionRaw;
  if (!productoDescripcion && productoCodigoRaw) {
    productoDescripcion = productoCodigoRaw;
    advertencias.push(`Producto sin "Clave MBA3": se usó el código "${productoCodigoRaw}" como descripción`);
  }
  if (!productoDescripcion) {
    return { error: `Registro ${numeroFila} (folio ${folioOrigen || '?'}): sin descripción ("Clave MBA3") ni código de producto` };
  }

  return {
    ok: true,
    datos: {
      numeroFila,
      folioOrigen,
      clienteNombreRaw: campo(fila, idx, 'CLIENTE'),
      clienteCodigoRaw: campo(fila, idx, 'Clave Cliente').trim(),
      vendedorNombreRaw: campo(fila, idx, 'VENDEDOR'),
      vendedorCodigoRaw: campo(fila, idx, 'Clave Vendedor').trim(),
      fechaInicioISO: fechaResultado.valor,
      autorizacionRaw: campo(fila, idx, 'AUTORIZACION').trim(),
      vigenciaRaw: campo(fila, idx, 'VIGENCIA').trim(),
      observacionesRaw: campo(fila, idx, 'OBSERVACIONES').trim(),
      comentariosRaw: campo(fila, idx, 'COMENTARIOS').trim(),
      cancelada,
      productoCodigo: productoCodigoRaw || null,
      productoDescripcion,
      empaque,
      unidadMedida: campo(fila, idx, 'U.M').trim() || null,
      cantidadPeriodica: consumo.cantidad,
      periodo: consumo.periodo,
      precioCompra: compra.valor,
      precioVenta: venta.valor,
      factor: factor.valor,
      inventarioHistorico: inventarioHistoricoResultado.valor,
      advertencias,
    },
  };
}

// ---------------------------------------------------------------------------
// Agrupación: 1 convenio = 1 folio + 1 cliente (regla 1); si dentro de ese grupo aparece más de un
// VENDEDOR distinto (regla 3, no debería pasar) se vuelve a dividir por vendedor con advertencia.
function agruparFilas(filasOk) {
  const porFolioCliente = new Map();
  for (const f of filasOk) {
    const clienteNorm = normalizarClave(f.clienteNombreRaw) || normalizarClave(f.clienteCodigoRaw);
    const key = `${f.folioOrigen}||${clienteNorm}`;
    if (!porFolioCliente.has(key)) porFolioCliente.set(key, []);
    porFolioCliente.get(key).push(f);
  }

  const grupos = [];
  for (const filas of porFolioCliente.values()) {
    const vendedoresNorm = [
      ...new Set(filas.map((f) => normalizarClave(f.vendedorNombreRaw) || normalizarClave(f.vendedorCodigoRaw))),
    ];
    if (vendedoresNorm.length <= 1) {
      grupos.push({ filas, advertenciaSplit: null });
      continue;
    }
    for (const vn of vendedoresNorm) {
      const subset = filas.filter(
        (f) => (normalizarClave(f.vendedorNombreRaw) || normalizarClave(f.vendedorCodigoRaw)) === vn,
      );
      grupos.push({
        filas: subset,
        advertenciaSplit:
          `Folio ${subset[0].folioOrigen} cliente "${normalizarTexto(subset[0].clienteNombreRaw) || normalizarTexto(subset[0].clienteCodigoRaw)}" ` +
          `tenía más de un VENDEDOR distinto dentro del mismo folio+cliente; se dividió también por vendedor (error de datos, revisar).`,
      });
    }
  }
  return grupos;
}

// ---------------------------------------------------------------------------
// Estatus + vigente_hasta a partir de VIGENCIA/OBSERVACIONES/AUTORIZACION de la fila "cabecera"
// del grupo (la primera). Reglas de negocio con ambigüedad: ver encargo original / code-notes.md.
function calcularEstatusYVigencia({ vigenciaRaw, observacionesRaw, autorizacionRaw, folioOrigen, clienteNombre }) {
  const advertencias = [];
  const prefijo = `Folio ${folioOrigen} cliente "${clienteNombre}":`;

  if (vigenciaRaw.toLowerCase() === 'no vigente') {
    return {
      estatus: 'cancelado',
      vigenteHasta: null,
      advertencias,
      notaObservacion: "Convenio histórico marcado 'No vigente' en el Excel (incremento de precios).",
    };
  }
  if (/ya no comprar/i.test(observacionesRaw)) {
    return {
      estatus: 'cancelado',
      vigenteHasta: null,
      advertencias,
      notaObservacion: "Observación del Excel: 'Ya no comprar' (convenio histórico dado de baja).",
    };
  }
  if (!autorizacionRaw) {
    advertencias.push(`${prefijo} AUTORIZACION vacía en el Excel; se importó como cancelado (sin autorizador identificado).`);
    return {
      estatus: 'cancelado',
      vigenteHasta: null,
      advertencias,
      notaObservacion: 'Convenio histórico sin AUTORIZACION en el Excel: se importó como cancelado.',
    };
  }
  if (!vigenciaRaw) {
    return { estatus: 'autorizado', vigenteHasta: null, advertencias, notaObservacion: null };
  }

  const fechaDirecta = parseFechaDDMMAAAA(vigenciaRaw);
  if (!fechaDirecta.error) {
    return { estatus: 'autorizado', vigenteHasta: fechaDirecta.valor, advertencias, notaObservacion: null };
  }

  if (/^\d{4,6}$/.test(vigenciaRaw)) {
    const serial = fechaDeSerialExcelConRango(Number(vigenciaRaw));
    if (serial) {
      advertencias.push(`${prefijo} VIGENCIA="${vigenciaRaw}" se interpretó como número de serie de fecha de Excel -> ${serial}.`);
      return { estatus: 'autorizado', vigenteHasta: serial, advertencias, notaObservacion: null };
    }
    // Numérica pero no interpretable con confianza como fecha de Excel: cae a la regla general de
    // abajo (ni fecha válida ni serial parseable, y no es "No vigente" -> cancelado).
  }

  // Decisión del humano [2026-10-23] (generaliza R-P3-1, folio 90 "No sale en precio"): CUALQUIER
  // VIGENCIA que no sea una fecha válida, ni un serial de Excel parseable, y que no sea exactamente
  // "No vigente" (ya cubierto arriba) se trata IGUAL que "No vigente": cancelado, sin inventar una
  // vigente_hasta. Se eliminó la heurística anterior que usaba OBSERVACIONES como posible columna
  // desalineada (dejaba el folio 90 "autorizado" con una fecha ya vencida: hallazgo ALTO del
  // revisor) — ahora cualquier texto no reconocible cancela el convenio con una nota explícita.
  advertencias.push(
    `${prefijo} VIGENCIA="${vigenciaRaw}" no es una fecha válida ni un serial de Excel reconocible, y no es "No vigente"; ` +
      `se trató igual que "No vigente": estatus cancelado (decisión del humano 2026-10-23, generalización del caso folio 90).`,
  );
  return {
    estatus: 'cancelado',
    vigenteHasta: null,
    advertencias,
    notaObservacion: `Convenio histórico cancelado: VIGENCIA original no reconocible como fecha: "${vigenciaRaw}".`,
  };
}

// ---------------------------------------------------------------------------
// Construye el convenio candidato (cabecera + líneas) a partir de un grupo folio+cliente(+vendedor).
function construirConvenio(filas, advertenciaSplit) {
  const advertencias = advertenciaSplit ? [advertenciaSplit] : [];
  const primera = filas[0];
  const folioOrigen = primera.folioOrigen;

  const clienteConNombre = filas.find((f) => normalizarTexto(f.clienteNombreRaw));
  const clienteCodigoEncontrado = filas.find((f) => f.clienteCodigoRaw)?.clienteCodigoRaw || null;
  let clienteNombre = clienteConNombre ? normalizarTexto(clienteConNombre.clienteNombreRaw) : null;
  if (!clienteNombre) {
    if (clienteCodigoEncontrado) {
      clienteNombre = clienteCodigoEncontrado;
      advertencias.push(`Folio ${folioOrigen}: sin nombre de cliente en el Excel; se usó el código "${clienteCodigoEncontrado}" como nombre.`);
    } else {
      return {
        omitido: true,
        folioOrigen,
        clienteNombre: '(sin identificar)',
        motivo: 'Sin nombre ni código de cliente en ninguna línea del folio.',
      };
    }
  }

  const vendedorConNombre = filas.find((f) => normalizarTexto(f.vendedorNombreRaw));
  const vendedorCodigoEncontrado = filas.find((f) => f.vendedorCodigoRaw)?.vendedorCodigoRaw || null;
  let vendedorNombre = vendedorConNombre ? normalizarTexto(vendedorConNombre.vendedorNombreRaw) : null;
  if (!vendedorNombre) {
    if (vendedorCodigoEncontrado) {
      vendedorNombre = vendedorCodigoEncontrado;
      advertencias.push(`Folio ${folioOrigen} cliente "${clienteNombre}": sin nombre de vendedor en el Excel; se usó el código "${vendedorCodigoEncontrado}" como nombre.`);
    } else {
      return {
        omitido: true,
        folioOrigen,
        clienteNombre,
        motivo: 'Sin nombre ni código de vendedor en ninguna línea del folio.',
      };
    }
  }

  const fechas = [...new Set(filas.map((f) => f.fechaInicioISO))];
  const fechaInicio = filas[0].fechaInicioISO;
  if (fechas.length > 1) {
    advertencias.push(`Folio ${folioOrigen} cliente "${clienteNombre}": las líneas tienen Fecha distinta entre sí (${fechas.join(', ')}); se usó ${fechaInicio} (la primera línea).`);
  }

  const vigs = [...new Set(filas.map((f) => f.vigenciaRaw))];
  const obss = [...new Set(filas.map((f) => f.observacionesRaw))];
  const auts = [...new Set(filas.map((f) => f.autorizacionRaw))];
  if (vigs.length > 1) {
    advertencias.push(`Folio ${folioOrigen} cliente "${clienteNombre}": VIGENCIA distinta entre líneas (${vigs.map((v) => `"${v}"`).join(', ')}); se usó la de la primera línea.`);
  }
  if (obss.length > 1) {
    advertencias.push(`Folio ${folioOrigen} cliente "${clienteNombre}": OBSERVACIONES distinta entre líneas (${obss.map((v) => `"${v}"`).join(', ')}); se usó la de la primera línea para decidir el estatus.`);
  }
  if (auts.length > 1) {
    advertencias.push(`Folio ${folioOrigen} cliente "${clienteNombre}": AUTORIZACION distinta entre líneas (${auts.map((v) => `"${v}"`).join(', ')}); se usó la de la primera línea.`);
  }

  const resultadoEstatus = calcularEstatusYVigencia({
    vigenciaRaw: primera.vigenciaRaw,
    observacionesRaw: primera.observacionesRaw,
    autorizacionRaw: primera.autorizacionRaw,
    folioOrigen,
    clienteNombre,
  });
  advertencias.push(...resultadoEstatus.advertencias);

  const lineasExcluidas = [];
  const lineas = [];
  const notasInventarioHistorico = [];
  for (const f of filas) {
    if (f.cancelada) {
      lineasExcluidas.push(f);
      continue;
    }
    lineas.push({
      producto_codigo: f.productoCodigo,
      producto_descripcion: f.productoDescripcion,
      empaque: f.empaque,
      unidad_medida: f.unidadMedida,
      cantidad_periodica: f.cantidadPeriodica,
      periodo: f.periodo,
      precio_compra: f.precioCompra,
      precio_venta: f.precioVenta,
      factor: f.factor,
    });
    if (f.inventarioHistorico !== null && f.inventarioHistorico !== undefined) {
      notasInventarioHistorico.push({
        producto: f.productoCodigo || f.productoDescripcion,
        valor: f.inventarioHistorico,
      });
    }
    for (const a of f.advertencias) {
      advertencias.push(`Folio ${folioOrigen} cliente "${clienteNombre}" producto "${f.productoCodigo || f.productoDescripcion}": ${a}`);
    }
  }
  if (lineasExcluidas.length) {
    advertencias.push(
      `Folio ${folioOrigen} cliente "${clienteNombre}": se excluyeron ${lineasExcluidas.length} línea(s) marcadas CANCELADO ` +
        `(${lineasExcluidas.map((f) => f.productoDescripcion || f.productoCodigo || '?').join(', ')}).`,
    );
  }
  if (lineas.length === 0) {
    return {
      omitido: true,
      folioOrigen,
      clienteNombre,
      motivo: `Sin líneas válidas tras excluir canceladas (el folio tenía ${filas.length} línea(s), todas CANCELADO).`,
    };
  }

  const partesObs = [];
  const comentariosUnicos = [...new Set(filas.map((f) => f.comentariosRaw).filter(Boolean))];
  if (comentariosUnicos.length) partesObs.push(`Comentarios: ${comentariosUnicos.join(' / ')}`);
  const observacionesUnicas = [...new Set(filas.map((f) => f.observacionesRaw).filter(Boolean))];
  if (observacionesUnicas.length) partesObs.push(`Observaciones: ${observacionesUnicas.join(' / ')}`);
  if (resultadoEstatus.notaObservacion) partesObs.push(resultadoEstatus.notaObservacion);
  // Decisión del humano [2026-10-23]: inventario histórico (columna "16.10.26") como nota de texto
  // en observaciones, nunca en una columna nueva. Es un dato por línea de producto (ver
  // procesarFila), así que con 1 sola línea se guarda el valor solo (ej. "Inv. al día (histórico):
  // 155"); con 2+ líneas se identifica cada producto para no mezclar valores distintos.
  if (notasInventarioHistorico.length === 1) {
    partesObs.push(`Inv. al día (histórico): ${notasInventarioHistorico[0].valor}`);
  } else if (notasInventarioHistorico.length > 1) {
    partesObs.push(
      `Inv. al día (histórico) por producto: ${notasInventarioHistorico
        .map((n) => `${n.producto}=${n.valor}`)
        .join('; ')}`,
    );
  }
  const observaciones = partesObs.length ? partesObs.join('\n') : null;

  return {
    omitido: false,
    folioOrigen,
    clienteNombre,
    advertencias,
    cabecera: {
      folio_origen: folioOrigen,
      cliente_codigo: clienteCodigoEncontrado,
      cliente_nombre: clienteNombre,
      vendedor_codigo: vendedorCodigoEncontrado,
      vendedor_nombre: vendedorNombre,
      fecha_inicio: fechaInicio,
      vigente_hasta: resultadoEstatus.vigenteHasta,
      estatus: resultadoEstatus.estatus,
      autoriza_nombre: primera.autorizacionRaw || null,
      fecha_autoriza: fechaInicio,
      observaciones,
    },
    lineas,
  };
}

function construirCandidatos(filasOk) {
  return agruparFilas(filasOk).map((g) => construirConvenio(g.filas, g.advertenciaSplit));
}

// ---------------------------------------------------------------------------
// CLI
function parsearArgs(argv) {
  const opts = {
    dryRun: false,
    archivo: RUTA_CSV_DEFECTO,
    creadoPorUsuarioId: null,
    creadoPorCorreo: null,
    reporte: null,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--archivo=')) opts.archivo = arg.slice('--archivo='.length).trim();
    else if (arg.startsWith('--reporte=')) opts.reporte = arg.slice('--reporte='.length).trim();
    else if (arg.startsWith('--creado-por-usuario-id=')) {
      const n = parseInt(arg.slice('--creado-por-usuario-id='.length), 10);
      if (!Number.isInteger(n) || n <= 0) throw new Error('--creado-por-usuario-id debe ser un entero positivo');
      opts.creadoPorUsuarioId = n;
    } else if (arg.startsWith('--creado-por-correo=')) {
      opts.creadoPorCorreo = arg.slice('--creado-por-correo='.length).trim();
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }
  if (opts.creadoPorUsuarioId && opts.creadoPorCorreo) {
    throw new Error('Usa --creado-por-usuario-id=<id> o --creado-por-correo=<correo>, no ambos.');
  }
  if (!opts.creadoPorUsuarioId && !opts.creadoPorCorreo) {
    throw new Error(
      'Falta un parámetro obligatorio: --creado-por-usuario-id=<id> o --creado-por-correo=<correo> ' +
        '(nunca se usa un valor inventado).',
    );
  }
  return opts;
}

async function resolverCreadoPorId(opts, { usuarioRepo }) {
  if (opts.creadoPorUsuarioId) {
    const usuario = await usuarioRepo.buscarPorId(opts.creadoPorUsuarioId);
    if (!usuario) throw new Error(`No existe un usuario con id=${opts.creadoPorUsuarioId} (--creado-por-usuario-id)`);
    return usuario.id;
  }
  const correo = opts.creadoPorCorreo.toLowerCase();
  const usuario = await usuarioRepo.buscarPorCorreo(correo);
  if (!usuario) throw new Error(`No existe un usuario con correo "${opts.creadoPorCorreo}" (--creado-por-correo)`);
  return usuario.id;
}

// ---------------------------------------------------------------------------
// Orquestación. `convenioRepo`/`usuarioRepo` inyectados (igual que `servicio` en
// migrar-usuarios-supabase.js) para poder probar sin Postgres real; main() los conecta a los
// modelos reales.
async function ejecutar(opts, { convenioRepo, usuarioRepo, log = console.log }) {
  const texto = fs.readFileSync(opts.archivo, 'utf8');
  const filas = parseCSV(texto);
  if (filas.length === 0) throw new Error('El archivo CSV está vacío');
  const header = filas[0];
  const idx = construirIndiceColumnas(header);
  const dataRows = filas.slice(1);

  const creadoPorId = await resolverCreadoPorId(opts, { usuarioRepo });

  const filasOk = [];
  const erroresFilas = [];
  let numeroFila = 1; // la fila 1 es el encabezado
  let filasVacias = 0; // R-P3-12: antes se saltaban sin contarse en ningún lado del reporte
  for (const fila of dataRows) {
    numeroFila++;
    if (esFilaVacia(fila, idx)) {
      filasVacias++;
      continue;
    }
    const resultado = procesarFila(fila, idx, numeroFila);
    if (resultado.error) {
      erroresFilas.push(resultado.error);
      continue;
    }
    filasOk.push(resultado.datos);
  }

  const candidatos = construirCandidatos(filasOk);

  const reporte = {
    creados: [],
    omitidos: [],
    errores: [],
    erroresFilas,
    advertenciasReejecucion: [],
    resumen: {
      conveniosCreados: 0,
      lineasCreadas: 0,
      omitidos: 0,
      filasError: erroresFilas.length,
      filasVacias,
      advertencias: 0,
    },
  };

  log(
    `Filas de datos leídas: ${dataRows.length}; filas vacías: ${filasVacias}; filas con error: ${erroresFilas.length}; ` +
      `convenios candidatos: ${candidatos.length}${opts.dryRun ? ' (dry-run: no se escribe nada)' : ''}`,
  );
  for (const e of erroresFilas) log(`  [fila-error] ${e}`);

  // R-P3-3: dry-run y corrida real deben coincidir cuando un folio+cliente se divide en varios
  // convenios por VENDEDOR distinto (agruparFilas() ya es la ÚNICA función de agrupación que usan
  // ambos modos; esto no se duplica). El problema estaba en el chequeo de "ya importado": en la
  // corrida real, el segundo subgrupo encontraba la fila recién insertada por el primero dentro de
  // ESTA MISMA corrida y se omitía como "ya importado" (perdiendo sus líneas); en dry-run, como no
  // se escribe nada, ningún subgrupo lo veía y ambos salían "creados". La corrección: por cada
  // clave folio+cliente se consulta la BD UNA sola vez (antes de que esta corrida cree nada para esa
  // clave) y se guarda en caché cuántas filas YA existían de antes; cada candidato con esa clave se
  // compara contra ese número fijo según el orden en que aparece en este archivo, nunca contra lo
  // que esta misma corrida acaba de escribir.
  const filasExistentesPorFolio = new Map(); // folioOrigen -> filas de existeHistorico (cache)
  const vistosPorClave = new Map(); // "folio||clienteNorm" -> cuántos candidatos de esta corrida ya se procesaron
  async function existentesParaClave(folioOrigen, clienteNorm) {
    if (!filasExistentesPorFolio.has(folioOrigen)) {
      filasExistentesPorFolio.set(folioOrigen, await convenioRepo.existeHistorico(folioOrigen));
    }
    return filasExistentesPorFolio.get(folioOrigen).filter((f) => normalizarClave(f.cliente_nombre) === clienteNorm);
  }

  for (const candidato of candidatos) {
    if (candidato.omitido) {
      log(`  [omitido] folio=${candidato.folioOrigen} cliente="${candidato.clienteNombre}" motivo="${candidato.motivo}"`);
      reporte.omitidos.push(candidato);
      reporte.resumen.omitidos++;
      continue;
    }

    const clienteNorm = normalizarClave(candidato.cabecera.cliente_nombre);
    const clave = `${candidato.folioOrigen}||${clienteNorm}`;
    const existentesClave = await existentesParaClave(candidato.folioOrigen, clienteNorm);
    const vistos = vistosPorClave.get(clave) || 0;
    vistosPorClave.set(clave, vistos + 1);
    const filaExistente = existentesClave[vistos]; // undefined si no hay (vistos)-ésima fila previa
    const yaImportado = Boolean(filaExistente);

    if (yaImportado) {
      // R-P3-4: si el archivo actual trae un número de líneas distinto al que ya está en la BD, no
      // se queda callado — advertencia explícita y visible en el reporte; nunca se modifica el
      // convenio existente automáticamente.
      const lineasExistentes = Number(filaExistente.total_lineas) || 0;
      const lineasActuales = candidato.lineas.length;
      let motivo = 'ya importado';
      if (lineasExistentes !== lineasActuales) {
        const advertenciaReejecucion =
          `Folio ${candidato.folioOrigen} cliente "${candidato.clienteNombre}" ya importado ` +
          `(id=${filaExistente.id}) con ${lineasExistentes} línea(s); el archivo actual trae ${lineasActuales}; ` +
          `revisar manualmente, no se modifica automáticamente.`;
        log(`  [ADVERTENCIA] ${advertenciaReejecucion}`);
        reporte.advertenciasReejecucion.push(advertenciaReejecucion);
        motivo = `ya importado (líneas distintas: BD=${lineasExistentes}, archivo=${lineasActuales})`;
      }
      log(`  [omitido] folio=${candidato.folioOrigen} cliente="${candidato.clienteNombre}" motivo="${motivo}"`);
      reporte.omitidos.push({ ...candidato, motivo });
      reporte.resumen.omitidos++;
      continue;
    }

    reporte.resumen.advertencias += candidato.advertencias.length;

    if (opts.dryRun) {
      log(`  [creado-simulado] folio=${candidato.folioOrigen} cliente="${candidato.clienteNombre}" estatus=${candidato.cabecera.estatus} lineas=${candidato.lineas.length}`);
      candidato.advertencias.forEach((a) => log(`      advertencia: ${a}`));
      reporte.creados.push(candidato);
      reporte.resumen.conveniosCreados++;
      reporte.resumen.lineasCreadas += candidato.lineas.length;
      continue;
    }

    try {
      const creado = await convenioRepo.crearHistorico({ ...candidato.cabecera, creado_por_id: creadoPorId }, candidato.lineas);
      log(`  [creado] folio=${candidato.folioOrigen} cliente="${candidato.clienteNombre}" id=${creado.id} estatus=${candidato.cabecera.estatus} lineas=${candidato.lineas.length}`);
      candidato.advertencias.forEach((a) => log(`      advertencia: ${a}`));
      reporte.creados.push(candidato);
      reporte.resumen.conveniosCreados++;
      reporte.resumen.lineasCreadas += candidato.lineas.length;
    } catch (error) {
      log(`  [error] folio=${candidato.folioOrigen} cliente="${candidato.clienteNombre}": ${error.message}`);
      reporte.errores.push({ folioOrigen: candidato.folioOrigen, clienteNombre: candidato.clienteNombre, error: error.message });
    }
  }

  log('');
  log(
    `Resumen: convenios_creados=${reporte.resumen.conveniosCreados} lineas_creadas=${reporte.resumen.lineasCreadas} ` +
      `omitidos=${reporte.resumen.omitidos} filas_error=${reporte.resumen.filasError} filas_vacias=${reporte.resumen.filasVacias} ` +
      `advertencias=${reporte.resumen.advertencias} advertencias_reejecucion=${reporte.advertenciasReejecucion.length} ` +
      `convenios_con_error=${reporte.errores.length}${opts.dryRun ? ' (dry-run: no se escribió nada)' : ''}`,
  );

  return reporte;
}

async function main() {
  const opts = parsearArgs(process.argv.slice(2));
  const { grupo } = require('../../modules/portal/backend/config/database');
  const Convenio = require('../../modules/comercial/backend/models/convenio.model');
  const Usuario = require('../../modules/portal/backend/models/usuario.model');

  const lineasLog = [];
  const log = (msg) => {
    console.log(msg);
    lineasLog.push(msg);
  };

  try {
    const reporte = await ejecutar(opts, {
      convenioRepo: { existeHistorico: Convenio.existeHistorico, crearHistorico: Convenio.crearHistorico },
      usuarioRepo: { buscarPorId: Usuario.buscarPorId, buscarPorCorreo: Usuario.buscarPorCorreo },
      log,
    });
    if (opts.reporte) {
      fs.writeFileSync(opts.reporte, `${lineasLog.join('\n')}\n`, 'utf8');
    }
    return reporte.errores.length > 0 || reporte.resumen.filasError > 0 ? 1 : 0;
  } finally {
    await grupo.end().catch(() => {});
  }
}

if (require.main === module) {
  main()
    .then((codigo) => process.exit(codigo))
    .catch((e) => {
      console.error('Error en la importación de convenios históricos:', e.message);
      process.exit(1);
    });
}

module.exports = {
  parseCSV,
  construirIndiceColumnas,
  normalizarTexto,
  normalizarClave,
  parseFechaDDMMAAAA,
  fechaDeSerialExcelConRango,
  parseMonto,
  parseConsumo,
  esLineaCancelada,
  esFilaVacia,
  procesarFila,
  agruparFilas,
  calcularEstatusYVigencia,
  construirConvenio,
  construirCandidatos,
  parsearArgs,
  resolverCreadoPorId,
  ejecutar,
};
