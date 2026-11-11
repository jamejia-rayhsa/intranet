// modules/comercial/frontend/pages/ConvenioDetalle.jsx
// Fase 4: análisis de consumo por línea de producto — compra inicial, consumo registrado, stock
// restante y tiempo estimado para agotarlo (ritmo real si ya hay movimientos, si no el plan).

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  obtenerConvenio, obtenerEstadoConsumoConvenio, registrarMovimiento,
} from '../services/convenios.service';
import PageHeader from '../../../portal/frontend/components/PageHeader';
import TarjetaKPI from '../../../portal/frontend/components/TarjetaKPI';
import '../styles/comercial.css';

const ETIQUETA_TIPO_MOVIMIENTO = {
  compra_inicial: 'Compra inicial',
  consumo: 'Consumo',
  devolucion: 'Devolución (resta del consumo)',
};

const MOVIMIENTO_VACIO ={ cantidad: '', fecha_movimiento: '', orden_compra: '', comentario: '' };

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

export default function ConvenioDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [convenio, setConvenio] = useState(null);
  const [lineasEstado, setLineasEstado] = useState({}); // producto_id -> estado
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [formularios, setFormularios] = useState({}); // producto_id -> datos del movimiento a registrar
  const [guardando, setGuardando] = useState({}); // producto_id -> bool

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [resConvenio, resEstado] = await Promise.all([
        obtenerConvenio(id),
        obtenerEstadoConsumoConvenio(id),
      ]);
      if (!resConvenio?.exito) throw new Error(resConvenio?.mensaje || 'No se pudo cargar el convenio');
      setConvenio(resConvenio.datos);
      const mapa = {};
      for (const linea of resEstado?.datos?.lineas || []) mapa[linea.producto_id] = linea;
      setLineasEstado(mapa);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el convenio');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  function cambiarFormulario(productoId, campo, valor) {
    setFormularios((f) => ({
      ...f,
      [productoId]: { ...(f[productoId] || MOVIMIENTO_VACIO), [campo]: valor },
    }));
  }

  async function registrar(productoId, tipo) {
    const datos = formularios[productoId] || MOVIMIENTO_VACIO;
    if (!datos.cantidad || Number(datos.cantidad) <= 0) {
      setError('La cantidad debe ser mayor a 0');
      return;
    }
    if (!datos.fecha_movimiento) {
      setError('La fecha del movimiento es requerida');
      return;
    }
    setError('');
    setGuardando((g) => ({ ...g, [productoId]: true }));
    try {
      await registrarMovimiento(id, productoId, {
        tipo,
        cantidad: Number(datos.cantidad),
        fecha_movimiento: datos.fecha_movimiento,
        orden_compra: datos.orden_compra || null,
        comentario: datos.comentario || null,
      });
      setFormularios((f) => ({ ...f, [productoId]: { ...MOVIMIENTO_VACIO } }));
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo registrar el movimiento');
    } finally {
      setGuardando((g) => ({ ...g, [productoId]: false }));
    }
  }

  if (cargando) return <p style={{ color: 'var(--color-texto-claro)' }}>Cargando…</p>;
  if (!convenio) return <p style={{ color: 'var(--color-error)' }}>{error || 'Convenio no encontrado'}</p>;

  const puedeRegistrar = convenio.estatus === 'autorizado';

  return (
    <>
      <PageHeader
        eyebrow="Módulo · Comercial"
        title={`Convenio — ${convenio.cliente_nombre}`}
        subtitle={`Vendedor: ${convenio.vendedor_nombre} · Estatus: ${convenio.estatus}`}
        actions={<button className="btn-secundario" onClick={() => navigate('/comercial/convenios')}>Volver al listado</button>}
      />

      {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}

      {!puedeRegistrar && (
        <p style={{ color: 'var(--color-texto-claro)' }}>
          Solo se pueden registrar movimientos sobre un convenio autorizado. Este convenio está en estatus «{convenio.estatus}».
        </p>
      )}

      {convenio.productos.map((p) => {
        const estado = lineasEstado[p.id] || {};
        const form = formularios[p.id] || MOVIMIENTO_VACIO;
        const sinCompraInicial = !estado.tiene_compra_inicial;

        return (
          <div key={p.id} className="convenio-linea-detalle">
            <h3>{p.producto_descripcion} {p.producto_codigo && <span style={{ color: 'var(--color-texto-claro)', fontWeight: 'normal' }}>({p.producto_codigo})</span>}</h3>
            <p style={{ color: 'var(--color-texto-claro)', fontSize: '0.85rem' }}>
              Plan: {fmt(p.cantidad_periodica)} {p.unidad_medida || ''} / {p.periodo}
            </p>

            <div className="grid-kpis">
              <TarjetaKPI titulo="Comprado" valor={fmt(estado.stock_comprado)} />
              <TarjetaKPI titulo="Consumido" valor={fmt(estado.stock_consumido)} />
              <TarjetaKPI
                titulo="Restante"
                valor={fmt(estado.stock_restante)}
                color={estado.stock_restante <= 0 ? 'var(--color-error)' : 'var(--color-primario)'}
              />
              <TarjetaKPI
                titulo="Ritmo usado"
                valor={`${fmt(estado.ritmo_usado)} ${estado.ritmo_es_real ? '(real)' : '(plan)'}`}
              />
              <TarjetaKPI
                titulo="Tiempo estimado restante"
                valor={
                  estado.periodos_restantes_estimados === null
                    ? 'Sin datos suficientes'
                    : estado.periodos_restantes_estimados === 0
                      ? 'Agotado'
                      : `${fmt(estado.periodos_restantes_estimados)} periodos${estado.fecha_estimada_agotamiento ? ` (≈ ${estado.fecha_estimada_agotamiento})` : ''}`
                }
                color={estado.periodos_restantes_estimados === 0 ? 'var(--color-error)' : 'var(--color-advertencia)'}
              />
            </div>

            {puedeRegistrar && (
              <div className="convenio-movimiento-form">
                <input
                  placeholder="Cantidad *" type="number" min="0.0001" step="any"
                  value={form.cantidad} onChange={(e) => cambiarFormulario(p.id, 'cantidad', e.target.value)}
                />
                <input
                  placeholder="Fecha *" type="date"
                  value={form.fecha_movimiento} onChange={(e) => cambiarFormulario(p.id, 'fecha_movimiento', e.target.value)}
                />
                <input
                  placeholder="Orden de compra"
                  value={form.orden_compra} onChange={(e) => cambiarFormulario(p.id, 'orden_compra', e.target.value)}
                />
                <input
                  placeholder="Comentario"
                  value={form.comentario} onChange={(e) => cambiarFormulario(p.id, 'comentario', e.target.value)}
                />
                {sinCompraInicial ? (
                  <button
                    className="btn-primario" disabled={guardando[p.id]}
                    onClick={() => registrar(p.id, 'compra_inicial')}
                  >
                    {guardando[p.id] ? 'Guardando…' : 'Registrar compra inicial'}
                  </button>
                ) : (
                  <button
                    className="btn-primario" disabled={guardando[p.id]}
                    onClick={() => registrar(p.id, 'consumo')}
                  >
                    {guardando[p.id] ? 'Guardando…' : 'Registrar consumo'}
                  </button>
                )}
              </div>
            )}

            {Array.isArray(estado.movimientos) && estado.movimientos.length > 0 && (
              <table className="credito-tabla">
                <thead>
                  <tr>
                    <th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Orden de compra</th><th>Comentario</th><th>Registrado por</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.movimientos.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontSize: '0.78rem' }}>{String(m.fecha_movimiento).slice(0, 10)}</td>
                      <td>{ETIQUETA_TIPO_MOVIMIENTO[m.tipo] || m.tipo}</td>
                      <td>{fmt(m.cantidad)}</td>
                      <td>{m.orden_compra || '—'}</td>
                      <td>{m.comentario || '—'}</td>
                      <td>
                        {m.origen === 'mba3'
                          ? 'MBA3 (automático)'
                          : [m.registrado_por_nombre, m.registrado_por_apellido].filter(Boolean).join(' ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </>
  );
}
