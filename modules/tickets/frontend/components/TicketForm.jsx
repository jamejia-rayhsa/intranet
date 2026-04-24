import { useState, useEffect } from "react";
import { crearTicket } from "../services/tickets.service";
import { subirAdjunto } from "../services/adjuntos.service";
import { obtenerCategorias } from "../services/categorias.service";

const niveles = [
  { valor: "bajo", etiqueta: "Bajo", color: "verde" },
  { valor: "medio", etiqueta: "Medio", color: "amarillo" },
  { valor: "alto", etiqueta: "Alto", color: "naranja" },
  { valor: "critico", etiqueta: "Crítico", color: "rojo" },
];

export default function TicketForm({ alGuardar, alCancelar }) {
  const [formulario, setFormulario] = useState({
    titulo: "",
    descripcion: "",
    nivel_atencion: "medio",
    categoria: "",
  });
  const [archivos, setArchivos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    cargarCategorias();
  }, []);

  async function cargarCategorias() {
    try {
      const respuesta = await obtenerCategorias();
      console.log("Categorías cargadas:", respuesta);
      if (respuesta.exito) setCategorias(respuesta.datos);
    } catch (e) {
      console.error("Error al cargar categorías:", e);
    }
  }

  function manejarCambio(evento) {
    const { name, value } = evento.target;
    setFormulario({ ...formulario, [name]: value });
  }

  function manejarArchivos(evento) {
    setArchivos(Array.from(evento.target.files));
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");
    setCargando(true);

    try {
      const respuesta = await crearTicket(formulario);
      const ticketId = respuesta.datos.id;

      for (const archivo of archivos) {
        try {
          await subirAdjunto(ticketId, archivo);
        } catch (e) {
          console.error("Error al subir archivo:", e.message);
        }
      }

      alGuardar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="ticket-formulario">
      <h2>Nuevo Ticket de Soporte</h2>

      {error && <div className="mensaje-error">{error}</div>}

      <form onSubmit={manejarEnvio}>
        <div className="campo">
          <label htmlFor="titulo">Título</label>
          <input
            type="text"
            id="titulo"
            name="titulo"
            value={formulario.titulo}
            onChange={manejarCambio}
            required
            placeholder="Describe brevemente el problema"
          />
        </div>

        <div className="campo">
          <label htmlFor="descripcion">Descripción</label>
          <textarea
            id="descripcion"
            name="descripcion"
            value={formulario.descripcion}
            onChange={manejarCambio}
            rows={5}
            placeholder="Describe el problema con detalle"
          />
        </div>

        <div className="campo">
          <label htmlFor="nivel_atencion">Nivel de Atención</label>
          <select
            id="nivel_atencion"
            name="nivel_atencion"
            value={formulario.nivel_atencion}
            onChange={manejarCambio}
          >
            {niveles.map((nivel) => (
              <option key={nivel.valor} value={nivel.valor}>
                {nivel.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="categoria">Categoría</label>
          <select
            id="categoria"
            name="categoria"
            value={formulario.categoria}
            onChange={manejarCambio}
            required
          >
            <option value="">Selecciona una categoría</option>
            {categorias.map((cat) => (
              <option key={cat.id} value={cat.nombre}>
                {cat.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="archivos">Archivos Adjuntos (opcional)</label>
          <input
            type="file"
            id="archivos"
            multiple
            onChange={manejarArchivos}
          />
          {archivos.length > 0 && (
            <p className="archivos-seleccionados">
              {archivos.length} archivo(s) seleccionado(s)
            </p>
          )}
        </div>

        <div className="formulario-botones">
          <button type="submit" disabled={cargando}>
            {cargando ? "Creando..." : "Crear Ticket"}
          </button>
          {alCancelar && (
            <button type="button" onClick={alCancelar}>
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
