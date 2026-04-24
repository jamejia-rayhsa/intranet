import { useState, useEffect } from "react";
import { solicitarPermiso } from "../services/permisos.service";
import { obtenerMiPerfil } from "../services/empleados.service";
import { usarAuth } from "../../../portal/frontend/context/AuthContext";

const tiposPermiso = [
  { valor: "vacaciones", etiqueta: "Vacaciones" },
  { valor: "incapacidad", etiqueta: "Incapacidad" },
  { valor: "asunto_personal", etiqueta: "Asunto Personal" },
  { valor: "otro", etiqueta: "Otro" },
];

export default function PermisosForm({ empleadoId, alGuardar, alCancelar }) {
  const { usuario } = usarAuth();
  const [empleado, setEmpleado] = useState(null);
  const [sinPerfil, setSinPerfil] = useState(false);
  const [formulario, setFormulario] = useState({
    empleado_id: empleadoId || "",
    tipo: "vacaciones",
    fecha_inicio: "",
    fecha_fin: "",
    motivo: "",
  });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!empleadoId) {
      obtenerMiPerfil()
        .then((resp) => {
          if (resp.exito && resp.datos) {
            setEmpleado(resp.datos);
            setFormulario((prev) => ({ ...prev, empleado_id: resp.datos.id }));
          } else {
            setSinPerfil(true);
          }
        })
        .catch(() => setSinPerfil(true));
    }
  }, [empleadoId]);

  function manejarCambio(evento) {
    const { name, value } = evento.target;
    setFormulario({ ...formulario, [name]: value });
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");

    if (!formulario.empleado_id) {
      setError("No se encontró perfil de empleado para este usuario");
      return;
    }

    if (new Date(formulario.fecha_fin) < new Date(formulario.fecha_inicio)) {
      setError("La fecha fin no puede ser anterior a la fecha inicio");
      return;
    }

    setCargando(true);
    try {
      await solicitarPermiso(formulario);
      alGuardar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  const nombreSolicitante = empleadoId
    ? null
    : empleado
      ? `${empleado.nombre} ${empleado.apellido}`
      : usuario?.nombre || "Cargando...";

  return (
    <div className="permisos-form">
      <h2>Solicitar Permiso / Vacaciones</h2>

      {sinPerfil && (
        <div className="mensaje-aviso" style={{ background: "var(--color-advertencia-fondo, #fff3cd)", color: "#856404", padding: "0.75rem 1rem", borderRadius: "6px", marginBottom: "1rem", border: "1px solid #ffc107" }}>
          Tu cuenta no tiene un perfil de empleado asociado. Contacta a RH para vincular tu usuario.
        </div>
      )}

      {error && <div className="mensaje-error">{error}</div>}

      <form onSubmit={manejarEnvio}>
        {/* Solicitante — solo lectura, nombre del usuario logueado */}
        {!empleadoId && (
          <div className="campo">
            <label>Solicitante</label>
            <input
              type="text"
              value={nombreSolicitante}
              readOnly
              style={{ background: "var(--color-fondo)", cursor: "default" }}
            />
          </div>
        )}

        <div className="campo">
          <label htmlFor="tipo">Tipo de Permiso</label>
          <select
            id="tipo"
            name="tipo"
            value={formulario.tipo}
            onChange={manejarCambio}
          >
            {tiposPermiso.map((tipo) => (
              <option key={tipo.valor} value={tipo.valor}>
                {tipo.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="campo-doble">
          <div className="campo">
            <label htmlFor="fecha_inicio">Fecha Inicio</label>
            <input
              type="date"
              id="fecha_inicio"
              name="fecha_inicio"
              value={formulario.fecha_inicio}
              onChange={manejarCambio}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="fecha_fin">Fecha Fin</label>
            <input
              type="date"
              id="fecha_fin"
              name="fecha_fin"
              value={formulario.fecha_fin}
              onChange={manejarCambio}
              required
            />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="motivo">Motivo</label>
          <textarea
            id="motivo"
            name="motivo"
            value={formulario.motivo}
            onChange={manejarCambio}
            rows={3}
            placeholder="Describe el motivo de tu solicitud"
          />
        </div>

        <div className="formulario-botones">
          <button type="submit" disabled={cargando || !formulario.empleado_id}>
            {cargando ? "Enviando..." : "Enviar Solicitud"}
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
