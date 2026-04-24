import { useState, useEffect } from 'react';
import CarruselNoticias from '../components/CarruselNoticias';
import { usarAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function obtenerToken() { return localStorage.getItem('token'); }

export default function PortalHome() {
  const { usuario } = usarAuth();
  const [noticias, setNoticias] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch(`${API}/noticias/publicas`)
      .then(r => r.json())
      .then(j => { if (j.exito) setNoticias(j.datos?.noticias || []); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  const destacadas = noticias.slice(0, 5);
  const secundarias = noticias.slice(5, 10);

  return (
    <div className="contenido-principal">
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.25rem' }}>
        Bienvenido, {usuario?.nombre || 'usuario'}
      </h2>

      {cargando ? (
        <p style={{ color: 'var(--color-texto-claro)' }}>Cargando noticias...</p>
      ) : (
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
          {/* Noticia destacada con carrusel (60%) */}
          <div style={{ flex: '1.5', minWidth: '300px', minHeight: '320px' }}>
            {destacadas.length > 0
              ? <CarruselNoticias noticias={destacadas} modo="fondo" />
              : <div style={{ height: '320px', background: 'var(--color-superficie)', border: '1px solid var(--color-borde)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-texto-claro)' }}>Sin noticias publicadas</div>
            }
          </div>

          {/* Lista lateral (40%) */}
          {secundarias.length > 0 && (
            <div style={{ flex: '1', minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                Más noticias
              </h3>
              {secundarias.map(n => (
                <div key={n.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: 'var(--color-superficie)', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: 'var(--color-primario)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem', margin: '0 0 0.25rem', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.titulo}</p>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-texto-claro)' }}>
                      {n.fecha_publicacion ? new Date(n.fecha_publicacion).toLocaleDateString('es-MX') : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
