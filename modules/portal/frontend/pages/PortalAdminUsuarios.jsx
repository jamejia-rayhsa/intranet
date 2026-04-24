import { useState, useEffect } from "react";
import { solicitar } from "../utils/api";

export default function PortalAdminUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState("");
  const [mostrarResetModal, setMostrarResetModal] = useState(false);
  const [passwordTemporal, setPasswordTemporal] = useState("");
  const [formulario, setFormulario] = useState({
    nombre: "",
    apellido: "",
    correo: "",
    contraseña: "",
    activo: true,
    rol_id: "",
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    try {
      const [respuestaUsuarios, respuestaRoles] = await Promise.all([
        solicitar("/usuarios"),
        solicitar("/roles"),
      ]);
      if (respuestaUsuarios.exito) setUsuarios(respuestaUsuarios.datos);
      if (respuestaRoles.exito) setRoles(respuestaRoles.datos);
    } catch (error) {
      console.error("Error al cargar datos:", error);
    } finally {
      setCargando(false);
    }
  }

  function manejarCambio(evento) {
    const { name, value, type, checked } = evento.target;
    setFormulario({
      ...formulario,
      [name]: type === "checkbox" ? checked : value,
    });
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");
    try {
      if (editando) {
        const datosEnvio = {
          nombre: formulario.nombre,
          apellido: formulario.apellido,
          activo: formulario.activo,
          rol_id: formulario.rol_id ? parseInt(formulario.rol_id) : null,
        };
        if (formulario.contraseña) {
          datosEnvio.contraseña = formulario.contraseña;
        }
        await solicitar(`/usuarios/${editando.id}`, {
          metodo: "PUT",
          cuerpo: JSON.stringify(datosEnvio),
        });
      } else {
        await solicitar("/usuarios", {
          metodo: "POST",
          cuerpo: JSON.stringify({
            ...formulario,
            rol_id: formulario.rol_id ? parseInt(formulario.rol_id) : null,
          }),
        });
      }
      setFormulario({
        nombre: "",
        apellido: "",
        correo: "",
        contraseña: "",
        activo: true,
        rol_id: "",
      });
      setMostrarFormulario(false);
      setEditando(null);
      cargarDatos();
    } catch (err) {
      setError(err.message || "Error al guardar usuario");
    }
  }

  function editarUsuario(usuario) {
    setFormulario({
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      correo: usuario.correo,
      contraseña: "",
      activo: usuario.activo,
      rol_id:
        usuario.roles && usuario.roles.length > 0 ? usuario.roles[0].id : "",
    });
    setEditando(usuario);
    setMostrarFormulario(true);
    setError("");
  }

  async function eliminarUsuario(id) {
    if (confirm("¿Estás seguro de eliminar este usuario?")) {
      try {
        await solicitar(`/usuarios/${id}`, { metodo: "DELETE" });
        cargarDatos();
      } catch (error) {
        console.error("Error al eliminar usuario:", error);
      }
    }
  }

  async function resetearPassword(usuario) {
    try {
      const respuesta = await solicitar(
        `/usuarios/${usuario.id}/reset-password`,
        {
          metodo: "POST",
        },
      );
      if (respuesta.exito) {
        setPasswordTemporal(respuesta.datos.contraseña_temporal);
        setMostrarResetModal(true);
      }
    } catch (error) {
      alert(error.message || "Error al resetear contraseña");
    }
  }

  if (cargando) return <p>Cargando usuarios...</p>;

  return (
    <div className="admin-usuarios">
      <div className="admin-encabezado">
        <h1>Administración de Usuarios</h1>
        <button
          onClick={() => {
            setMostrarFormulario(true);
            setEditando(null);
            setFormulario({
              nombre: "",
              apellido: "",
              correo: "",
              contraseña: "",
              activo: true,
              rol_id: "",
            });
            setError("");
          }}
        >
          Nuevo Usuario
        </button>
      </div>

      {mostrarFormulario && (
        <div className="formulario-modal">
          <h2>{editando ? "Editar Usuario" : "Nuevo Usuario"}</h2>

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
                disabled={!!editando}
              />
            </div>

            {(!editando || editando.auth_tipo === "local") && (
              <div className="campo">
                <label htmlFor="contraseña">
                  {editando
                    ? "Nueva contraseña (dejar vacío para no cambiar)"
                    : "Contraseña"}
                </label>
                <input
                  type="password"
                  id="contraseña"
                  name="contraseña"
                  value={formulario.contraseña}
                  onChange={manejarCambio}
                  required={!editando}
                />
              </div>
            )}

            <div className="campo">
              <label htmlFor="rol_id">Rol</label>
              <select
                id="rol_id"
                name="rol_id"
                value={formulario.rol_id}
                onChange={manejarCambio}
              >
                <option value="">Sin rol</option>
                {roles.map((rol) => (
                  <option key={rol.id} value={rol.id}>
                    {rol.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo-casilla">
              <input
                type="checkbox"
                id="activo"
                name="activo"
                checked={formulario.activo}
                onChange={manejarCambio}
              />
              <label htmlFor="activo">Activo</label>
            </div>

            <div className="formulario-botones">
              <button type="submit">{editando ? "Actualizar" : "Crear"}</button>
              <button
                type="button"
                onClick={() => {
                  setMostrarFormulario(false);
                  setEditando(null);
                  setError("");
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {mostrarResetModal && (
        <div className="modal-editor">
          <div className="modal-contenido">
            <h2>Contraseña Resetada</h2>
            <p>La contraseña temporal del usuario es:</p>
            <div className="password-temporal">{passwordTemporal}</div>
            <p className="password-aviso">
              El usuario deberá cambiar esta contraseña en su próximo inicio de
              sesión.
            </p>
            <div className="formulario-botones">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(passwordTemporal);
                }}
              >
                Copiar
              </button>
              <button
                onClick={() => {
                  setMostrarResetModal(false);
                  setPasswordTemporal("");
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <table className="usuarios-tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Auth</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((usuario) => (
            <tr key={usuario.id}>
              <td>
                {usuario.nombre} {usuario.apellido}
              </td>
              <td>{usuario.correo}</td>
              <td>
                {usuario.roles && usuario.roles.length > 0
                  ? usuario.roles[0].nombre
                  : "-"}
              </td>
              <td>{usuario.activo ? "Activo" : "Inactivo"}</td>
              <td>{usuario.auth_tipo}</td>
              <td>
                <button onClick={() => editarUsuario(usuario)}>Editar</button>
                {usuario.auth_tipo === "local" && (
                  <button
                    className="boton-reset"
                    onClick={() => resetearPassword(usuario)}
                  >
                    Resetear Clave
                  </button>
                )}
                <button
                  className="boton-eliminar"
                  onClick={() => eliminarUsuario(usuario.id)}
                >
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
