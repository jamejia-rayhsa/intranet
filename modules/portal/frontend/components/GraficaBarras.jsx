// modules/portal/frontend/components/GraficaBarras.jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// datos: [{ nombre: 'Ene', valor: 42 }, ...]
// series: [{ clave: 'valor', color: '#1a5276', etiqueta: 'Eventos' }]
export default function GraficaBarras({ datos = [], series = [], alto = 280 }) {
  if (!datos.length) {
    return (
      <div style={{ height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7f8c8d', fontSize: '0.9rem' }}>
        Sin datos
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={datos} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        {series.length > 1 && <Legend />}
        {series.map((s) => (
          <Bar key={s.clave} dataKey={s.clave} name={s.etiqueta || s.clave} fill={s.color || '#1a5276'} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
