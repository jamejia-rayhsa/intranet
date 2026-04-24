import { useState, useEffect } from "react";
import {
  obtenerEmpleado,
  actualizarEmpleado,
  obtenerEmpleados,
} from "../services/empleados.service";
import ChecklistDocumentos from "./ChecklistDocumentos";
import { obtenerDepartamentos } from "../services/departamentos.service";
import { obtenerPuestos } from "../services/puestos.service";
import { obtenerUbicaciones } from "../services/ubicaciones.service";
import {
  obtenerDocumentos,
  subirDocumento,
  eliminarDocumento,
} from "../services/expediente.service";

export default function EmpleadoProfileCard({ empleadoId, alVolver }) {
  const [empleado, setEmpleado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [documentos, setDocumentos] = useState([]);
  const [cargandoDocs, setCargandoDocs] = useState(false);
  const [error, setError] = useState("");
  const [formulario, setFormulario] = useState({});
  const [jefes, setJefes] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [mostrarSubirDoc, setMostrarSubirDoc] = useState(false);
  const [docFormulario, setDocFormulario] = useState({
    archivo: null,
    tipo_documento: "",
    descripcion: "",
  });
  const [docError, setDocError] = useState("");
  const [subiendoDoc, setSubiendoDoc] = useState(false);

  useEffect(() => {
    cargarEmpleado();
    cargarDocumentos();
    cargarJefes();
    cargarCatalogos();
  }, [empleadoId]);

  async function cargarCatalogos() {
    try {
      const [respDeptos, respPuestos, respUbicaciones] = await Promise.all([
        obtenerDepartamentos(),
        obtenerPuestos(),
        obtenerUbicaciones(),
      ]);
      if (respDeptos.exito) setDepartamentos(respDeptos.datos);
      if (respPuestos.exito) setPuestos(respPuestos.datos);
      if (respUbicaciones.exito) setUbicaciones(respUbicaciones.datos);
    } catch (error) {
      console.error("Error al cargar catálogos:", error);
    }
  }

  async function cargarEmpleado() {
    setCargando(true);
    try {
      const respuesta = await obtenerEmpleado(empleadoId);
      if (respuesta.exito) {
        setEmpleado(respuesta.datos);
        setFormulario({
          nombre: respuesta.datos.nombre,
          apellido: respuesta.datos.apellido,
          curp: respuesta.datos.curp || "",
          rfc: respuesta.datos.rfc || "",
          fecha_nacimiento: respuesta.datos.fecha_nacimiento
            ? new Date(respuesta.datos.fecha_nacimiento)
                .toISOString()
                .split("T")[0]
            : "",
          puesto_id: respuesta.datos.puesto_id || "",
          departamento_id: respuesta.datos.departamento_id || "",
          ubicacion_id: respuesta.datos.ubicacion_id || "",
          fecha_ingreso: respuesta.datos.fecha_ingreso
            ? new Date(respuesta.datos.fecha_ingreso)
                .toISOString()
                .split("T")[0]
            : "",
          jefe_inmediato_id: respuesta.datos.jefe_inmediato_id || "",
        });
      }
    } catch (error) {
      console.error("Error al cargar empleado:", error);
    } finally {
      setCargando(false);
    }
  }

  async function cargarJefes() {
    try {
      const respuesta = await obtenerEmpleados({
        estatus: "activo",
        limite: 100,
      });
      if (respuesta.exito) {
        setJefes(respuesta.datos.empleados || []);
      }
    } catch (error) {
      console.error("Error al cargar jefes:", error);
    }
  }

  async function cargarDocumentos() {
    setCargandoDocs(true);
    try {
      const respuesta = await obtenerDocumentos(empleadoId);
      if (respuesta.exito) setDocumentos(respuesta.datos);
    } catch (error) {
      console.error("Error al cargar documentos:", error);
    } finally {
      setCargandoDocs(false);
    }
  }

  function manejarCambio(evento) {
    const { name, value } = evento.target;
    setFormulario({ ...formulario, [name]: value });
  }

  async function guardarCambios() {
    setError("");
    try {
      const datosEnvio = { ...formulario };
      if (!datosEnvio.jefe_inmediato_id) {
        datosEnvio.jefe_inmediato_id = null;
      }
      await actualizarEmpleado(empleadoId, datosEnvio);
      setEditando(false);
      cargarEmpleado();
    } catch (err) {
      setError(err.message || "Error al actualizar empleado");
    }
  }

  function manejarDocCambio(evento) {
    const { name, value, files } = evento.target;
    if (name === "archivo") {
      setDocFormulario({ ...docFormulario, archivo: files[0] });
    } else {
      setDocFormulario({ ...docFormulario, [name]: value });
    }
  }

  async function subirDoc(evento) {
    evento.preventDefault();
    setDocError("");
    if (!docFormulario.archivo) {
      setDocError("Selecciona un archivo");
      return;
    }
    setSubiendoDoc(true);
    try {
      await subirDocumento(
        empleadoId,
        docFormulario.archivo,
        docFormulario.tipo_documento,
        docFormulario.descripcion,
      );
      setDocFormulario({ archivo: null, tipo_documento: "", descripcion: "" });
      setMostrarSubirDoc(false);
      cargarDocumentos();
    } catch (error) {
      setDocError(error.message || "Error al subir documento");
    } finally {
      setSubiendoDoc(false);
    }
  }

  async function eliminarDoc(id) {
    if (confirm("¿Estás seguro de eliminar este documento?")) {
      try {
        await eliminarDocumento(id);
        cargarDocumentos();
      } catch (error) {
        console.error("Error al eliminar documento:", error);
      }
    }
  }

  if (cargando) return <div className="cargando">Cargando expediente...</div>;
  if (!empleado) return <p>No se encontró información del empleado.</p>;

  return (
    <div className="expediente-page">
      <div className="expediente-encabezado">
        <button onClick={alVolver} className="boton-volver">
          ← Volver
        </button>
        <h1>
          Expediente: {empleado.nombre} {empleado.apellido}
        </h1>
        {!editando && (
          <button onClick={() => setEditando(true)} className="boton-editar">
            Editar
          </button>
        )}
      </div>

      {error && <div className="mensaje-error">{error}</div>}

      {editando ? (
        <div className="expediente-seccion formulario-edicion">
          <h2>Editar Información</h2>
          <div className="datos-grid">
            <div className="dato">
              <label htmlFor="edit-nombre">Nombre</label>
              <input
                type="text"
                id="edit-nombre"
                name="nombre"
                value={formulario.nombre || ""}
                onChange={manejarCambio}
              />
            </div>
            <div className="dato">
              <label htmlFor="edit-apellido">Apellido</label>
              <input
                type="text"
                id="edit-apellido"
                name="apellido"
                value={formulario.apellido || ""}
                onChange={manejarCambio}
              />
            </div>
            <div className="dato">
              <label htmlFor="edit-curp">CURP</label>
              <input
                type="text"
                id="edit-curp"
                name="curp"
                value={formulario.curp || ""}
                onChange={manejarCambio}
              />
            </div>
            <div className="dato">
              <label htmlFor="edit-rfc">RFC</label>
              <input
                type="text"
                id="edit-rfc"
                name="rfc"
                value={formulario.rfc || ""}
                onChange={manejarCambio}
              />
            </div>
            <div className="dato">
              <label htmlFor="edit-departamento_id">Departamento</label>
              <select
                id="edit-departamento_id"
                name="departamento_id"
                value={formulario.departamento_id || ""}
                onChange={manejarCambio}
              >
                <option value="">Seleccionar</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="dato">
              <label htmlFor="edit-puesto_id">Puesto</label>
              <select
                id="edit-puesto_id"
                name="puesto_id"
                value={formulario.puesto_id || ""}
                onChange={manejarCambio}
              >
                <option value="">Seleccionar</option>
                {puestos
                  .filter(
                    (p) =>
                      !formulario.departamento_id ||
                      p.departamento_id ===
                        parseInt(formulario.departamento_id),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
              </select>
            </div>
            <div className="dato">
              <label htmlFor="edit-ubicacion_id">Ubicación</label>
              <select
                id="edit-ubicacion_id"
                name="ubicacion_id"
                value={formulario.ubicacion_id || ""}
                onChange={manejarCambio}
              >
                <option value="">Seleccionar</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="dato">
              <label htmlFor="edit-fecha_nacimiento">Fecha Nacimiento</label>
              <input
                type="date"
                id="edit-fecha_nacimiento"
                name="fecha_nacimiento"
                value={formulario.fecha_nacimiento || ""}
                onChange={manejarCambio}
              />
            </div>
            <div className="dato">
              <label htmlFor="edit-fecha_ingreso">Fecha Ingreso</label>
              <input
                type="date"
                id="edit-fecha_ingreso"
                name="fecha_ingreso"
                value={formulario.fecha_ingreso || ""}
                onChange={manejarCambio}
              />
            </div>
            <div className="dato">
              <label htmlFor="edit-jefe_inmediato_id">Jefe Inmediato</label>
              <select
                id="edit-jefe_inmediato_id"
                name="jefe_inmediato_id"
                value={formulario.jefe_inmediato_id || ""}
                onChange={manejarCambio}
              >
                <option value="">Sin jefe inmediato</option>
                {jefes
                  .filter((j) => j.id !== empleadoId)
                  .map((jefe) => (
                    <option key={jefe.id} value={jefe.id}>
                      {jefe.nombre} {jefe.apellido}
                    </option>
                  ))}
              </select>
            </div>
            <div className="dato">
              <label>Correo electrónico</label>
              <span className="correo-solo-lectura">
                {empleado.usuario_correo || "No asignado"}
              </span>
              <small className="correo-aviso">
                Se gestiona desde Administración de Usuarios
              </small>
            </div>
          </div>
          <div className="formulario-botones">
            <button onClick={guardarCambios}>Guardar</button>
            <button
              onClick={() => {
                setEditando(false);
                setError("");
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="expediente-datos">
          <div className="expediente-seccion">
            <h2>Información Personal</h2>
            <div className="datos-grid">
              <div className="dato">
                <label>Nombre</label>
                <span>
                  {empleado.nombre} {empleado.apellido}
                </span>
              </div>
              <div className="dato">
                <label>CURP</label>
                <span>{empleado.curp || "-"}</span>
              </div>
              <div className="dato">
                <label>RFC</label>
                <span>{empleado.rfc || "-"}</span>
              </div>
              <div className="dato">
                <label>Fecha Nacimiento</label>
                <span>
                  {empleado.fecha_nacimiento
                    ? new Date(empleado.fecha_nacimiento).toLocaleDateString(
                        "es-MX",
                      )
                    : "-"}
                </span>
              </div>
            </div>
          </div>

          <div className="expediente-seccion">
            <h2>Información Laboral</h2>
            <div className="datos-grid">
              <div className="dato">
                <label>Puesto</label>
                <span>{empleado.puesto || "-"}</span>
              </div>
              <div className="dato">
                <label>Departamento</label>
                <span>{empleado.departamento || "-"}</span>
              </div>
              <div className="dato">
                <label>Fecha Ingreso</label>
                <span>
                  {empleado.fecha_ingreso
                    ? new Date(empleado.fecha_ingreso).toLocaleDateString(
                        "es-MX",
                      )
                    : "-"}
                </span>
              </div>
              <div className="dato">
                <label>Estatus</label>
                <span className={`badge badge-${empleado.estatus}`}>
                  {empleado.estatus}
                </span>
              </div>
              <div className="dato">
                <label>Jefe Inmediato</label>
                <span>
                  {empleado.jefe_nombre
                    ? `${empleado.jefe_nombre} ${empleado.jefe_apellido}`
                    : "-"}
                </span>
              </div>
              <div className="dato">
                <label>Correo</label>
                <span>{empleado.usuario_correo || "-"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sección de Documentos */}
      <div className="expediente-seccion seccion-documentos">
        <div className="documentos-encabezado">
          <h2>Documentos del Expediente</h2>
          <button onClick={() => setMostrarSubirDoc(!mostrarSubirDoc)}>
            {mostrarSubirDoc ? "Cancelar" : "Subir Documento"}
          </button>
        </div>

        {mostrarSubirDoc && (
          <form onSubmit={subirDoc} className="formulario-subir-doc">
            {docError && <div className="mensaje-error">{docError}</div>}
            <div className="campo">
              <label htmlFor="doc-tipo">Tipo de Documento</label>
              <select
                id="doc-tipo"
                name="tipo_documento"
                value={docFormulario.tipo_documento}
                onChange={manejarDocCambio}
                required
              >
                <option value="">Seleccionar tipo</option>
                <option value="curriculum_vitae">Curriculum Vitae</option>
                <option value="ine">Identificación Oficial (INE / Pasaporte)</option>
                <option value="acta_nacimiento">Acta de Nacimiento</option>
                <option value="rfc">RFC</option>
                <option value="nss">Número de Seguridad Social</option>
                <option value="curp">CURP</option>
                <option value="comprobante_domicilio">Comprobante de Domicilio</option>
                <option value="constancia_fiscal">Constancia de Situación Fiscal</option>
                <option value="constancia_estudios">Constancia de Estudio / Cédula Profesional</option>
                <option value="carta_recomendacion">Carta de Recomendación</option>
                <option value="certificado_medico">Certificado Médico</option>
                <option value="estado_cuenta">Estado de Cuenta Bancario</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="doc-archivo">Archivo</label>
              <input
                type="file"
                id="doc-archivo"
                name="archivo"
                accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx"
                onChange={manejarDocCambio}
                required
              />
              <small style={{ color: "var(--color-texto-suave)", fontSize: "0.78rem", marginTop: "0.3rem", display: "block" }}>
                Formatos: JPG, PNG, GIF, PDF, DOC, DOCX &nbsp;·&nbsp; Tamaño máximo: 10 MB
              </small>
            </div>
            <div className="campo">
              <label htmlFor="doc-descripcion">Descripción</label>
              <input
                type="text"
                id="doc-descripcion"
                name="descripcion"
                value={docFormulario.descripcion}
                onChange={manejarDocCambio}
                placeholder="Descripción opcional"
              />
            </div>
            <div className="formulario-botones">
              <button type="submit" disabled={subiendoDoc}>
                {subiendoDoc ? "Subiendo..." : "Subir"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMostrarSubirDoc(false);
                  setDocError("");
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {cargandoDocs ? (
          <p>Cargando documentos...</p>
        ) : (
          <ChecklistDocumentos
            documentos={documentos}
            onEliminar={eliminarDoc}
          />
        )}
      </div>
    </div>
  );
}
