// modules/portal/frontend/pages/PortalLogin.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usarAuth } from '../context/AuthContext';
import CarruselNoticias from '../components/CarruselNoticias';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const NOMBRE_EMPRESA = import.meta.env.VITE_NOMBRE_EMPRESA || 'Intranet Corporativa';

export default function PortalLogin() {
  const [correo, setCorreo] = useState('');
  const [contraseña, setContraseña] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [noticias, setNoticias] = useState([]);
  const { iniciarSesion } = usarAuth();
  const navigate = useNavigate();

  // Cargar noticias públicas para el carrusel
  useEffect(() => {
    fetch(`${API}/noticias/publicas`)
      .then(r => r.json())
      .then(j => { if (j.exito) setNoticias(j.datos?.noticias || []); })
      .catch(() => {});
  }, []);

  async function manejarEnvio(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const resp = await fetch(`${API}/auth/inicio-sesion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, contraseña }),
      });
      const json = await resp.json();
      if (!json.exito) { setError(json.mensaje || 'Credenciales incorrectas'); return; }
      iniciarSesion(json.datos.token, json.datos.usuario);
      navigate('/');
    } catch {
      setError('Error al conectar con el servidor');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Panel izquierdo: Logo + Formulario */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--color-fondo)', minWidth: 0 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/logo-rayhsa.png"
            alt="RAYHSA"
            style={{ height: '80px', width: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto 0.75rem' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-texto)', margin: 0 }}>{NOMBRE_EMPRESA}</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-texto-claro)', marginTop: '0.25rem' }}>Acceso al portal corporativo</p>
        </div>

        {/* Formulario */}
        <form onSubmit={manejarEnvio} style={{ width: '100%', maxWidth: '360px' }}>
          {error && (
            <div style={{ background: '#fdecea', border: '1px solid var(--color-error)', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', color: 'var(--color-error)', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Correo electrónico</label>
            <input
              type="email" value={correo} onChange={e => setCorreo(e.target.value)} required
              style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid var(--color-borde)', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
              placeholder="usuario@empresa.com"
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Contraseña</label>
            <input
              type="password" value={contraseña} onChange={e => setContraseña(e.target.value)} required
              style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid var(--color-borde)', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit" disabled={cargando}
            style={{ width: '100%', padding: '0.75rem', background: 'var(--color-primario)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
          >
            {cargando ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>

      {/* Panel derecho: Carrusel de noticias (oculto en móvil) */}
      <div style={{ flex: 1, display: 'none', minWidth: 0 }} className="login-panel-carrusel">
        <div style={{ width: '100%', height: '100%', minHeight: '100vh' }}>
          <CarruselNoticias noticias={noticias} modo="fondo" />
        </div>
      </div>
    </div>
  );
}
