import { useState, useEffect } from "react";
import {
  obtenerTicket,
  actualizarEstadoTicket,
  asignarTecnico,
  obtenerTecnicos,
} from "../services/tickets.service";
import {
  obtenerAdjuntos,
  subirAdjunto,
  eliminarAdjunto,
} from "../services/adjuntos.service";
import { enviarEncuesta, obtenerEncuesta } from "../services/encuestas.service";
import {
  obtenerComentarios,
  crearComentario,
} from "../services/comentarios.service";
import AdjuntosUploader from "../components/AdjuntosUploader";
import SatisfactionSurvey from "../components/SatisfactionSurvey";
import { usarAuth } from "../../../portal/frontend/context/AuthContext";

function tienePermisosTickets(usuario) {
  if (!usuario) return false;
  const roles = usuario.roles || [];
  const permisos = usuario.permisos || [];
  return (
    roles.includes("super_admin") ||
    roles.includes("tickets_admin") ||
    permisos.includes("tickets.admin") ||
    permisos.includes("tickets.technician")
  );
}

function formatearTiempo(segundos) {
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${minutos}m`;
  return `${minutos}m`;
}

const etiquetasEstado = {
  abierto: "Abierto",
  asignado: "Asignado",
  en_progreso: "En Progreso",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
};

const coloresEstado = {
  abierto: "badge-abierto",
  en_progreso: "badge-progreso",
  resuelto: "badge-resuelto",
  cerrado: "badge-cerrado",
};

const etiquetasNivel = {
  bajo: "Bajo",
  medio: "Medio",
  alto: "Alto",
  critico: "Crítico",
};

const coloresNivel = {
  bajo: "badge-bajo",
  medio: "badge-medio",
  alto: "badge-alto",
  critico: "badge-critico",
};

export default function TicketDetail({ ticketId, alVolver, onEstadoCambiado }) {
  const { usuario } = usarAuth();
  const [ticket, setTicket] = useState(null);
  const [adjuntos, setAdjuntos] = useState([]);
  const [encuesta, setEncuesta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [tecnicos, setTecnicos] = useState([]);
  const [tecnicoSeleccionado, setTecnicoSeleccionado] = useState("");
  const [comentarios, setComentarios] = useState([]);
  const [nuevoComentario, setNuevoComentario] = useState("");
  const puedeCambiarEstado = tienePermisosTickets(usuario);
  const puedeComentar =
    ticket && ticket.estado !== "cerrado" && ticket.estado !== "abierto";

  useEffect(() => {
    cargarDetalle();
    if (puedeCambiarEstado) cargarTecnicos();
  }, [ticketId]);

  async function cargarDetalle() {
    try {
      const [respuestaTicket, respuestaAdjuntos] = await Promise.all([
        obtenerTicket(ticketId),
        obtenerAdjuntos(ticketId),
      ]);

      if (respuestaTicket.exito) {
        setTicket(respuestaTicket.datos);
      }

      if (respuestaAdjuntos.exito) {
        setAdjuntos(respuestaAdjuntos.datos);
      }

      try {
        const respComentarios = await obtenerComentarios(ticketId);
        if (respComentarios.exito) {
          setComentarios(respComentarios.datos);
        }
      } catch {
        setComentarios([]);
      }

      try {
        const respuestaEncuesta = await obtenerEncuesta(ticketId);
        if (respuestaEncuesta.exito) {
          setEncuesta(respuestaEncuesta.datos);
        }
      } catch {
        setEncuesta(null);
      }
    } catch (error) {
      console.error("Error al cargar detalle:", error);
      setError(
        "Error al cargar el detalle del ticket: " + (error.message || ""),
      );
    } finally {
      setCargando(false);
    }
  }

  async function manejarCambioEstado(nuevoEstado) {
    try {
      await actualizarEstadoTicket(ticketId, nuevoEstado);
      cargarDetalle();
      if (onEstadoCambiado) onEstadoCambiado();
    } catch (error) {
      console.error("Error al cambiar estado:", error);
    }
  }

  async function cargarTecnicos() {
    try {
      const respuesta = await obtenerTecnicos();
      if (respuesta.exito) setTecnicos(respuesta.datos);
    } catch (error) {
      console.error("Error al cargar técnicos:", error);
    }
  }

  async function manejarAsignacion(evento) {
    evento.preventDefault();
    if (!tecnicoSeleccionado) return;
    try {
      await asignarTecnico(ticketId, parseInt(tecnicoSeleccionado));
      await actualizarEstadoTicket(ticketId, "asignado");
      cargarDetalle();
      if (onEstadoCambiado) onEstadoCambiado();
      setTecnicoSeleccionado("");
    } catch (error) {
      console.error("Error al asignar técnico:", error);
    }
  }

  async function manejarSubidaArchivo(archivo) {
    try {
      await subirAdjunto(ticketId, archivo);
      cargarDetalle();
    } catch (error) {
      console.error("Error al subir archivo:", error);
    }
  }

  async function manejarEliminarAdjunto(adjuntoId) {
    try {
      await eliminarAdjunto(adjuntoId);
      setAdjuntos(adjuntos.filter((a) => a.id !== adjuntoId));
    } catch (error) {
      console.error("Error al eliminar adjunto:", error);
    }
  }

  async function manejarEnviarEncuesta(calificacion, comentarios) {
    try {
      await enviarEncuesta(ticketId, calificacion, comentarios);
      const respuesta = await obtenerEncuesta(ticketId);
      if (respuesta.exito) {
        setEncuesta(respuesta.datos);
      }
    } catch (error) {
      console.error("Error al enviar encuesta:", error);
    }
  }

  async function manejarEnviarComentario(evento) {
    evento.preventDefault();
    if (!nuevoComentario.trim()) return;
    try {
      await crearComentario(ticketId, nuevoComentario.trim());
      setNuevoComentario("");
      const resp = await obtenerComentarios(ticketId);
      if (resp.exito) setComentarios(resp.datos);
    } catch (error) {
      console.error("Error al enviar comentario:", error);
    }
  }

  if (cargando) {
    return <div className="cargando">Cargando detalle del ticket...</div>;
  }

  if (error) {
    return <div className="mensaje-error">{error}</div>;
  }

  if (!ticket) {
    return <div className="mensaje-info">Ticket no encontrado</div>;
  }

  return (
    <div className="ticket-detalle">
      <button onClick={alVolver} className="boton-volver">
        ← Volver a la lista
      </button>

      <div className="ticket-encabezado">
        <h1>{ticket.titulo}</h1>
        <span className={`badge ${coloresEstado[ticket.estado]}`}>
          {etiquetasEstado[ticket.estado]}
        </span>
        <span className={`badge ${coloresNivel[ticket.nivel_atencion]}`}>
          {etiquetasNivel[ticket.nivel_atencion]}
        </span>
      </div>

      <div className="ticket-info">
        <div className="info-grupo">
          <strong>Categoría:</strong> {ticket.categoria || "Sin categoría"}
        </div>
        <div className="info-grupo">
          <strong>Creado por:</strong> {ticket.usuario_nombre}{" "}
          {ticket.usuario_apellido}
        </div>
        <div className="info-grupo">
          <strong>Fecha de creación:</strong>{" "}
          {new Date(ticket.fecha_creacion).toLocaleDateString("es-MX")}
        </div>
        {ticket.tecnico_nombre && (
          <div className="info-grupo">
            <strong>Técnico asignado:</strong> {ticket.tecnico_nombre}{" "}
            {ticket.tecnico_apellido}
          </div>
        )}
        {ticket.fecha_cierre && (
          <div className="info-grupo">
            <strong>Fecha de cierre:</strong>{" "}
            {new Date(ticket.fecha_cierre).toLocaleDateString("es-MX")}
          </div>
        )}
        {ticket.tiempo_resolucion_segundos && (
          <div className="info-grupo">
            <strong>Tiempo de resolución:</strong>{" "}
            {formatearTiempo(ticket.tiempo_resolucion_segundos)}
          </div>
        )}
      </div>

      <div className="ticket-descripcion">
        <h2>Descripción</h2>
        <p>{ticket.descripcion || "Sin descripción"}</p>
      </div>

      {puedeCambiarEstado && (
        <div className="ticket-acciones">
          <h2>Gestión del Ticket</h2>
          {ticket.estado === "abierto" && (
            <div className="asignar-tecnico">
              <h3>Asignar Técnico</h3>
              <form onSubmit={manejarAsignacion} className="asignar-form">
                <select
                  value={tecnicoSeleccionado}
                  onChange={(e) => setTecnicoSeleccionado(e.target.value)}
                  required
                >
                  <option value="">Seleccionar técnico...</option>
                  {tecnicos.map((tec) => (
                    <option key={tec.id} value={tec.id}>
                      {tec.nombre} {tec.apellido} ({tec.correo})
                    </option>
                  ))}
                </select>
                <button type="submit">Asignar</button>
              </form>
            </div>
          )}
          <div className="estados-botones">
            {ticket.estado === "asignado" && (
              <button onClick={() => manejarCambioEstado("en_progreso")}>
                Tomar en Progreso
              </button>
            )}
            {ticket.estado === "en_progreso" && (
              <button onClick={() => manejarCambioEstado("resuelto")}>
                Marcar como Resuelto
              </button>
            )}
            {ticket.estado === "resuelto" && (
              <button onClick={() => manejarCambioEstado("cerrado")}>
                Cerrar Ticket
              </button>
            )}
          </div>
        </div>
      )}

      <div className="ticket-adjuntos">
        <h2>Archivos Adjuntos ({adjuntos.length})</h2>
        <AdjuntosUploader ticketId={ticketId} onSubir={manejarSubidaArchivo} />
        {adjuntos.length > 0 && (
          <ul className="adjuntos-lista">
            {adjuntos.map((adjunto) => (
              <li key={adjunto.id} className="adjunto-item">
                <a
                  href={adjunto.ruta_archivo}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {adjunto.nombre_archivo}
                </a>
                <button
                  className="boton-eliminar"
                  onClick={() => manejarEliminarAdjunto(adjunto.id)}
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {puedeComentar && (
        <div className="ticket-comentarios">
          <h2>Comentarios ({comentarios.length})</h2>

          {comentarios.length > 0 && (
            <div className="comentarios-lista">
              {comentarios.map((comentario) => (
                <div key={comentario.id} className="comentario-item">
                  <div className="comentario-header">
                    <span className="comentario-autor">
                      {comentario.usuario_nombre} {comentario.usuario_apellido}
                    </span>
                    <span className="comentario-fecha">
                      {new Date(comentario.fecha_creacion).toLocaleString(
                        "es-MX",
                      )}
                    </span>
                  </div>
                  <p className="comentario-texto">{comentario.comentario}</p>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={manejarEnviarComentario} className="comentario-form">
            <div className="campo">
              <label htmlFor="nuevo-comentario">Agregar comentario</label>
              <textarea
                id="nuevo-comentario"
                value={nuevoComentario}
                onChange={(e) => setNuevoComentario(e.target.value)}
                rows={3}
                placeholder="Escribe un comentario..."
                required
              />
            </div>
            <button type="submit">Enviar</button>
          </form>
        </div>
      )}

      {ticket.estado === "resuelto" && !encuesta && (
        <SatisfactionSurvey
          ticketId={ticketId}
          onEnviar={manejarEnviarEncuesta}
        />
      )}

      {encuesta && (
        <div className="encuesta-enviada">
          <h2>Encuesta de Satisfacción</h2>
          <p>Calificación: {encuesta.calificacion}/5</p>
          {encuesta.comentarios && <p>Comentarios: {encuesta.comentarios}</p>}
        </div>
      )}
    </div>
  );
}
