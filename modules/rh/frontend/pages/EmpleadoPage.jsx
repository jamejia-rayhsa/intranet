import { useState, useEffect } from "react";
import {
  obtenerEmpleados,
  crearEmpleado,
  marcarBaja,
  obtenerRoles,
} from "../services/empleados.service";
import { obtenerDepartamentos } from "../services/departamentos.service";
import { obtenerPuestos } from "../services/puestos.service";
import { obtenerUbicaciones } from "../services/ubicaciones.service";
import EmpleadoProfileCard from "../components/EmpleadoProfileCard";
import {
  ESTADOS_MEXICO,
  BANCOS_MEXICO,
  GENEROS,
  ESTADOS_CIVILES,
  NIVELES_ESCOLARIDAD,
  TIPOS_CONTRATO,
} from "../constants/catalogos";

function soloDigitos(e) {
  e.target.value = e.target.value.replace(/\D/g, "");
}

const etiquetasEstatus = {
  activo: "Activo",
  baja: "Baja",
  suspendido: "Suspendido",
};

const coloresEstatus = {
  activo: "badge-activo",
  baja: "badge-baja",
  suspendido: "badge-suspendido",
};

const estiloSeccion = {
  borderBottom: "1px solid var(--color-borde)",
  paddingBottom: "0.75rem",
  marginBottom: "0.75rem",
  fontWeight: 700,
  color: "var(--color-primario)",
  fontSize: "0.88rem",
  marginTop: "1rem",
};

const estiloGrid2 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem",
};

const estiloGrid3 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "0.75rem",
};

const formularioInicial = {
  nombre: "",
  apellido_paterno: "",
  apellido_materno: "",
  fecha_nacimiento: "",
  curp: "",
  rfc: "",
  nss: "",
  genero: "",
  estado_civil: "",
  escolaridad: "",
  estado_nacimiento: "",
  celular_personal: "",
  correo_personal: "",
  telefono_emergencia: "",
  parentesco_emergencia: "",
  contacto_emergencia: "",
  calle: "",
  colonia: "",
  codigo_postal: "",
  municipio: "",
  estado_residencia: "",
  numero_nomina: "",
  fecha_imss: "",
  fecha_ingreso: new Date().toISOString().split("T")[0],
  fecha_renovacion: "",
  tipo_contrato: "",
  celular_corporativo: "",
  jefe_inmediato_id: "",
  banco: "",
  clabe: "",
  cp_fiscal: "",
  infonavit: "",
  fonacot: "",
  puesto_id: "",
  departamento_id: "",
  ubicacion_id: "",
  estatus: "activo",
  correo: "",
  contraseña: "",
  rol_id: "",
};

export default function EmpleadoPage() {
  const [empleados, setEmpleados] = useState([]);
  const [empleadosJefes, setEmpleadosJefes] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [paginasTotales, setPaginasTotales] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("");
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [error, setError] = useState("");
  const [crearUsuario, setCrearUsuario] = useState(false);
  const [formulario, setFormulario] = useState(formularioInicial);

  useEffect(() => {
    cargarEmpleados();
    cargarRoles();
    cargarCatalogos();
  }, [pagina, busqueda, filtroEstatus]);

  async function cargarCatalogos() {
    try {
      const [respDeptos, respPuestos, respUbicaciones, respJefes] =
        await Promise.all([
          obtenerDepartamentos(),
          obtenerPuestos(),
          obtenerUbicaciones(),
          obtenerEmpleados({ limite: 200, estatus: "activo" }),
        ]);
      if (respDeptos.exito) setDepartamentos(respDeptos.datos);
      if (respPuestos.exito) setPuestos(respPuestos.datos);
      if (respUbicaciones.exito) setUbicaciones(respUbicaciones.datos);
      if (respJefes.exito) setEmpleadosJefes(respJefes.datos.empleados || []);
    } catch (error) {
      console.error("Error al cargar catálogos:", error);
    }
  }

  async function cargarRoles() {
    try {
      const respuesta = await obtenerRoles();
      if (respuesta.exito) setRoles(respuesta.datos);
    } catch (error) {
      console.error("Error al cargar roles:", error);
    }
  }

  async function cargarEmpleados() {
    setCargando(true);
    try {
      const respuesta = await obtenerEmpleados({
        pagina,
        limite: 15,
        busqueda,
        estatus: filtroEstatus,
      });
      if (respuesta.exito) {
        setEmpleados(respuesta.datos.empleados);
        setPaginasTotales(respuesta.datos.paginas_totales);
      }
    } catch (error) {
      console.error("Error al cargar empleados:", error);
    } finally {
      setCargando(false);
    }
  }

  function manejarCambio(evento) {
    const { name, value } = evento.target;
    setFormulario({ ...formulario, [name]: value });
  }

  function manejarBlurNombre(e) {
    const capitalizado = e.target.value
      .toLowerCase()
      .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    setFormulario((prev) => ({ ...prev, [e.target.name]: capitalizado }));
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");
    try {
      const datosEnvio = {
        nombre: formulario.nombre,
        apellido_paterno: formulario.apellido_paterno,
        apellido_materno: formulario.apellido_materno || null,
        fecha_nacimiento: formulario.fecha_nacimiento || null,
        curp: formulario.curp || null,
        rfc: formulario.rfc || null,
        nss: formulario.nss || null,
        genero: formulario.genero || null,
        estado_civil: formulario.estado_civil || null,
        escolaridad: formulario.escolaridad || null,
        estado_nacimiento: formulario.estado_nacimiento || null,
        celular_personal: formulario.celular_personal || null,
        correo_personal: formulario.correo_personal || null,
        telefono_emergencia: formulario.telefono_emergencia || null,
        parentesco_emergencia: formulario.parentesco_emergencia || null,
        contacto_emergencia: formulario.contacto_emergencia || null,
        calle: formulario.calle || null,
        colonia: formulario.colonia || null,
        codigo_postal: formulario.codigo_postal || null,
        municipio: formulario.municipio || null,
        estado_residencia: formulario.estado_residencia || null,
        numero_nomina: formulario.numero_nomina || null,
        fecha_imss: formulario.fecha_imss || null,
        fecha_ingreso: formulario.fecha_ingreso,
        fecha_renovacion: formulario.fecha_renovacion || null,
        tipo_contrato: formulario.tipo_contrato || null,
        celular_corporativo: formulario.celular_corporativo || null,
        jefe_inmediato_id: formulario.jefe_inmediato_id || null,
        banco: formulario.banco || null,
        clabe: formulario.clabe || null,
        cp_fiscal: formulario.cp_fiscal || null,
        infonavit: formulario.infonavit || null,
        fonacot: formulario.fonacot || null,
        puesto_id: formulario.puesto_id || null,
        departamento_id: formulario.departamento_id || null,
        ubicacion_id: formulario.ubicacion_id || null,
        estatus: formulario.estatus,
        crear_usuario: crearUsuario,
      };
      if (crearUsuario) {
        datosEnvio.correo = formulario.correo;
        datosEnvio.contraseña = formulario.contraseña;
        datosEnvio.rol_id = formulario.rol_id
          ? parseInt(formulario.rol_id)
          : null;
      }
      await crearEmpleado(datosEnvio);
      setFormulario({
        ...formularioInicial,
        fecha_ingreso: new Date().toISOString().split("T")[0],
      });
      setMostrarFormulario(false);
      setCrearUsuario(false);
      cargarEmpleados();
    } catch (err) {
      setError(err.message || "Error al crear empleado");
    }
  }

  async function manejarBaja(id) {
    if (confirm("¿Estás seguro de dar de baja a este empleado?")) {
      try {
        await marcarBaja(id, "Baja solicitada desde el panel de RH");
        cargarEmpleados();
      } catch (error) {
        console.error("Error al dar de baja:", error);
      }
    }
  }

  if (empleadoSeleccionado) {
    return (
      <EmpleadoProfileCard
        empleadoId={empleadoSeleccionado}
        alVolver={() => setEmpleadoSeleccionado(null)}
      />
    );
  }

  if (cargando) {
    return <div className="cargando">Cargando empleados...</div>;
  }

  return (
    <div className="empleados-page">
      <div className="admin-encabezado">
        <h1>Gestión de Empleados</h1>
        <button onClick={() => setMostrarFormulario(true)}>
          Nuevo Empleado
        </button>
      </div>

      {mostrarFormulario && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "2rem 1rem",
            overflowY: "auto",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setMostrarFormulario(false);
              setCrearUsuario(false);
              setError("");
            }
          }}
        >
          <div
            style={{
              background: "var(--color-fondo, #fff)",
              borderRadius: "0.75rem",
              padding: "1.75rem 2rem",
              width: "100%",
              maxWidth: "720px",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
          >
            <h2 style={{ marginTop: 0, color: "var(--color-primario)" }}>
              Nuevo Empleado
            </h2>

            {error && (
              <div
                style={{
                  background: "#fee2e2",
                  color: "#dc2626",
                  padding: "0.6rem 1rem",
                  borderRadius: "0.375rem",
                  marginBottom: "1rem",
                  fontSize: "0.9rem",
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={manejarEnvio}>
              {/* ── DATOS BÁSICOS ─────────────────────────────── */}
              <div style={estiloSeccion}>Datos básicos</div>
              <div style={estiloGrid3}>
                <div className="campo">
                  <label>Nombre *</label>
                  <input
                    type="text"
                    name="nombre"
                    value={formulario.nombre}
                    onChange={manejarCambio}
                    onBlur={manejarBlurNombre}
                    required
                    placeholder="Nombre(s)"
                  />
                </div>
                <div className="campo">
                  <label>Apellido paterno *</label>
                  <input
                    type="text"
                    name="apellido_paterno"
                    value={formulario.apellido_paterno}
                    onChange={manejarCambio}
                    onBlur={manejarBlurNombre}
                    required
                    placeholder="Apellido paterno"
                  />
                </div>
                <div className="campo">
                  <label>Apellido materno</label>
                  <input
                    type="text"
                    name="apellido_materno"
                    value={formulario.apellido_materno}
                    onChange={manejarCambio}
                    onBlur={manejarBlurNombre}
                    placeholder="Apellido materno"
                  />
                </div>
              </div>
              <div style={estiloGrid2}>
                <div className="campo">
                  <label>Fecha de ingreso</label>
                  <input
                    type="date"
                    name="fecha_ingreso"
                    value={formulario.fecha_ingreso}
                    onChange={manejarCambio}
                  />
                </div>
                <div className="campo">
                  <label>Estatus</label>
                  <select
                    name="estatus"
                    value={formulario.estatus}
                    onChange={manejarCambio}
                  >
                    <option value="activo">Activo</option>
                    <option value="suspendido">Suspendido</option>
                  </select>
                </div>
              </div>

              {/* ── DATOS LABORALES ───────────────────────────── */}
              <div style={estiloSeccion}>Datos laborales</div>
              <div style={estiloGrid3}>
                <div className="campo">
                  <label>Número de nómina</label>
                  <input
                    type="text"
                    name="numero_nomina"
                    value={formulario.numero_nomina}
                    onChange={manejarCambio}
                    placeholder="Ej. 00123"
                  />
                </div>
                <div className="campo">
                  <label>Tipo de contrato</label>
                  <select
                    name="tipo_contrato"
                    value={formulario.tipo_contrato}
                    onChange={manejarCambio}
                  >
                    <option value="">Seleccionar</option>
                    {TIPOS_CONTRATO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="campo">
                  <label>Celular corporativo</label>
                  <input
                    type="tel"
                    name="celular_corporativo"
                    value={formulario.celular_corporativo}
                    onChange={manejarCambio}
                    placeholder="10 dígitos"
                    maxLength={10}
                    minLength={10}
                    onInput={soloDigitos}
                    pattern="\d{10}"
                    title="10 dígitos sin espacios"
                  />
                </div>
              </div>
              <div style={estiloGrid2}>
                <div className="campo">
                  <label>Fecha de alta IMSS</label>
                  <input
                    type="date"
                    name="fecha_imss"
                    value={formulario.fecha_imss}
                    onChange={manejarCambio}
                  />
                </div>
                <div className="campo">
                  <label>Fecha de renovación</label>
                  <input
                    type="date"
                    name="fecha_renovacion"
                    value={formulario.fecha_renovacion}
                    onChange={manejarCambio}
                  />
                </div>
              </div>
              <div style={estiloGrid3}>
                <div className="campo">
                  <label>Departamento</label>
                  <select
                    name="departamento_id"
                    value={formulario.departamento_id}
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
                <div className="campo">
                  <label>Puesto</label>
                  <select
                    name="puesto_id"
                    value={formulario.puesto_id}
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
                <div className="campo">
                  <label>Ubicación</label>
                  <select
                    name="ubicacion_id"
                    value={formulario.ubicacion_id}
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
              </div>
              <div className="campo">
                <label>Jefe inmediato</label>
                <select
                  name="jefe_inmediato_id"
                  value={formulario.jefe_inmediato_id}
                  onChange={manejarCambio}
                >
                  <option value="">Sin jefe asignado</option>
                  {empleadosJefes.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre} {e.apellido_paterno}
                    </option>
                  ))}
                </select>
              </div>

              {/* ── DATOS PERSONALES ──────────────────────────── */}
              <div style={estiloSeccion}>Datos personales</div>
              <div style={estiloGrid2}>
                <div className="campo">
                  <label>Fecha de nacimiento</label>
                  <input
                    type="date"
                    name="fecha_nacimiento"
                    value={formulario.fecha_nacimiento}
                    onChange={manejarCambio}
                  />
                </div>
                <div className="campo">
                  <label>Estado de nacimiento</label>
                  <select
                    name="estado_nacimiento"
                    value={formulario.estado_nacimiento}
                    onChange={manejarCambio}
                  >
                    <option value="">Seleccionar</option>
                    {ESTADOS_MEXICO.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
              <div style={estiloGrid3}>
                <div className="campo">
                  <label>CURP</label>
                  <input
                    type="text"
                    name="curp"
                    value={formulario.curp}
                    onChange={manejarCambio}
                    placeholder="18 caracteres"
                    maxLength={18}
                    minLength={18}
                    style={{ textTransform: "uppercase" }}
                    title="CURP de 18 caracteres"
                  />
                </div>
                <div className="campo">
                  <label>RFC</label>
                  <input
                    type="text"
                    name="rfc"
                    value={formulario.rfc}
                    onChange={manejarCambio}
                    placeholder="13 caracteres"
                    maxLength={13}
                    minLength={13}
                    style={{ textTransform: "uppercase" }}
                    title="RFC de 13 caracteres"
                  />
                </div>
                <div className="campo">
                  <label>NSS</label>
                  <input
                    type="text"
                    name="nss"
                    value={formulario.nss}
                    onChange={manejarCambio}
                    placeholder="11 dígitos"
                    maxLength={11}
                    minLength={11}
                    onInput={soloDigitos}
                    pattern="\d{11}"
                    title="NSS de 11 dígitos"
                  />
                </div>
              </div>
              <div style={estiloGrid3}>
                <div className="campo">
                  <label>Género</label>
                  <select
                    name="genero"
                    value={formulario.genero}
                    onChange={manejarCambio}
                  >
                    <option value="">Seleccionar</option>
                    {GENEROS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="campo">
                  <label>Estado civil</label>
                  <select
                    name="estado_civil"
                    value={formulario.estado_civil}
                    onChange={manejarCambio}
                  >
                    <option value="">Seleccionar</option>
                    {ESTADOS_CIVILES.map((ec) => (
                      <option key={ec} value={ec}>{ec}</option>
                    ))}
                  </select>
                </div>
                <div className="campo">
                  <label>Escolaridad</label>
                  <select
                    name="escolaridad"
                    value={formulario.escolaridad}
                    onChange={manejarCambio}
                  >
                    <option value="">Seleccionar</option>
                    {NIVELES_ESCOLARIDAD.map((ne) => (
                      <option key={ne} value={ne}>{ne}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── CONTACTO ──────────────────────────────────── */}
              <div style={estiloSeccion}>Contacto</div>
              <div style={estiloGrid2}>
                <div className="campo">
                  <label>Celular personal</label>
                  <input
                    type="tel"
                    name="celular_personal"
                    value={formulario.celular_personal}
                    onChange={manejarCambio}
                    placeholder="10 dígitos"
                    maxLength={10}
                    minLength={10}
                    onInput={soloDigitos}
                    pattern="\d{10}"
                    title="10 dígitos sin espacios"
                  />
                </div>
                <div className="campo">
                  <label>Correo personal</label>
                  <input
                    type="email"
                    name="correo_personal"
                    value={formulario.correo_personal}
                    onChange={manejarCambio}
                    placeholder="correo@personal.com"
                  />
                </div>
              </div>
              <div style={estiloGrid3}>
                <div className="campo">
                  <label>Teléfono de emergencia</label>
                  <input
                    type="tel"
                    name="telefono_emergencia"
                    value={formulario.telefono_emergencia}
                    onChange={manejarCambio}
                    placeholder="10 dígitos"
                    maxLength={10}
                    minLength={10}
                    onInput={soloDigitos}
                    pattern="\d{10}"
                    title="10 dígitos sin espacios"
                  />
                </div>
                <div className="campo">
                  <label>Contacto de emergencia</label>
                  <input
                    type="text"
                    name="contacto_emergencia"
                    value={formulario.contacto_emergencia}
                    onChange={manejarCambio}
                    placeholder="Nombre completo"
                  />
                </div>
                <div className="campo">
                  <label>Parentesco</label>
                  <input
                    type="text"
                    name="parentesco_emergencia"
                    value={formulario.parentesco_emergencia}
                    onChange={manejarCambio}
                    placeholder="Ej. Madre, Cónyuge"
                  />
                </div>
              </div>

              {/* ── DOMICILIO ─────────────────────────────────── */}
              <div style={estiloSeccion}>Domicilio</div>
              <div style={estiloGrid2}>
                <div className="campo">
                  <label>Calle y número</label>
                  <input
                    type="text"
                    name="calle"
                    value={formulario.calle}
                    onChange={manejarCambio}
                    placeholder="Ej. Av. Reforma 123"
                  />
                </div>
                <div className="campo">
                  <label>Colonia</label>
                  <input
                    type="text"
                    name="colonia"
                    value={formulario.colonia}
                    onChange={manejarCambio}
                  />
                </div>
              </div>
              <div style={estiloGrid3}>
                <div className="campo">
                  <label>Código postal</label>
                  <input
                    type="text"
                    name="codigo_postal"
                    value={formulario.codigo_postal}
                    onChange={manejarCambio}
                    maxLength={5}
                    minLength={5}
                    onInput={soloDigitos}
                    pattern="\d{5}"
                    title="5 dígitos numéricos"
                    placeholder="5 dígitos"
                  />
                </div>
                <div className="campo">
                  <label>Municipio</label>
                  <input
                    type="text"
                    name="municipio"
                    value={formulario.municipio}
                    onChange={manejarCambio}
                  />
                </div>
                <div className="campo">
                  <label>Estado</label>
                  <select
                    name="estado_residencia"
                    value={formulario.estado_residencia}
                    onChange={manejarCambio}
                  >
                    <option value="">Seleccionar</option>
                    {ESTADOS_MEXICO.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>

              {/* ── DATOS FINANCIEROS ─────────────────────────── */}
              <div style={estiloSeccion}>Datos financieros</div>
              <div style={estiloGrid3}>
                <div className="campo">
                  <label>Banco</label>
                  <select
                    name="banco"
                    value={formulario.banco}
                    onChange={manejarCambio}
                  >
                    <option value="">Seleccionar</option>
                    {BANCOS_MEXICO.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label>CLABE interbancaria</label>
                  <input
                    type="text"
                    name="clabe"
                    value={formulario.clabe}
                    onChange={manejarCambio}
                    maxLength={18}
                    minLength={18}
                    onInput={soloDigitos}
                    pattern="\d{18}"
                    title="CLABE de 18 dígitos numéricos"
                    placeholder="18 dígitos"
                  />
                </div>
                <div className="campo">
                  <label>CP fiscal</label>
                  <input
                    type="text"
                    name="cp_fiscal"
                    value={formulario.cp_fiscal}
                    onChange={manejarCambio}
                    maxLength={5}
                    minLength={5}
                    onInput={soloDigitos}
                    pattern="\d{5}"
                    title="Código postal fiscal de 5 dígitos"
                    placeholder="5 dígitos"
                  />
                </div>
              </div>
              <div style={estiloGrid2}>
                <div className="campo">
                  <label>Crédito Infonavit</label>
                  <input
                    type="text"
                    name="infonavit"
                    value={formulario.infonavit}
                    onChange={manejarCambio}
                    placeholder="Número de crédito"
                  />
                </div>
                <div className="campo">
                  <label>Crédito Fonacot</label>
                  <input
                    type="text"
                    name="fonacot"
                    value={formulario.fonacot}
                    onChange={manejarCambio}
                    placeholder="Número de crédito"
                  />
                </div>
              </div>

              {/* ── CREAR USUARIO ─────────────────────────────── */}
              <div style={estiloSeccion}>Acceso al sistema</div>
              <div className="campo-casilla">
                <input
                  type="checkbox"
                  id="crear_usuario"
                  checked={crearUsuario}
                  onChange={(e) => setCrearUsuario(e.target.checked)}
                />
                <label htmlFor="crear_usuario">
                  Crear usuario para este empleado
                </label>
              </div>

              {crearUsuario && (
                <div style={{ marginTop: "0.75rem" }}>
                  <div style={estiloGrid2}>
                    <div className="campo">
                      <label>Correo electrónico *</label>
                      <input
                        type="email"
                        name="correo"
                        value={formulario.correo}
                        onChange={manejarCambio}
                        required={crearUsuario}
                        placeholder="usuario@rayhsa.com.mx"
                      />
                    </div>
                    <div className="campo">
                      <label>Contraseña temporal *</label>
                      <input
                        type="password"
                        name="contraseña"
                        value={formulario.contraseña}
                        onChange={manejarCambio}
                        required={crearUsuario}
                        minLength={6}
                        placeholder="Mín. 6 caracteres"
                      />
                    </div>
                  </div>
                  <div className="campo">
                    <label>Rol del usuario</label>
                    <select
                      name="rol_id"
                      value={formulario.rol_id}
                      onChange={manejarCambio}
                    >
                      <option value="">Sin rol</option>
                      {roles.map((rol) => (
                        <option key={rol.id} value={rol.id}>
                          {rol.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div
                className="formulario-botones"
                style={{ marginTop: "1.5rem" }}
              >
                <button type="submit">Crear Empleado</button>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarFormulario(false);
                    setCrearUsuario(false);
                    setError("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="empleados-filtros">
        <input
          type="text"
          placeholder="Buscar por nombre, apellido o puesto..."
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPagina(1);
          }}
        />
        <select
          value={filtroEstatus}
          onChange={(e) => {
            setFiltroEstatus(e.target.value);
            setPagina(1);
          }}
        >
          <option value="">Todos los estatus</option>
          <option value="activo">Activos</option>
          <option value="baja">Baja</option>
          <option value="suspendido">Suspendidos</option>
        </select>
      </div>

      {empleados.length === 0 ? (
        <p className="mensaje-info">No se encontraron empleados.</p>
      ) : (
        <table className="empleados-tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Puesto</th>
              <th>Departamento</th>
              <th>Estatus</th>
              <th>Fecha Ingreso</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {empleados.map((empleado) => (
              <tr key={empleado.id}>
                <td>
                  {empleado.nombre} {empleado.apellido_paterno}
                </td>
                <td>{empleado.puesto || "-"}</td>
                <td>{empleado.departamento || "-"}</td>
                <td>
                  <span className={`badge ${coloresEstatus[empleado.estatus]}`}>
                    {etiquetasEstatus[empleado.estatus]}
                  </span>
                </td>
                <td>
                  {empleado.fecha_ingreso
                    ? new Date(empleado.fecha_ingreso).toLocaleDateString(
                        "es-MX",
                      )
                    : "-"}
                </td>
                <td>
                  <button onClick={() => setEmpleadoSeleccionado(empleado.id)}>
                    Ver Expediente
                  </button>
                  {empleado.estatus === "activo" && (
                    <button
                      className="boton-peligro"
                      onClick={() => manejarBaja(empleado.id)}
                    >
                      Dar de Baja
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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
