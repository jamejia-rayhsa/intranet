import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listarSolicitudes, responderSolicitud } from "../services/vacaciones.service";

const ESTATUS_CONFIG = {
  pendiente: { etiqueta: "Pendiente", color: "var(--color-advertencia)" },
  aprobado: { etiqueta: "Aprobado", color: "var(--color-exito)" },
  rechazado: { etiqueta: "Rechazado", color: "var(--color-error)" },
};

function BadgeEstatus({ estatus }) {
  const config = ESTATUS_CONFIG[estatus] || { etiqueta: estatus, color: "var(--color-borde)" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.6rem",
        borderRadius: "0.9rem",
        fontSize: "0.78rem",
        fontWeight: 600,
        background: config.color,
        color: "#fff",
        whiteSpace: "nowrap",
      }}
    >
      {config.etiqueta}
    </span>
  );
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return "—";
  const fecha = new Date(fechaStr);
  return fecha.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function VacacionesListadoPage() {
  const navigate = useNavigate();
  const anioActual = new Date().getFullYear();

  const [solicitudes, setSolicitudes] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [esAdmin, setEsAdmin] = useState(false);

  const [periodo, setPeriodo] = useState(anioActual);
  const [estatus, setEstatus] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");

  const [respondiendo, setRespondiendo] = useState(false);
  const [modalRechazo, setModalRechazo] = useState({ abierto: false, id: null });
  const [motivoRechazo, setMotivoRechazo] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await listarSolicitudes({
        periodo,
        estatus: estatus || undefined,
        busqueda: busquedaAplicada || undefined,
      });
      const datos = respuesta.datos || {};
      setSolicitudes(datos.solicitudes || []);
      setTotal(datos.total || 0);
      setEsAdmin(datos.es_admin || false);
    } catch (err) {
      setError(err.message || "Error al cargar solicitudes");
      setSolicitudes([]);
    } finally {
      setCargando(false);
    }
  }, [periodo, estatus, busquedaAplicada]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function aplicarFiltros(e) {
    e.preventDefault();
    setBusquedaAplicada(busqueda);
  }

  async function handleAprobar(id) {
    setRespondiendo(true);
    try {
      await responderSolicitud(id, "aprobado", null);
      await cargar();
    } catch (err) {
      alert(err.message || "Error al aprobar solicitud");
    } finally {
      setRespondiendo(false);
    }
  }

  function abrirModalRechazo(id) {
    setMotivoRechazo("");
    setModalRechazo({ abierto: true, id });
  }

  async function handleRechazar() {
    if (!motivoRechazo.trim()) {
      alert("El motivo de rechazo es obligatorio");
      return;
    }
    setRespondiendo(true);
    try {
      await responderSolicitud(modalRechazo.id, "rechazado", motivoRechazo);
      setModalRechazo({ abierto: false, id: null });
      await cargar();
    } catch (err) {
      alert(err.message || "Error al rechazar solicitud");
    } finally {
      setRespondiendo(false);
    }
  }

  const estiloInput = {
    padding: "0.45rem 0.75rem",
    border: "1px solid var(--color-borde)",
    borderRadius: "0.4rem",
    fontSize: "0.88rem",
    background: "var(--color-fondo)",
    color: "inherit",
  };

  const estiloBtnPrimario = {
    background: "var(--color-primario)",
    color: "#fff",
    border: "none",
    borderRadius: "0.4rem",
    padding: "0.45rem 1.1rem",
    fontWeight: 600,
    fontSize: "0.88rem",
    cursor: "pointer",
  };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
          Solicitudes de vacaciones
        </h1>
        <button
          onClick={() => navigate("/rh/vacaciones")}
          style={{
            ...estiloInput,
            cursor: "pointer",
            fontSize: "0.82rem",
            color: "var(--color-secundario)",
            background: "transparent",
            border: "1px solid var(--color-borde)",
          }}
        >
          ← Nueva solicitud
        </button>
      </div>
      <p style={{ color: "var(--color-texto-claro)", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
        {esAdmin ? "Todas las solicitudes del sistema." : "Solicitudes propias y de tu equipo."}
        {total > 0 && ` (${total} registro${total !== 1 ? "s" : ""})`}
      </p>

      {/* Filtros */}
      <form
        onSubmit={aplicarFiltros}
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "1.25rem",
          background: "var(--color-superficie)",
          border: "1px solid var(--color-borde)",
          borderRadius: "0.75rem",
          padding: "1rem 1.25rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, whiteSpace: "nowrap" }}>Periodo:</label>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(parseInt(e.target.value))}
            style={estiloInput}
          >
            {[anioActual - 2, anioActual - 1, anioActual, anioActual + 1].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, whiteSpace: "nowrap" }}>Estatus:</label>
          <select
            value={estatus}
            onChange={(e) => setEstatus(e.target.value)}
            style={estiloInput}
          >
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>

        {esAdmin && (
          <input
            type="text"
            placeholder="Buscar por nombre o nómina..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ ...estiloInput, minWidth: "200px" }}
          />
        )}

        <button type="submit" style={estiloBtnPrimario}>
          Aplicar
        </button>
      </form>

      {/* Tabla */}
      <div
        style={{
          background: "var(--color-superficie)",
          border: "1px solid var(--color-borde)",
          borderRadius: "0.75rem",
          padding: "1.5rem",
        }}
      >
        {cargando ? (
          <p style={{ color: "var(--color-texto-claro)" }}>Cargando solicitudes...</p>
        ) : error ? (
          <p style={{ color: "var(--color-error)" }}>{error}</p>
        ) : solicitudes.length === 0 ? (
          <p style={{ color: "var(--color-texto-claro)", fontSize: "0.9rem" }}>
            No hay solicitudes para los filtros seleccionados.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.87rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-borde)", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Folio</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Empleado</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Nómina</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Periodo</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Fechas</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Días</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Estatus</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Autorizó</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((sol) => (
                  <tr key={sol.id} style={{ borderBottom: "1px solid var(--color-borde)" }}>
                    <td style={{ padding: "0.5rem 0.75rem" }}>#{sol.id}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      {sol.nombre} {sol.apellido_paterno}
                      {sol.departamento && (
                        <div style={{ fontSize: "0.75rem", color: "var(--color-texto-claro)" }}>
                          {sol.departamento}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{sol.numero_nomina || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{sol.periodo}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      {formatearFecha(sol.fecha_inicial)} – {formatearFecha(sol.fecha_final)}
                      {sol.fecha_regreso && (
                        <div style={{ fontSize: "0.75rem", color: "var(--color-texto-claro)" }}>
                          Regresa: {formatearFecha(sol.fecha_regreso)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{sol.dias_a_disfrutar}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      <BadgeEstatus estatus={sol.estatus} />
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      {sol.autoriza_nombre || "—"}
                      {sol.estatus === "rechazado" && sol.motivo_rechazo && (
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--color-error)",
                            marginTop: "0.2rem",
                            maxWidth: "160px",
                            wordBreak: "break-word",
                          }}
                          title={sol.motivo_rechazo}
                        >
                          {sol.motivo_rechazo.length > 60
                            ? sol.motivo_rechazo.slice(0, 60) + "…"
                            : sol.motivo_rechazo}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      {sol.puede_responder && (
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          <button
                            onClick={() => handleAprobar(sol.id)}
                            disabled={respondiendo}
                            style={{
                              background: "var(--color-exito)",
                              color: "#fff",
                              border: "none",
                              borderRadius: "0.35rem",
                              padding: "0.3rem 0.65rem",
                              fontWeight: 600,
                              fontSize: "0.8rem",
                              cursor: respondiendo ? "not-allowed" : "pointer",
                              opacity: respondiendo ? 0.7 : 1,
                            }}
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => abrirModalRechazo(sol.id)}
                            disabled={respondiendo}
                            style={{
                              background: "var(--color-error)",
                              color: "#fff",
                              border: "none",
                              borderRadius: "0.35rem",
                              padding: "0.3rem 0.65rem",
                              fontWeight: 600,
                              fontSize: "0.8rem",
                              cursor: respondiendo ? "not-allowed" : "pointer",
                              opacity: respondiendo ? 0.7 : 1,
                            }}
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de rechazo */}
      {modalRechazo.abierto && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalRechazo({ abierto: false, id: null });
          }}
        >
          <div
            style={{
              background: "var(--color-superficie)",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              width: "min(440px, 90vw)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "1rem" }}>
              Motivo de rechazo
            </h3>
            <textarea
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--color-borde)",
                borderRadius: "0.4rem",
                fontSize: "0.9rem",
                background: "var(--color-fondo)",
                color: "inherit",
                boxSizing: "border-box",
                minHeight: "100px",
                resize: "vertical",
                marginBottom: "1rem",
              }}
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              placeholder="Indica el motivo por el cual se rechaza la solicitud..."
              autoFocus
            />
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setModalRechazo({ abierto: false, id: null })}
                style={{
                  background: "var(--color-fondo)",
                  border: "1px solid var(--color-borde)",
                  borderRadius: "0.4rem",
                  padding: "0.5rem 1rem",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleRechazar}
                disabled={respondiendo || !motivoRechazo.trim()}
                style={{
                  background: "var(--color-error)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0.4rem",
                  padding: "0.5rem 1rem",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: respondiendo || !motivoRechazo.trim() ? "not-allowed" : "pointer",
                  opacity: respondiendo || !motivoRechazo.trim() ? 0.6 : 1,
                }}
              >
                {respondiendo ? "Rechazando..." : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
