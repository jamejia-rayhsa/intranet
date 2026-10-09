import { useState, useEffect } from "react";
import { obtenerEmpleado } from "../services/empleados.service";
import {
  obtenerDocumentos,
  subirDocumento,
  eliminarDocumento,
  obtenerUrlDocumento,
} from "../services/expediente.service";
import { obtenerRecibos } from "../services/recibos.service";
import ExpedienteUpload from "../components/ExpedienteUpload";
import RecibosNominaList from "../components/RecibosNominaList";

const tiposDocumento = [
  { valor: "acta_nacimiento", etiqueta: "Acta de Nacimiento" },
  { valor: "comprobante_domicilio", etiqueta: "Comprobante de Domicilio" },
  { valor: "identificacion", etiqueta: "Identificación Oficial" },
  { valor: "curp", etiqueta: "CURP" },
  { valor: "rfc", etiqueta: "RFC" },
  { valor: "cef", etiqueta: "CEF" },
  { valor: "otro", etiqueta: "Otro" },
];

export default function EmpleadoProfileCard({ empleadoId, alVolver }) {
  const [empleado, setEmpleado] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [recibos, setRecibos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pestañaActiva, setPestañaActiva] = useState("datos");

  useEffect(() => {
    cargarDatos();
  }, [empleadoId]);

  async function cargarDatos() {
    try {
      const [respuestaEmpleado, respuestaDocumentos, respuestaRecibos] =
        await Promise.all([
          obtenerEmpleado(empleadoId),
          obtenerDocumentos(empleadoId),
          obtenerRecibos(empleadoId),
        ]);

      if (respuestaEmpleado.exito) setEmpleado(respuestaEmpleado.datos);
      if (respuestaDocumentos.exito) setDocumentos(respuestaDocumentos.datos);
      if (respuestaRecibos.exito) setRecibos(respuestaRecibos.datos);
    } catch (error) {
      console.error("Error al cargar datos del empleado:", error);
    } finally {
      setCargando(false);
    }
  }

  async function manejarSubida(archivo, tipoDocumento, descripcion) {
    try {
      await subirDocumento(empleadoId, archivo, tipoDocumento, descripcion);
      const respuesta = await obtenerDocumentos(empleadoId);
      if (respuesta.exito) setDocumentos(respuesta.datos);
    } catch (error) {
      console.error("Error al subir documento:", error);
    }
  }

  async function abrirDocumento(docId) {
    try {
      const respuesta = await obtenerUrlDocumento(docId);
      window.location.assign(respuesta.datos.url); // descarga forzada: no navega fuera de la página
    } catch (error) {
      console.error("Error al abrir documento:", error);
      alert(error.message || "No se pudo abrir el documento");
    }
  }

  async function manejarEliminarDocumento(docId) {
    try {
      await eliminarDocumento(docId);
      setDocumentos(documentos.filter((d) => d.id !== docId));
    } catch (error) {
      console.error("Error al eliminar documento:", error);
    }
  }

  if (cargando) {
    return <div className="cargando">Cargando perfil del empleado...</div>;
  }

  if (!empleado) {
    return <div className="mensaje-error">Empleado no encontrado</div>;
  }

  return (
    <div className="empleado-perfil">
      <button onClick={alVolver} className="boton-volver">
        ← Volver a la lista
      </button>

      <div className="perfil-encabezado">
        <h1>
          {empleado.nombre} {empleado.apellido}
        </h1>
        <span className={`badge badge-${empleado.estatus}`}>
          {empleado.estatus.charAt(0).toUpperCase() + empleado.estatus.slice(1)}
        </span>
      </div>

      <div className="perfil-datos">
        <div className="datos-grupo">
          <h3>Datos Personales</h3>
          <p>
            <strong>CURP:</strong> {empleado.curp || "-"}
          </p>
          <p>
            <strong>RFC:</strong> {empleado.rfc || "-"}
          </p>
          <p>
            <strong>Fecha de Nacimiento:</strong>{" "}
            {empleado.fecha_nacimiento
              ? new Date(empleado.fecha_nacimiento).toLocaleDateString("es-MX")
              : "-"}
          </p>
        </div>

        <div className="datos-grupo">
          <h3>Datos Laborales</h3>
          <p>
            <strong>Puesto:</strong> {empleado.puesto || "-"}
          </p>
          <p>
            <strong>Departamento:</strong> {empleado.departamento || "-"}
          </p>
          <p>
            <strong>Fecha de Ingreso:</strong>{" "}
            {empleado.fecha_ingreso
              ? new Date(empleado.fecha_ingreso).toLocaleDateString("es-MX")
              : "-"}
          </p>
          <p>
            <strong>Jefe Inmediato:</strong>{" "}
            {empleado.jefe_nombre
              ? `${empleado.jefe_nombre} ${empleado.jefe_apellido}`
              : "-"}
          </p>
          {empleado.usuario_correo && (
            <p>
              <strong>Correo:</strong> {empleado.usuario_correo}
            </p>
          )}
        </div>
      </div>

      <div className="perfil-pestanas">
        <button
          className={pestañaActiva === "datos" ? "activa" : ""}
          onClick={() => setPestañaActiva("datos")}
        >
          Expediente ({documentos.length})
        </button>
        <button
          className={pestañaActiva === "recibos" ? "activa" : ""}
          onClick={() => setPestañaActiva("recibos")}
        >
          Recibos de Nómina ({recibos.length})
        </button>
      </div>

      {pestañaActiva === "datos" && (
        <div className="expediente-seccion">
          <h2>Documentos del Expediente</h2>
          <ExpedienteUpload
            empleadoId={empleadoId}
            tiposDocumento={tiposDocumento}
            onSubir={manejarSubida}
          />
          {documentos.length > 0 && (
            <table className="documentos-tabla">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Archivo</th>
                  <th>Fecha de Carga</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {documentos.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.tipo_documento}</td>
                    <td>
                      <button
                        type="button"
                        className="boton-enlace"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: "var(--color-primario)",
                          textDecoration: "underline",
                        }}
                        onClick={() => abrirDocumento(doc.id)}
                      >
                        {doc.nombre_archivo}
                      </button>
                    </td>
                    <td>
                      {new Date(doc.fecha_subida).toLocaleDateString("es-MX")}
                    </td>
                    <td>
                      <button
                        className="boton-peligro"
                        onClick={() => manejarEliminarDocumento(doc.id)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {pestañaActiva === "recibos" && <RecibosNominaList recibos={recibos} />}
    </div>
  );
}
