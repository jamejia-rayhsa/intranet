import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usarAuth } from '../context/AuthContext';

function errorDeLaUrl() {
  const parametros = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const mensaje = parametros.get('error_description') || hash.get('error_description');
  // Texto plano y acotado: viene de la URL y se muestra en el login
  return mensaje ? String(mensaje).slice(0, 200) : null;
}

export default function AuthCallback() {
  const { usuario, cargando, errorAuth } = usarAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (cargando) return;
    const error = errorDeLaUrl();
    if (error) {
      navigate('/inicio-sesion', { replace: true, state: { error } });
    } else if (usuario) {
      navigate('/', { replace: true });
    } else {
      navigate('/inicio-sesion', {
        replace: true,
        state: { error: errorAuth || 'No se pudo iniciar sesión con Microsoft' },
      });
    }
  }, [cargando, usuario, errorAuth, navigate]);

  return <div>Iniciando sesión…</div>;
}
