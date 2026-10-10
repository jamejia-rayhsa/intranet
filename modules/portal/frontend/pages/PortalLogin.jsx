// modules/portal/frontend/pages/PortalLogin.jsx
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usarAuth } from '../context/AuthContext';
import { config } from '../lib/config';

const LOGIN_MICROSOFT = config.ms365Login;
const NOMBRE_EMPRESA = import.meta.env.VITE_NOMBRE_EMPRESA || 'Intranet Corporativa';

export default function PortalLogin() {
  const [correo, setCorreo] = useState('');
  const [contraseña, setContraseña] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const { iniciarSesion, iniciarSesionMicrosoft, errorAuth } = usarAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const errorMostrado = error || location.state?.error || errorAuth;

  async function manejarMicrosoft() {
    setError('');
    try {
      await iniciarSesionMicrosoft();
    } catch (err) {
      setError(err.message);
    }
  }

  async function manejarEnvio(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await iniciarSesion(correo, contraseña);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Error al conectar con el servidor');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--color-fondo)' }}>
      {/* Logo + Formulario */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', minWidth: 0 }}>
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
          {errorMostrado && (
            <div style={{ background: '#fdecea', border: '1px solid var(--color-error)', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', color: 'var(--color-error)', fontSize: '0.9rem' }}>
              {errorMostrado}
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
          {LOGIN_MICROSOFT && (
            <button
              type="button" className="btn btn-secundario" onClick={manejarMicrosoft} disabled={cargando}
              style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem' }}
            >
              Entrar con Microsoft
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
