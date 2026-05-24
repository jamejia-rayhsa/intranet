// modules/comercial/frontend/pages/ComercialDashboard.jsx
// Dashboard de Comercial con sistema visual Rayhsa.
// Usa el servicio existente `obtenerEstadisticas` para los KPIs.

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { obtenerEstadisticas } from '../services/solicitudesCredito.service';

import PageHeader from '../../../portal/frontend/components/PageHeader';
import KPICard from '../../../portal/frontend/components/KPICard';
import Icons from '../../../portal/frontend/components/Icons';

export default function ComercialDashboard() {
  const [stats, setStats] = useState(null);
  const [cargando, setCargando] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    obtenerEstadisticas()
      .then(res => { if (res?.exito) setStats(res.datos); })
      .finally(() => setCargando(false));
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Módulo · Comercial"
        title="Solicitudes de crédito"
        subtitle="Estado de las solicitudes activas y movimientos del mes"
        actions={
          <>
            <Link to="/comercial/creditos" className="btn-secundario">Ver listado</Link>
            <button className="btn-primario" onClick={() => navigate('/comercial/creditos/nueva')}>
              {Icons.briefcase} Nueva solicitud
            </button>
          </>
        }
      />

      {cargando ? (
        <p style={{ color: 'var(--color-texto-claro)' }}>Cargando estadísticas…</p>
      ) : stats ? (
        <div className="kpi-grid">
          <KPICard label="Total solicitudes" valor={stats.total}        accent="primary" />
          <KPICard label="Borradores"         valor={stats.borradores}   accent="neutral" />
          <KPICard label="Guardadas"          valor={stats.guardadas}    accent="info" />
          <KPICard label="Aprobadas"          valor={stats.aprobadas}    accent="success" />
          <KPICard label="Industria"          valor={stats.industria}    accent="primary" />
          <KPICard label="Distribución"       valor={stats.distribucion} accent="warning" />
        </div>
      ) : (
        <p style={{ color: 'var(--color-texto-claro)' }}>Sin estadísticas disponibles.</p>
      )}
    </>
  );
}
