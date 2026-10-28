import ImportadorArchivo from './ImportadorArchivo';
import { solicitar } from '../utils/api';
import {
  COLUMNAS_USUARIOS, FILAS_EJEMPLO_USUARIOS, NOMBRE_PLANTILLA_USUARIOS, MAX_FILAS_USUARIOS, MAX_BYTES_ARCHIVO_USUARIOS,
  ETIQUETAS_RESULTADO_USUARIOS, AVISO_IMPORTACION_USUARIOS, ETIQUETAS_ESTADO_USUARIOS, TIPO_CHIP_ESTADO_USUARIOS,
  resumirVerificacion, detalleFilaVerificacion, textoBotonAplicar, filasParaServidor,
} from '../utils/importarUsuarios';

const chip = (tipo) => ({
  display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
  background: tipo === 'ok' ? 'var(--color-exito-suave)' : tipo === 'warn' ? 'var(--color-advertencia-suave)' : 'var(--color-error-suave)',
  color: 'var(--color-texto)',
  border: `1px solid ${tipo === 'ok' ? 'var(--color-exito)' : tipo === 'warn' ? 'var(--color-advertencia)' : 'var(--color-error)'}`,
});
const th = {
  fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-texto)', textTransform: 'uppercase', letterSpacing: '0.04em',
  padding: '0.5rem 0.75rem', background: 'var(--color-fondo)', borderBottom: '2px solid var(--color-borde)', textAlign: 'left', whiteSpace: 'nowrap',
};
const td = { padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-borde)', fontSize: '0.85rem', overflowWrap: 'anywhere' };

// Resultado de la vista previa del servidor: una fila por fila del archivo (nada se ha creado todavía).
function VistaVerificacion({ datos }) {
  const filas = Array.isArray(datos && datos.filas) ? datos.filas : [];
  const r = resumirVerificacion(filas);
  return (
    <div>
      <div role="status" style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <span style={chip('ok')}>{r.crear} por crear</span>
        <span style={chip(r.omitir ? 'warn' : 'ok')}>{r.omitir} se omitirán (ya existen)</span>
        <span style={chip(r.error ? 'err' : 'ok')}>{r.error} con error</span>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-texto)', margin: '0 0 0.5rem' }}>
        Vista previa del servidor: todavía no se creó nada. Revisa a quién se vinculará cada cuenta; las filas con error no se crearán.
      </p>
      <div tabIndex={0} role="region" aria-label="Vista previa de las cuentas por crear" style={{ maxHeight: '40vh', overflow: 'auto', borderRadius: '6px', border: '1px solid var(--color-borde)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Fila</th>
              <th style={th}>Correo</th>
              <th style={th}>Nombre</th>
              <th style={th}>Resultado</th>
              <th style={th}>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.fila}>
                <td style={td}>{f.fila}</td>
                <td style={td}>{f.correo || '—'}</td>
                <td style={td}>{f.nombre || '—'}</td>
                <td style={td}><span style={chip(TIPO_CHIP_ESTADO_USUARIOS[f.estado] || 'err')}>{ETIQUETAS_ESTADO_USUARIOS[f.estado] || 'Error'}</span></td>
                <td style={{ ...td, minWidth: '12rem' }}>{detalleFilaVerificacion(f) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * "Importar usuarios" (solo super_admin): alta masiva de cuentas Microsoft con rol rh_empleado y vínculo con el empleado.
 * Flujo: archivo -> vista previa del servidor (obligatoria, no escribe) -> aplicar -> reporte por fila.
 */
export default function ImportarUsuariosDialogo({ onCerrar, onImportado }) {
  const verificar = {
    ejecutar: async (filas) => {
      const resp = await solicitar('/usuarios/importar/vista-previa', {
        method: 'POST',
        body: JSON.stringify({ filas: filasParaServidor(filas) }),
      });
      if (!resp || !resp.exito) throw new Error((resp && resp.mensaje) || 'No se pudo verificar el archivo');
      return resp.datos;
    },
    vista: (datos) => <VistaVerificacion datos={datos} />,
    puedeAplicar: (datos) => resumirVerificacion(datos && datos.filas).crear > 0,
    textoBoton: (datos) => textoBotonAplicar(resumirVerificacion(datos && datos.filas)),
  };
  return (
    <ImportadorArchivo
      titulo="Importar usuarios"
      columnas={COLUMNAS_USUARIOS}
      filasEjemplo={FILAS_EJEMPLO_USUARIOS}
      nombreArchivo={NOMBRE_PLANTILLA_USUARIOS}
      maxFilas={MAX_FILAS_USUARIOS}
      maxBytesArchivo={MAX_BYTES_ARCHIVO_USUARIOS}
      etiquetasResultado={ETIQUETAS_RESULTADO_USUARIOS}
      aviso={AVISO_IMPORTACION_USUARIOS}
      verificar={verificar}
      onImportar={(filas) => solicitar('/usuarios/importar', {
        method: 'POST',
        body: JSON.stringify({ filas: filasParaServidor(filas), confirmar: true }),
      })}
      onExito={() => { if (onImportado) onImportado(); }}
      onCancelar={onCerrar}
    />
  );
}
