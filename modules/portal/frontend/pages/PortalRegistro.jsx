import { useState } from 'react';
import { registrarse } from '../services/auth.service';
import { usarAuth } from '../context/AuthContext';

export default function PortalRegistro() {
  const { iniciarSesion } = usarAuth();
  const [formulario, setFormulario] = useState({
    nombre: '',
    apellido: '',
    correo: '',
    contraseña: '',
    confirmarContraseña: '',
  });
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  function manejarCambio(evento) {
    setFormulario({ ...formulario, [evento.target.name]: evento.target.value });
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError('');

    if (formulario.contraseña !== formulario.confirmarContraseña) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (formulario.contraseña.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setCargando(true);

    try {
      const respuesta = await registrarse({
        nombre: formulario.nombre,
        apellido: formulario.apellido,
        correo: formulario.correo,
        contraseña: formulario.contraseña,
      });

      if (respuesta.exito) {
        iniciarSesion(respuesta.datos.token, respuesta.datos.usuario);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="registro-contenedor">
      <h1>Crear Cuenta</h1>

      {error && <div className="mensaje-error">{error}</div>}

      <form onSubmit={manejarEnvio}>
        <div className="campo">
          <label htmlFor="nombre">Nombre</label>
          <input
            type="text"
            id="nombre"
            name="nombre"
            value={formulario.nombre}
            onChange={manejarCambio}
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="apellido">Apellido</label>
          <input
            type="text"
            id="apellido"
            name="apellido"
            value={formulario.apellido}
            onChange={manejarCambio}
          />
        </div>

        <div className="campo">
          <label htmlFor="correo">Correo electrónico</label>
          <input
            type="email"
            id="correo"
            name="correo"
            value={formulario.correo}
            onChange={manejarCambio}
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="contraseña">Contraseña</label>
          <input
            type="password"
            id="contraseña"
            name="contraseña"
            value={formulario.contraseña}
            onChange={manejarCambio}
            required
            minLength={6}
          />
        </div>

        <div className="campo">
          <label htmlFor="confirmarContraseña">Confirmar contraseña</label>
          <input
            type="password"
            id="confirmarContraseña"
            name="confirmarContraseña"
            value={formulario.confirmarContraseña}
            onChange={manejarCambio}
            required
            minLength={6}
          />
        </div>

        <button type="submit" disabled={cargando}>
          {cargando ? 'Registrando...' : 'Registrarse'}
        </button>
      </form>

      <div className="enlaces-login">
        <a href="/inicio-sesion">¿Ya tienes cuenta? Inicia sesión</a>
      </div>
    </div>
  );
}
