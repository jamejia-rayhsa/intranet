// modules/portal/frontend/components/TarjetaKPI.jsx
export default function TarjetaKPI({ titulo, valor, color = '#1a5276', icono }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid #dce1e6`,
      borderTop: `3px solid ${color}`,
      borderRadius: '8px',
      padding: '1.25rem',
      flex: 1,
      minWidth: '150px',
    }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7f8c8d', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        {icono && <span style={{ marginRight: '0.4rem' }}>{icono}</span>}
        {titulo}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#2c3e50' }}>
        {valor ?? '—'}
      </div>
    </div>
  );
}
