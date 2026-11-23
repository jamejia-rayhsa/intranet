// modules/comercial/frontend/pages/ConvenioDetalle.jsx
// Detalle de convenio: por cada línea de producto, pestañas con el resumen compras − ventas contra
// existencias, todas las órdenes de compra del producto y todas las facturas del cliente+producto
// (en vivo desde MBA3), más el historial de movimientos manuales de Fase 4.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  obtenerConvenio, obtenerEstadoConsumoConvenio, registrarMovimiento, obtenerDetalleMba3Linea,
} from '../services/convenios.service';
import PageHeader from '../../../portal/frontend/components/PageHeader';
import TarjetaKPI from '../../../portal/frontend/components/TarjetaKPI';
import '../styles/comercial.css';

const ETIQUETA_TIPO_MOVIMIENTO = {
  compra_inicial: 'Compra inicial',
  consumo: 'Consumo',
  devolucion: 'Devolución (resta del consumo)',
};

const PESTANAS = [
  { id: 'resumen', etiqueta: 'Resumen' },
  { id: 'ordenes', etiqueta: 'Órdenes de compra' },
  { id: 'facturas', etiqueta: 'Facturas' },
  { id: 'movimientos', etiqueta: 'Movimientos manuales' },
];

const MOVIMIENTO_VACIO = { cantidad: '', fecha_movimiento: '', orden_compra: '', comentario: '' };

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

function Comparativo({ resumen }) {
  const dif = resumen.diferencia;
  const ok = Math.abs(dif) < 0.0001;
  const texto = ok
    ? 'La existencia coincide con el saldo teórico (comprado − vendido).'
    : dif > 0
      ? `Hay ${fmt(dif)} piezas MÁS en existencia que el saldo teórico.`
      : `Faltan ${fmt(Math.abs(dif))} piezas en existencia respecto al saldo teórico (comprado − vendido).`;
  return (
    <div className={`convenio-comparativo ${ok ? 'convenio-comparativo--ok' : 'convenio-comparativo--alerta'}`} role="status">
      {texto}
    </div>
  );
}

function PestanaResumen({ mba3 }) {
  const r = mba3.resumen;
  return (
    <>
      <div className="grid-kpis">
        <TarjetaKPI titulo="Comprado (OC recibidas)" valor={fmt(r.comprado)} />
        <TarjetaKPI titulo="Vendido (facturas)" valor={fmt(r.vendido)} />
        <TarjetaKPI titulo="Saldo teórico" valor={fmt(r.saldo_teorico)} />
        <TarjetaKPI titulo="Existencia actual" valor={fmt(r.existencia)} />
        <TarjetaKPI
          titulo="Diferencia (existencia − saldo)"
          valor={fmt(r.diferencia)}
          color={Math.abs(r.diferencia) < 0.0001 ? 'var(--color-primario)' : 'var(--color-advertencia)'}
        />
      </div>
      <Comparativo resumen={r} />
      <p style={{ color: 'var(--color-texto-claro)', fontSize: '0.8rem' }}>
        Periodo: desde {mba3.desde} · {r.ordenes_compra} recepciones · {r.facturas} facturas · existencia al{' '}
        {String(mba3.existencias.actualizado_en).slice(0, 16).replace('T', ' ')} (UTC)
      </p>
      {mba3.existencias.almacenes.length > 0 && (
        <table className="credito-tabla">
          <thead><tr><th>Almacén</th><th>Nombre</th><th>Existencia</th></tr></thead>
          <tbody>
            {mba3.existencias.almacenes.map((a) => (
              <tr key={a.almacen}><td>{a.almacen}</td><td>{a.nombre || '—'}</td><td>{fmt(a.existencia)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function PestanaOrdenes({ mba3 }) {
  if (mba3.ordenes_compra.length === 0) return <p style={{ color: 'var(--color-texto-claro)' }}>Sin recepciones del producto desde {mba3.desde}.</p>;
  return (
    <table className="credito-tabla">
      <thead>
        <tr><th>Fecha</th><th>Orden de compra</th><th>Recepción</th><th>Proveedor</th><th>Cantidad</th><th>Costo unit.</th></tr>
      </thead>
      <tbody>
        {mba3.ordenes_compra.map((o) => (
          <tr key={`${o.documento}-${o.orden_compra}-${o.cantidad}`}>
            <td style={{ fontSize: '0.78rem' }}>{o.fecha}</td>
            <td>{o.orden_compra || '—'}</td>
            <td>{o.recepcion || '—'}</td>
            <td>{o.proveedor || '—'}</td>
            <td>{fmt(o.cantidad)} {o.unidad || ''}</td>
            <td>{o.costo_unitario === null ? '—' : `${fmt(o.costo_unitario)} ${o.moneda || ''}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PestanaFacturas({ mba3 }) {
  if (mba3.facturas.length === 0) return <p style={{ color: 'var(--color-texto-claro)' }}>Sin facturas de este cliente y producto desde {mba3.desde}.</p>;
  return (
    <table className="credito-tabla">
      <thead>
        <tr><th>Fecha</th><th>Factura</th><th>Sucursal</th><th>Cantidad</th><th>Precio</th><th>Total MXN</th></tr>
      </thead>
      <tbody>
        {mba3.facturas.map((f) => (
          <tr key={`${f.documento}-${f.cantidad}-${f.fecha}`}>
            <td style={{ fontSize: '0.78rem' }}>{f.fecha}</td>
            <td>{f.documento || '—'}</td>
            <td>{f.sucursal || '—'}</td>
            <td>{fmt(f.cantidad)}</td>
            <td>{f.precio === null ? '—' : `${fmt(f.precio)} ${f.moneda || ''}`}</td>
            <td>{fmt(f.total_mxn)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PestanaMovimientos({ producto, estado, puedeRegistrar, form, guardando, onCambio, onRegistrar }) {
  const sinCompraInicial = !estado.tiene_compra_inicial;
  return (
    <>
      {puedeRegistrar && (
        <div className="convenio-movimiento-form">
          <input placeholder="Cantidad *" type="number" min="0.0001" step="any" value={form.cantidad} onChange={(e) => onCambio('cantidad', e.target.value)} />
          <input placeholder="Fecha *" type="date" value={form.fecha_movimiento} onChange={(e) => onCambio('fecha_movimiento', e.target.value)} />
          <input placeholder="Orden de compra" value={form.orden_compra} onChange={(e) => onCambio('orden_compra', e.target.value)} />
          <input placeholder="Comentario" value={form.comentario} onChange={(e) => onCambio('comentario', e.target.value)} />
          <button className="btn-primario" disabled={guardando} onClick={() => onRegistrar(sinCompraInicial ? 'compra_inicial' : 'consumo')}>
            {guardando ? 'Guardando…' : sinCompraInicial ? 'Registrar compra inicial' : 'Registrar consumo'}
          </button>
        </div>
      )}
      {Array.isArray(estado.movimientos) && estado.movimientos.length > 0 ? (
        <table className="credito-tabla">
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Orden de compra</th><th>Comentario</th><th>Registrado por</th></tr>
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
      ) : (
        <p style={{ color: 'var(--color-texto-claro)' }}>Sin movimientos manuales para {producto.producto_descripcion}.</p>
      )}
    </>
  );
}

function LineaConvenio({ convenioId, producto, estado, puedeRegistrar, onMovimientoRegistrado, onError }) {
  const [pestana, setPestana] = useState('resumen');
  const [mba3, setMba3] = useState(null);
  const [cargandoMba3, setCargandoMba3] = useState(true);
  const [errorMba3, setErrorMba3] = useState('');
  const [form, setForm] = useState(MOVIMIENTO_VACIO);
  const [guardando, setGuardando] = useState(false);

  const cargarMba3 = useCallback(async (refrescar = false) => {
    setCargandoMba3(true);
    setErrorMba3('');
    try {
      const res = await obtenerDetalleMba3Linea(convenioId, producto.id, { refrescar });
      if (!res?.exito) throw new Error(res?.mensaje || 'No se pudo consultar MBA3');
      setMba3(res.datos);
    } catch (err) {
      setErrorMba3(err.message || 'No se pudo consultar MBA3');
    } finally {
      setCargandoMba3(false);
    }
  }, [convenioId, producto.id]);

  useEffect(() => { cargarMba3(); }, [cargarMba3]);

  async function registrar(tipo) {
    if (!form.cantidad || Number(form.cantidad) <= 0) return onError('La cantidad debe ser mayor a 0');
    if (!form.fecha_movimiento) return onError('La fecha del movimiento es requerida');
    onError('');
    setGuardando(true);
    try {
      await registrarMovimiento(convenioId, producto.id, {
        tipo,
        cantidad: Number(form.cantidad),
        fecha_movimiento: form.fecha_movimiento,
        orden_compra: form.orden_compra || null,
        comentario: form.comentario || null,
      });
      setForm(MOVIMIENTO_VACIO);
      await onMovimientoRegistrado();
    } catch (err) {
      onError(err.message || 'No se pudo registrar el movimiento');
    } finally {
      setGuardando(false);
    }
  }

  function contenidoMba3(Componente) {
    if (cargandoMba3) return <p style={{ color: 'var(--color-texto-claro)' }}>Consultando MBA3…</p>;
    if (errorMba3) {
      return (
        <p style={{ color: 'var(--color-error)' }}>
          {errorMba3} <button className="btn-secundario" onClick={() => cargarMba3()}>Reintentar</button>
        </p>
      );
    }
    return <Componente mba3={mba3} />;
  }

  return (
    <div className="convenio-linea-detalle">
      <h3>
        {producto.producto_descripcion}{' '}
        {producto.producto_codigo && <span style={{ color: 'var(--color-texto-claro)', fontWeight: 'normal' }}>({producto.producto_codigo})</span>}
      </h3>
      <p style={{ color: 'var(--color-texto-claro)', fontSize: '0.85rem' }}>
        Plan: {fmt(producto.cantidad_periodica)} {producto.unidad_medida || ''} / {producto.periodo}
        {mba3 && (
          <> · <button className="btn-secundario" onClick={() => cargarMba3(true)} disabled={cargandoMba3}>Actualizar desde MBA3</button></>
        )}
      </p>
      {mba3?.advertencias?.length > 0 && (
        <p style={{ color: 'var(--color-advertencia)', fontSize: '0.8rem' }}>Datos posiblemente incompletos: {mba3.advertencias.join(' · ')}</p>
      )}

      <div className="convenio-pestanas" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.id} role="tab" aria-selected={pestana === p.id} className="convenio-pestana"
            onClick={() => setPestana(p.id)}
          >
            {p.etiqueta}
            {mba3 && p.id === 'ordenes' && ` (${mba3.ordenes_compra.length})`}
            {mba3 && p.id === 'facturas' && ` (${mba3.facturas.length})`}
          </button>
        ))}
      </div>

      {pestana === 'resumen' && contenidoMba3(PestanaResumen)}
      {pestana === 'ordenes' && contenidoMba3(PestanaOrdenes)}
      {pestana === 'facturas' && contenidoMba3(PestanaFacturas)}
      {pestana === 'movimientos' && (
        <PestanaMovimientos
          producto={producto} estado={estado} puedeRegistrar={puedeRegistrar} form={form} guardando={guardando}
          onCambio={(campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))}
          onRegistrar={registrar}
        />
      )}
    </div>
  );
}

export default function ConvenioDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [convenio, setConvenio] = useState(null);
  const [lineasEstado, setLineasEstado] = useState({}); // producto_id -> estado de movimientos manuales
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    try {
      const [resConvenio, resEstado] = await Promise.all([obtenerConvenio(id), obtenerEstadoConsumoConvenio(id)]);
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

  if (cargando) return <p style={{ color: 'var(--color-texto-claro)' }}>Cargando…</p>;
  if (!convenio) return <p style={{ color: 'var(--color-error)' }}>{error || 'Convenio no encontrado'}</p>;

  const puedeRegistrar = convenio.estatus === 'autorizado';

  return (
    <>
      <PageHeader
        eyebrow="Módulo · Comercial"
        title={`Convenio — ${convenio.cliente_nombre}`}
        subtitle={`Vendedor: ${convenio.vendedor_nombre} · Estatus: ${convenio.estatus} · Inicio: ${String(convenio.fecha_inicio).slice(0, 10)}`}
        actions={<button className="btn-secundario" onClick={() => navigate('/comercial/convenios')}>Volver al listado</button>}
      />

      {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}

      {convenio.productos.map((p) => (
        <LineaConvenio
          key={p.id}
          convenioId={id}
          producto={p}
          estado={lineasEstado[p.id] || {}}
          puedeRegistrar={puedeRegistrar}
          onMovimientoRegistrado={cargar}
          onError={setError}
        />
      ))}
    </>
  );
}
