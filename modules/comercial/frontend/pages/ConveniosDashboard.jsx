// modules/comercial/frontend/pages/ConveniosDashboard.jsx
// Fase 5: dashboard de convenios — KPIs globales (activos, por vencer, vencidos, sin movimientos
// recientes; umbrales decididos por el humano: 30 días para "por vencer", 60 días sin movimiento)
// y resumen de consumo/vigencia por convenio con semáforo.

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { obtenerDashboardConvenios } from '../services/convenios.service';
import PageHeader from '../../../portal/frontend/components/PageHeader';
import TarjetaKPI from '../../../portal/frontend/components/TarjetaKPI';
import BarraProgreso from '../../../portal/frontend/components/BarraProgreso';
import '../styles/comercial.css';

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

function badgeClass(estatus) {
  return `credito-badge credito-badge-${estatus === 'pendiente_autorizacion' ? 'guardada' : estatus === 'autorizado' ? 'aprobada' : estatus === 'rechazado' ? 'rechazada' : 'borrador'}`;
}

// Semáforo de consumo: sin compra inicial todavía = neutral; agotado o cerca = rojo; acercándose
// al límite = ámbar; holgado = verde.
function estadoConsumo(c) {
  const comprado = Number(c.stock_comprado) || 0;
  const consumido = Number(c.stock_consumido) || 0;
  if (comprado <= 0) {
    return { color: 'var(--color-texto-claro)', porcentaje: 0, etiqueta: 'Sin compra inicial registrada' };
  }
  const restante = comprado - consumido;
  const pct = Math.min(100, (consumido / comprado) * 100);
  const color = restante <= 0 || pct >= 90 ? 'var(--color-error)'
    : pct >= 70 ? 'var(--color-advertencia)'
      : 'var(--color-exito)';
  return { color, porcentaje: pct, etiqueta: `${fmt(pct)}% consumido · ${fmt(restante)} restante` };
}

// Semáforo de vigencia: vencido = rojo; dentro de la ventana de "por vencer" (30 días) = ámbar;
// resto (o abierta, sin vigente_hasta) = verde.
function estadoVigencia(c) {
  if (c.vencido) {
    return { color: 'var(--color-error)', porcentaje: 100, etiqueta: 'Vencido' };
  }
  if (c.dias_para_vencer === null || c.dias_para_vencer === undefined) {
    return { color: 'var(--color-exito)', porcentaje: 0, etiqueta: 'Abierta' };
  }
  const dias = Number(c.dias_para_vencer);
  if (dias <= 30) {
    return { color: 'var(--color-advertencia)', porcentaje: Math.max(0, 100 - (dias / 30) * 100), etiqueta: `Vence en ${dias} día(s)` };
  }
  return { color: 'var(--color-exito)', porcentaje: 0, etiqueta: `Vence en ${dias} días` };
}

export default function ConveniosDashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await obtenerDashboardConvenios();
      if (res?.exito) setDatos(res.datos);
      else setError(res?.mensaje || 'No se pudo cargar el dashboard');
    } catch (err) {
      setError(err.message || 'No se pudo cargar el dashboard');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <>
      <PageHeader
        eyebrow="Módulo · Comercial"
        title="Convenios de compra — Dashboard"
        subtitle="Estado global de los convenios: vigencia y consumo real contra lo comprado"
        actions={<Link to="/comercial/convenios" className="btn-secundario">Ver listado</Link>}
      />

      {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}

      {cargando ? (
        <p style={{ color: 'var(--color-texto-claro)' }}>Cargando…</p>
      ) : datos && (
        <>
          <div className="grid-kpis" style={{ marginBottom: '1.5rem' }}>
            <TarjetaKPI titulo="Activos" valor={datos.kpis.activos} color="var(--color-primario)" />
            <TarjetaKPI titulo="Por vencer (30 días)" valor={datos.kpis.por_vencer} color="var(--color-advertencia)" />
            <TarjetaKPI titulo="Vencidos" valor={datos.kpis.vencidos} color="var(--color-error)" />
            <TarjetaKPI titulo="Sin movimientos (60 días)" valor={datos.kpis.sin_movimientos_recientes} color="var(--color-advertencia)" />
          </div>

          {datos.convenios.length === 0 ? (
            <p style={{ color: 'var(--color-texto-claro)', padding: '1rem' }}>No hay convenios que mostrar.</p>
          ) : (
            <table className="credito-tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Estatus</th>
                  <th>Consumo vs. plan</th>
                  <th>Vigencia</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {datos.convenios.map((c) => {
                  const consumo = estadoConsumo(c);
                  const vigencia = estadoVigencia(c);
                  return (
                    <tr key={c.id}>
                      <td>{c.cliente_nombre}</td>
                      <td>{c.vendedor_nombre}</td>
                      <td><span className={badgeClass(c.estatus)}>{c.estatus}</span></td>
                      <td><BarraProgreso porcentaje={consumo.porcentaje} color={consumo.color} etiqueta={consumo.etiqueta} /></td>
                      <td><BarraProgreso porcentaje={vigencia.porcentaje} color={vigencia.color} etiqueta={vigencia.etiqueta} /></td>
                      <td>
                        <button className="btn-secundario" onClick={() => navigate(`/comercial/convenios/${c.id}`)}>Ver</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
