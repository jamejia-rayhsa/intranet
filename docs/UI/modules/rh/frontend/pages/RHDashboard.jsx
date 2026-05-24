// modules/rh/frontend/pages/RHDashboard.jsx
// Dashboard de RH con sistema visual Rayhsa.
// Endpoint: /rh/dashboard
// Datos esperados: { kpis: {total_empleados, activos, bajas_mes, permisos_pendientes},
//                    movimientos_por_mes: [{mes, ingresos, bajas}],
//                    por_departamento: [{label, value}] | {dept: count},
//                    permisos_pendientes_lista: [{empleado, tipo, fecha_inicio, fecha_fin}] }

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { solicitar } from '../../../portal/frontend/utils/api';

import PageHeader from '../../../portal/frontend/components/PageHeader';
import KPICard from '../../../portal/frontend/components/KPICard';
import ChartCard from '../../../portal/frontend/components/ChartCard';
import BarChart from '../../../portal/frontend/components/BarChart';
import DonutChart from '../../../portal/frontend/components/DonutChart';
import TablaCard from '../../../portal/frontend/components/TablaCard';
import StatusPill, { Avatar } from '../../../portal/frontend/components/StatusPill';
import Icons from '../../../portal/frontend/components/Icons';

const DEPT_PALETTE = ['#002E6D', '#1a4d9e', '#0284c7', '#766E63', '#9a9186', '#16a34a', '#d97706'];

export default function RHDashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    solicitar('/rh/dashboard')
      .then(json => { if (json.exito) setDatos(json.datos); else setError(json.mensaje); })
      .catch(err => setError(err.message || 'Error al conectar'))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <p>Cargando dashboard…</p>;
  if (error) return <p style={{ color: 'var(--color-error)' }}>{error}</p>;
  if (!datos) return null;

  const porDepto = Array.isArray(datos.por_departamento)
    ? datos.por_departamento.map((d, i) => ({ ...d, color: d.color || DEPT_PALETTE[i % DEPT_PALETTE.length] }))
    : Object.entries(datos.por_departamento || {}).map(([k, v], i) => ({
        label: k, value: v, color: DEPT_PALETTE[i % DEPT_PALETTE.length],
      }));

  return (
    <>
      <PageHeader
        eyebrow="Módulo · Recursos Humanos"
        title="Personas"
        subtitle="Movimientos del personal y solicitudes pendientes"
        actions={
          <>
            <Link to="/rh/empleados" className="btn-secundario">Ver empleados</Link>
            <button className="btn-primario">{Icons.users} Alta de empleado</button>
          </>
        }
      />

      <div className="kpi-grid">
        <KPICard label="Total empleados"      valor={datos.kpis.total_empleados}     accent="primary" />
        <KPICard label="Activos"              valor={datos.kpis.activos}             accent="success" />
        <KPICard label="Bajas del mes"        valor={datos.kpis.bajas_mes}           accent="danger" />
        <KPICard label="Permisos pendientes"  valor={datos.kpis.permisos_pendientes} accent="warning" />
      </div>

      <div className="chart-grid">
        <ChartCard
          title="Movimientos por mes"
          sub="Ingresos vs bajas · últimos 6 meses"
          legend={[
            { color: '#16a34a', label: 'Ingresos' },
            { color: '#dc2626', label: 'Bajas' },
          ]}
        >
          <BarChart
            data={(datos.movimientos_por_mes || []).map(m => ({ label: m.mes || m.label, ...m }))}
            series={[
              { key: 'ingresos', color: '#16a34a' },
              { key: 'bajas',    color: '#dc2626' },
            ]}
          />
        </ChartCard>

        <ChartCard title="Empleados por departamento" sub="Distribución actual">
          <DonutChart data={porDepto} />
        </ChartCard>
      </div>

      {datos.permisos_pendientes_lista?.length > 0 && (
        <TablaCard title="Permisos y ausencias pendientes" ctaLabel="Ver bandeja completa →" ctaTo="/rh/admin">
          <table className="tabla-mod">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Tipo</th>
                <th>Desde</th>
                <th>Hasta</th>
                <th>Días</th>
                <th style={{ textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {datos.permisos_pendientes_lista.map((p, i) => {
                const inicio = new Date(p.fecha_inicio);
                const fin = new Date(p.fecha_fin);
                const dias = Math.max(1, Math.round((fin - inicio) / (1000 * 60 * 60 * 24)) + 1);
                return (
                  <tr key={i}>
                    <td><Avatar nombre={p.empleado} sub={p.area} /></td>
                    <td>{p.tipo}</td>
                    <td>{inicio.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</td>
                    <td>{fin.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</td>
                    <td>{dias}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-secundario" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}>
                        Revisar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TablaCard>
      )}
    </>
  );
}
