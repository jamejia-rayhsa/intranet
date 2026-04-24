// modules/portal/frontend/components/GraficaDona.jsx
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORES_POR_DEFECTO = ['#1a5276', '#2e86c1', '#27ae60', '#f39c12', '#e74c3c', '#8e44ad'];

// datos: [{ nombre: 'INSERT', valor: 120 }, ...]
export default function GraficaDona({ datos = [], alto = 280 }) {
  if (!datos.length) {
    return (
      <div style={{ height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7f8c8d', fontSize: '0.9rem' }}>
        Sin datos
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <PieChart>
        <Pie data={datos} dataKey="valor" nameKey="nombre" cx="50%" cy="50%" innerRadius="55%" outerRadius="75%" paddingAngle={3}>
          {datos.map((_, i) => (
            <Cell key={i} fill={COLORES_POR_DEFECTO[i % COLORES_POR_DEFECTO.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => v.toLocaleString()} />
        <Legend iconType="circle" iconSize={10} />
      </PieChart>
    </ResponsiveContainer>
  );
}
