import { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  filasDesdeMatriz, separarFilas, dividirEnLotes, resultadoVacio, sumarResultados,
  construirCsvResultado, numeroFilaDeError, nombreDeError, TAMANO_LOTE,
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

function parsearArchivo(archivo, columnas) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // cellDates: las fechas llegan como Date (no como serial); raw: los CSV no se reinterpretan (mes/día de EE. UU.)
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true, raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws || !ws['!ref']) { resolve([]); return; }
        const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true });
        const filaEncabezado = XLSX.utils.decode_range(ws['!ref']).s.r + 1;
        resolve(filasDesdeMatriz(matriz, columnas, filaEncabezado));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(archivo);
  });
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

function VistaSeleccion({ columnas, filasEjemplo, nombreArchivo, onArchivo, onCancelar }) {
  const [arrastrandoSobre, setArrastrandoSobre] = useState(false);
  const [errorParseo, setErrorParseo] = useState('');
  const inputRef = useRef();

  async function procesarArchivo(archivo) {
    if (!archivo) return;
    const ext = archivo.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setErrorParseo('Formato no válido. Usa .xlsx, .xls o .csv');
      return;
    }
    try {
      const filas = await parsearArchivo(archivo, columnas);
      if (!filas.length) { setErrorParseo('El archivo no contiene datos'); return; }
      onArchivo(filas);
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
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            {columnas.map(c => (
              <span key={c.clave} style={estilos.chip(c.requerido ? 'err' : 'ok')}>
                {c.etiqueta}{c.requerido ? ' *' : ''}
              </span>
            ))}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-texto-claro)', margin: 0 }}>
            * Campo obligatorio. Los encabezados del archivo deben coincidir exactamente.
          </p>
        </div>
      </div>

      <div style={estilos.pie}>
        <button
          style={{ ...estilos.botonSecundario, color: 'var(--color-primario)', fontWeight: 600 }}
          onClick={() => descargarEjemplo(columnas, filasEjemplo, nombreArchivo)}
        >
          ⬇ Descargar plantilla de ejemplo
        </button>
        <button style={estilos.botonSecundario} onClick={onCancelar}>Cancelar</button>
      </div>
    </>
  );
}

function VistaPreview({ columnas, filas, procesando, progreso, onConfirmar, onVolver }) {
  const { enviar, omitidas } = useMemo(() => separarFilas(filas, columnas), [filas, columnas]);
  const porFila = useMemo(() => {
    const mapa = {};
    omitidas.forEach(o => { mapa[o.fila] = o.error; });
    return mapa;
  }, [omitidas]);
  const filasMostrar = filas.slice(0, 8);
  const restantes = filas.length - filasMostrar.length;

  return (
    <>
      <div style={estilos.cuerpo}>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={estilos.chip('ok')}>{filas.length} filas detectadas</span>
          {omitidas.length > 0
            ? <span style={estilos.chip('err')}>{omitidas.length} filas con errores (no se importarán)</span>
            : <span style={estilos.chip('ok')}>Sin errores de validación</span>}
        </div>

        <div tabIndex={0} role="region" aria-label="Vista previa de las primeras filas" style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid var(--color-borde)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th style={estilos.etiquetaCol}>Fila</th>
                {columnas.map(c => (
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
                  {columnas.map(c => (
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

        {restantes > 0 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-texto-medio)', marginTop: '0.5rem' }}>
            … y {restantes} filas más (no mostradas en la vista previa)
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
            Importando… lote {progreso.actual} de {progreso.total}
          </p>
        )}
      </div>

      <div style={estilos.pie}>
        <button style={estilos.botonSecundario} onClick={onVolver} disabled={procesando}>
          ← Seleccionar otro
        </button>
        <button
          style={{ ...estilos.botonPrimario, opacity: procesando || enviar.length === 0 ? 0.7 : 1 }}
          onClick={onConfirmar}
          disabled={procesando || enviar.length === 0}
        >
          {procesando ? 'Importando…' : `Importar ${enviar.length} registros`}
        </button>
      </div>
    </>
  );
}

function descargarCsv(resultado) {
  const csv = construirCsvResultado(resultado.errores, resultado.duplicados_detalle);
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

function VistaResultado({ resultado, onNuevo, onCerrar }) {
  const { insertados = 0, duplicados = 0, errores = [], duplicados_detalle: detalleDup = [] } = resultado;
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
            <TarjetaResumen tipo={duplicados ? 'warn' : ''} valor={duplicados} etiqueta="Duplicados (omitidos)" />
            <TarjetaResumen tipo={errores.length ? 'err' : ''} valor={errores.length} etiqueta="Errores" />
          </div>
        </div>

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

        {insertados > 0 && errores.length === 0 && (
          <p style={{ color: 'var(--color-texto)', fontWeight: 600, marginTop: '0.5rem' }}>
            Importación completada sin errores.
          </p>
        )}
        {insertados === 0 && (
          <p style={{ color: 'var(--color-texto)', fontWeight: 600, marginTop: '0.5rem' }}>
            No se insertó ningún registro.
          </p>
        )}
      </div>

      <div style={estilos.pie}>
        {(errores.length > 0 || detalleDup.length > 0) && (
          <button style={{ ...estilos.botonSecundario, color: 'var(--color-primario)', fontWeight: 600 }} onClick={() => descargarCsv(resultado)}>
            ⬇ Descargar errores (CSV)
          </button>
        )}
        <button style={estilos.botonSecundario} onClick={onNuevo}>Importar otro archivo</button>
        <button style={estilos.botonPrimario} onClick={onCerrar}>Cerrar</button>
      </div>
    </>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

/**
 * Importador genérico de catálogos desde Excel/CSV.
 *
 * Props:
 *   titulo       — string
 *   columnas     — [{ clave, etiqueta, requerido, tipo }]  (tipo:'fecha' normaliza a AAAA-MM-DD)
 *   filasEjemplo — [{ clave: valor, ... }]  — datos de la plantilla descargable
 *   nombreArchivo — nombre del CSV de ejemplo a descargar (ej: 'plantilla_puestos.csv')
 *   onImportar   — async (filas) => { exito, datos: { insertados, duplicados, errores, duplicados_detalle } }
 *                  Se llama por lotes de TAMANO_LOTE filas (cada fila lleva `_fila`, su número en el archivo) y
 *                  el componente suma los resultados (el cuerpo global del backend admite 100 kb).
 *   onExito      — (resultado) => void  — SOLO recarga la lista: NO debe cerrar el modal, la vista de
 *                  resultados se queda abierta hasta que el usuario pulse Cerrar (onCancelar).
 *   onCancelar   — () => void
 */
export default function ImportadorArchivo({ titulo, columnas, filasEjemplo, nombreArchivo, onImportar, onExito, onCancelar }) {
  const [vista, setVista] = useState('seleccion');
  const [filas, setFilas] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [errorApi, setErrorApi] = useState('');
  const [resultado, setResultado] = useState(null);
  const modalRef = useRef(null);

  useEffect(() => { if (modalRef.current) modalRef.current.focus(); }, []);

  async function confirmarImportacion() {
    const { enviar, omitidas } = separarFilas(filas, columnas);
    const lotes = dividirEnLotes(enviar, TAMANO_LOTE);
    setProcesando(true);
    setErrorApi('');
    let acumulado = resultadoVacio();
    let fallo = '';
    let enviadas = 0;
    try {
      for (let i = 0; i < lotes.length; i++) {
        setProgreso({ actual: i + 1, total: lotes.length });
        const resp = await onImportar(lotes[i]);
        if (!resp || !resp.exito) { fallo = (resp && resp.mensaje) || 'Error al importar'; break; }
        acumulado = sumarResultados(acumulado, resp.datos);
        enviadas += lotes[i].length;
      }
    } catch (err) {
      fallo = err && err.message ? err.message : 'Error de conexión';
    }
    setProgreso(null);
    setProcesando(false);

    if (fallo) {
      // Lo que no se llegó a enviar se reporta como error para que el CSV incluya todas las filas con problema.
      enviar.slice(enviadas).forEach(f => acumulado.errores.push({
        fila: f._fila, nombre: [f.nombre, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' '),
        error: 'No se envió: ' + fallo,
      }));
    }
    acumulado.errores = omitidas.concat(acumulado.errores);

    if (fallo && enviadas === 0) {
      setErrorApi(fallo);
      return;
    }
    if (fallo) setErrorApi(`La importación se interrumpió: ${fallo}`);
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
    if (e.key === 'Escape' && !procesando) onCancelar();
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
            onArchivo={(f) => { setFilas(f); setVista('preview'); }}
            onCancelar={onCancelar}
          />
        )}

        {vista === 'preview' && (
          <VistaPreview
            columnas={columnas}
            filas={filas}
            procesando={procesando}
            progreso={progreso}
            onConfirmar={confirmarImportacion}
            onVolver={reiniciar}
          />
        )}

        {vista === 'resultado' && resultado && (
          <VistaResultado
            resultado={resultado}
            onNuevo={reiniciar}
            onCerrar={onCancelar}
          />
        )}
      </div>
    </div>
  );
}
