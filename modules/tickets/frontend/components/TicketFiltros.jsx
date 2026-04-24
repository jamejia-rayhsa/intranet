import { useState } from "react";

const estados = [
  { valor: "", etiqueta: "Todos" },
  { valor: "abierto", etiqueta: "Abierto" },
  { valor: "en_progreso", etiqueta: "En Progreso" },
  { valor: "resuelto", etiqueta: "Resuelto" },
  { valor: "cerrado", etiqueta: "Cerrado" },
];

const niveles = [
  { valor: "", etiqueta: "Todos" },
  { valor: "bajo", etiqueta: "Bajo" },
  { valor: "medio", etiqueta: "Medio" },
  { valor: "alto", etiqueta: "Alto" },
  { valor: "critico", etiqueta: "Crítico" },
];

const categorias = [
  { valor: "", etiqueta: "Todas" },
  { valor: "Hardware", etiqueta: "Hardware" },
  { valor: "Software", etiqueta: "Software" },
  { valor: "Red", etiqueta: "Red" },
  { valor: "Correo Electrónico", etiqueta: "Correo Electrónico" },
  { valor: "Accesos", etiqueta: "Accesos" },
  { valor: "Impresoras", etiqueta: "Impresoras" },
  { valor: "Otro", etiqueta: "Otro" },
];

export default function TicketFiltros({ filtros, onFiltrar }) {
  const [filtrosLocales, setFiltrosLocales] = useState(filtros);

  function manejarCambio(evento) {
    const { name, value } = evento.target;
    const nuevos = { ...filtrosLocales, [name]: value };
    setFiltrosLocales(nuevos);
  }

  function aplicarFiltros() {
    onFiltrar(filtrosLocales);
  }

  function limpiarFiltros() {
    const limpios = { estado: "", nivel_atencion: "", categoria: "" };
    setFiltrosLocales(limpios);
    onFiltrar(limpios);
  }

  return (
    <div className="ticket-filtros">
      <div className="filtros-grupo">
        <div className="filtro-item">
          <label htmlFor="filtro-estado">Estado</label>
          <select
            id="filtro-estado"
            name="estado"
            value={filtrosLocales.estado}
            onChange={manejarCambio}
          >
            {estados.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="filtro-item">
          <label htmlFor="filtro-nivel">Nivel</label>
          <select
            id="filtro-nivel"
            name="nivel_atencion"
            value={filtrosLocales.nivel_atencion}
            onChange={manejarCambio}
          >
            {niveles.map((n) => (
              <option key={n.valor} value={n.valor}>
                {n.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="filtro-item">
          <label htmlFor="filtro-categoria">Categoría</label>
          <select
            id="filtro-categoria"
            name="categoria"
            value={filtrosLocales.categoria}
            onChange={manejarCambio}
          >
            {categorias.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="filtros-botones">
          <button onClick={aplicarFiltros}>Filtrar</button>
          <button className="boton-secundario" onClick={limpiarFiltros}>
            Limpiar
          </button>
        </div>
      </div>
    </div>
  );
}
