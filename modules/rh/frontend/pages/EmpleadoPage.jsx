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

export default function EmpleadoPage() {
  const [empleados, setEmpleados] = useState([]);
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
  const [formulario, setFormulario] = useState({
    nombre: "",
    apellido: "",
    correo: "",
    contraseña: "",
    puesto_id: "",
    departamento_id: "",
    ubicacion_id: "",
    fecha_ingreso: new Date().toISOString().split("T")[0],
    estatus: "activo",
    rol_id: "",
  });

  useEffect(() => {
    cargarEmpleados();
    cargarRoles();
    cargarCatalogos();
  }, [pagina, busqueda, filtroEstatus]);

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

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");
    try {
      const datosEnvio = {
        nombre: formulario.nombre,
        apellido: formulario.apellido,
        puesto_id: formulario.puesto_id || null,
        departamento_id: formulario.departamento_id || null,
        ubicacion_id: formulario.ubicacion_id || null,
        fecha_ingreso: formulario.fecha_ingreso,
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
        nombre: "",
        apellido: "",
        correo: "",
        contraseña: "",
        puesto_id: "",
        departamento_id: "",
        ubicacion_id: "",
        fecha_ingreso: new Date().toISOString().split("T")[0],
        estatus: "activo",
        rol_id: "",
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
        <div className="formulario-modal">
          <h2>Nuevo Empleado</h2>

          {error && <div className="mensaje-error">{error}</div>}

          <form onSubmit={manejarEnvio}>
            <div className="campo">
              <label htmlFor="nombre">Nombre</label>
              <input
                type="text"
                id="nombre"
                name="nombre"
                value={formulario.nombre}
                onChange={manejarCambio}
                required
              />
            </div>

            <div className="campo">
              <label htmlFor="apellido">Apellido</label>
              <input
                type="text"
                id="apellido"
                name="apellido"
                value={formulario.apellido}
                onChange={manejarCambio}
                required
              />
            </div>

            <div className="campo">
              <label htmlFor="departamento_id">Departamento</label>
              <select
                id="departamento_id"
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
              <label htmlFor="puesto_id">Puesto</label>
              <select
                id="puesto_id"
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
              <label htmlFor="ubicacion_id">Ubicación</label>
              <select
                id="ubicacion_id"
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

            <div className="campo">
              <label htmlFor="fecha_ingreso">Fecha de Ingreso</label>
              <input
                type="date"
                id="fecha_ingreso"
                name="fecha_ingreso"
                value={formulario.fecha_ingreso}
                onChange={manejarCambio}
              />
            </div>

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
              <>
                <div className="campo">
                  <label htmlFor="correo">Correo electrónico</label>
                  <input
                    type="email"
                    id="correo"
                    name="correo"
                    value={formulario.correo}
                    onChange={manejarCambio}
                    required={crearUsuario}
                  />
                </div>

                <div className="campo">
                  <label htmlFor="contraseña">Contraseña temporal</label>
                  <input
                    type="password"
                    id="contraseña"
                    name="contraseña"
                    value={formulario.contraseña}
                    onChange={manejarCambio}
                    required={crearUsuario}
                    minLength={6}
                  />
                </div>

                <div className="campo">
                  <label htmlFor="rol_id">Rol del usuario</label>
                  <select
                    id="rol_id"
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
              </>
            )}

            <div className="formulario-botones">
              <button type="submit">Crear</button>
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
                  {empleado.nombre} {empleado.apellido}
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
