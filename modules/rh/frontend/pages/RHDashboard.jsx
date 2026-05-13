import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TarjetaKPI from '../../../portal/frontend/components/TarjetaKPI';
import GraficaBarras from '../../../portal/frontend/components/GraficaBarras';
import GraficaDona from '../../../portal/frontend/components/GraficaDona';
import { solicitar } from '../../../portal/frontend/utils/api';

export default function RHDashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    solicitar('/rh/dashboard')
      .then(json => { if (json.exito) setDatos(json.datos); else setError(json.mensaje); })
      .catch(err => setError(err.message || 'Error al conectar con el servidor'))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <div className="contenido-principal"><p>Cargando dashboard...</p></div>;
  if (error) return <div className="contenido-principal"><p style={{ color: 'var(--color-error)' }}>{error}</p></div>;

  return (
    <div className="contenido-principal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Recursos Humanos — Dashboard</h1>
        <Link to="/rh/admin" style={{ fontSize: '0.9rem', color: 'var(--color-secundario)' }}>
          Ver empleados →
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid-kpis" style={{ marginBottom: '1.5rem' }}>
        <TarjetaKPI titulo="Total empleados" valor={datos.kpis.total_empleados} color="var(--color-primario)" icono="👥" />
        <TarjetaKPI titulo="Activos" valor={datos.kpis.activos} color="#27ae60" icono="✅" />
        <TarjetaKPI titulo="Bajas del mes" valor={datos.kpis.bajas_mes} color="#e74c3c" icono="📉" />
        <TarjetaKPI titulo="Permisos pendientes" valor={datos.kpis.permisos_pendientes} color="#f39c12" icono="📋" />
      </div>

      {/* Gráficas */}
      <div className="grid-graficas">
        <div className="grafica-principal" style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Movimientos por mes (últimos 6 meses)
          </h3>
          <GraficaBarras
            datos={datos.movimientos_por_mes}
            series={[
              { clave: 'ingresos', color: '#27ae60', etiqueta: 'Ingresos' },
              { clave: 'bajas', color: '#e74c3c', etiqueta: 'Bajas' },
            ]}
          />
        </div>
        <div className="grafica-secundaria" style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Empleados por departamento
          </h3>
          <GraficaDona datos={datos.por_departamento} />
        </div>
      </div>

      {/* Permisos pendientes */}
      {datos.permisos_pendientes_lista.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem', marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Permisos/ausencias pendientes de aprobación
          </h3>
          <div className="tabla-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-borde)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 600, color: 'var(--color-texto-claro)' }}>Empleado</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 600, color: 'var(--color-texto-claro)' }}>Tipo</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 600, color: 'var(--color-texto-claro)' }}>Desde</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 600, color: 'var(--color-texto-claro)' }}>Hasta</th>
                </tr>
              </thead>
              <tbody>
                {datos.permisos_pendientes_lista.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-borde)' }}>
                    <td style={{ padding: '0.5rem', fontWeight: 500 }}>{p.empleado}</td>
                    <td style={{ padding: '0.5rem' }}>{p.tipo}</td>
                    <td style={{ padding: '0.5rem', color: 'var(--color-texto-claro)' }}>{new Date(p.fecha_inicio).toLocaleDateString('es-MX')}</td>
                    <td style={{ padding: '0.5rem', color: 'var(--color-texto-claro)' }}>{new Date(p.fecha_fin).toLocaleDateString('es-MX')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: 'right', marginTop: '0.75rem' }}>
            <Link to="/rh/permisos" style={{ fontSize: '0.85rem', color: 'var(--color-secundario)' }}>Ver todos →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
