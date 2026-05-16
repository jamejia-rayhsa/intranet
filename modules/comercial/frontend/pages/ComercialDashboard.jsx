import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtenerEstadisticas } from '../services/solicitudesCredito.service';
import '../styles/comercial.css';

export default function ComercialDashboard() {
  const [stats, setStats] = useState(null);
  const [cargando, setCargando] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    cargarStats();
  }, []);

  async function cargarStats() {
    setCargando(true);
    const res = await obtenerEstadisticas();
    if (res?.exito) setStats(res.datos);
    setCargando(false);
  }

  return (
    <div className="pagina-contenedor">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--color-primario)' }}>
          Módulo Comercial
        </h1>
        <button
          className="btn-primario credito-sin-impresion"
          onClick={() => navigate('/comercial/creditos/nueva')}
        >
          + Nueva Solicitud de Crédito
        </button>
      </div>

      {cargando ? (
        <p style={{ color: 'var(--color-texto-claro)' }}>Cargando estadísticas...</p>
      ) : stats ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Total Solicitudes', valor: stats.total, color: 'var(--color-primario)' },
            { label: 'Borradores', valor: stats.borradores, color: '#888' },
            { label: 'Guardadas', valor: stats.guardadas, color: '#1d4ed8' },
            { label: 'Aprobadas', valor: stats.aprobadas, color: 'var(--color-exito)' },
            { label: 'Industria', valor: stats.industria, color: 'var(--color-secundario)' },
            { label: 'Distribución', valor: stats.distribucion, color: 'var(--color-advertencia)' },
          ].map(kpi => (
            <div key={kpi.label} style={{
              background: 'var(--color-superficie)',
              border: '1px solid var(--color-borde)',
              borderRadius: 8,
              padding: '1rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: kpi.color }}>{kpi.valor}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-texto-claro)', marginTop: '0.25rem' }}>{kpi.label}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button className="btn-secundario" onClick={() => navigate('/comercial/creditos')}>
          Ver Listado de Solicitudes
        </button>
      </div>
    </div>
  );
}
