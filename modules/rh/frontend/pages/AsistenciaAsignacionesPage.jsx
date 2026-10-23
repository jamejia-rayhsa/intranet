import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  listarTurnos,
  listarAsignaciones,
  listarDepartamentos,
  buscarEmpleados,
  historialEmpleado,
  mensajeDeError,
} from "../services/asistencia.service";
import { fechaMexicoHoy } from "../utils/asistenciaFechas";
import {
  AVISO_ASIGNACIONES,
  agruparPorPadre,
  vigenteHoy,
  etiquetaOrigen,
} from "../utils/asistenciaAsignaciones";
import { OPCION_TURNOS } from "../utils/asistenciaPermisos";
import useAccesoAsistencia from "../hooks/useAccesoAsistencia";
import useFocoTitulo from "../hooks/useFocoTitulo";
import EstadoCarga from "../components/asistencia/EstadoCarga";
import Paginacion from "../components/asistencia/Paginacion";
import AsignarDialogo from "../components/asistencia/AsignarDialogo";
import TerminarDialogo from "../components/asistencia/TerminarDialogo";
import ListaVigencias from "../components/asistencia/ListaVigencias";
import "../styles/asistencia.css";

const POR_PAGINA = 20;
const PESTANAS = [
  { id: "departamento", etiqueta: "Por departamento" },
  { id: "empleado", etiqueta: "Por empleado" },
];

export default function AsistenciaAsignacionesPage() {
  const nivel = useAccesoAsistencia(OPCION_TURNOS);
  const { ref: tituloRef, enfocarSiPerdido } = useFocoTitulo();
  const puedeEditar = nivel === "edicion";
  const hoy = useMemo(() => fechaMexicoHoy(), []);

  const [pestana, setPestana] = useState("departamento");
  const [turnos, setTurnos] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [dialogo, setDialogo] = useState(null); // { tipo: 'asignar'|'terminar', alcance, destino, asignacion }
  const refPestanas = useRef({});

  // Departamentos
  const [departamentos, setDepartamentos] = useState([]);
  const [asigDep, setAsigDep] = useState([]);
  const [cargandoDep, setCargandoDep] = useState(true);
  const [errorDep, setErrorDep] = useState("");

  // Empleados
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState({ empleados: [], total: 0, paginas_totales: 0 });
  const [cargandoEmp, setCargandoEmp] = useState(false);
  const [errorEmp, setErrorEmp] = useState("");
  const [seleccionado, setSeleccionado] = useState(null); // { id, nombre }
  const [historial, setHistorial] = useState(null);
  const [errorHistorial, setErrorHistorial] = useState("");

  const cargarDepartamentos = useCallback(async () => {
    setCargandoDep(true);
    setErrorDep("");
    try {
      const [t, d, a] = await Promise.all([listarTurnos(), listarDepartamentos(), listarAsignaciones("departamento")]);
      setTurnos(t.datos || []);
      setDepartamentos(d.datos || []);
      setAsigDep(a.datos || []);
    } catch (err) {
      setErrorDep(mensajeDeError(err, "No se pudieron cargar las asignaciones por departamento"));
    } finally {
      setCargandoDep(false);
    }
  }, []);

  const cargarEmpleados = useCallback(async () => {
    setCargandoEmp(true);
    setErrorEmp("");
    try {
      const [r, t] = await Promise.all([buscarEmpleados({ q: consulta, pagina, limite: POR_PAGINA }), listarTurnos()]);
      setResultado(r.datos);
      setTurnos(t.datos || []);
    } catch (err) {
      setResultado({ empleados: [], total: 0, paginas_totales: 0 });
      setErrorEmp(mensajeDeError(err, "No se pudieron cargar los empleados"));
    } finally {
      setCargandoEmp(false);
    }
  }, [consulta, pagina]);

  const cargarHistorial = useCallback(async (empleado) => {
    setErrorHistorial("");
    try {
      const r = await historialEmpleado(empleado.id);
      setHistorial(r.datos);
    } catch (err) {
      setHistorial(null);
      setErrorHistorial(mensajeDeError(err, "No se pudo cargar el historial del empleado"));
    }
  }, []);

  useEffect(() => {
    if (nivel) cargarDepartamentos();
  }, [nivel, cargarDepartamentos]);

  useEffect(() => {
    if (nivel && pestana === "empleado") cargarEmpleados();
  }, [nivel, pestana, cargarEmpleados]);

  const porDepartamento = useMemo(() => agruparPorPadre(asigDep, "departamento_id"), [asigDep]);

  async function alTerminarOAsignar(texto2, alcance) {
    setDialogo(null);
    setMensaje(texto2);
    if (alcance === "departamento") await cargarDepartamentos();
    else {
      await cargarEmpleados();
      if (seleccionado) await cargarHistorial(seleccionado);
    }
    enfocarSiPerdido();
  }

  function teclaPestana(e, indice) {
    const mover = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const destino = PESTANAS[e.key === "Home" ? 0 : PESTANAS.length - 1].id;
      setPestana(destino);
      refPestanas.current[destino]?.focus();
      return;
    }
    if (!mover) return;
    e.preventDefault();
    const destino = PESTANAS[(indice + mover + PESTANAS.length) % PESTANAS.length].id;
    setPestana(destino);
    refPestanas.current[destino]?.focus();
  }

  function buscar(e) {
    e.preventDefault();
    setPagina(1);
    setConsulta(texto.trim());
    setSeleccionado(null);
    setHistorial(null);
  }

  function elegirEmpleado(emp) {
    setSeleccionado({ id: emp.id, nombre: emp.nombre });
    setHistorial(null);
    cargarHistorial(emp);
  }

  if (nivel === null) {
    return (
      <div className="asi">
        <h1 ref={tituloRef} tabIndex={-1}>Asignaciones de turno</h1>
        <p className="asi__aviso asi__aviso--error" role="alert">No tienes permiso para ver las asignaciones de turno.</p>
      </div>
    );
  }

  return (
    <div className="asi">
      <h1 ref={tituloRef} tabIndex={-1}>Asignaciones de turno</h1>
      <p className="asi__sub">Asigna turnos a departamentos o a empleados con una vigencia. Las asignaciones no se borran: se terminan y quedan en el historial.</p>
      <p className="asi__aviso asi__aviso--advertencia">{AVISO_ASIGNACIONES}</p>

      <div role="status" aria-live="polite">
        {mensaje && <p className="asi__aviso asi__aviso--ok">{mensaje}</p>}
      </div>

      <div className="asi__pestanas" role="tablist" aria-label="Alcance de la asignación">
        {PESTANAS.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`asig-tab-${p.id}`}
            aria-selected={pestana === p.id}
            aria-controls={`asig-panel-${p.id}`}
            tabIndex={pestana === p.id ? 0 : -1}
            className="asi__pestana"
            ref={(el) => { refPestanas.current[p.id] = el; }}
            onClick={() => setPestana(p.id)}
            onKeyDown={(e) => teclaPestana(e, i)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestana === "departamento" && (
        <div role="tabpanel" id="asig-panel-departamento" aria-labelledby="asig-tab-departamento">
          <EstadoCarga
            cargando={cargandoDep || nivel === undefined}
            error={errorDep}
            vacio={!cargandoDep && !errorDep && departamentos.length === 0}
            textoVacio="No hay departamentos."
            onReintentar={cargarDepartamentos}
          />
          {!cargandoDep && !errorDep && departamentos.length > 0 && (
            <div className="asi__tabla-caja" role="region" aria-label="Asignaciones por departamento" tabIndex={0}>
              <table className="asi__tabla">
                <caption className="asi__sr">Asignaciones de turno por departamento</caption>
                <thead>
                  <tr>
                    <th scope="col">Departamento</th>
                    <th scope="col">Turno hoy</th>
                    <th scope="col">Vigencias</th>
                    {puedeEditar && <th scope="col">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {departamentos.map((d) => {
                    const lista = porDepartamento.get(d.id) || [];
                    const actual = vigenteHoy(lista, hoy);
                    return (
                      <tr key={d.id}>
                        <th scope="row">{d.nombre}</th>
                        <td>{actual ? actual.turno_nombre : <span className="asi__badge asi__badge--aviso">Sin turno</span>}</td>
                        <td>
                          <ListaVigencias
                            lista={lista}
                            hoy={hoy}
                            nombreDestino={d.nombre}
                            onTerminar={puedeEditar ? (a) => setDialogo({ tipo: "terminar", alcance: "departamento", destino: d, asignacion: a }) : undefined}
                          />
                        </td>
                        {puedeEditar && (
                          <td>
                            <button
                              type="button"
                              className="asi__btn asi__btn--chico"
                              onClick={() => { setMensaje(""); setDialogo({ tipo: "asignar", alcance: "departamento", destino: d }); }}
                              aria-label={`Asignar turno a ${d.nombre}`}
                            >
                              Asignar turno
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pestana === "empleado" && (
        <div role="tabpanel" id="asig-panel-empleado" aria-labelledby="asig-tab-empleado">
          <form className="asi__barra" onSubmit={buscar} role="search" aria-label="Buscar empleado">
            <div className="asi__campo">
              <label htmlFor="asig-buscar">Nombre o número de nómina</label>
              <input id="asig-buscar" type="search" value={texto} maxLength={100} onChange={(e) => setTexto(e.target.value)} />
            </div>
            <button type="submit" className="asi__btn asi__btn--primario">Buscar</button>
          </form>

          <EstadoCarga
            cargando={cargandoEmp || nivel === undefined}
            error={errorEmp}
            vacio={!cargandoEmp && !errorEmp && resultado.empleados.length === 0}
            textoVacio={consulta ? "Ningún empleado coincide con la búsqueda." : "No hay empleados."}
            onReintentar={cargarEmpleados}
          />
          {!cargandoEmp && !errorEmp && resultado.empleados.length > 0 && (
            <>
              <div className="asi__tabla-caja" role="region" aria-label="Empleados" tabIndex={0}>
                <table className="asi__tabla">
                  <caption className="asi__sr">Empleados y su turno de hoy</caption>
                  <thead>
                    <tr>
                      <th scope="col">Empleado</th>
                      <th scope="col">Nómina</th>
                      <th scope="col">Departamento</th>
                      <th scope="col">Turno hoy</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.empleados.map((e) => (
                      <tr key={e.id}>
                        <th scope="row">
                          {e.nombre}
                          {e.estatus && e.estatus !== "activo" && <span className="asi__sec">{e.estatus}</span>}
                        </th>
                        <td className="asi__nowrap">{e.numero_nomina || <span className="asi__sec">Sin nómina</span>}</td>
                        <td>{e.departamento || "—"}</td>
                        <td>
                          {e.turno_nombre ? (
                            <>
                              {e.turno_nombre}
                              <span className="asi__sec">{etiquetaOrigen(e.origen)}</span>
                            </>
                          ) : (
                            <span className="asi__badge asi__badge--aviso">Sin turno</span>
                          )}
                        </td>
                        <td>
                          <div className="asi__acciones-celda">
                            <button type="button" className="asi__btn asi__btn--chico" onClick={() => elegirEmpleado(e)} aria-label={`Ver historial de ${e.nombre}`}>Historial</button>
                            {puedeEditar && (
                              <button
                                type="button"
                                className="asi__btn asi__btn--chico"
                                onClick={() => { setMensaje(""); setSeleccionado({ id: e.id, nombre: e.nombre }); cargarHistorial(e); setDialogo({ tipo: "asignar", alcance: "empleado", destino: { id: e.id, nombre: e.nombre } }); }}
                                aria-label={`Asignar turno a ${e.nombre}`}
                              >
                                Asignar turno
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacion
                pagina={pagina}
                paginasTotales={resultado.paginas_totales}
                texto={`${(pagina - 1) * POR_PAGINA + 1}-${(pagina - 1) * POR_PAGINA + resultado.empleados.length} de ${resultado.total}`}
                onCambiar={(p) => { setPagina(p); setSeleccionado(null); setHistorial(null); }}
                deshabilitado={cargandoEmp}
              />
            </>
          )}

          {seleccionado && (
            <section className="asi__bloque" aria-labelledby="asig-historial-titulo">
              <h2 id="asig-historial-titulo" style={{ marginTop: 0 }}>Historial de {seleccionado.nombre}</h2>
              {errorHistorial && <p className="asi__aviso asi__aviso--error" role="alert">{errorHistorial}</p>}
              {!historial && !errorHistorial && <p className="asi__estado" role="status">Cargando…</p>}
              {historial && (
                <>
                  <h3>Asignaciones individuales</h3>
                  <ListaVigencias
                    lista={historial.individuales}
                    hoy={hoy}
                    nombreDestino={seleccionado.nombre}
                    onTerminar={puedeEditar ? (a) => setDialogo({ tipo: "terminar", alcance: "empleado", destino: seleccionado, asignacion: a }) : undefined}
                  />
                  <h3>Turno de su departamento (solo lectura)</h3>
                  <ListaVigencias lista={historial.departamento} hoy={hoy} nombreDestino="su departamento" />
                  <p className="asi__ayuda">Las asignaciones del departamento se cambian en la pestaña «Por departamento».</p>
                </>
              )}
            </section>
          )}
        </div>
      )}

      {dialogo && dialogo.tipo === "asignar" && (
        <AsignarDialogo
          tipo={dialogo.alcance}
          destino={dialogo.destino}
          turnos={turnos}
          hoy={hoy}
          onCerrar={() => setDialogo(null)}
          onAsignado={(t) => alTerminarOAsignar(t, dialogo.alcance)}
        />
      )}
      {dialogo && dialogo.tipo === "terminar" && (
        <TerminarDialogo
          tipo={dialogo.alcance}
          asignacion={dialogo.asignacion}
          nombreDestino={dialogo.destino.nombre}
          hoy={hoy}
          onCerrar={() => setDialogo(null)}
          onTerminada={(t) => alTerminarOAsignar(t, dialogo.alcance)}
        />
      )}
    </div>
  );
}
