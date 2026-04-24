import { useState, useEffect } from "react";
import { solicitar } from "../../../portal/frontend/utils/api";

export default function CrudPage({
  titulo,
  apiRuta,
  columnas,
  camposFormulario,
}) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formulario, setFormulario] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    try {
      const respuesta = await solicitar(apiRuta);
      if (respuesta.exito) setItems(respuesta.datos);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  }

  function manejarCambio(e) {
    const { name, value } = e.target;
    setFormulario({ ...formulario, [name]: value });
  }

  async function manejarEnvio(e) {
    e.preventDefault();
    setError("");
    try {
      if (editando) {
        await solicitar(`${apiRuta}/${editando.id}`, {
          metodo: "PUT",
          cuerpo: JSON.stringify(formulario),
        });
      } else {
        await solicitar(apiRuta, {
          metodo: "POST",
          cuerpo: JSON.stringify(formulario),
        });
      }
      setFormulario({});
      setEditando(null);
      setMostrarFormulario(false);
      cargar();
    } catch (err) {
      setError(err.message || "Error al guardar");
    }
  }

  function editar(item) {
    setFormulario({ ...item });
    setEditando(item);
    setMostrarFormulario(true);
    setError("");
  }

  async function eliminar(id) {
    if (confirm("¿Estás seguro de eliminar este registro?")) {
      try {
        await solicitar(`${apiRuta}/${id}`, { metodo: "DELETE" });
        cargar();
      } catch (e) {
        console.error(e);
      }
    }
  }

  if (cargando) return <p>Cargando...</p>;

  return (
    <div className="crud-page">
      <div className="admin-encabezado">
        <h1>{titulo}</h1>
        <button
          onClick={() => {
            setMostrarFormulario(true);
            setEditando(null);
            setFormulario({});
          }}
        >
          Nuevo
        </button>
      </div>

      {mostrarFormulario && (
        <div className="formulario-modal">
          <h2>{editando ? "Editar" : "Nuevo"}</h2>
          {error && <div className="mensaje-error">{error}</div>}
          <form onSubmit={manejarEnvio}>
            {camposFormulario.map((campo) => (
              <div className="campo" key={campo.name}>
                <label htmlFor={`f-${campo.name}`}>{campo.label}</label>
                {campo.tipo === "textarea" ? (
                  <textarea
                    id={`f-${campo.name}`}
                    name={campo.name}
                    value={formulario[campo.name] || ""}
                    onChange={manejarCambio}
                    required={campo.required}
                  />
                ) : (
                  <input
                    type={campo.tipo || "text"}
                    id={`f-${campo.name}`}
                    name={campo.name}
                    value={formulario[campo.name] || ""}
                    onChange={manejarCambio}
                    required={campo.required}
                  />
                )}
              </div>
            ))}
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

      <table className="crud-tabla">
        <thead>
          <tr>
            {columnas.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              {columnas.map((col) => (
                <td key={col.key}>
                  {col.render ? col.render(item) : item[col.key] || "-"}
                </td>
              ))}
              <td>
                <button onClick={() => editar(item)}>Editar</button>
                <button
                  className="boton-eliminar"
                  onClick={() => eliminar(item.id)}
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
