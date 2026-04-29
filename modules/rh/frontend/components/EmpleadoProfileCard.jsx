import { useState, useEffect } from "react";
import {
  obtenerEmpleado,
  actualizarEmpleado,
  obtenerEmpleados,
} from "../services/empleados.service";
import { ESTADOS_MEXICO, BANCOS_MEXICO } from "../constants/catalogos";
import ChecklistDocumentos from "./ChecklistDocumentos";
import { obtenerDepartamentos } from "../services/departamentos.service";
import { obtenerPuestos } from "../services/puestos.service";
import { obtenerUbicaciones } from "../services/ubicaciones.service";
import {
  obtenerDocumentos,
  subirDocumento,
  eliminarDocumento,
} from "../services/expediente.service";
import {
  obtenerHijos,
  crearHijo,
  eliminarHijo,
} from "../services/hijos.service";

const PESTANAS = [
  { id: "general", etiqueta: "Info General" },
  { id: "laboral", etiqueta: "Info Laboral" },
  { id: "personal", etiqueta: "Info Personal" },
  { id: "documentos", etiqueta: "Documentación" },
];

function fechaParaInput(fecha) {
  if (!fecha) return "";
  return new Date(fecha).toISOString().split("T")[0];
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return "-";
  const hoy = new Date();
  const nac = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nac.getFullYear();
  if (
    hoy.getMonth() < nac.getMonth() ||
    (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())
  )
    edad--;
  return edad;
}

function calcularAniversario(fechaIngreso) {
  if (!fechaIngreso) return "-";
  return new Date(fechaIngreso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
  });
}

function formatFecha(fecha) {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleDateString("es-MX");
}

const FORMULARIO_VACIO = {
  // General
  nombre: "", apellido_paterno: "", apellido_materno: "",
  estatus: "activo", nss: "", curp: "", rfc: "", infonavit: "", fonacot: "",
  // Laboral
  numero_nomina: "", ubicacion_id: "", fecha_ingreso: "", fecha_imss: "",
  fecha_renovacion: "", departamento_id: "", puesto_id: "", tipo_contrato: "",
  jefe_inmediato_id: "", celular_corporativo: "",
  // Personal
  fecha_nacimiento: "", estado_nacimiento: "", genero: "", estado_civil: "",
  escolaridad: "", celular_personal: "", telefono_emergencia: "",
  parentesco_emergencia: "", contacto_emergencia: "", correo_personal: "",
  calle: "", colonia: "", codigo_postal: "", municipio: "",
  estado_residencia: "", banco: "", clabe: "", cp_fiscal: "",
};

export default function EmpleadoProfileCard({ empleadoId, alVolver }) {
  const [empleado, setEmpleado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [pestana, setPestana] = useState("general");
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [error, setError] = useState("");

  const [documentos, setDocumentos] = useState([]);
  const [cargandoDocs, setCargandoDocs] = useState(false);
  const [mostrarSubirDoc, setMostrarSubirDoc] = useState(false);
  const [docFormulario, setDocFormulario] = useState({ archivo: null, tipo_documento: "", descripcion: "" });
  const [docError, setDocError] = useState("");
  const [subiendoDoc, setSubiendoDoc] = useState(false);

  const [hijos, setHijos] = useState([]);
  const [mostrarFormHijo, setMostrarFormHijo] = useState(false);
  const [hijoFormulario, setHijoFormulario] = useState({ nombre: "", fecha_nacimiento: "", escolaridad: "" });

  const [jefes, setJefes] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);

  useEffect(() => {
    cargarEmpleado();
    cargarDocumentos();
    cargarHijos();
    cargarJefes();
    cargarCatalogos();
  }, [empleadoId]);

  async function cargarCatalogos() {
    try {
      const [rDeptos, rPuestos, rUbicaciones] = await Promise.all([
        obtenerDepartamentos(),
        obtenerPuestos(),
        obtenerUbicaciones(),
      ]);
      if (rDeptos.exito) setDepartamentos(rDeptos.datos);
      if (rPuestos.exito) setPuestos(rPuestos.datos);
      if (rUbicaciones.exito) setUbicaciones(rUbicaciones.datos);
    } catch (e) {
      console.error("Error al cargar catálogos:", e);
    }
  }

  async function cargarEmpleado() {
    setCargando(true);
    try {
      const resp = await obtenerEmpleado(empleadoId);
      if (resp.exito) {
        setEmpleado(resp.datos);
        const d = resp.datos;
        setFormulario({
          nombre: d.nombre || "",
          apellido_paterno: d.apellido_paterno || "",
          apellido_materno: d.apellido_materno || "",
          estatus: d.estatus || "activo",
          nss: d.nss || "",
          curp: d.curp || "",
          rfc: d.rfc || "",
          infonavit: d.infonavit || "",
          fonacot: d.fonacot || "",
          numero_nomina: d.numero_nomina || "",
          ubicacion_id: d.ubicacion_id || "",
          fecha_ingreso: fechaParaInput(d.fecha_ingreso),
          fecha_imss: fechaParaInput(d.fecha_imss),
          fecha_renovacion: fechaParaInput(d.fecha_renovacion),
          departamento_id: d.departamento_id || "",
          puesto_id: d.puesto_id || "",
          tipo_contrato: d.tipo_contrato || "",
          jefe_inmediato_id: d.jefe_inmediato_id || "",
          celular_corporativo: d.celular_corporativo || "",
          fecha_nacimiento: fechaParaInput(d.fecha_nacimiento),
          estado_nacimiento: d.estado_nacimiento || "",
          genero: d.genero || "",
          estado_civil: d.estado_civil || "",
          escolaridad: d.escolaridad || "",
          celular_personal: d.celular_personal || "",
          telefono_emergencia: d.telefono_emergencia || "",
          parentesco_emergencia: d.parentesco_emergencia || "",
          contacto_emergencia: d.contacto_emergencia || "",
          correo_personal: d.correo_personal || "",
          calle: d.calle || "",
          colonia: d.colonia || "",
          codigo_postal: d.codigo_postal || "",
          municipio: d.municipio || "",
          estado_residencia: d.estado_residencia || "",
          banco: d.banco || "",
          clabe: d.clabe || "",
          cp_fiscal: d.cp_fiscal || "",
        });
      }
    } catch (e) {
      console.error("Error al cargar empleado:", e);
    } finally {
      setCargando(false);
    }
  }

  async function cargarJefes() {
    try {
      const resp = await obtenerEmpleados({ estatus: "activo", limite: 200 });
      if (resp.exito) setJefes(resp.datos.empleados || []);
    } catch (e) {
      console.error("Error al cargar jefes:", e);
    }
  }

  async function cargarDocumentos() {
    setCargandoDocs(true);
    try {
      const resp = await obtenerDocumentos(empleadoId);
      if (resp.exito) setDocumentos(resp.datos);
    } catch (e) {
      console.error("Error al cargar documentos:", e);
    } finally {
      setCargandoDocs(false);
    }
  }

  async function cargarHijos() {
    try {
      const resp = await obtenerHijos(empleadoId);
      if (resp.exito) setHijos(resp.datos);
    } catch (e) {
      console.error("Error al cargar hijos:", e);
    }
  }

  function manejarCambio(e) {
    const { name, value } = e.target;
    setFormulario({ ...formulario, [name]: value });
  }

  async function guardarCambios() {
    setError("");
    try {
      const datos = { ...formulario };
      if (!datos.jefe_inmediato_id) datos.jefe_inmediato_id = null;
      if (!datos.puesto_id) datos.puesto_id = null;
      if (!datos.departamento_id) datos.departamento_id = null;
      if (!datos.ubicacion_id) datos.ubicacion_id = null;
      await actualizarEmpleado(empleadoId, datos);
      setEditando(false);
      cargarEmpleado();
    } catch (err) {
      setError(err.message || "Error al actualizar empleado");
    }
  }

  function manejarDocCambio(e) {
    const { name, value, files } = e.target;
    if (name === "archivo") {
      setDocFormulario({ ...docFormulario, archivo: files[0] });
    } else {
      setDocFormulario({ ...docFormulario, [name]: value });
    }
  }

  async function subirDoc(e) {
    e.preventDefault();
    setDocError("");
    if (!docFormulario.archivo) { setDocError("Selecciona un archivo"); return; }
    setSubiendoDoc(true);
    try {
      await subirDocumento(empleadoId, docFormulario.archivo, docFormulario.tipo_documento, docFormulario.descripcion);
      setDocFormulario({ archivo: null, tipo_documento: "", descripcion: "" });
      setMostrarSubirDoc(false);
      cargarDocumentos();
    } catch (e) {
      setDocError(e.message || "Error al subir documento");
    } finally {
      setSubiendoDoc(false);
    }
  }

  async function eliminarDoc(id) {
    if (confirm("¿Eliminar este documento?")) {
      try { await eliminarDocumento(id); cargarDocumentos(); }
      catch (e) { console.error(e); }
    }
  }

  async function agregarHijo(e) {
    e.preventDefault();
    try {
      await crearHijo(empleadoId, hijoFormulario);
      setHijoFormulario({ nombre: "", fecha_nacimiento: "", escolaridad: "" });
      setMostrarFormHijo(false);
      cargarHijos();
    } catch (e) {
      console.error("Error al agregar hijo:", e);
    }
  }

  async function quitarHijo(id) {
    if (confirm("¿Eliminar este registro?")) {
      try { await eliminarHijo(id); cargarHijos(); }
      catch (e) { console.error(e); }
    }
  }

  if (cargando) return <div className="cargando">Cargando expediente...</div>;
  if (!empleado) return <p>No se encontró información del empleado.</p>;

  const nombreCompleto = [empleado.nombre, empleado.apellido_paterno, empleado.apellido_materno]
    .filter(Boolean).join(" ");

  return (
    <div className="expediente-page">
      <div className="expediente-encabezado">
        <button onClick={alVolver} className="boton-volver">← Volver</button>
        <h1>Expediente: {nombreCompleto}</h1>
        {!editando ? (
          <button onClick={() => setEditando(true)} className="boton-editar">Editar</button>
        ) : (
          <div className="expediente-acciones">
            <button onClick={guardarCambios} className="boton-guardar">Guardar</button>
            <button onClick={() => { setEditando(false); setError(""); cargarEmpleado(); }} className="boton-cancelar">Cancelar</button>
          </div>
        )}
      </div>

      {error && <div className="mensaje-error">{error}</div>}

      {/* Pestañas */}
      <div className="expediente-pestanas">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            className={`pestana-btn${pestana === p.id ? " activa" : ""}`}
            onClick={() => setPestana(p.id)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {/* Tab: Información General */}
      {pestana === "general" && (
        <div className="expediente-seccion">
          <div className="datos-grid">
            <div className="dato dato-completo">
              <label>Nombre Completo</label>
              <span className="nombre-completo-display">{nombreCompleto || "-"}</span>
            </div>
            {editando ? (
              <>
                <Campo label="Nombres" name="nombre" value={formulario.nombre} onChange={manejarCambio} />
                <Campo label="Apellido Paterno" name="apellido_paterno" value={formulario.apellido_paterno} onChange={manejarCambio} />
                <Campo label="Apellido Materno" name="apellido_materno" value={formulario.apellido_materno} onChange={manejarCambio} />
                <div className="dato">
                  <label htmlFor="edit-estatus">Estatus</label>
                  <select id="edit-estatus" name="estatus" value={formulario.estatus} onChange={manejarCambio}>
                    <option value="activo">Activo</option>
                    <option value="baja">Baja</option>
                    <option value="suspendido">Suspendido</option>
                  </select>
                </div>
                <Campo label="NSS" name="nss" value={formulario.nss} onChange={manejarCambio} maxLength={11} minLength={11} pattern="\d{11}" title="NSS de 11 dígitos" onInput={soloDigitos} />
                <Campo label="CURP" name="curp" value={formulario.curp} onChange={manejarCambio} maxLength={18} minLength={18} pattern="[A-Za-zÑñ]{4}\d{6}[HMhm][A-Za-z]{2}[A-Za-z\d]{3}[A-Za-z\d]\d" title="CURP de 18 caracteres" />
                <Campo label="RFC" name="rfc" value={formulario.rfc} onChange={manejarCambio} maxLength={13} minLength={13} title="RFC de 13 caracteres" />
                <Campo label="INFONAVIT" name="infonavit" value={formulario.infonavit} onChange={manejarCambio} />
                <Campo label="FONACOT" name="fonacot" value={formulario.fonacot} onChange={manejarCambio} />
              </>
            ) : (
              <>
                <DatoLectura label="Nombres" valor={empleado.nombre} />
                <DatoLectura label="Apellido Paterno" valor={empleado.apellido_paterno} />
                <DatoLectura label="Apellido Materno" valor={empleado.apellido_materno} />
                <div className="dato">
                  <label>Estatus</label>
                  <span className={`badge badge-${empleado.estatus}`}>{empleado.estatus}</span>
                </div>
                <DatoLectura label="NSS" valor={empleado.nss} />
                <DatoLectura label="CURP" valor={empleado.curp} />
                <DatoLectura label="RFC" valor={empleado.rfc} />
                <DatoLectura label="INFONAVIT" valor={empleado.infonavit} />
                <DatoLectura label="FONACOT" valor={empleado.fonacot} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab: Información Laboral */}
      {pestana === "laboral" && (
        <div className="expediente-seccion">
          <div className="datos-grid">
            {editando ? (
              <>
                <Campo label="No. de Nómina" name="numero_nomina" value={formulario.numero_nomina} onChange={manejarCambio} />
                <div className="dato">
                  <label htmlFor="edit-ubicacion_id">Ubicación</label>
                  <select id="edit-ubicacion_id" name="ubicacion_id" value={formulario.ubicacion_id} onChange={manejarCambio}>
                    <option value="">Seleccionar</option>
                    {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </div>
                <Campo label="Fecha Ingreso" name="fecha_ingreso" value={formulario.fecha_ingreso} onChange={manejarCambio} type="date" />
                <Campo label="Fecha IMSS" name="fecha_imss" value={formulario.fecha_imss} onChange={manejarCambio} type="date" />
                <Campo label="Fecha Renovación" name="fecha_renovacion" value={formulario.fecha_renovacion} onChange={manejarCambio} type="date" />
                <div className="dato">
                  <label htmlFor="edit-departamento_id">Departamento</label>
                  <select id="edit-departamento_id" name="departamento_id" value={formulario.departamento_id} onChange={manejarCambio}>
                    <option value="">Seleccionar</option>
                    {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                  </select>
                </div>
                <div className="dato">
                  <label htmlFor="edit-puesto_id">Puesto</label>
                  <select id="edit-puesto_id" name="puesto_id" value={formulario.puesto_id} onChange={manejarCambio}>
                    <option value="">Seleccionar</option>
                    {puestos
                      .filter((p) => !formulario.departamento_id || p.departamento_id === parseInt(formulario.departamento_id))
                      .map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="dato">
                  <label htmlFor="edit-tipo_contrato">Tipo de Contrato</label>
                  <select id="edit-tipo_contrato" name="tipo_contrato" value={formulario.tipo_contrato} onChange={manejarCambio}>
                    <option value="">Seleccionar</option>
                    <option value="indefinido">Indefinido</option>
                    <option value="temporal">Temporal</option>
                    <option value="por_obra">Por Obra</option>
                    <option value="honorarios">Honorarios</option>
                    <option value="practicas">Prácticas</option>
                  </select>
                </div>
                <div className="dato">
                  <label htmlFor="edit-jefe_inmediato_id">Jefe Directo</label>
                  <select id="edit-jefe_inmediato_id" name="jefe_inmediato_id" value={formulario.jefe_inmediato_id} onChange={manejarCambio}>
                    <option value="">Sin jefe inmediato</option>
                    {jefes.filter((j) => j.id !== empleadoId).map((j) => (
                      <option key={j.id} value={j.id}>{j.nombre} {j.apellido_paterno}</option>
                    ))}
                  </select>
                </div>
                <Campo label="Celular Corporativo" name="celular_corporativo" value={formulario.celular_corporativo} onChange={manejarCambio} maxLength={10} minLength={10} pattern="\d{10}" title="10 dígitos numéricos sin espacios" onInput={soloDigitos} />
                <div className="dato">
                  <label>Correo Corporativo</label>
                  <span>{empleado.usuario_correo || "No asignado"}</span>
                  <small style={{ color: "var(--color-texto-claro)", display: "block" }}>Se gestiona desde Administración de Usuarios</small>
                </div>
              </>
            ) : (
              <>
                <DatoLectura label="No. de Nómina" valor={empleado.numero_nomina} />
                <DatoLectura label="Ubicación" valor={empleado.ubicacion} />
                <DatoLectura label="Fecha Ingreso" valor={formatFecha(empleado.fecha_ingreso)} />
                <DatoLectura label="Fecha IMSS" valor={formatFecha(empleado.fecha_imss)} />
                <DatoLectura label="Fecha Renovación" valor={formatFecha(empleado.fecha_renovacion)} />
                <DatoLectura label="Año Ingreso" valor={empleado.fecha_ingreso ? new Date(empleado.fecha_ingreso).getFullYear() : "-"} />
                <DatoLectura label="Aniversario" valor={calcularAniversario(empleado.fecha_ingreso)} />
                <DatoLectura label="Departamento" valor={empleado.departamento} />
                <DatoLectura label="Puesto" valor={empleado.puesto} />
                <DatoLectura label="Tipo de Contrato" valor={empleado.tipo_contrato} />
                <DatoLectura label="Jefe Directo" valor={empleado.jefe_nombre ? `${empleado.jefe_nombre} ${empleado.jefe_apellido}` : null} />
                <DatoLectura label="Celular Corporativo" valor={empleado.celular_corporativo} />
                <DatoLectura label="Correo Corporativo" valor={empleado.usuario_correo} />
                {empleado.estatus === "baja" && (
                  <div className="dato dato-completo desvinculacion-bloque">
                    <label>Desvinculación</label>
                    <div className="datos-grid" style={{ marginTop: "0.5rem" }}>
                      <DatoLectura label="Fecha Baja" valor={formatFecha(empleado.fecha_baja)} />
                      <DatoLectura label="Motivo" valor={empleado.motivo_baja} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab: Información Personal */}
      {pestana === "personal" && (
        <div className="expediente-seccion">
          <div className="datos-grid">
            {editando ? (
              <>
                <Campo label="Fecha de Nacimiento" name="fecha_nacimiento" value={formulario.fecha_nacimiento} onChange={manejarCambio} type="date" />
                <CampoSelect label="Estado de Nacimiento" name="estado_nacimiento" value={formulario.estado_nacimiento} onChange={manejarCambio} opciones={ESTADOS_MEXICO} />
                <div className="dato">
                  <label htmlFor="edit-genero">Género</label>
                  <select id="edit-genero" name="genero" value={formulario.genero} onChange={manejarCambio}>
                    <option value="">Seleccionar</option>
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div className="dato">
                  <label htmlFor="edit-estado_civil">Estado Civil</label>
                  <select id="edit-estado_civil" name="estado_civil" value={formulario.estado_civil} onChange={manejarCambio}>
                    <option value="">Seleccionar</option>
                    <option value="soltero">Soltero/a</option>
                    <option value="casado">Casado/a</option>
                    <option value="union_libre">Unión Libre</option>
                    <option value="divorciado">Divorciado/a</option>
                    <option value="viudo">Viudo/a</option>
                  </select>
                </div>
                <div className="dato">
                  <label htmlFor="edit-escolaridad">Escolaridad</label>
                  <select id="edit-escolaridad" name="escolaridad" value={formulario.escolaridad} onChange={manejarCambio}>
                    <option value="">Seleccionar</option>
                    <option value="primaria">Primaria</option>
                    <option value="secundaria">Secundaria</option>
                    <option value="preparatoria">Preparatoria</option>
                    <option value="tecnico">Técnico</option>
                    <option value="licenciatura">Licenciatura</option>
                    <option value="posgrado">Posgrado</option>
                  </select>
                </div>
                <Campo label="Celular Personal" name="celular_personal" value={formulario.celular_personal} onChange={manejarCambio} maxLength={10} minLength={10} pattern="\d{10}" title="10 dígitos numéricos sin espacios" onInput={soloDigitos} />
                <Campo label="No. de Emergencia" name="telefono_emergencia" value={formulario.telefono_emergencia} onChange={manejarCambio} maxLength={10} minLength={10} pattern="\d{10}" title="10 dígitos numéricos sin espacios" onInput={soloDigitos} />
                <Campo label="Parentesco" name="parentesco_emergencia" value={formulario.parentesco_emergencia} onChange={manejarCambio} />
                <Campo label="Contacto de Emergencia" name="contacto_emergencia" value={formulario.contacto_emergencia} onChange={manejarCambio} />
                <Campo label="Correo Personal" name="correo_personal" value={formulario.correo_personal} onChange={manejarCambio} type="email" />
                <Campo label="Calle y Número" name="calle" value={formulario.calle} onChange={manejarCambio} />
                <Campo label="Colonia" name="colonia" value={formulario.colonia} onChange={manejarCambio} />
                <Campo label="C.P." name="codigo_postal" value={formulario.codigo_postal} onChange={manejarCambio} maxLength={5} minLength={5} pattern="\d{5}" title="Código postal de 5 dígitos" onInput={soloDigitos} />
                <Campo label="Alcaldía o Municipio" name="municipio" value={formulario.municipio} onChange={manejarCambio} />
                <CampoSelect label="Residencia (Estado)" name="estado_residencia" value={formulario.estado_residencia} onChange={manejarCambio} opciones={ESTADOS_MEXICO} />
                <CampoSelect label="Banco" name="banco" value={formulario.banco} onChange={manejarCambio} opciones={BANCOS_MEXICO} />
                <Campo label="CLABE Interbancaria" name="clabe" value={formulario.clabe} onChange={manejarCambio} maxLength={18} minLength={18} pattern="\d{18}" title="CLABE interbancaria de 18 dígitos numéricos" onInput={soloDigitos} />
                <Campo label="C.P. Fiscal" name="cp_fiscal" value={formulario.cp_fiscal} onChange={manejarCambio} maxLength={5} minLength={5} pattern="\d{5}" title="Código postal fiscal de 5 dígitos" onInput={soloDigitos} />
              </>
            ) : (
              <>
                <DatoLectura label="Fecha de Nacimiento" valor={formatFecha(empleado.fecha_nacimiento)} />
                <DatoLectura label="Edad" valor={calcularEdad(empleado.fecha_nacimiento) !== "-" ? `${calcularEdad(empleado.fecha_nacimiento)} años` : "-"} />
                <DatoLectura label="Estado de Nacimiento" valor={empleado.estado_nacimiento} />
                <DatoLectura label="Género" valor={empleado.genero} />
                <DatoLectura label="Estado Civil" valor={empleado.estado_civil} />
                <DatoLectura label="Escolaridad" valor={empleado.escolaridad} />
                <DatoLectura label="Celular Personal" valor={empleado.celular_personal} />
                <DatoLectura label="No. de Emergencia" valor={empleado.telefono_emergencia} />
                <DatoLectura label="Parentesco" valor={empleado.parentesco_emergencia} />
                <DatoLectura label="Contacto de Emergencia" valor={empleado.contacto_emergencia} />
                <DatoLectura label="Correo Personal" valor={empleado.correo_personal} />
                <DatoLectura label="Calle y Número" valor={empleado.calle} />
                <DatoLectura label="Colonia" valor={empleado.colonia} />
                <DatoLectura label="C.P." valor={empleado.codigo_postal} />
                <DatoLectura label="Alcaldía o Municipio" valor={empleado.municipio} />
                <DatoLectura label="Residencia (Estado)" valor={empleado.estado_residencia} />
                <DatoLectura label="Banco" valor={empleado.banco} />
                <DatoLectura label="CLABE Interbancaria" valor={empleado.clabe} />
                <DatoLectura label="C.P. Fiscal" valor={empleado.cp_fiscal} />
              </>
            )}
          </div>

          {/* Sección Hijos */}
          <div className="expediente-subseccion">
            <div className="subseccion-encabezado">
              <h3>Hijos</h3>
              {editando && (
                <button
                  className="boton-agregar-hijo"
                  onClick={() => setMostrarFormHijo(!mostrarFormHijo)}
                >
                  {mostrarFormHijo ? "Cancelar" : "+ Agregar"}
                </button>
              )}
            </div>

            {editando && mostrarFormHijo && (
              <form onSubmit={agregarHijo} className="formulario-hijo">
                <div className="datos-grid">
                  <Campo label="Nombre" name="nombre" value={hijoFormulario.nombre}
                    onChange={(e) => setHijoFormulario({ ...hijoFormulario, nombre: e.target.value })} />
                  <Campo label="Fecha de Nacimiento" name="fecha_nacimiento" type="date"
                    value={hijoFormulario.fecha_nacimiento}
                    onChange={(e) => setHijoFormulario({ ...hijoFormulario, fecha_nacimiento: e.target.value })} />
                  <div className="dato">
                    <label>Escolaridad</label>
                    <select value={hijoFormulario.escolaridad}
                      onChange={(e) => setHijoFormulario({ ...hijoFormulario, escolaridad: e.target.value })}>
                      <option value="">Seleccionar</option>
                      <option value="preescolar">Preescolar</option>
                      <option value="primaria">Primaria</option>
                      <option value="secundaria">Secundaria</option>
                      <option value="preparatoria">Preparatoria</option>
                      <option value="universidad">Universidad</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="boton-guardar">Guardar hijo</button>
              </form>
            )}

            {hijos.length === 0 ? (
              <p className="sin-datos">No hay hijos registrados.</p>
            ) : (
              <table className="tabla-hijos">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Fecha Nacimiento</th>
                    <th>Edad</th>
                    <th>Escolaridad</th>
                    {editando && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {hijos.map((h) => (
                    <tr key={h.id}>
                      <td>{h.nombre || "-"}</td>
                      <td>{formatFecha(h.fecha_nacimiento)}</td>
                      <td>{calcularEdad(h.fecha_nacimiento) !== "-" ? `${calcularEdad(h.fecha_nacimiento)} años` : "-"}</td>
                      <td>{h.escolaridad || "-"}</td>
                      {editando && (
                        <td>
                          <button className="boton-eliminar-hijo" onClick={() => quitarHijo(h.id)}>✕</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab: Documentación */}
      {pestana === "documentos" && (
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
                <select id="doc-tipo" name="tipo_documento" value={docFormulario.tipo_documento} onChange={manejarDocCambio} required>
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
                <input type="file" id="doc-archivo" name="archivo" accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx" onChange={manejarDocCambio} required />
                <small style={{ color: "var(--color-texto-claro)", fontSize: "0.78rem", marginTop: "0.3rem", display: "block" }}>
                  Formatos: JPG, PNG, GIF, PDF, DOC, DOCX · Tamaño máximo: 10 MB
                </small>
              </div>
              <div className="campo">
                <label htmlFor="doc-descripcion">Descripción</label>
                <input type="text" id="doc-descripcion" name="descripcion" value={docFormulario.descripcion} onChange={manejarDocCambio} placeholder="Descripción opcional" />
              </div>
              <div className="formulario-botones">
                <button type="submit" disabled={subiendoDoc}>{subiendoDoc ? "Subiendo..." : "Subir"}</button>
                <button type="button" onClick={() => { setMostrarSubirDoc(false); setDocError(""); }}>Cancelar</button>
              </div>
            </form>
          )}

          {cargandoDocs ? (
            <p>Cargando documentos...</p>
          ) : (
            <ChecklistDocumentos documentos={documentos} onEliminar={eliminarDoc} />
          )}
        </div>
      )}
    </div>
  );
}

function soloDigitos(e) {
  e.target.value = e.target.value.replace(/\D/g, "");
}

function Campo({ label, name, value, onChange, type = "text", maxLength, minLength, pattern, title, onInput }) {
  return (
    <div className="dato">
      <label htmlFor={`edit-${name}`}>{label}</label>
      <input
        type={type}
        id={`edit-${name}`}
        name={name}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        minLength={minLength}
        pattern={pattern}
        title={title}
        onInput={onInput}
      />
    </div>
  );
}

function CampoSelect({ label, name, value, onChange, opciones, placeholder = "Seleccionar" }) {
  return (
    <div className="dato">
      <label htmlFor={`edit-${name}`}>{label}</label>
      <select id={`edit-${name}`} name={name} value={value} onChange={onChange}>
        <option value="">{placeholder}</option>
        {opciones.map((op) => (
          <option key={op} value={op}>{op}</option>
        ))}
      </select>
    </div>
  );
}

function DatoLectura({ label, valor }) {
  return (
    <div className="dato">
      <label>{label}</label>
      <span>{valor || "-"}</span>
    </div>
  );
}
