import { useState, useEffect } from 'react';
import { solicitar } from '../utils/api';
import { usarAuth } from '../context/AuthContext';

export default function PortalAdminRoles() {
  const { usuario } = usarAuth();
  // Esta pantalla edita la tabla heredada de permisos y borra roles: el backend lo reserva a
  // super_admin (los demás editan permisos en /admin/permisos). Se ocultan los botones, y si el
  // servidor rechaza algo se muestra su mensaje.
  const esSuperAdmin = Array.isArray(usuario?.roles) && usuario.roles.includes('super_admin');
  const [error, setError] = useState('');
  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [rolSeleccionado, setRolSeleccionado] = useState(null);
  const [nombreRol, setNombreRol] = useState('');
  const [permisosSeleccionados, setPermisosSeleccionados] = useState([]);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    try {
      const [respuestaRoles, respuestaPermisos] = await Promise.all([
        solicitar('/roles'),
        solicitar('/permisos/opciones'),
      ]);
      if (respuestaRoles.exito) setRoles(respuestaRoles.datos);
      if (respuestaPermisos.exito) setPermisos(respuestaPermisos.datos);
    } catch (err) {
      console.error('Error al cargar datos:', err);
      setError(err.message || 'No se pudieron cargar los roles');
    } finally {
      setCargando(false);
    }
  }

  async function crearRol() {
    if (!nombreRol) return;
    setError('');
    try {
      await solicitar('/roles', {
        metodo: 'POST',
        cuerpo: JSON.stringify({ nombre: nombreRol }),
      });
      setNombreRol('');
      setMostrarFormulario(false);
      cargarDatos();
    } catch (err) {
      console.error('Error al crear rol:', err);
      setError(err.message || 'No se pudo crear el rol');
    }
  }

  async function guardarPermisos() {
    if (!rolSeleccionado) return;
    setError('');
    try {
      await solicitar(`/roles/${rolSeleccionado.id}/permisos`, {
        metodo: 'PUT',
        cuerpo: JSON.stringify({ permisos_ids: permisosSeleccionados }),
      });
      setRolSeleccionado(null);
      setPermisosSeleccionados([]);
      cargarDatos();
    } catch (err) {
      console.error('Error al guardar permisos:', err);
      setError(err.message || 'No se pudieron guardar los permisos');
    }
  }

  async function eliminarRol(id) {
    if (confirm('¿Estás seguro de eliminar este rol?')) {
      setError('');
      try {
        await solicitar(`/roles/${id}`, { metodo: 'DELETE' });
        cargarDatos();
      } catch (err) {
        console.error('Error al eliminar rol:', err);
        setError(err.message || 'No se pudo eliminar el rol');
      }
    }
  }

  function abrirEdicionPermisos(rol) {
    setRolSeleccionado(rol);
    setPermisosSeleccionados(rol.permisos ? rol.permisos.map((p) => p.id) : []);
  }

  function alternarPermiso(id) {
    if (permisosSeleccionados.includes(id)) {
      setPermisosSeleccionados(permisosSeleccionados.filter((p) => p !== id));
    } else {
      setPermisosSeleccionados([...permisosSeleccionados, id]);
    }
  }

  if (cargando) return <p>Cargando roles y permisos...</p>;

  return (
    <div className="admin-roles">
      <div className="admin-encabezado">
        <h1>Administración de Roles y Permisos</h1>
        <button onClick={() => setMostrarFormulario(true)}>Nuevo Rol</button>
      </div>

      {error && (
        <p role="alert" className="mensaje-error">
          {error}
        </p>
      )}

      {mostrarFormulario && (
        <div className="formulario-modal">
          <h2>Crear Nuevo Rol</h2>
          <div className="campo">
            <label htmlFor="nombre-rol">Nombre del Rol</label>
            <input
              type="text"
              id="nombre-rol"
              value={nombreRol}
              onChange={(e) => setNombreRol(e.target.value)}
              placeholder="ej: rh_admin"
            />
          </div>
          <div className="formulario-botones">
            <button onClick={crearRol}>Crear</button>
            <button onClick={() => setMostrarFormulario(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {rolSeleccionado && (
        <div className="formulario-modal">
          <h2>Permisos para: {rolSeleccionado.nombre}</h2>
          <div className="permisos-lista">
            {permisos.map((permiso) => (
              <label key={permiso.id} className="permiso-casilla">
                <input
                  type="checkbox"
                  checked={permisosSeleccionados.includes(permiso.id)}
                  onChange={() => alternarPermiso(permiso.id)}
                />
                {permiso.nombre}
              </label>
            ))}
          </div>
          <div className="formulario-botones">
            <button onClick={guardarPermisos}>Guardar Permisos</button>
            <button onClick={() => { setRolSeleccionado(null); setPermisosSeleccionados([]); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <table className="roles-tabla">
        <thead>
          <tr>
            <th>Rol</th>
            <th>Permisos</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((rol) => (
            <tr key={rol.id}>
              <td>{rol.nombre}</td>
              <td>{rol.permisos ? rol.permisos.map((p) => p.nombre).join(', ') : '-'}</td>
              <td>
                {esSuperAdmin && (
                  <>
                    <button onClick={() => abrirEdicionPermisos(rol)}>Editar Permisos</button>
                    <button className="boton-eliminar" onClick={() => eliminarRol(rol.id)}>
                      Eliminar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
