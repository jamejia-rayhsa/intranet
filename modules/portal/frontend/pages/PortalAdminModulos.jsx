import { useState, useEffect } from 'react';
import { obtenerModulos, crearModulo, actualizarModulo, eliminarModulo } from '../services/modulos.service';

export default function PortalAdminModulos() {
  const [modulos, setModulos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formulario, setFormulario] = useState({
    nombre: '',
    path_reactivo: '',
    descripcion: '',
    activo: true,
  });

  useEffect(() => {
    cargarModulos();
  }, []);

  async function cargarModulos() {
    try {
      const respuesta = await obtenerModulos();
      if (respuesta.exito) {
        setModulos(respuesta.datos);
      }
    } catch (error) {
      console.error('Error al cargar módulos:', error);
    } finally {
      setCargando(false);
    }
  }

  function manejarCambio(evento) {
    const { name, value, type, checked } = evento.target;
    setFormulario({ ...formulario, [name]: type === 'checkbox' ? checked : value });
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    try {
      if (editando) {
        await actualizarModulo(editando.id, formulario);
      } else {
        await crearModulo(formulario);
      }
      setFormulario({ nombre: '', path_reactivo: '', descripcion: '', activo: true });
      setMostrarFormulario(false);
      setEditando(null);
      cargarModulos();
    } catch (error) {
      console.error('Error al guardar módulo:', error);
    }
  }

  function editarModulo(modulo) {
    setFormulario({
      nombre: modulo.nombre,
      path_reactivo: modulo.path_reactivo || '',
      descripcion: modulo.descripcion || '',
      activo: modulo.activo,
    });
    setEditando(modulo);
    setMostrarFormulario(true);
  }

  async function eliminarModuloConfirmado(id) {
    if (confirm('¿Estás seguro de eliminar este módulo?')) {
      try {
        await eliminarModulo(id);
        cargarModulos();
      } catch (error) {
        console.error('Error al eliminar módulo:', error);
      }
    }
  }

  if (cargando) return <p>Cargando módulos...</p>;

  return (
    <div className="admin-modulos">
      <div className="admin-encabezado">
        <h1>Administración de Módulos</h1>
        <button onClick={() => { setMostrarFormulario(true); setEditando(null); setFormulario({ nombre: '', path_reactivo: '', descripcion: '', activo: true }); }}>
          Nuevo Módulo
        </button>
      </div>

      {mostrarFormulario && (
        <form className="modulo-formulario" onSubmit={manejarEnvio}>
          <h2>{editando ? 'Editar Módulo' : 'Nuevo Módulo'}</h2>

          <div className="campo">
            <label htmlFor="nombre">Nombre</label>
            <input type="text" id="nombre" name="nombre" value={formulario.nombre} onChange={manejarCambio} required />
          </div>

          <div className="campo">
            <label htmlFor="path_reactivo">Ruta Reactiva</label>
            <input type="text" id="path_reactivo" name="path_reactivo" value={formulario.path_reactivo} onChange={manejarCambio} placeholder="/modulo" />
          </div>

          <div className="campo">
            <label htmlFor="descripcion">Descripción</label>
            <textarea id="descripcion" name="descripcion" value={formulario.descripcion} onChange={manejarCambio} />
          </div>

          <div className="campo-casilla">
            <input type="checkbox" id="activo" name="activo" checked={formulario.activo} onChange={manejarCambio} />
            <label htmlFor="activo">Activo</label>
          </div>

          <div className="formulario-botones">
            <button type="submit">{editando ? 'Actualizar' : 'Crear'}</button>
            <button type="button" onClick={() => { setMostrarFormulario(false); setEditando(null); }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <table className="modulos-tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Ruta</th>
            <th>Descripción</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {modulos.map((modulo) => (
            <tr key={modulo.id}>
              <td>{modulo.nombre}</td>
              <td>{modulo.path_reactivo || '-'}</td>
              <td>{modulo.descripcion || '-'}</td>
              <td>{modulo.activo ? 'Activo' : 'Inactivo'}</td>
              <td>
                <button onClick={() => editarModulo(modulo)}>Editar</button>
                <button className="boton-eliminar" onClick={() => eliminarModuloConfirmado(modulo.id)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
