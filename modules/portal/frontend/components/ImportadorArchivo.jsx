import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

const estilos = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '1rem',
  },
  modal: {
    background: 'var(--color-superficie)', borderRadius: '10px',
    width: '100%', maxWidth: '760px', maxHeight: '90vh',
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
  cuerpo: { padding: '1.5rem', overflowY: 'auto', flex: 1 },
  pie: {
    padding: '1rem 1.5rem', borderTop: '1px solid var(--color-borde)',
    display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
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
  celdaVacia: { padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-borde)', fontSize: '0.875rem', color: '#c0392b', fontStyle: 'italic' },
  chip: (tipo) => ({
    display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '12px',
    fontSize: '0.75rem', fontWeight: 600,
    background: tipo === 'ok' ? '#d1f2eb' : tipo === 'warn' ? '#fff3cd' : '#fde8e8',
    color: tipo === 'ok' ? '#1a7a5e' : tipo === 'warn' ? '#856404' : '#c0392b',
  }),
  resumen: {
    display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap',
  },
  tarjetaResumen: (tipo) => ({
    flex: 1, minWidth: '120px', padding: '1rem', borderRadius: '8px', textAlign: 'center',
    background: tipo === 'ok' ? '#d1f2eb' : tipo === 'warn' ? '#fff3cd' : tipo === 'err' ? '#fde8e8' : 'var(--color-fondo)',
    border: `1px solid ${tipo === 'ok' ? '#a8e6cf' : tipo === 'warn' ? '#ffc107' : tipo === 'err' ? '#f5c6c6' : 'var(--color-borde)'}`,
  }),
};

function parsearArchivo(archivo, columnas) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const filasCrudas = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!filasCrudas.length) { resolve([]); return; }

        // Mapa flexible: etiqueta o clave (case-insensitive) → clave interna
        const mapaClaves = {};
        columnas.forEach(c => {
          mapaClaves[c.etiqueta.toLowerCase()] = c.clave;
          mapaClaves[c.clave.toLowerCase()] = c.clave;
        });

        const filasNormalizadas = filasCrudas.map(fila => {
          const nueva = {};
          Object.keys(fila).forEach(k => {
            const clave = mapaClaves[k.toLowerCase().trim()];
            if (clave) nueva[clave] = String(fila[k]).trim();
          });
          return nueva;
        });
        resolve(filasNormalizadas);
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

function validarFilas(filas, columnas) {
  const requeridas = columnas.filter(c => c.requerido).map(c => c.clave);
  return filas.map(fila => {
    const faltantes = requeridas.filter(c => !fila[c]);
    return { ...fila, __errores: faltantes };
  });
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

function VistaPreview({ columnas, filas, procesando, onConfirmar, onVolver }) {
  const filasValidadas = validarFilas(filas, columnas);
  const conError = filasValidadas.filter(f => f.__errores.length > 0).length;
  const filasMostrar = filasValidadas.slice(0, 8);
  const restantes = filas.length - filasMostrar.length;

  return (
    <>
      <div style={estilos.cuerpo}>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={estilos.chip('ok')}>{filas.length} filas detectadas</span>
          {conError > 0 && <span style={estilos.chip('err')}>{conError} filas con campos requeridos vacíos</span>}
          {conError === 0 && <span style={estilos.chip('ok')}>Sin errores de validación</span>}
        </div>

        <div style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid var(--color-borde)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                {columnas.map(c => (
                  <th key={c.clave} style={estilos.etiquetaCol}>
                    {c.etiqueta}{c.requerido ? ' *' : ''}
                  </th>
                ))}
                <th style={estilos.etiquetaCol}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filasMostrar.map((fila, i) => (
                <tr key={i} style={{ background: fila.__errores.length ? '#fff8f8' : 'transparent' }}>
                  {columnas.map(c => (
                    <td key={c.clave} style={c.requerido && !fila[c.clave] ? estilos.celdaVacia : estilos.celda}>
                      {fila[c.clave] || (c.requerido ? '(vacío)' : '—')}
                    </td>
                  ))}
                  <td style={estilos.celda}>
                    <span style={estilos.chip(fila.__errores.length ? 'err' : 'ok')}>
                      {fila.__errores.length ? `Falta: ${fila.__errores.join(', ')}` : 'OK'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {restantes > 0 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-texto-claro)', marginTop: '0.5rem' }}>
            … y {restantes} filas más (no mostradas en la vista previa)
          </p>
        )}

        {conError > 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-error)', marginTop: '0.75rem' }}>
            Las filas con errores de validación no serán importadas.
          </p>
        )}
      </div>

      <div style={estilos.pie}>
        <button style={estilos.botonSecundario} onClick={onVolver} disabled={procesando}>
          ← Seleccionar otro
        </button>
        <button
          style={{ ...estilos.botonPrimario, opacity: procesando ? 0.7 : 1 }}
          onClick={onConfirmar}
          disabled={procesando}
        >
          {procesando ? 'Importando…' : `Importar ${filas.length - conError} registros`}
        </button>
      </div>
    </>
  );
}

function VistaResultado({ resultado, onNuevo, onCerrar }) {
  const { insertados = 0, duplicados = 0, errores = [] } = resultado;
  return (
    <>
      <div style={estilos.cuerpo}>
        <div style={estilos.resumen}>
          <div style={estilos.tarjetaResumen('ok')}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1a7a5e' }}>{insertados}</div>
            <div style={{ fontSize: '0.8rem', color: '#1a7a5e', fontWeight: 600 }}>Insertados</div>
          </div>
          <div style={estilos.tarjetaResumen('warn')}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#856404' }}>{duplicados}</div>
            <div style={{ fontSize: '0.8rem', color: '#856404', fontWeight: 600 }}>Duplicados (omitidos)</div>
          </div>
          <div style={estilos.tarjetaResumen(errores.length ? 'err' : '')}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: errores.length ? '#c0392b' : 'var(--color-texto-claro)' }}>
              {errores.length}
            </div>
            <div style={{ fontSize: '0.8rem', color: errores.length ? '#c0392b' : 'var(--color-texto-claro)', fontWeight: 600 }}>Errores</div>
          </div>
        </div>

        {errores.length > 0 && (
          <div>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-error)', marginBottom: '0.5rem' }}>
              Filas con error:
            </p>
            <div style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid var(--color-borde)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={estilos.etiquetaCol}>Fila</th>
                    <th style={estilos.etiquetaCol}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {errores.slice(0, 20).map((e, i) => (
                    <tr key={i}>
                      <td style={estilos.celda}>{JSON.stringify(e.fila)}</td>
                      <td style={{ ...estilos.celda, color: 'var(--color-error)' }}>{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {insertados > 0 && errores.length === 0 && (
          <p style={{ color: '#1a7a5e', fontWeight: 600, marginTop: '0.5rem' }}>
            Importación completada sin errores.
          </p>
        )}
      </div>

      <div style={estilos.pie}>
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
 *   columnas     — [{ clave, etiqueta, requerido }]
 *   filasEjemplo — [{ clave: valor, ... }]  — datos de la plantilla descargable
 *   nombreArchivo — nombre del CSV de ejemplo a descargar (ej: 'plantilla_puestos.csv')
 *   onImportar   — async (filas) => { exito, datos: { insertados, duplicados, errores } }
 *   onExito      — (resultado) => void  — se llama tras importación exitosa
 *   onCancelar   — () => void
 */
export default function ImportadorArchivo({ titulo, columnas, filasEjemplo, nombreArchivo, onImportar, onExito, onCancelar }) {
  const [vista, setVista] = useState('seleccion');
  const [filas, setFilas] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [errorApi, setErrorApi] = useState('');
  const [resultado, setResultado] = useState(null);

  async function confirmarImportacion() {
    const filasValidas = validarFilas(filas, columnas).filter(f => f.__errores.length === 0);
    const filasLimpias = filasValidas.map(({ __errores, ...resto }) => resto);
    setProcesando(true);
    setErrorApi('');
    try {
      const resp = await onImportar(filasLimpias);
      if (resp.exito) {
        setResultado(resp.datos);
        setVista('resultado');
        onExito(resp.datos);
      } else {
        setErrorApi(resp.mensaje || 'Error al importar');
      }
    } catch (err) {
      setErrorApi(err.message || 'Error de conexión');
    } finally {
      setProcesando(false);
    }
  }

  function reiniciar() {
    setVista('seleccion');
    setFilas([]);
    setErrorApi('');
    setResultado(null);
  }

  return (
    <div style={estilos.overlay} onClick={(e) => e.target === e.currentTarget && onCancelar()}>
      <div style={estilos.modal}>
        <div style={estilos.header}>
          <h2 style={estilos.titulo}>{titulo || 'Importar desde archivo'}</h2>
          <button style={estilos.cerrar} onClick={onCancelar}>×</button>
        </div>

        {errorApi && (
          <div style={{ padding: '0.75rem 1.5rem', background: '#fde8e8', color: '#c0392b', fontSize: '0.875rem' }}>
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
