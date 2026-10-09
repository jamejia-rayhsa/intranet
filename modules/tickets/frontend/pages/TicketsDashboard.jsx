// modules/tickets/frontend/pages/TicketsDashboard.jsx
// Dashboard de Tickets con sistema visual Rayhsa.
// Consume el mismo endpoint que la versión anterior: GET /tickets/dashboard
// Espera datos: { kpis: {total_tickets, pendientes, en_proceso, cerrados_hoy},
//                 tickets_por_mes: [{mes, abierto, en_proceso, cerrado}],
//                 por_estado: [{label, value, color}] | {abierto, en_proceso, cerrado},
//                 top_tecnicos: [{nombre, tickets_resueltos, calificacion_promedio}] }

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import PageHeader from '../../../portal/frontend/components/PageHeader';
import KPICard from '../../../portal/frontend/components/KPICard';
import ChartCard from '../../../portal/frontend/components/ChartCard';
import BarChart from '../../../portal/frontend/components/BarChart';
import DonutChart from '../../../portal/frontend/components/DonutChart';
import TablaCard from '../../../portal/frontend/components/TablaCard';
import { Avatar } from '../../../portal/frontend/components/StatusPill';
import Icons from '../../../portal/frontend/components/Icons';
import { obtenerToken } from '../../../portal/frontend/utils/token';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4001';

export default function TicketsDashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    obtenerToken().then(token => fetch(`${API}/tickets/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    }))
      .then(r => r.json())
      .then(json => { if (json.exito) setDatos(json.datos); else setError(json.mensaje); })
      .catch(() => setError('Error al conectar con el servidor'))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <p>Cargando dashboard…</p>;
  if (error) return <p style={{ color: 'var(--color-error)' }}>{error}</p>;
  if (!datos) return null;

  // Normaliza por_estado a la forma [{label, value, color}]
  const porEstado = Array.isArray(datos.por_estado)
    ? datos.por_estado.map(d => ({ ...d, color: d.color || ESTADO_COLORS[d.label] || '#766E63' }))
    : Object.entries(datos.por_estado || {}).map(([k, v]) => ({
        label: k.replace('_', ' '),
        value: v,
        color: ESTADO_COLORS[k] || '#766E63',
      }));

  return (
    <>
      <PageHeader
        eyebrow="Módulo · Soporte TI"
        title="Tickets"
        subtitle="Resumen del módulo · datos en tiempo real"
        actions={
          <>
            <Link to="/tickets/lista" className="btn-secundario">Ver listado</Link>
            <button className="btn-primario">{Icons.ticket} Nuevo ticket</button>
          </>
        }
      />

      <div className="kpi-grid">
        <KPICard label="Total tickets" valor={datos.kpis.total_tickets} accent="primary" />
        <KPICard label="Pendientes"    valor={datos.kpis.pendientes}    accent="danger" />
        <KPICard label="En proceso"    valor={datos.kpis.en_proceso}    accent="warning" />
        <KPICard label="Cerrados hoy"  valor={datos.kpis.cerrados_hoy}  accent="success" />
      </div>

      <div className="chart-grid">
        <ChartCard
          title="Tickets por mes"
          sub="Últimos 6 meses · stacked por estado"
          legend={[
            { color: '#dc2626', label: 'Abierto' },
            { color: '#d97706', label: 'En proceso' },
            { color: '#16a34a', label: 'Cerrado' },
          ]}
        >
          <BarChart
            data={(datos.tickets_por_mes || []).map(m => ({ label: m.mes || m.label, ...m }))}
            stacked
            series={[
              { key: 'abierto',    color: '#dc2626' },
              { key: 'en_proceso', color: '#d97706' },
              { key: 'cerrado',    color: '#16a34a' },
            ]}
          />
        </ChartCard>

        <ChartCard title="Distribución por estado">
          <DonutChart data={porEstado} />
        </ChartCard>
      </div>

      {datos.top_tecnicos?.length > 0 && (
        <TablaCard title="Top técnicos por calificación" ctaLabel="Ver todos →" ctaTo="/tickets/lista">
          <table className="tabla-mod">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Técnico</th>
                <th>Resueltos</th>
                <th>Calificación</th>
              </tr>
            </thead>
            <tbody>
              {datos.top_tecnicos.map((t, i) => (
                <tr key={i}>
                  <td className="col-id">{String(i + 1).padStart(2, '0')}</td>
                  <td><Avatar nombre={t.nombre} sub={t.area} /></td>
                  <td>{t.tickets_resueltos} tickets</td>
                  <td style={{ color: '#d97706', fontWeight: 600 }}>
                    {t.calificacion_promedio > 0 ? `★ ${t.calificacion_promedio.toFixed(1)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaCard>
      )}
    </>
  );
}

const ESTADO_COLORS = {
  abierto: '#dc2626',
  en_proceso: '#d97706',
  cerrado: '#16a34a',
  Abierto: '#dc2626',
  'En proceso': '#d97706',
  Cerrado: '#16a34a',
};
