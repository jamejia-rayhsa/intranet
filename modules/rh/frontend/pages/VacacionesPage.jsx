import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { usarAuth } from "../../../portal/frontend/context/AuthContext";
import {
  obtenerSaldo,
  crearSolicitud,
  listarSolicitudes,
} from "../services/vacaciones.service";

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

function TarjetaSaldo({ titulo, valor, subtitulo }) {
  return (
    <div
      style={{
        background: "var(--color-superficie)",
        border: "1px solid var(--color-borde)",
        borderRadius: "0.75rem",
        padding: "1.25rem 1.5rem",
        textAlign: "center",
        minWidth: "140px",
        flex: "1",
      }}
    >
      <div
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          color: "var(--color-primario)",
        }}
      >
        {valor}
      </div>
      <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--color-texto-claro)", marginTop: "0.25rem" }}>
        {titulo}
      </div>
      {subtitulo && (
        <div style={{ fontSize: "0.75rem", color: "var(--color-texto-claro)", opacity: 0.7 }}>
          {subtitulo}
        </div>
      )}
    </div>
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

export default function VacacionesPage() {
  const { usuario } = usarAuth();
  const navigate = useNavigate();
  const anioActual = new Date().getFullYear();

  const [periodo, setPeriodo] = useState(anioActual);
  const [saldo, setSaldo] = useState(null);
  const [cargandoSaldo, setCargandoSaldo] = useState(true);

  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);

  const [formulario, setFormulario] = useState({
    fecha_inicial: "",
    fecha_final: "",
    fecha_regreso: "",
    observaciones: "",
  });

  const [enviando, setEnviando] = useState(false);
  const [mensajeFormulario, setMensajeFormulario] = useState(null);

  const cargarSaldo = useCallback(async () => {
    setCargandoSaldo(true);
    try {
      const respuesta = await obtenerSaldo(null, periodo);
      setSaldo(respuesta.datos);
    } catch (error) {
      setSaldo(null);
    } finally {
      setCargandoSaldo(false);
    }
  }, [periodo]);

  const cargarHistorial = useCallback(async () => {
    setCargandoHistorial(true);
    try {
      const respuesta = await listarSolicitudes({ periodo });
      setHistorial(respuesta.datos?.solicitudes || []);
    } catch (error) {
      setHistorial([]);
    } finally {
      setCargandoHistorial(false);
    }
  }, [periodo]);

  useEffect(() => {
    cargarSaldo();
    cargarHistorial();
  }, [cargarSaldo, cargarHistorial]);

  const diasSolicitados = (() => {
    if (!formulario.fecha_inicial || !formulario.fecha_final) return 0;
    const inicio = new Date(formulario.fecha_inicial);
    const fin = new Date(formulario.fecha_final);
    if (fin < inicio) return 0;
    return Math.round((fin - inicio) / (1000 * 60 * 60 * 24)) + 1;
  })();

  const diasQueQuedan =
    saldo ? Math.max(0, saldo.dias_pendientes - diasSolicitados) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setMensajeFormulario(null);

    if (!formulario.fecha_inicial || !formulario.fecha_final) {
      setMensajeFormulario({ tipo: "error", texto: "La fecha inicial y final son obligatorias" });
      return;
    }

    if (new Date(formulario.fecha_final) < new Date(formulario.fecha_inicial)) {
      setMensajeFormulario({ tipo: "error", texto: "La fecha final no puede ser anterior a la inicial" });
      return;
    }

    if (saldo && diasSolicitados > saldo.dias_pendientes) {
      setMensajeFormulario({
        tipo: "error",
        texto: `No hay suficientes días disponibles. Disponibles: ${saldo.dias_pendientes}, solicitados: ${diasSolicitados}`,
      });
      return;
    }

    setEnviando(true);
    try {
      await crearSolicitud({
        ...formulario,
        periodo,
      });
      setMensajeFormulario({ tipo: "exito", texto: "Solicitud enviada exitosamente. Tu jefe inmediato recibirá una notificación." });
      setFormulario({ fecha_inicial: "", fecha_final: "", fecha_regreso: "", observaciones: "" });
      await cargarSaldo();
      await cargarHistorial();
    } catch (error) {
      setMensajeFormulario({ tipo: "error", texto: error.message || "Error al enviar solicitud" });
    } finally {
      setEnviando(false);
    }
  }

  const estiloSeccion = {
    background: "var(--color-superficie)",
    border: "1px solid var(--color-borde)",
    borderRadius: "0.75rem",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  };

  const estiloTituloSeccion = {
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "var(--color-primario)",
    marginBottom: "1.25rem",
    paddingBottom: "0.5rem",
    borderBottom: "2px solid var(--color-borde)",
  };

  const estiloInput = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    border: "1px solid var(--color-borde)",
    borderRadius: "0.4rem",
    fontSize: "0.9rem",
    background: "var(--color-fondo)",
    color: "inherit",
    boxSizing: "border-box",
  };

  const estiloLabel = {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 600,
    marginBottom: "0.3rem",
    color: "var(--color-texto-claro)",
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Vacaciones
      </h1>
      <p style={{ color: "var(--color-texto-claro)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Gestiona tus solicitudes de vacaciones y consulta tu saldo disponible.
      </p>

      {/* Selector de periodo */}
      <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <label style={{ fontWeight: 600, fontSize: "0.9rem" }}>Periodo:</label>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(parseInt(e.target.value))}
          style={{ ...estiloInput, width: "auto" }}
        >
          {[anioActual - 1, anioActual, anioActual + 1].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Sección 1 — Saldo de vacaciones */}
      <div style={estiloSeccion}>
        <div style={estiloTituloSeccion}>Saldo de vacaciones — {periodo}</div>
        {cargandoSaldo ? (
          <p style={{ color: "var(--color-texto-claro)" }}>Calculando saldo...</p>
        ) : saldo ? (
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <TarjetaSaldo titulo="Días del periodo" valor={saldo.dias_periodo} subtitulo={`Antigüedad: ${saldo.antiguedad} año(s)`} />
            <TarjetaSaldo titulo="Días disfrutados" valor={saldo.dias_disfrutados} subtitulo="Solicitudes aprobadas" />
            <TarjetaSaldo titulo="Días disponibles" valor={saldo.dias_pendientes} subtitulo="Para este periodo" />
          </div>
        ) : (
          <p style={{ color: "var(--color-error)" }}>No se pudo calcular el saldo. Verifica que tu perfil de empleado esté completo.</p>
        )}
      </div>

      {/* Sección 2 — Formulario de solicitud */}
      <div style={estiloSeccion}>
        <div style={estiloTituloSeccion}>Nueva solicitud de vacaciones</div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={estiloLabel}>Fecha inicial *</label>
              <input
                type="date"
                style={estiloInput}
                value={formulario.fecha_inicial}
                onChange={(e) => setFormulario((f) => ({ ...f, fecha_inicial: e.target.value }))}
                required
              />
            </div>
            <div>
              <label style={estiloLabel}>Fecha final *</label>
              <input
                type="date"
                style={estiloInput}
                value={formulario.fecha_final}
                onChange={(e) => setFormulario((f) => ({ ...f, fecha_final: e.target.value }))}
                required
                min={formulario.fecha_inicial}
              />
            </div>
            <div>
              <label style={estiloLabel}>Fecha de regreso</label>
              <input
                type="date"
                style={estiloInput}
                value={formulario.fecha_regreso}
                onChange={(e) => setFormulario((f) => ({ ...f, fecha_regreso: e.target.value }))}
                min={formulario.fecha_final}
              />
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={estiloLabel}>Observaciones</label>
            <textarea
              style={{ ...estiloInput, minHeight: "80px", resize: "vertical" }}
              value={formulario.observaciones}
              onChange={(e) => setFormulario((f) => ({ ...f, observaciones: e.target.value }))}
              placeholder="Comentarios adicionales (opcional)"
            />
          </div>

          {formulario.fecha_inicial && formulario.fecha_final && diasSolicitados > 0 && (
            <div
              style={{
                background: "var(--color-fondo)",
                border: "1px solid var(--color-borde)",
                borderRadius: "0.5rem",
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
                display: "flex",
                gap: "2rem",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "0.9rem" }}>
                <strong>Días a disfrutar:</strong> {diasSolicitados}
              </span>
              {saldo && (
                <span
                  style={{
                    fontSize: "0.9rem",
                    color: diasQueQuedan < 0 ? "var(--color-error)" : "var(--color-exito)",
                    fontWeight: 600,
                  }}
                >
                  Días que quedarían: {diasQueQuedan}
                </span>
              )}
            </div>
          )}

          {mensajeFormulario && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "0.5rem",
                marginBottom: "1rem",
                background:
                  mensajeFormulario.tipo === "exito"
                    ? "var(--color-exito)"
                    : "var(--color-error)",
                color: "#fff",
                fontSize: "0.9rem",
              }}
            >
              {mensajeFormulario.texto}
            </div>
          )}

          <button
            type="submit"
            disabled={enviando || !saldo}
            style={{
              background: "var(--color-primario)",
              color: "#fff",
              border: "none",
              borderRadius: "0.4rem",
              padding: "0.6rem 1.4rem",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: enviando ? "not-allowed" : "pointer",
              opacity: enviando ? 0.7 : 1,
            }}
          >
            {enviando ? "Enviando..." : "Solicitar vacaciones"}
          </button>
        </form>
      </div>

      {/* Sección 3 — Historial de solicitudes propias */}
      <div style={estiloSeccion}>
        <div style={estiloTituloSeccion}>Mis solicitudes</div>
        {cargandoHistorial ? (
          <p style={{ color: "var(--color-texto-claro)" }}>Cargando historial...</p>
        ) : historial.length === 0 ? (
          <p style={{ color: "var(--color-texto-claro)", fontSize: "0.9rem" }}>No hay solicitudes para este periodo.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-borde)", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Folio</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Fecha solicitud</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Periodo</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Fechas</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Días</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Estatus</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Motivo rechazo</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((sol) => (
                  <tr
                    key={sol.id}
                    style={{ borderBottom: "1px solid var(--color-borde)" }}
                  >
                    <td style={{ padding: "0.5rem 0.75rem" }}>#{sol.id}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{formatearFecha(sol.fecha_solicitud)}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{sol.periodo}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      {formatearFecha(sol.fecha_inicial)} – {formatearFecha(sol.fecha_final)}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{sol.dias_a_disfrutar}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      <BadgeEstatus estatus={sol.estatus} />
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", maxWidth: "200px", wordBreak: "break-word" }}>
                      {sol.estatus === "rechazado" ? sol.motivo_rechazo || "—" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ textAlign: "right", marginTop: "0.75rem" }}>
          <a
            href="/rh/vacaciones/listado"
            style={{ fontSize: "0.85rem", color: "var(--color-secundario)" }}
            onClick={(e) => { e.preventDefault(); navigate("/rh/vacaciones/listado"); }}
          >
            Ver todas las solicitudes →
          </a>
        </div>
      </div>
    </div>
  );
}
