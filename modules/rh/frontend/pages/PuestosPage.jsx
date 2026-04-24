import { useState, useEffect } from "react";
import {
  obtenerPuestos,
  crearPuesto,
  actualizarPuesto,
  eliminarPuesto,
} from "../services/puestos.service";
import { obtenerDepartamentos } from "../services/departamentos.service";

export default function PuestosPage() {
  const [puestos, setPuestos] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formulario, setFormulario] = useState({
    nombre: "",
    descripcion: "",
    departamento_id: "",
    nivel_salarial: "",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    try {
      const [respPuestos, respDeptos] = await Promise.all([
        obtenerPuestos(),
        obtenerDepartamentos(),
      ]);
      if (respPuestos.exito) setPuestos(respPuestos.datos);
      if (respDeptos.exito) setDepartamentos(respDeptos.datos);
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
      const datos = {
        ...formulario,
        departamento_id: formulario.departamento_id || null,
      };
      if (editando) {
        await actualizarPuesto(editando.id, datos);
      } else {
        await crearPuesto(datos);
      }
      setFormulario({
        nombre: "",
        descripcion: "",
        departamento_id: "",
        nivel_salarial: "",
      });
      setEditando(null);
      setMostrarFormulario(false);
      cargar();
    } catch (err) {
      setError(err.message || "Error al guardar");
    }
  }

  function editar(item) {
    setFormulario({
      nombre: item.nombre,
      descripcion: item.descripcion || "",
      departamento_id: item.departamento_id || "",
      nivel_salarial: item.nivel_salarial || "",
    });
    setEditando(item);
    setMostrarFormulario(true);
    setError("");
  }

  async function eliminarItem(id) {
    if (confirm("¿Estás seguro de eliminar este puesto?")) {
      try {
        await eliminarPuesto(id);
        cargar();
      } catch (e) {
        console.error(e);
      }
    }
  }

  if (cargando) return <p>Cargando puestos...</p>;

  return (
    <div className="puestos-page">
      <div className="admin-encabezado">
        <h1>Gestión de Puestos</h1>
        <button
          onClick={() => {
            setMostrarFormulario(true);
            setEditando(null);
            setFormulario({
              nombre: "",
              descripcion: "",
              departamento_id: "",
              nivel_salarial: "",
            });
          }}
        >
          Nuevo Puesto
        </button>
      </div>

      {mostrarFormulario && (
        <div className="formulario-modal">
          <h2>{editando ? "Editar Puesto" : "Nuevo Puesto"}</h2>
          {error && <div className="mensaje-error">{error}</div>}
          <form onSubmit={manejarEnvio}>
            <div className="campo">
              <label htmlFor="p-nombre">Nombre</label>
              <input
                type="text"
                id="p-nombre"
                name="nombre"
                value={formulario.nombre}
                onChange={manejarCambio}
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="p-departamento_id">Departamento</label>
              <select
                id="p-departamento_id"
                name="departamento_id"
                value={formulario.departamento_id}
                onChange={manejarCambio}
              >
                <option value="">Seleccionar departamento</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="p-nivel_salarial">Nivel Salarial</label>
              <input
                type="text"
                id="p-nivel_salarial"
                name="nivel_salarial"
                value={formulario.nivel_salarial}
                onChange={manejarCambio}
              />
            </div>
            <div className="campo">
              <label htmlFor="p-descripcion">Descripción</label>
              <textarea
                id="p-descripcion"
                name="descripcion"
                value={formulario.descripcion}
                onChange={manejarCambio}
              />
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

      <table className="crud-tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Departamento</th>
            <th>Nivel Salarial</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {puestos.map((p) => (
            <tr key={p.id}>
              <td>{p.nombre}</td>
              <td>{p.departamento_nombre || "-"}</td>
              <td>{p.nivel_salarial || "-"}</td>
              <td>
                <button onClick={() => editar(p)}>Editar</button>
                <button
                  className="boton-eliminar"
                  onClick={() => eliminarItem(p.id)}
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
