// modules/auditoria/frontend/pages/AuditoriaDashboard.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TarjetaKPI from '../../../portal/frontend/components/TarjetaKPI';
import GraficaBarras from '../../../portal/frontend/components/GraficaBarras';
import GraficaDona from '../../../portal/frontend/components/GraficaDona';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export default function AuditoriaDashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API}/auditoria/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.exito) setDatos(json.datos);
        else setError(json.mensaje);
      })
      .catch(() => setError('Error al conectar con el servidor'))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <div className="contenido-principal"><p>Cargando dashboard...</p></div>;
  if (error) return <div className="contenido-principal"><p style={{ color: 'var(--color-error)' }}>{error}</p></div>;

  return (
    <div className="contenido-principal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Auditoría — Dashboard</h1>
        <Link to="/auditoria/logs" style={{ fontSize: '0.9rem', color: 'var(--color-secundario)' }}>
          Ver todos los logs →
        </Link>
      </div>

      {/* Fila de KPIs */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <TarjetaKPI titulo="Eventos hoy" valor={datos.kpis.eventos_hoy} color="var(--color-secundario)" icono="📋" />
        <TarjetaKPI titulo="Eventos del mes" valor={datos.kpis.eventos_mes} color="var(--color-primario)" icono="📅" />
        <TarjetaKPI titulo="Usuarios activos" valor={datos.kpis.usuarios_activos} color="var(--color-exito)" icono="👥" />
        <TarjetaKPI titulo="Módulos monitoreados" valor={datos.kpis.modulos_monitoreados} color="var(--color-advertencia)" icono="🔍" />
      </div>

      {/* Fila de gráficas */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1.5', minWidth: '300px', background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Eventos por día (últimos 30 días)
          </h3>
          <GraficaBarras
            datos={datos.eventos_por_dia}
            series={[{ clave: 'valor', color: '#2e86c1', etiqueta: 'Eventos' }]}
          />
        </div>
        <div style={{ flex: '1', minWidth: '260px', background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Distribución por acción
          </h3>
          <GraficaDona datos={datos.distribucion_acciones} />
        </div>
      </div>
    </div>
  );
}
