import { useState } from "react";
import PermisosForm from "./PermisosForm";

const etiquetasEstatus = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

const etiquetasTipo = {
  vacaciones: "Vacaciones",
  incapacidad: "Incapacidad",
  asunto_personal: "Asunto Personal",
  otro: "Otro",
};

const coloresEstatus = {
  pendiente: "badge-pendiente",
  aprobado: "badge-aprobado",
  rechazado: "badge-rechazado",
};

export default function PermisosList({ permisos, onResponder }) {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  if (mostrarFormulario) {
    return (
      <PermisosForm
        alGuardar={() => {
          setMostrarFormulario(false);
          if (onResponder) onResponder();
        }}
        alCancelar={() => setMostrarFormulario(false)}
      />
    );
  }

  if (permisos.length === 0) {
    return (
      <div className="permisos-vacios">
        <p>No hay solicitudes de permiso.</p>
        <button onClick={() => setMostrarFormulario(true)}>
          Solicitar Permiso
        </button>
      </div>
    );
  }

  return (
    <div className="permisos-lista">
      <div className="lista-encabezado">
        <h2>Solicitudes de Permiso ({permisos.length})</h2>
        <button onClick={() => setMostrarFormulario(true)}>
          Nueva Solicitud
        </button>
      </div>

      <table className="permisos-tabla">
        <thead>
          <tr>
            <th>Empleado</th>
            <th>Tipo</th>
            <th>Fecha Inicio</th>
            <th>Fecha Fin</th>
            <th>Estatus</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {permisos.map((permiso) => (
            <tr key={permiso.id}>
              <td>
                {permiso.empleado_nombre} {permiso.empleado_apellido}
              </td>
              <td>{etiquetasTipo[permiso.tipo] || permiso.tipo}</td>
              <td>
                {new Date(permiso.fecha_inicio).toLocaleDateString("es-MX")}
              </td>
              <td>{new Date(permiso.fecha_fin).toLocaleDateString("es-MX")}</td>
              <td>
                <span className={`badge ${coloresEstatus[permiso.estatus]}`}>
                  {etiquetasEstatus[permiso.estatus]}
                </span>
              </td>
              <td>
                {permiso.estatus === "pendiente" && onResponder && (
                  <>
                    <button
                      className="boton-aprobar"
                      onClick={() => onResponder(permiso.id, "aprobado")}
                    >
                      Aprobar
                    </button>
                    <button
                      className="boton-rechazar"
                      onClick={() => onResponder(permiso.id, "rechazado")}
                    >
                      Rechazar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
