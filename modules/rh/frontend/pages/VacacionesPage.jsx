import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { usarAuth } from "../../../portal/frontend/context/AuthContext";
import {
  obtenerSaldo,
  crearSolicitud,
  listarSolicitudes,
  consultarDisponibilidad,
} from "../services/vacaciones.service";
import CalendarioOcupacion from "../components/CalendarioOcupacion";
import {
  rangoCompleto,
  anioDeTexto,
  notaCruceDeAnio,
  regresoValido,
  resumirDisponibilidad,
  envioBloqueado,
  textoDiasHabiles,
  fechaLegible,
  siguienteSeleccion,
  mensajeErrorRed,
  MENSAJE_ERROR_DISPONIBILIDAD,
} from "../utils/calendarioLaboral";

// Espera tras el último cambio de fechas antes de consultar la disponibilidad
const RETARDO_DISPONIBILIDAD_MS = 350;

const ESTATUS_CONFIG = {
  pendiente: { etiqueta: "Pendiente", color: "var(--color-advertencia)" },
  aprobado: { etiqueta: "Aprobado", color: "var(--color-exito)" },
  rechazado: { etiqueta: "Rechazado", color: "var(--color-error)" },
};

// Constantes de estilo — patrón EmpleadoPage (definidas fuera del componente para evitar recreación en cada render)
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
  color: "var(--color-texto-medio)",
};

const estiloBotonPrimario = {
  background: "var(--color-primario)",
  color: "#fff",
  border: "none",
  borderRadius: "0.4rem",
  padding: "0.6rem 1.4rem",
  fontWeight: 600,
  fontSize: "0.9rem",
  cursor: "pointer",
};

const estiloAviso = {
  margin: "0.5rem 0 0",
  padding: "0.6rem 0.9rem",
  borderRadius: "0.4rem",
  fontSize: "0.88rem",
  overflowWrap: "anywhere",
};

const estiloResumen = {
  background: "var(--color-fondo)",
  border: "1px solid var(--color-borde)",
  borderRadius: "0.5rem",
  padding: "0.75rem 1rem",
  display: "flex",
  gap: "0.5rem 2rem",
  flexWrap: "wrap",
};

const estiloBotonSecundario = {
  background: "var(--color-superficie)",
  border: "1px solid var(--color-borde)",
  borderRadius: "0.4rem",
  padding: "0.2rem 0.7rem",
  cursor: "pointer",
  fontSize: "0.85rem",
  color: "inherit",
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
      <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--color-texto-medio)", marginTop: "0.25rem" }}>
        {titulo}
      </div>
      {subtitulo && (
        <div style={{ fontSize: "0.75rem", color: "var(--color-texto-medio)" }}>
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
  const [disp, setDisp] = useState({ estado: "ocioso", resumen: null, error: "" });
  const [versionDisp, setVersionDisp] = useState(0);

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

  // Días hábiles, cupo y conflictos los calcula el backend (única fuente de la regla). El efecto espera
  // a que el usuario termine de elegir fechas y descarta las respuestas de peticiones ya obsoletas.
  useEffect(() => {
    if (!rangoCompleto(formulario.fecha_inicial, formulario.fecha_final)) {
      setDisp({ estado: "ocioso", resumen: null, error: "" });
      return undefined;
    }
    let vigente = true;
    setDisp((d) => ({ estado: "cargando", resumen: d.resumen, error: "" }));
    const temporizador = setTimeout(async () => {
      try {
        const respuesta = await consultarDisponibilidad({
          fecha_inicial: formulario.fecha_inicial,
          fecha_final: formulario.fecha_final,
        });
        if (!vigente) return;
        if (respuesta && respuesta.exito === true && respuesta.datos) {
          setDisp({ estado: "listo", resumen: resumirDisponibilidad(respuesta.datos), error: "" });
        } else {
          setDisp({ estado: "error", resumen: null, error: (respuesta && respuesta.mensaje) || MENSAJE_ERROR_DISPONIBILIDAD });
        }
      } catch (error) {
        if (!vigente) return;
        setDisp({ estado: "error", resumen: null, error: mensajeErrorRed(error, MENSAJE_ERROR_DISPONIBILIDAD) });
      }
    }, RETARDO_DISPONIBILIDAD_MS);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [formulario.fecha_inicial, formulario.fecha_final, versionDisp]);

  // El saldo mostrado sigue al año de la fecha inicial elegida (el servidor siempre usa ese año)
  useEffect(() => {
    const anio = anioDeTexto(formulario.fecha_inicial);
    if (anio !== null) setPeriodo(anio);
  }, [formulario.fecha_inicial]);

  const resumen = disp.resumen;
  const bloqueado = envioBloqueado(disp, enviando) || !saldo || cargandoSaldo;
  const notaCruce = notaCruceDeAnio(formulario.fecha_inicial, formulario.fecha_final);
  const opcionesPeriodo = [...new Set([anioActual - 1, anioActual, anioActual + 1, periodo])].sort();

  function elegirDesdeCalendario(fecha) {
    setFormulario((f) => {
      const { inicio, fin } = siguienteSeleccion({ inicio: f.fecha_inicial, fin: f.fecha_final }, fecha);
      return { ...f, fecha_inicial: inicio, fecha_final: fin };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (envioBloqueado(disp, enviando) || !saldo || cargandoSaldo) return;
    setMensajeFormulario(null);

    if (!formulario.fecha_inicial || !formulario.fecha_final) {
      setMensajeFormulario({ tipo: "error", texto: "La fecha inicial y final son obligatorias" });
      return;
    }

    if (formulario.fecha_final < formulario.fecha_inicial) {
      setMensajeFormulario({ tipo: "error", texto: "La fecha final no puede ser anterior a la inicial" });
      return;
    }

    if (!regresoValido(formulario.fecha_final, formulario.fecha_regreso)) {
      setMensajeFormulario({ tipo: "error", texto: "La fecha de regreso no puede ser anterior a la fecha final" });
      return;
    }

    // Saldo, traslape y cupo los valida el backend (y los anticipa /disponibilidad)
    setEnviando(true);
    try {
      // Sin `periodo`: el servidor lo deriva del año de la fecha inicial
      await crearSolicitud({ ...formulario });
      setMensajeFormulario({ tipo: "exito", texto: "Solicitud enviada exitosamente. Tu jefe inmediato recibirá una notificación." });
      setFormulario({ fecha_inicial: "", fecha_final: "", fecha_regreso: "", observaciones: "" });
      setVersionDisp((v) => v + 1);
      await cargarSaldo();
      await cargarHistorial();
    } catch (error) {
      // 400 (validación, saldo, 0 hábiles) y 409 (traslape, cupo): se muestra el mensaje del servidor
      // y se refresca la disponibilidad (otra persona pudo ocupar el cupo mientras tanto)
      setMensajeFormulario({ tipo: "error", texto: mensajeErrorRed(error, "Error al enviar solicitud") });
      setVersionDisp((v) => v + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Vacaciones
      </h1>
      <p style={{ color: "var(--color-texto-medio)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Gestiona tus solicitudes de vacaciones y consulta tu saldo disponible.
      </p>

      {/* Selector de periodo */}
      <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <label htmlFor="vac-periodo" style={{ fontWeight: 600, fontSize: "0.9rem" }}>Ver periodo (solo consulta):</label>
        <select
          id="vac-periodo"
          value={periodo}
          onChange={(e) => setPeriodo(parseInt(e.target.value))}
          style={{ ...estiloInput, width: "auto" }}
        >
          {opcionesPeriodo.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Sección 1 — Saldo de vacaciones */}
      <div style={estiloSeccion}>
        <div style={estiloTituloSeccion}>Saldo de vacaciones — {periodo}</div>
        {cargandoSaldo ? (
          <p style={{ color: "var(--color-texto-medio)" }}>Calculando saldo...</p>
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
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label htmlFor="vac-fecha-inicial" style={estiloLabel}>Fecha inicial *</label>
              <input
                id="vac-fecha-inicial"
                type="date"
                style={estiloInput}
                value={formulario.fecha_inicial}
                onChange={(e) => setFormulario((f) => ({ ...f, fecha_inicial: e.target.value }))}
                required
              />
            </div>
            <div>
              <label htmlFor="vac-fecha-final" style={estiloLabel}>Fecha final *</label>
              <input
                id="vac-fecha-final"
                type="date"
                style={estiloInput}
                value={formulario.fecha_final}
                onChange={(e) => setFormulario((f) => ({ ...f, fecha_final: e.target.value }))}
                required
                min={formulario.fecha_inicial}
              />
            </div>
            <div>
              <label htmlFor="vac-fecha-regreso" style={estiloLabel}>Fecha de regreso</label>
              <input
                id="vac-fecha-regreso"
                type="date"
                style={estiloInput}
                value={formulario.fecha_regreso}
                onChange={(e) => setFormulario((f) => ({ ...f, fecha_regreso: e.target.value }))}
                min={formulario.fecha_final}
              />
            </div>
          </div>

          {notaCruce && (
            <p style={{ ...estiloAviso, background: "var(--color-info-suave)", color: "#0c4a6e", margin: "0 0 1rem" }}>{notaCruce}</p>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <CalendarioOcupacion
              inicio={formulario.fecha_inicial}
              fin={formulario.fecha_final}
              cupo={resumen ? resumen.cupo : undefined}
              version={versionDisp}
              onElegir={elegirDesdeCalendario}
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="vac-observaciones" style={estiloLabel}>Observaciones</label>
            <textarea
              id="vac-observaciones"
              style={{ ...estiloInput, minHeight: "80px", resize: "vertical" }}
              value={formulario.observaciones}
              onChange={(e) => setFormulario((f) => ({ ...f, observaciones: e.target.value }))}
              placeholder="Comentarios adicionales (opcional)"
            />
          </div>

          <div aria-live="polite" style={{ marginBottom: "1rem" }}>
            {disp.estado === "cargando" && (
              <p style={{ margin: 0, color: "var(--color-texto-medio)", fontSize: "0.9rem" }}>Calculando días hábiles…</p>
            )}
            {disp.estado === "error" && (
              <p role="alert" style={{ ...estiloAviso, background: "var(--color-error-suave)", color: "#7f1d1d" }}>
                {disp.error}{" "}
                <button type="button" style={estiloBotonSecundario} onClick={() => setVersionDisp((v) => v + 1)}>Reintentar</button>
              </p>
            )}
            {disp.estado === "listo" && resumen && (
              <div style={estiloResumen}>
                <span style={{ fontSize: "0.9rem" }}>
                  <strong>Días hábiles a descontar:</strong> {resumen.dias}
                </span>
                {resumen.quedarian !== null && (
                  <span
                    style={{
                      fontSize: "0.9rem",
                      color: resumen.quedarian < 0 ? "#7f1d1d" : "#14532d",
                      fontWeight: 600,
                    }}
                  >
                    Saldo restante: {resumen.quedarian} {resumen.quedarian === 1 ? "día" : "días"}
                  </span>
                )}
              </div>
            )}
            {disp.estado === "listo" && resumen && resumen.noHabiles.length > 0 && (
              <div style={{ ...estiloAviso, background: "var(--color-info-suave)", color: "#0c4a6e" }}>
                <strong>Días no hábiles en tu rango (no se descuentan):</strong>
                <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.2rem" }}>
                  {resumen.noHabiles.map((d) => (
                    <li key={`${d.fecha}-${d.tipo}`}>
                      {fechaLegible(d.fecha)} — {d.nombre} ({d.etiquetaTipo})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {disp.estado === "listo" && resumen && resumen.eventos.length > 0 && (
              <div style={{ ...estiloAviso, background: "var(--color-info-suave)", color: "#0c4a6e" }}>
                <strong>Eventos en tu rango (solo informativo, no bloquean):</strong>
                <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.2rem" }}>
                  {resumen.eventos.map((e) => (
                    <li key={`${e.fecha}-${e.nombre}`}>{fechaLegible(e.fecha)} — {e.nombre}</li>
                  ))}
                </ul>
              </div>
            )}
            {disp.estado === "listo" && resumen && resumen.bloqueadas.length > 0 && (
              <div style={{ ...estiloAviso, background: "#ede9fe", color: "#4c1d95", border: "1px solid #4c1d95" }}>
                <strong><span aria-hidden="true">■ </span>Fechas bloqueadas en tu rango (Día Actividad Empresa, no se pueden solicitar):</strong>
                <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.2rem" }}>
                  {resumen.bloqueadas.map((b) => (
                    <li key={`${b.fecha}-${b.nombre}`}>{fechaLegible(b.fecha)} — Bloqueado: {b.nombre}</li>
                  ))}
                </ul>
              </div>
            )}
            {disp.estado === "listo" && resumen && resumen.conflicto && (
              <p role="alert" style={{ ...estiloAviso, background: "var(--color-error-suave)", color: "#7f1d1d", fontWeight: 600 }}>
                {resumen.conflicto.mensaje}
              </p>
            )}
            {disp.estado === "listo" && resumen && !resumen.conflicto && resumen.dias > 0 && (
              <span className="sr-only-cal">{`Se descontarán ${textoDiasHabiles(resumen.dias)}.`}</span>
            )}
          </div>

          {mensajeFormulario && (
            <div
              role={mensajeFormulario.tipo === "exito" ? "status" : "alert"}
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "0.5rem",
                marginBottom: "1rem",
                background: mensajeFormulario.tipo === "exito" ? "#14532d" : "#991b1b",
                color: "#fff",
                fontSize: "0.9rem",
                overflowWrap: "anywhere",
              }}
            >
              {mensajeFormulario.texto}
            </div>
          )}

          <button
            type="submit"
            disabled={bloqueado}
            style={{
              ...estiloBotonPrimario,
              cursor: bloqueado ? "not-allowed" : "pointer",
              opacity: bloqueado ? 0.6 : 1,
            }}
          >
            {enviando ? "Enviando..." : "Solicitar vacaciones"}
          </button>
          {!enviando && disp.estado === "ocioso" && (
            <span style={{ marginLeft: "0.75rem", fontSize: "0.82rem", color: "var(--color-texto-medio)" }}>
              Elige las fechas inicial y final para continuar.
            </span>
          )}
        </form>
      </div>

      {/* Sección 3 — Historial de solicitudes propias */}
      <div style={estiloSeccion}>
        <div style={estiloTituloSeccion}>Mis solicitudes</div>
        {cargandoHistorial ? (
          <p style={{ color: "var(--color-texto-medio)" }}>Cargando historial...</p>
        ) : historial.length === 0 ? (
          <p style={{ color: "var(--color-texto-medio)", fontSize: "0.9rem" }}>No hay solicitudes para este periodo.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-borde)", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Folio</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Fecha solicitud</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Periodo</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Fechas</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Días hábiles</th>
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
        {historial.length > 0 && (
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.8rem", color: "var(--color-texto-medio)" }}>
            Los días se cuentan como días hábiles (sin fines de semana, días oficiales ni descansos otorgados). Las solicitudes registradas antes de este cambio conservan los días naturales con que se capturaron.
          </p>
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
