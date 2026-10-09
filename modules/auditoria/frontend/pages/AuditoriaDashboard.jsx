// modules/auditoria/frontend/pages/AuditoriaDashboard.jsx
// Dashboard de Auditoría con sistema visual Rayhsa.
// Endpoint: /auditoria/dashboard
// Datos esperados: { kpis: {eventos_hoy, eventos_mes, usuarios_activos, modulos_monitoreados},
//                    eventos_por_dia: [{dia|label, valor|eventos}],
//                    distribucion_acciones: [{label, value}] | {INSERT, UPDATE, DELETE} }

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import PageHeader from '../../../portal/frontend/components/PageHeader';
import KPICard from '../../../portal/frontend/components/KPICard';
import ChartCard from '../../../portal/frontend/components/ChartCard';
import BarChart from '../../../portal/frontend/components/BarChart';
import DonutChart from '../../../portal/frontend/components/DonutChart';
import Icons from '../../../portal/frontend/components/Icons';
import { obtenerToken } from '../../../portal/frontend/utils/token';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const ACCION_COLORS = { INSERT: '#16a34a', UPDATE: '#0284c7', DELETE: '#dc2626' };

export default function AuditoriaDashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    obtenerToken().then(token => fetch(`${API}/auditoria/dashboard`, {
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

  const eventosPorDia = (datos.eventos_por_dia || []).map(d => ({
    label: d.dia || d.label,
    eventos: d.valor ?? d.eventos ?? d.value ?? 0,
  }));

  const distribucion = Array.isArray(datos.distribucion_acciones)
    ? datos.distribucion_acciones.map(d => ({ ...d, color: d.color || ACCION_COLORS[d.label] || '#766E63' }))
    : Object.entries(datos.distribucion_acciones || {}).map(([k, v]) => ({
        label: k, value: v, color: ACCION_COLORS[k] || '#766E63',
      }));

  return (
    <>
      <PageHeader
        eyebrow="Módulo · Transversal"
        title="Auditoría"
        subtitle="Bitácora completa de eventos en todos los módulos"
        actions={
          <>
            <Link to="/auditoria/logs" className="btn-secundario">Ver bitácora</Link>
            <button className="btn-primario">{Icons.search} Buscar evento</button>
          </>
        }
      />

      <div className="kpi-grid">
        <KPICard label="Eventos hoy"          valor={datos.kpis.eventos_hoy}          accent="primary" />
        <KPICard label="Eventos del mes"      valor={datos.kpis.eventos_mes}          accent="info" />
        <KPICard label="Usuarios activos"     valor={datos.kpis.usuarios_activos}     accent="success" />
        <KPICard label="Módulos monitoreados" valor={datos.kpis.modulos_monitoreados} accent="neutral" />
      </div>

      <div className="chart-grid">
        <ChartCard
          title="Eventos por día"
          sub="Últimos 30 días"
          legend={[{ color: '#002E6D', label: 'Eventos registrados' }]}
        >
          <BarChart data={eventosPorDia} series={[{ key: 'eventos', color: '#002E6D' }]} />
        </ChartCard>

        <ChartCard title="Distribución por acción">
          <DonutChart data={distribucion} />
        </ChartCard>
      </div>
    </>
  );
}
