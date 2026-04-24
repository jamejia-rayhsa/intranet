import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TarjetaKPI from '../../../portal/frontend/components/TarjetaKPI';
import GraficaBarras from '../../../portal/frontend/components/GraficaBarras';
import GraficaDona from '../../../portal/frontend/components/GraficaDona';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4001';

export default function TicketsDashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API}/tickets/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => { if (json.exito) setDatos(json.datos); else setError(json.mensaje); })
      .catch(() => setError('Error al conectar con el servidor'))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <div className="contenido-principal"><p>Cargando dashboard...</p></div>;
  if (error) return <div className="contenido-principal"><p style={{ color: 'var(--color-error)' }}>{error}</p></div>;

  return (
    <div className="contenido-principal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Tickets — Dashboard</h1>
        <Link to="/tickets/lista" style={{ fontSize: '0.9rem', color: 'var(--color-secundario)' }}>
          Ver todos los tickets →
        </Link>
      </div>

      {/* Fila de KPIs */}
      <div className="grid-kpis" style={{ marginBottom: '1.5rem' }}>
        <TarjetaKPI titulo="Total tickets" valor={datos.kpis.total_tickets} color="var(--color-primario)" icono="🎫" />
        <TarjetaKPI titulo="Pendientes" valor={datos.kpis.pendientes} color="#e74c3c" icono="⏳" />
        <TarjetaKPI titulo="En proceso" valor={datos.kpis.en_proceso} color="#f39c12" icono="🔧" />
        <TarjetaKPI titulo="Cerrados hoy" valor={datos.kpis.cerrados_hoy} color="#27ae60" icono="✅" />
      </div>

      {/* Gráficas */}
      <div className="grid-graficas">
        <div className="grafica-principal" style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Tickets por mes (últimos 6 meses)
          </h3>
          <GraficaBarras
            datos={datos.tickets_por_mes}
            series={[
              { clave: 'abierto', color: '#e74c3c', etiqueta: 'Abierto' },
              { clave: 'en_proceso', color: '#f39c12', etiqueta: 'En proceso' },
              { clave: 'cerrado', color: '#27ae60', etiqueta: 'Cerrado' },
            ]}
          />
        </div>
        <div className="grafica-secundaria" style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Distribución por estado
          </h3>
          <GraficaDona datos={datos.por_estado} />
        </div>
      </div>

      {/* Top técnicos */}
      {datos.top_tecnicos.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem', marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Top técnicos por calificación
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {datos.top_tecnicos.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--color-borde)' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-primario)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <span style={{ flex: 1, fontWeight: 500, fontSize: '0.9rem' }}>{t.nombre}</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-texto-claro)' }}>{t.tickets_resueltos} tickets</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f39c12' }}>
                  {t.calificacion_promedio > 0 ? `★ ${t.calificacion_promedio.toFixed(1)}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
