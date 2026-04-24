import { useState, useEffect } from "react";
import {
  obtenerTickets,
  actualizarEstadoTicket,
} from "../services/tickets.service";
import TicketList from "../components/TicketList";
import TicketFiltros from "../components/TicketFiltros";
import TicketForm from "../components/TicketForm";

export default function TicketPage() {
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [paginasTotales, setPaginasTotales] = useState(1);
  const [filtros, setFiltros] = useState({
    estado: "",
    nivel_atencion: "",
    categoria: "",
  });
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  useEffect(() => {
    cargarTickets();
  }, [pagina, filtros]);

  async function cargarTickets() {
    setCargando(true);
    try {
      const respuesta = await obtenerTickets({
        pagina,
        limite: 15,
        ...filtros,
      });
      if (respuesta.exito) {
        setTickets(respuesta.datos.tickets);
        setPaginasTotales(respuesta.datos.paginas_totales);
      }
    } catch (error) {
      console.error("Error al cargar tickets:", error);
    } finally {
      setCargando(false);
    }
  }

  function manejarFiltros(nuevosFiltros) {
    setFiltros(nuevosFiltros);
    setPagina(1);
  }

  async function manejarCambioEstado(ticketId, nuevoEstado) {
    try {
      await actualizarEstadoTicket(ticketId, nuevoEstado);
      cargarTickets();
    } catch (error) {
      console.error("Error al cambiar estado:", error);
    }
  }

  if (mostrarFormulario) {
    return (
      <div className="tickets-page">
        <TicketForm
          alGuardar={() => {
            setMostrarFormulario(false);
            cargarTickets();
          }}
          alCancelar={() => setMostrarFormulario(false)}
        />
      </div>
    );
  }

  if (cargando) {
    return <div className="cargando">Cargando tickets...</div>;
  }

  return (
    <div className="tickets-page">
      <div className="tickets-encabezado">
        <h1>Tickets de Soporte TI</h1>
        <button
          className="boton-nuevo-ticket"
          onClick={() => setMostrarFormulario(true)}
        >
          Nuevo Ticket
        </button>
      </div>

      <TicketFiltros filtros={filtros} onFiltrar={manejarFiltros} />

      <TicketList
        tickets={tickets}
        onCambioEstado={manejarCambioEstado}
        onRefresh={cargarTickets}
      />

      {paginasTotales > 1 && (
        <div className="paginacion">
          <button disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </button>
          <span>
            Página {pagina} de {paginasTotales}
          </span>
          <button
            disabled={pagina >= paginasTotales}
            onClick={() => setPagina(pagina + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
