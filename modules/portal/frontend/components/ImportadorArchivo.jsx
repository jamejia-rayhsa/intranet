import { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { hojaAMatriz, libroEs1904 } from '../utils/hojaAMatriz';
import {
  leerMatriz, separarFilas, dividirEnLotes, resultadoVacio, sumarResultados, sumarJefes, decodificarTextoCsv,
  construirCsvResultado, numeroFilaDeError, nombreDeError, avisosSinCatalogo, TAMANO_LOTE, MAX_PARES_JEFES, MAX_ADVERTENCIAS,
  enviarConReintento, repeticionesEntreLotes, MENSAJE_OCUPADO,
} from '../utils/importarFilas';

const estilos = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '1rem',
  },
  modal: {
    background: 'var(--color-superficie)', borderRadius: '10px',
    width: '100%', maxWidth: '760px', maxHeight: '90vh', minWidth: 0,
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  },
  header: {
    padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-borde)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  titulo: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-texto)', margin: 0 },
  cerrar: {
    background: 'none', border: 'none', fontSize: '1.4rem',
    cursor: 'pointer', color: 'var(--color-texto-claro)', lineHeight: 1, padding: '0.25rem',
  },
  cuerpo: { padding: '1.5rem', overflowY: 'auto', flex: 1, minWidth: 0 },
  listaScroll: {
    maxHeight: '40vh', overflow: 'auto', borderRadius: '6px', border: '1px solid var(--color-borde)',
  },
  pie: {
    padding: '1rem 1.5rem', borderTop: '1px solid var(--color-borde)',
    display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap',
  },
  botonPrimario: {
    padding: '0.55rem 1.25rem', background: 'var(--color-primario)', color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
  },
  botonSecundario: {
    padding: '0.55rem 1.25rem', background: 'transparent',
    border: '1px solid var(--color-borde)', borderRadius: '6px',
    cursor: 'pointer', color: 'var(--color-texto)', fontSize: '0.9rem',
  },
  zona: (arrastrandoSobre) => ({
    border: `2px dashed ${arrastrandoSobre ? 'var(--color-primario)' : 'var(--color-borde)'}`,
    borderRadius: '8px', padding: '2.5rem 1.5rem', textAlign: 'center',
    background: arrastrandoSobre ? 'rgba(0,46,109,0.04)' : 'var(--color-fondo)',
    cursor: 'pointer', transition: 'all 0.2s',
    marginBottom: '1rem',
  }),
  etiquetaCol: {
    fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-texto-claro)',
    textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0.5rem 0.75rem',
    background: 'var(--color-fondo)', borderBottom: '2px solid var(--color-borde)',
    textAlign: 'left', whiteSpace: 'nowrap',
  },
  celda: { padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-borde)', fontSize: '0.875rem' },
  celdaVacia: { padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-borde)', fontSize: '0.875rem', color: 'var(--color-error)', fontStyle: 'italic' },
  chip: (tipo) => ({
    display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '12px',
    fontSize: '0.75rem', fontWeight: 600,
    background: tipo === 'ok' ? 'var(--color-exito-suave)' : tipo === 'warn' ? 'var(--color-advertencia-suave)' : 'var(--color-error-suave)',
    color: 'var(--color-texto)',
    border: `1px solid ${tipo === 'ok' ? 'var(--color-exito)' : tipo === 'warn' ? 'var(--color-advertencia)' : 'var(--color-error)'}`,
    overflowWrap: 'anywhere',
  }),
  resumen: {
    display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap',
  },
  tarjetaResumen: (tipo) => ({
    flex: '1 1 100px', minWidth: 0, padding: '1rem', borderRadius: '8px', textAlign: 'center',
    background: tipo === 'ok' ? 'var(--color-exito-suave)' : tipo === 'warn' ? 'var(--color-advertencia-suave)' : tipo === 'err' ? 'var(--color-error-suave)' : 'var(--color-fondo)',
    border: `1px solid ${tipo === 'ok' ? 'var(--color-exito)' : tipo === 'warn' ? 'var(--color-advertencia)' : tipo === 'err' ? 'var(--color-error)' : 'var(--color-borde)'}`,
  }),
};

// Devuelve { filas, encabezados: { reconocidas, ignoradas, faltantes } }. Los CSV se decodifican aquí (UTF-8 con o sin
// BOM; si no es UTF-8 válido, Windows-1252) porque SheetJS leería los bytes como Latin-1/UTF-8 según el caso y
// rompería los acentos; el separador (coma, punto y coma o tabulador) lo detecta SheetJS.
function parsearArchivo(archivo, columnas) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // xlsx: cellDates:false + cellNF (formato de cada celda): hojaAMatriz entrega las fechas como serial exacto y
        // sin pasar por Date local; raw: los CSV no se reinterpretan (mes/día de EE. UU.)
        const esCsv = /\.csv$/i.test(archivo.name);
        const wb = esCsv
          ? XLSX.read(decodificarTextoCsv(new Uint8Array(e.target.result)).texto, { type: 'string', raw: true })
          : XLSX.read(e.target.result, { type: 'array', cellDates: false, cellNF: true, raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws || !ws['!ref']) { resolve(leerMatriz([], columnas, 1)); return; }
        const matriz = hojaAMatriz(XLSX, ws, !esCsv && libroEs1904(wb));
        const filaEncabezado = XLSX.utils.decode_range(ws['!ref']).s.r + 1;
        resolve(leerMatriz(matriz, columnas, filaEncabezado));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(archivo);
  });
}

// Columnas agrupadas por `grupo` (en el orden de aparición); sin grupo, un solo bloque.
function gruposDe(columnas) {
  const orden = [];
  const mapa = {};
  columnas.forEach(c => {
    const k = c.grupo || '';
    if (!mapa[k]) { mapa[k] = { nombre: k, columnas: [] }; orden.push(k); }
    mapa[k].columnas.push(c);
  });
  return orden.map(k => mapa[k]);
}

function descargarEjemplo(columnas, filasEjemplo, nombreArchivo) {
  const encabezado = columnas.map(c => c.etiqueta).join(',');
  const filas = (filasEjemplo || []).map(f =>
    columnas.map(c => {
      const val = f[c.clave] || '';
      return val.includes(',') ? `"${val}"` : val;
    }).join(',')
  );
  const csv = [encabezado, ...filas].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo || 'plantilla.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Vistas ──────────────────────────────────────────────────────────────────

function VistaSeleccion({ columnas, filasEjemplo, nombreArchivo, accionesDescarga, onArchivo, onCancelar }) {
  const [arrastrandoSobre, setArrastrandoSobre] = useState(false);
  const [errorParseo, setErrorParseo] = useState('');
  const [descargando, setDescargando] = useState('');
  const inputRef = useRef();

  async function ejecutarDescarga(accion) {
    setErrorParseo('');
    setDescargando(accion.etiqueta);
    try {
      await accion.onClick();
    } catch (err) {
      setErrorParseo((err && err.message) || 'No se pudo generar la descarga');
    } finally {
      setDescargando('');
    }
  }

  async function procesarArchivo(archivo) {
    if (!archivo) return;
    const ext = archivo.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setErrorParseo('Formato no válido. Usa .xlsx, .xls o .csv');
      return;
    }
    try {
      const leido = await parsearArchivo(archivo, columnas);
      if (!leido.filas.length && !leido.encabezados.reconocidas.length) { setErrorParseo('El archivo no contiene datos ni encabezados reconocibles'); return; }
      if (!leido.filas.length) { setErrorParseo('El archivo no contiene filas de datos'); return; }
      onArchivo(leido);
    } catch {
      setErrorParseo('No se pudo leer el archivo. Verifica que no esté corrupto.');
    }
  }

  return (
    <>
      <div style={estilos.cuerpo}>
        <div
          style={estilos.zona(arrastrandoSobre)}
          role="button" tabIndex={0} aria-label="Seleccionar archivo para importar"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current.click(); } }}
          onClick={() => inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastrandoSobre(true); }}
          onDragLeave={() => setArrastrandoSobre(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrandoSobre(false); procesarArchivo(e.dataTransfer.files[0]); }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📂</div>
          <p style={{ fontWeight: 600, color: 'var(--color-texto)', marginBottom: '0.25rem' }}>
            Arrastra tu archivo aquí o haz clic para seleccionarlo
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-texto-claro)' }}>
            Formatos aceptados: .xlsx, .xls, .csv
          </p>
          <input
            ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => procesarArchivo(e.target.files[0])}
          />
        </div>

        {errorParseo && (
          <p style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            {errorParseo}
          </p>
        )}

        <div style={{ background: 'var(--color-fondo)', borderRadius: '8px', padding: '1rem' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-texto)', marginBottom: '0.5rem' }}>
            Columnas esperadas:
          </p>
          {gruposDe(columnas).map(g => (
            <div key={g.nombre || 'todas'} style={{ marginBottom: '0.5rem' }}>
              {g.nombre && <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-texto)', margin: '0 0 0.25rem' }}>{g.nombre}</p>}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {g.columnas.map(c => (
                  <span key={c.clave} style={estilos.chip(c.requerido ? 'err' : 'ok')}>
                    {c.etiqueta}{c.requerido ? ' *' : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p style={{ fontSize: '0.8rem', color: 'var(--color-texto-claro)', margin: '0.5rem 0 0' }}>
            * Campo obligatorio. Los encabezados se reconocen sin importar acentos, mayúsculas ni puntuación; las columnas que no se reconozcan se ignoran y la vista previa te las muestra.
          </p>
        </div>
      </div>

      <div style={estilos.pie}>
        <button
          style={{ ...estilos.botonSecundario, color: 'var(--color-primario)', fontWeight: 600 }}
          onClick={() => descargarEjemplo(columnas, filasEjemplo, nombreArchivo)}
        >
          ⬇ Descargar plantilla de ejemplo (.csv)
        </button>
        {(accionesDescarga || []).map(a => (
          <button
            key={a.etiqueta}
            style={{ ...estilos.botonSecundario, color: 'var(--color-primario)', fontWeight: 600 }}
            onClick={() => ejecutarDescarga(a)}
            disabled={!!descargando}
          >
            {descargando === a.etiqueta ? 'Generando…' : a.etiqueta}
          </button>
        ))}
        <button style={estilos.botonSecundario} onClick={onCancelar}>Cancelar</button>
      </div>
    </>
  );
}

function VistaPreview({ columnas, filas, encabezados, permiteActualizar, textosModo, modo, onModo, procesando, progreso, onConfirmar, onVolver }) {
  const { enviar, omitidas } = useMemo(() => separarFilas(filas, columnas), [filas, columnas]);
  const porFila = useMemo(() => {
    const mapa = {};
    omitidas.forEach(o => { mapa[o.fila] = o.error; });
    return mapa;
  }, [omitidas]);
  const filasMostrar = filas.slice(0, 8);
  const restantes = filas.length - filasMostrar.length;
  const faltantes = encabezados.faltantes;
  const ignoradas = encabezados.ignoradas;
  // La tabla muestra las primeras columnas reconocidas (un archivo completo trae más de 40).
  const MAX_COLUMNAS_VISTA = 10;
  const columnasVista = encabezados.reconocidas.slice(0, MAX_COLUMNAS_VISTA)
    .map(r => columnas.find(c => c.clave === r.clave)).filter(Boolean);
  const columnasOcultas = encabezados.reconocidas.length - columnasVista.length;

  return (
    <>
      <div style={estilos.cuerpo}>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={estilos.chip('ok')}>{filas.length} filas detectadas</span>
          {omitidas.length > 0
            ? <span style={estilos.chip('err')}>{omitidas.length} filas con errores (no se importarán)</span>
            : <span style={estilos.chip('ok')}>Sin errores de validación</span>}
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--color-texto)', margin: '0 0 0.5rem' }}>
          {encabezados.reconocidas.length} {encabezados.reconocidas.length === 1 ? 'columna reconocida' : 'columnas reconocidas'}.
        </p>
        {ignoradas.length > 0 && (
          <div role="status" style={{ marginBottom: '0.75rem', padding: '0.6rem 0.9rem', background: 'var(--color-advertencia-suave)', borderLeft: '4px solid var(--color-advertencia)', color: 'var(--color-texto)', fontSize: '0.85rem', overflowWrap: 'anywhere' }}>
            <strong>Columnas ignoradas:</strong> {ignoradas.join(', ')}. No se importarán; si debían cargarse, revisa el nombre del encabezado.
          </div>
        )}
        {faltantes.length > 0 && (
          <div role="alert" style={{ marginBottom: '0.75rem', padding: '0.6rem 0.9rem', background: 'var(--color-error-suave)', borderLeft: '4px solid var(--color-error)', color: 'var(--color-texto)', fontSize: '0.85rem', overflowWrap: 'anywhere' }}>
            <strong>Columnas requeridas que faltan:</strong> {faltantes.join(', ')}. No se puede importar hasta que el archivo las incluya.
          </div>
        )}

        {permiteActualizar && (
          <fieldset style={{ border: '1px solid var(--color-borde)', borderRadius: '6px', margin: '0 0 1rem', padding: '0.6rem 0.9rem' }} disabled={procesando}>
            <legend style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-texto)', padding: '0 0.4rem' }}>
              {textosModo.titulo}
            </legend>
            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--color-texto)', marginBottom: '0.25rem' }}>
              <input type="radio" name="modo-importacion" value="omitir" checked={modo === 'omitir'} onChange={() => onModo('omitir')} />{' '}
              Omitirlos (no se modifican)
            </label>
            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--color-texto)' }}>
              <input type="radio" name="modo-importacion" value="actualizar" checked={modo === 'actualizar'} onChange={() => onModo('actualizar')} />{' '}
              Actualizarlos con los datos del archivo
            </label>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-texto-claro)', margin: '0.4rem 0 0' }}>
              {textosModo.ayuda}
            </p>
          </fieldset>
        )}

        <div tabIndex={0} role="region" aria-label="Vista previa de las primeras filas" style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid var(--color-borde)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th style={estilos.etiquetaCol}>Fila</th>
                {columnasVista.map(c => (
                  <th key={c.clave} style={estilos.etiquetaCol}>
                    {c.etiqueta}{c.requerido ? ' *' : ''}
                  </th>
                ))}
                <th style={estilos.etiquetaCol}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filasMostrar.map((fila) => (
                <tr key={fila._fila}>
                  <td style={estilos.celda}>{fila._fila}</td>
                  {columnasVista.map(c => (
                    <td key={c.clave} style={c.requerido && !fila[c.clave] ? estilos.celdaVacia : estilos.celda}>
                      {fila[c.clave] || (c.requerido ? '(vacío)' : '—')}
                    </td>
                  ))}
                  <td style={{ ...estilos.celda, minWidth: '12rem' }}>
                    <span style={estilos.chip(porFila[fila._fila] ? 'err' : 'ok')}>
                      {porFila[fila._fila] || 'OK'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(restantes > 0 || columnasOcultas > 0) && (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-texto-medio)', marginTop: '0.5rem' }}>
            {restantes > 0 && `… y ${restantes} filas más (no mostradas en la vista previa). `}
            {columnasOcultas > 0 && `Se muestran las primeras ${MAX_COLUMNAS_VISTA} columnas; ${columnasOcultas} más se importarán igual.`}
          </p>
        )}

        {omitidas.length > 0 && (
          <div role="alert" style={{ marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-error)', margin: '0 0 0.5rem' }}>
              {omitidas.length} {omitidas.length === 1 ? 'fila se omitirá' : 'filas se omitirán'} y no se importarán. Corrige el archivo y vuelve a cargarlo si las necesitas:
            </p>
            <div tabIndex={0} role="region" aria-label="Filas que se omitirán" style={estilos.listaScroll}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={estilos.etiquetaCol}>Fila</th>
                    <th style={estilos.etiquetaCol}>Nombre</th>
                    <th style={estilos.etiquetaCol}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {omitidas.map(o => (
                    <tr key={o.fila}>
                      <td style={estilos.celda}>{o.fila}</td>
                      <td style={{ ...estilos.celda, overflowWrap: 'anywhere' }}>{o.nombre || '—'}</td>
                      <td style={{ ...estilos.celda, color: 'var(--color-error)', overflowWrap: 'anywhere', minWidth: '10rem' }}>{o.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {procesando && progreso && (
          <p role="status" style={{ fontSize: '0.85rem', color: 'var(--color-texto-medio)', marginTop: '0.75rem' }}>
            {progreso.reintento
              ? `Otra importación en curso: reintentando el mismo lote (${progreso.reintento} de ${progreso.de})…`
              : progreso.jefes ? 'Asignando jefes inmediatos…' : `Importando… lote ${progreso.actual} de ${progreso.total}`}
          </p>
        )}
      </div>

      <div style={estilos.pie}>
        <button style={estilos.botonSecundario} onClick={onVolver} disabled={procesando}>
          ← Seleccionar otro
        </button>
        <button
          style={{ ...estilos.botonPrimario, opacity: procesando || enviar.length === 0 || faltantes.length > 0 ? 0.7 : 1 }}
          onClick={onConfirmar}
          disabled={procesando || enviar.length === 0 || faltantes.length > 0}
        >
          {procesando ? 'Importando…' : `Importar ${enviar.length} registros`}
        </button>
      </div>
    </>
  );
}

function etiquetasDe(columnas) {
  const mapa = { jefe: 'Jefe inmediato' };
  columnas.forEach(c => { mapa[c.clave] = c.etiqueta; });
  return mapa;
}

function descargarCsv(resultado, columnas) {
  const csv = construirCsvResultado(resultado.errores, resultado.duplicados_detalle, resultado.sin_catalogo, {
    advertencias: resultado.advertencias,
    actualizados_detalle: resultado.actualizados_detalle,
    etiquetas: etiquetasDe(columnas),
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'errores_importacion.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function TarjetaResumen({ tipo, valor, etiqueta }) {
  return (
    <div style={estilos.tarjetaResumen(tipo)}>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-texto)' }}>{valor}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--color-texto)', fontWeight: 600 }}>{etiqueta}</div>
    </div>
  );
}

function VistaResultado({ resultado, columnas, onNuevo, onCerrar }) {
  const {
    insertados = 0, actualizados = 0, sin_cambios: sinCambios = 0, duplicados = 0, errores = [],
    duplicados_detalle: detalleDup = [], actualizados_detalle: detalleAct = [], advertencias = [],
    advertencias_omitidas: advOmitidas = 0, jefes = null, interrupcion = '',
  } = resultado;
  const etiquetas = etiquetasDe(columnas);
  const modoActualizar = actualizados > 0 || sinCambios > 0 || resultado.modo === 'actualizar';
  const avisos = avisosSinCatalogo(resultado.sin_catalogo);
  const sinDepto = ((resultado.sin_catalogo || {}).departamentos || []).reduce((t, d) => t + d.filas, 0);
  const sinPuesto = ((resultado.sin_catalogo || {}).puestos || []).reduce((t, d) => t + d.filas, 0);
  const sinUbicacion = ((resultado.sin_catalogo || {}).ubicaciones || []).reduce((t, d) => t + d.filas, 0);
  const encabezadoRef = useRef(null);
  // El foco pasa al resumen para que el lector de pantalla anuncie el resultado y no se pierda al cambiar de vista.
  useEffect(() => { if (encabezadoRef.current) encabezadoRef.current.focus(); }, []);

  return (
    <>
      <div style={estilos.cuerpo}>
        <div ref={encabezadoRef} tabIndex={-1} role="status" style={{ outline: 'none' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--color-texto)' }}>Resultado de la importación</h3>
          <div style={estilos.resumen}>
            <TarjetaResumen tipo="ok" valor={insertados} etiqueta="Insertados" />
            {modoActualizar && <TarjetaResumen tipo="ok" valor={actualizados} etiqueta="Actualizados" />}
            {modoActualizar && <TarjetaResumen tipo="" valor={sinCambios} etiqueta="Sin cambios" />}
            <TarjetaResumen tipo={duplicados ? 'warn' : ''} valor={duplicados} etiqueta={modoActualizar ? 'Repetidos en el archivo' : 'Duplicados (omitidos)'} />
            <TarjetaResumen tipo={errores.length ? 'err' : ''} valor={errores.length} etiqueta="Errores" />
            {(advertencias.length > 0 || advOmitidas > 0) && <TarjetaResumen tipo="warn" valor={advertencias.length + advOmitidas} etiqueta="Advertencias" />}
          </div>
        </div>

        {interrupcion && (
          <div role="alert" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--color-error-suave)', borderLeft: '4px solid var(--color-error)', color: 'var(--color-texto)', fontSize: '0.875rem', overflowWrap: 'anywhere' }}>
            <strong>La importación se interrumpió.</strong> {interrupcion}
            {' '}Revisa la lista antes de volver a importar: reimportar el archivo completo duplica las filas que no tienen CURP ni número de nómina.
          </div>
        )}

        {jefes && (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-texto)', margin: '0 0 1rem', overflowWrap: 'anywhere' }}>
            <strong>Jefes inmediatos:</strong> {jefes.asignados} asignados
            {jefes.sin_cambios ? `, ${jefes.sin_cambios} sin cambios` : ''}, {jefes.no_encontrados} no encontrados, {jefes.ciclos} con ciclo o auto-referencia
            {jefes.conflictos ? `, ${jefes.conflictos} con nómina y CURP contradictorias` : ''}
            {jefes.ambiguos ? `, ${jefes.ambiguos} con jefe ambiguo (varios empleados)` : ''}
            {jefes.no_activos ? `, ${jefes.no_activos} con jefe que no está activo` : ''}
            {jefes.pendientes ? `, ${jefes.pendientes} pendientes (no se pudieron asignar: ${jefes.error || 'importación interrumpida'})` : ''}.
          </p>
        )}

        {(resultado.turnos_asignados > 0 || resultado.turnos_cambiados > 0 || resultado.turnos_sin_cambio > 0) && (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-texto)', margin: '0 0 1rem' }}>
            <strong>Turnos:</strong> {resultado.turnos_asignados} asignados, {resultado.turnos_cambiados} cambiados, {resultado.turnos_sin_cambio} sin cambio.
          </p>
        )}

        {avisos.length > 0 && (
          <div role="alert" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--color-advertencia-suave)', borderLeft: '4px solid var(--color-advertencia)', color: 'var(--color-texto)', fontSize: '0.875rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>
              {sinDepto > 0 && `${sinDepto} ${sinDepto === 1 ? 'fila no pudo asignar departamento' : 'filas no pudieron asignar departamento'}. `}
              {sinPuesto > 0 && `${sinPuesto} ${sinPuesto === 1 ? 'fila no pudo asignar puesto' : 'filas no pudieron asignar puesto'}. `}
              {sinUbicacion > 0 && `${sinUbicacion} ${sinUbicacion === 1 ? 'fila no pudo asignar ubicación' : 'filas no pudieron asignar ubicación'}. `}
              Los empleados nuevos quedan sin ese dato (sin departamento no hay turno ni cupo de vacaciones) y los existentes conservan el que tenían: revisa el nombre en el catálogo.
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', overflowWrap: 'anywhere' }}>
              {avisos.map((a, i) => <li key={i}>{a.motivo}</li>)}
            </ul>
          </div>
        )}

        {advertencias.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-texto)', margin: '0 0 0.5rem' }}>
              Advertencias ({advertencias.length + advOmitidas}). Estas filas se importaron SIN el campo indicado:
              {advOmitidas > 0 ? ` se detallan las primeras ${advertencias.length}.` : ''}
            </p>
            <div tabIndex={0} role="region" aria-label="Advertencias" style={estilos.listaScroll}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={estilos.etiquetaCol}>Fila</th>
                    <th style={estilos.etiquetaCol}>Nombre</th>
                    <th style={estilos.etiquetaCol}>Campo</th>
                    <th style={estilos.etiquetaCol}>Valor recibido</th>
                    <th style={estilos.etiquetaCol}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {advertencias.map((a, i) => (
                    <tr key={i}>
                      <td style={estilos.celda}>{numeroFilaDeError(a) || '—'}</td>
                      <td style={{ ...estilos.celda, overflowWrap: 'anywhere' }}>{nombreDeError(a) || '—'}</td>
                      <td style={{ ...estilos.celda, overflowWrap: 'anywhere' }}>{etiquetas[a.campo] || a.campo}</td>
                      <td style={{ ...estilos.celda, overflowWrap: 'anywhere' }}>{a.valor_recibido || '—'}</td>
                      <td style={{ ...estilos.celda, overflowWrap: 'anywhere', minWidth: '10rem' }}>{a.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {detalleAct.length > 0 && (
          <details style={{ marginBottom: '1rem' }}>
            <summary style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-texto)', cursor: 'pointer' }}>
              {actualizados} actualizados (campos modificados por fila)
            </summary>
            <div tabIndex={0} role="region" aria-label="Empleados actualizados" style={{ ...estilos.listaScroll, marginTop: '0.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={estilos.etiquetaCol}>Fila</th>
                    <th style={estilos.etiquetaCol}>Nombre</th>
                    <th style={estilos.etiquetaCol}>Campos modificados</th>
                  </tr>
                </thead>
                <tbody>
                  {detalleAct.map((a, i) => (
                    <tr key={i}>
                      <td style={estilos.celda}>{numeroFilaDeError(a) || '—'}</td>
                      <td style={{ ...estilos.celda, overflowWrap: 'anywhere' }}>{nombreDeError(a) || '—'}</td>
                      <td style={estilos.celda}>{a.campos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {errores.length > 0 && (
          <div role="alert" style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-error)', margin: '0 0 0.5rem' }}>
              Filas con error ({errores.length}). El número de fila es el del archivo (la fila 1 es el encabezado):
            </p>
            <div tabIndex={0} role="region" aria-label="Filas con error" style={estilos.listaScroll}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={estilos.etiquetaCol}>Fila</th>
                    <th style={estilos.etiquetaCol}>Nombre</th>
                    <th style={estilos.etiquetaCol}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {errores.map((e, i) => (
                    <tr key={i}>
                      <td style={estilos.celda}>{numeroFilaDeError(e) || '—'}</td>
                      <td style={{ ...estilos.celda, overflowWrap: 'anywhere' }}>{nombreDeError(e) || '—'}</td>
                      <td style={{ ...estilos.celda, color: 'var(--color-error)', overflowWrap: 'anywhere', minWidth: '10rem' }}>{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {duplicados > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-texto)', margin: '0 0 0.5rem' }}>
              Duplicados omitidos ({duplicados}){detalleDup.length < duplicados ? `; se detallan los primeros ${detalleDup.length}` : ''}:
            </p>
            {detalleDup.length > 0 && (
              <div tabIndex={0} role="region" aria-label="Filas duplicadas" style={estilos.listaScroll}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={estilos.etiquetaCol}>Fila</th>
                      <th style={estilos.etiquetaCol}>Nombre</th>
                      <th style={estilos.etiquetaCol}>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleDup.map((d, i) => (
                      <tr key={i}>
                        <td style={estilos.celda}>{numeroFilaDeError(d) || '—'}</td>
                        <td style={{ ...estilos.celda, overflowWrap: 'anywhere' }}>{nombreDeError(d) || '—'}</td>
                        <td style={{ ...estilos.celda, overflowWrap: 'anywhere', minWidth: '10rem' }}>{d.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {(insertados > 0 || actualizados > 0) && errores.length === 0 && (
          <p style={{ color: 'var(--color-texto)', fontWeight: 600, marginTop: '0.5rem' }}>
            Importación completada sin errores.
          </p>
        )}
        {insertados === 0 && actualizados === 0 && (
          <p style={{ color: 'var(--color-texto)', fontWeight: 600, marginTop: '0.5rem' }}>
            No se insertó ni se actualizó ningún registro.
          </p>
        )}
      </div>

      <div style={estilos.pie}>
        {(errores.length > 0 || detalleDup.length > 0 || avisos.length > 0 || advertencias.length > 0 || detalleAct.length > 0) && (
          <button style={{ ...estilos.botonSecundario, color: 'var(--color-primario)', fontWeight: 600 }} onClick={() => descargarCsv(resultado, columnas)}>
            ⬇ Descargar errores (CSV)
          </button>
        )}
        <button style={estilos.botonSecundario} onClick={onNuevo}>Importar otro archivo</button>
        <button style={estilos.botonPrimario} onClick={onCerrar}>Cerrar</button>
      </div>
    </>
  );
}

const TEXTOS_MODO_POR_OMISION = {
  titulo: 'Qué hacer con los empleados que ya existen',
  ayuda: 'Se buscan por CURP y, si la fila no trae CURP, por número de nómina. Solo las celdas con valor sobrescriben: una celda vacía nunca borra datos.',
};

// ─── Componente principal ────────────────────────────────────────────────────

/**
 * Importador genérico de catálogos desde Excel/CSV.
 *
 * Props:
 *   titulo       — string
 *   columnas     — [{ clave, etiqueta, requerido, tipo }]  (tipo:'fecha' normaliza a AAAA-MM-DD)
 *   filasEjemplo — [{ clave: valor, ... }]  — datos de la plantilla descargable
 *   nombreArchivo — nombre del CSV de ejemplo a descargar (ej: 'plantilla_puestos.csv')
 *   permiteActualizar — bool: muestra el selector "Qué hacer con los empleados que ya existen" y envía { modo } como 2.º argumento
 *   textosModo — { titulo, ayuda } del selector (por omisión, los de empleados)
 *   onImportarJefes — async (pares) => { exito, datos }: segunda pasada opcional (jefes) con los pares devueltos en `jefes_pendientes`
 *   accionesDescarga — [{ etiqueta, onClick: async () => void }]: botones extra de la pantalla de selección (plantilla .xlsx, etc.)
 *   onImportar   — async (filas, { modo }) => { exito, datos: { insertados, duplicados, errores, duplicados_detalle } }
 *                  Se llama por lotes de TAMANO_LOTE filas (cada fila lleva `_fila`, su número en el archivo) y
 *                  el componente suma los resultados (el cuerpo global del backend admite 100 kb).
 *   onExito      — (resultado) => void  — SOLO recarga la lista: NO debe cerrar el modal, la vista de
 *                  resultados se queda abierta hasta que el usuario pulse Cerrar (onCancelar).
 *   onCancelar   — () => void
 */
// Espera para el reintento de un 409 (otra importación en curso)
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

export default function ImportadorArchivo({
  titulo, columnas, filasEjemplo, nombreArchivo, onImportar, onImportarJefes, permiteActualizar, textosModo, accionesDescarga,
  onExito, onCancelar,
}) {
  const [vista, setVista] = useState('seleccion');
  const [filas, setFilas] = useState([]);
  const [encabezados, setEncabezados] = useState({ reconocidas: [], ignoradas: [], faltantes: [] });
  const [modo, setModo] = useState('omitir');
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [errorApi, setErrorApi] = useState('');
  const [resultado, setResultado] = useState(null);
  const modalRef = useRef(null);

  const enCurso = useRef(false); // guardia contra doble clic: el estado `procesando` llega un render tarde

  useEffect(() => {
    // Al abrir, el foco pasa al diálogo; al desmontar vuelve al elemento que lo abrió (botón "Importar").
    const apertura = document.activeElement;
    if (modalRef.current) modalRef.current.focus();
    return () => { if (apertura && apertura.focus && document.contains(apertura)) apertura.focus(); };
  }, []);

  async function confirmarImportacion() {
    if (enCurso.current) return;
    enCurso.current = true;
    try {
      await ejecutarImportacion();
    } finally {
      enCurso.current = false;
    }
  }

  async function ejecutarImportacion() {
    const { enviar, omitidas } = separarFilas(filas, columnas);
    const lotes = dividirEnLotes(enviar, TAMANO_LOTE);
    setProcesando(true);
    setErrorApi('');
    let acumulado = resultadoVacio();
    let fallo = '';
    let loteFallido = -1;
    let seguro = false; // true: el servidor respondió que NO procesó el lote (400/401/403/413 o exito:false)
    let sinPermiso = false; // 401/403: se detiene todo (también la segunda pasada) con el mensaje de permisos
    let porOcupado = false; // 409 persistente: otra importación en curso; el lote NO se aplicó
    // Modo actualizar: el mismo empleado en lotes distintos se aplica una vez por lote y gana la última fila
    if (permiteActualizar && modo === 'actualizar') acumulado.advertencias = repeticionesEntreLotes(lotes).slice(0, MAX_ADVERTENCIAS);
    for (let i = 0; i < lotes.length; i++) {
      setProgreso({ actual: i + 1, total: lotes.length });
      // 409 = otra importación en curso (no se aplicó nada): se reintenta el MISMO lote tras 2 s, 5 s y 10 s
      const { resp, error: err, ocupado } = await enviarConReintento(
        () => onImportar(lotes[i], { modo: permiteActualizar ? modo : 'omitir' }),
        esperar, undefined, (n, de) => setProgreso({ actual: i + 1, total: lotes.length, reintento: n, de })
      );
      if (err) {
        porOcupado = ocupado;
        fallo = ocupado ? MENSAJE_OCUPADO : (err && err.message ? err.message : 'Error de conexión');
        sinPermiso = !!err && (err.status === 401 || err.status === 403);
        seguro = ocupado || (!!err && (err.status === 400 || err.status === 413 || sinPermiso));
        loteFallido = i;
        break;
      }
      if (!resp || !resp.exito) { fallo = (resp && resp.mensaje) || 'Error al importar'; seguro = true; loteFallido = i; break; }
      acumulado = sumarResultados(acumulado, resp.datos);
    }

    // Segunda pasada: jefe inmediato (el jefe puede venir en el mismo archivo, incluso en un lote posterior).
    const pares = acumulado.jefes_pendientes || [];
    if (onImportarJefes && pares.length) {
      let jefes = sumarJefes(null, null);
      let pendientes = pares.length;
      let errorJefes = '';
      // Los pares son SOLO de lotes confirmados: se asignan aunque otro lote haya fallado después (salvo sin permiso)
      if (!sinPermiso) {
        for (let k = 0; k < pares.length; k += MAX_PARES_JEFES) {
          const trozo = pares.slice(k, k + MAX_PARES_JEFES);
          setProgreso({ actual: 1, total: 1, jefes: true });
          {
            const { resp, error: errJefes, ocupado: ocupadoJefes } = await enviarConReintento(
              () => onImportarJefes(trozo), esperar, undefined, (n, de) => setProgreso({ actual: 1, total: 1, jefes: true, reintento: n, de })
            );
            if (errJefes) { errorJefes = ocupadoJefes ? MENSAJE_OCUPADO : (errJefes.message || 'Error de conexión'); break; }
            if (!resp || !resp.exito) { errorJefes = (resp && resp.mensaje) || 'Error al asignar jefes'; break; }
            jefes = sumarJefes(jefes, resp.datos);
            pendientes -= trozo.length;
            const nuevas = Array.isArray(resp.datos && resp.datos.advertencias) ? resp.datos.advertencias : [];
            const cupo = Math.max(0, MAX_ADVERTENCIAS - acumulado.advertencias.length);
            acumulado.advertencias = acumulado.advertencias.concat(nuevas.slice(0, cupo));
            acumulado.advertencias_omitidas += nuevas.length - Math.min(nuevas.length, cupo);
          }
        }
      } else {
        errorJefes = fallo;
      }
      jefes.pendientes = pendientes;
      if (pendientes) jefes.error = errorJefes;
      acumulado.jefes = jefes;
    }
    acumulado.modo = permiteActualizar ? modo : 'omitir';
    delete acumulado.jefes_pendientes;
    setProgreso(null);
    setProcesando(false);

    const nombreDe = (f) => [f.nombre, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ');
    let interrupcion = '';
    if (fallo) {
      // Se reportan TODAS las filas sin confirmar: el lote en vuelo puede haberse insertado aunque no llegara la
      // respuesta (no se dice "no se envió"); los lotes posteriores sí quedaron sin enviar.
      lotes.forEach((lote, i) => {
        if (i < loteFallido) return;
        lote.forEach(f => acumulado.errores.push({
          fila: f._fila, nombre: nombreDe(f),
          error: i === loteFallido
            ? (porOcupado ? MENSAJE_OCUPADO : seguro ? `No se envió: ${fallo}` : `Resultado no confirmado (lote ${i + 1} de ${lotes.length}): revisa la lista antes de reintentar`)
            : 'No se envió: la importación se interrumpió antes de este lote',
        }));
      });
      interrupcion = seguro
        ? `${fallo}.`
        : `No se pudo confirmar el resultado del lote ${loteFallido + 1} de ${lotes.length} (${fallo}).`;
    }
    acumulado.errores = omitidas.concat(acumulado.errores);

    // Falla segura en el primer lote: nada se insertó, se puede reintentar desde la vista previa.
    if (fallo && seguro && loteFallido === 0) {
      setErrorApi(fallo);
      return;
    }
    if (fallo) { acumulado.interrupcion = interrupcion; setErrorApi(`La importación se interrumpió: ${fallo}`); }
    setResultado(acumulado);
    setVista('resultado');
    onExito(acumulado);
  }

  function reiniciar() {
    setVista('seleccion');
    setFilas([]);
    setErrorApi('');
    setResultado(null);
  }

  function manejarTecla(e) {
    if (e.key === 'Escape' && !procesando) { onCancelar(); return; }
    if (e.key !== 'Tab' || !modalRef.current) return;
    // Trampa de foco: Tab/Shift+Tab no salen del diálogo.
    const foco = Array.from(modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.disabled && el.offsetParent !== null);
    if (!foco.length) { e.preventDefault(); return; }
    const primero = foco[0];
    const ultimo = foco[foco.length - 1];
    const activo = document.activeElement;
    if (e.shiftKey && (activo === primero || activo === modalRef.current)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && activo === ultimo) { e.preventDefault(); primero.focus(); }
  }

  return (
    <div style={estilos.overlay} onClick={(e) => e.target === e.currentTarget && !procesando && onCancelar()} onKeyDown={manejarTecla}>
      <div style={estilos.modal} role="dialog" aria-modal="true" aria-labelledby="importador-titulo" tabIndex={-1} ref={modalRef}>
        <div style={estilos.header}>
          <h2 id="importador-titulo" style={estilos.titulo}>{titulo || 'Importar desde archivo'}</h2>
          <button style={estilos.cerrar} onClick={onCancelar} aria-label="Cerrar" disabled={procesando}>×</button>
        </div>

        {errorApi && (
          <div role="alert" style={{ padding: '0.75rem 1.5rem', background: 'var(--color-error-suave)', color: 'var(--color-texto)', borderLeft: '4px solid var(--color-error)', fontSize: '0.875rem', overflowWrap: 'anywhere' }}>
            {errorApi}
          </div>
        )}

        {vista === 'seleccion' && (
          <VistaSeleccion
            columnas={columnas}
            filasEjemplo={filasEjemplo}
            nombreArchivo={nombreArchivo}
            accionesDescarga={accionesDescarga}
            onArchivo={(leido) => { setFilas(leido.filas); setEncabezados(leido.encabezados); setVista('preview'); }}
            onCancelar={onCancelar}
          />
        )}

        {vista === 'preview' && (
          <VistaPreview
            columnas={columnas}
            filas={filas}
            encabezados={encabezados}
            permiteActualizar={permiteActualizar}
            textosModo={{ ...TEXTOS_MODO_POR_OMISION, ...(textosModo || {}) }}
            modo={modo}
            onModo={setModo}
            procesando={procesando}
            progreso={progreso}
            onConfirmar={confirmarImportacion}
            onVolver={reiniciar}
          />
        )}

        {vista === 'resultado' && resultado && (
          <VistaResultado
            resultado={resultado}
            columnas={columnas}
            onNuevo={reiniciar}
            onCerrar={onCancelar}
          />
        )}
      </div>
    </div>
  );
}
