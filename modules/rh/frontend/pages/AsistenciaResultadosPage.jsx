import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  listarPeriodos,
  resumenResultados,
  listarResultados,
  sinIdentificador,
  listarDepartamentos,
  registrarExportacionResultados,
  mensajeDeError,
} from "../services/asistencia.service";
import { fechaMexicoHoy, formatoLocal } from "../utils/asistenciaFechas";
import {
  ORDEN_TARJETAS, ESTATUS, ATAJOS, ORDENES, FORMULA_PUNTUALIDAD, AVISO_CERRADA, AVISO_SIN_IDENTIFICADOR, MOTIVO_SIN_IDENTIFICADOR,
  TOPE_FILAS_EXPORTACION, totalesDeResumen, porcentajePuntualidad, textoPorcentaje, diasEvaluados, textoPeriodo, periodoPorOmision,
  validarRangoLibre, filtrarYOrdenar, textoFiltrados, paginar, nombreCompleto, paginasRestantes, construirCsvResumen,
  construirCsvDetalle, nombreArchivoResumen, nombreArchivoDetalle, MAX_DIAS_RANGO,
} from "../utils/asistenciaResultados";
import useAccesoGestion from "../hooks/useAccesoGestion";
import SinAccesoGestion from "../components/asistencia/SinAccesoGestion";
import useFocoTitulo from "../hooks/useFocoTitulo";
import EstadoCarga from "../components/asistencia/EstadoCarga";
import Paginacion from "../components/asistencia/Paginacion";
import CuadriculaAsistencia from "../components/asistencia/CuadriculaAsistencia";
import DetalleDiaDialogo from "../components/asistencia/DetalleDiaDialogo";
import "../styles/asistencia.css";
import "../styles/asistenciaResultados.css";

const FILAS_POR_PAGINA = 25;
const LIMITE = 500;

function descargarCsv(texto, nombre) {
  const blob = new Blob([texto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Pide todas las páginas de una consulta paginada (hasta el tope de seguridad). */
async function pedirTodas(pedir, tope) {
  const primera = await pedir(1);
  let filas = primera.datos.slice();
  const total = primera.paginacion ? primera.paginacion.total : filas.length;
  const mas = paginasRestantes(total, LIMITE);
  for (let p = 2; p <= mas + 1 && filas.length < tope; p += 1) {
    const r = await pedir(p);
    filas = filas.concat(r.datos);
  }
  return { filas, total, incompleto: total > filas.length };
}

export default function AsistenciaResultadosPage() {
  const acceso = useAccesoGestion();
  const { ref: tituloRef } = useFocoTitulo();
  const hoy = useMemo(() => fechaMexicoHoy(), []);

  const [periodos, setPeriodos] = useState([]);
  const [errorPeriodos, setErrorPeriodos] = useState("");
  const [seleccion, setSeleccion] = useState(""); // id del periodo o 'rango'
  const [rango, setRango] = useState({ desde: hoy, hasta: hoy });
  const [aplicado, setAplicado] = useState(null); // { desde, hasta, periodo }
  const [errorRango, setErrorRango] = useState("");
  const [departamentos, setDepartamentos] = useState([]);
  const [errorDeptos, setErrorDeptos] = useState("");
  const [filtros, setFiltros] = useState({ departamento: "", texto: "", estatus: "", atajo: "", orden: "nombre" });
  const [pagina, setPagina] = useState(1);

  const [filas, setFilas] = useState([]);
  const [totalServidor, setTotalServidor] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const solicitud = useRef(0);

  const [sinId, setSinId] = useState(null);
  const [errorSinId, setErrorSinId] = useState("");

  const [empleado, setEmpleado] = useState(null); // { id, nombre }
  const [diasEmpleado, setDiasEmpleado] = useState([]);
  const [cargandoDias, setCargandoDias] = useState(false);
  const [errorDias, setErrorDias] = useState("");
  const [diaAbierto, setDiaAbierto] = useState("");
  const tituloCuadRef = useRef(null);
  const solicitudDias = useRef(0);

  const [exportando, setExportando] = useState(false);
  const [avisoExport, setAvisoExport] = useState("");

  // --- Periodos y departamentos ---
  const cargarPeriodos = useCallback(async () => {
    setErrorPeriodos("");
    try {
      const r = await listarPeriodos({ limite: 100 });
      setPeriodos(r.datos || []);
      return r.datos || [];
    } catch (err) {
      setErrorPeriodos(mensajeDeError(err, "No se pudieron cargar las quincenas"));
      return [];
    }
  }, []);

  useEffect(() => {
    if (!acceso.puedeLeer) return undefined;
    let activo = true;
    cargarPeriodos().then((lista) => {
      if (!activo) return;
      const p = periodoPorOmision(lista, hoy);
      if (p) {
        setSeleccion(String(p.id));
        setAplicado({ desde: p.fecha_inicio, hasta: p.fecha_fin, periodo: p });
      } else {
        setSeleccion("rango");
      }
    });
    listarDepartamentos()
      .then((r) => { if (activo) setDepartamentos(r.datos || []); })
      .catch((err) => { if (activo) setErrorDeptos(mensajeDeError(err, "No se pudieron cargar los departamentos")); });
    return () => { activo = false; };
  }, [acceso.puedeLeer, cargarPeriodos, hoy]);

  // --- Resumen (todas las páginas de 500) ---
  const cargarResumen = useCallback(async (silencioso = false) => {
    if (!aplicado) return;
    const mia = ++solicitud.current;
    if (!silencioso) setCargando(true);
    setError("");
    try {
      const { filas: todas, total } = await pedirTodas(
        (pagina_) => resumenResultados({ desde: aplicado.desde, hasta: aplicado.hasta, departamentoId: filtros.departamento, pagina: pagina_, limite: LIMITE }),
        20000,
      );
      if (mia !== solicitud.current) return;
      setFilas(todas);
      setTotalServidor(total);
    } catch (err) {
      if (mia !== solicitud.current) return;
      setFilas([]);
      setTotalServidor(0);
      setError(mensajeDeError(err, "No se pudo cargar el resumen de asistencia"));
    } finally {
      if (mia === solicitud.current) setCargando(false);
    }
  }, [aplicado, filtros.departamento]);

  useEffect(() => {
    if (acceso.puedeLeer && aplicado) cargarResumen();
  }, [acceso.puedeLeer, aplicado, cargarResumen]);

  // --- Sin identificador ---
  const cargarSinId = useCallback(async () => {
    setErrorSinId("");
    try {
      const r = await sinIdentificador({ limite: 100 });
      setSinId({ filas: r.datos || [], total: r.paginacion ? r.paginacion.total : (r.datos || []).length });
    } catch (err) {
      setSinId(null);
      setErrorSinId(mensajeDeError(err, "No se pudo cargar la lista de empleados sin identificador"));
    }
  }, []);
  useEffect(() => {
    if (acceso.puedeLeer) cargarSinId();
  }, [acceso.puedeLeer, cargarSinId]);

  // --- Cuadrícula del empleado ---
  const cargarDias = useCallback(async (emp, silencioso = false) => {
    if (!emp || !aplicado) return;
    const mia = ++solicitudDias.current;
    if (!silencioso) setCargandoDias(true);
    setErrorDias("");
    try {
      const { filas: dias } = await pedirTodas((p) => listarResultados({ desde: aplicado.desde, hasta: aplicado.hasta, empleadoId: emp.id, pagina: p, limite: LIMITE }), 1000);
      if (mia !== solicitudDias.current) return;
      setDiasEmpleado(dias);
    } catch (err) {
      if (mia !== solicitudDias.current) return;
      setDiasEmpleado([]);
      setErrorDias(mensajeDeError(err, "No se pudo cargar la cuadrícula del empleado"));
    } finally {
      if (mia === solicitudDias.current) setCargandoDias(false);
    }
  }, [aplicado]);

  useEffect(() => {
    if (empleado) cargarDias(empleado);
  }, [empleado, cargarDias]);

  // --- Selección de quincena / rango ---
  function cambiarSeleccion(e) {
    const valor = e.target.value;
    setSeleccion(valor);
    setErrorRango("");
    if (valor !== "rango") {
      const p = periodos.find((x) => String(x.id) === valor);
      if (p) {
        setEmpleado(null);
        setPagina(1);
        setAplicado({ desde: p.fecha_inicio, hasta: p.fecha_fin, periodo: p });
      }
    }
  }
  function aplicarRango(e) {
    e.preventDefault();
    const problema = validarRangoLibre(rango.desde, rango.hasta);
    setErrorRango(problema);
    if (problema) return;
    setEmpleado(null);
    setPagina(1);
    setAplicado({ desde: rango.desde, hasta: rango.hasta, periodo: null });
  }
  const cambiarFiltro = (campo) => (e) => {
    setFiltros((f) => ({ ...f, [campo]: e.target.value }));
    setPagina(1);
  };
  function usarAtajo(id) {
    setFiltros((f) => ({ ...f, atajo: f.atajo === id ? "" : id }));
    setPagina(1);
  }
  function limpiarFiltros() {
    setFiltros((f) => ({ departamento: f.departamento, texto: "", estatus: "", atajo: "", orden: "nombre" }));
    setPagina(1);
  }

  const filtradas = useMemo(
    () => filtrarYOrdenar(filas, { texto: filtros.texto, estatus: filtros.estatus, atajo: filtros.atajo, orden: filtros.orden }),
    [filas, filtros.texto, filtros.estatus, filtros.atajo, filtros.orden],
  );
  // Las tarjetas son del PERIODO completo; los filtros solo afectan la tabla (su total va en una línea aparte)
  const totales = useMemo(() => totalesDeResumen(filas), [filas]);
  const totalesFiltrados = useMemo(() => totalesDeResumen(filtradas), [filtradas]);
  const pag = paginar(filtradas, pagina, FILAS_POR_PAGINA);
  const periodosCerradosEnRango = useMemo(() => {
    if (!aplicado) return [];
    return periodos.filter((p) => p.estado === "cerrado" && p.fecha_inicio <= aplicado.hasta && p.fecha_fin >= aplicado.desde);
  }, [periodos, aplicado]);
  const esCerrada = aplicado && aplicado.periodo ? aplicado.periodo.estado === "cerrado" : false;

  function abrirEmpleado(f) {
    setEmpleado({ id: f.empleado_id, nombre: nombreCompleto(f) });
    setTimeout(() => tituloCuadRef.current && tituloCuadRef.current.focus(), 0);
  }

  // --- Cambios hechos desde el detalle: refresca resumen y cuadrícula sin parpadeo ---
  const alCambiarDia = useCallback(async () => {
    // el periodo pudo cambiar de estado en otra pestaña: se refresca también la lista de quincenas
    await Promise.all([cargarResumen(true), empleado ? cargarDias(empleado, true) : Promise.resolve()]);
  }, [cargarResumen, cargarDias, empleado]);

  // --- Exportación ---
  async function exportar(tipo) {
    if (exportando || !aplicado || filtradas.length === 0) return;
    setExportando(true);
    setAvisoExport("");
    try {
      let csv;
      let nombre;
      if (tipo === "resumen") {
        csv = construirCsvResumen(filtradas);
        nombre = nombreArchivoResumen(aplicado.desde, aplicado.hasta);
      } else {
        const ids = new Set(filtradas.map((f) => f.empleado_id));
        const { filas: dias, incompleto } = await pedirTodas(
          (p) => listarResultados({ desde: aplicado.desde, hasta: aplicado.hasta, pagina: p, limite: LIMITE }),
          TOPE_FILAS_EXPORTACION,
        );
        csv = construirCsvDetalle(dias.filter((d) => ids.has(d.empleado_id)), formatoLocal, TOPE_FILAS_EXPORTACION, incompleto);
        nombre = nombreArchivoDetalle(aplicado.desde, aplicado.hasta);
      }
      // Primero la bitácora: si no se puede registrar, NO se descarga nada (el archivo lleva nombres y nóminas)
      try {
        await registrarExportacionResultados(tipo, csv.filas);
      } catch (err) {
        setAvisoExport(`No se descargó el archivo porque no se pudo registrar la exportación en la bitácora: ${mensajeDeError(err, "error desconocido")}`);
        return;
      }
      descargarCsv(csv.texto, nombre);
      setAvisoExport(
        csv.truncado
          ? `Archivo INCOMPLETO: se exportaron solo ${csv.filas} filas (tope de ${TOPE_FILAS_EXPORTACION}); el archivo lo indica en su última fila. Acota el periodo o los filtros para obtener el resto.`
          : `Se exportaron ${csv.filas} ${csv.filas === 1 ? "fila" : "filas"} a ${nombre}.`,
      );
    } catch (err) {
      setAvisoExport(`No se pudo exportar: ${mensajeDeError(err, "error desconocido")}`);
    } finally {
      setExportando(false);
    }
  }

  if (acceso.cargando || acceso.error || !acceso.puedeLeer) return <SinAccesoGestion acceso={acceso} tituloRef={tituloRef} titulo="Resultados de asistencia" />;

  const pct = porcentajePuntualidad(totales);
  const hayFiltros = filtradas.length !== filas.length;

  return (
    <div className="asi asr">
      <h1 ref={tituloRef} tabIndex={-1}>Resultados de asistencia</h1>
      <p className="asi__sub">
        Resultado del motor por empleado y día. Valida una quincena, revisa los casos raros y justifica lo que corresponda; las horas
        están en hora de México.
      </p>

      {errorPeriodos && <p className="asi__aviso asi__aviso--error" role="alert">{errorPeriodos}</p>}

      <div className="asi__barra" role="group" aria-label="Periodo a consultar">
        <div className="asi__campo">
          <label htmlFor="res-periodo">Quincena</label>
          <select id="res-periodo" value={seleccion} onChange={cambiarSeleccion}>
            {periodos.map((p) => <option key={p.id} value={String(p.id)}>{textoPeriodo(p)}</option>)}
            <option value="rango">Rango libre (hasta {MAX_DIAS_RANGO} días)</option>
          </select>
        </div>
        {seleccion === "rango" && (
          <form className="asi__barra asr__rango" onSubmit={aplicarRango} noValidate aria-label="Rango libre">
            <div className="asi__campo">
              <label htmlFor="res-desde">Desde</label>
              <input id="res-desde" type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} required aria-invalid={errorRango ? "true" : undefined} />
            </div>
            <div className="asi__campo">
              <label htmlFor="res-hasta">Hasta</label>
              <input id="res-hasta" type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} required aria-invalid={errorRango ? "true" : undefined} />
            </div>
            <button type="submit" className="asi__btn asi__btn--primario">Consultar</button>
          </form>
        )}
        <div className="asi__campo">
          <label htmlFor="res-depto">Departamento</label>
          <select id="res-depto" value={filtros.departamento} onChange={cambiarFiltro("departamento")} disabled={Boolean(errorDeptos)}>
            <option value="">Todos</option>
            {departamentos.map((d) => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
          </select>
        </div>
      </div>
      {errorRango && <p className="asi__aviso asi__aviso--error" role="alert">{errorRango}</p>}
      {errorDeptos && <p className="asi__aviso asi__aviso--error" role="alert">{errorDeptos}</p>}
      {esCerrada && <p className="asi__aviso asi__aviso--info">{AVISO_CERRADA} <Link to="/rh/asistencia/periodos">Ir a Periodos</Link></p>}
      {!esCerrada && aplicado && !aplicado.periodo && periodosCerradosEnRango.length > 0 && (
        <p className="asi__aviso asi__aviso--info">
          El rango incluye {periodosCerradosEnRango.length} {periodosCerradosEnRango.length === 1 ? "quincena cerrada" : "quincenas cerradas"}: se calcularon con el turno vigente en ese momento.
        </p>
      )}

      <EstadoCarga cargando={cargando} error={error} onReintentar={() => cargarResumen()} />

      {aplicado && !cargando && !error && (
        <>
          <h2>Resumen del periodo {aplicado.desde} a {aplicado.hasta} ({totales.empleados} empleados)</h2>
          <dl className="asi__tarjetas asr__tarjetas" aria-label="Totales del periodo">
            {ORDEN_TARJETAS.map((e) => (
              <div key={e} className={`asi__tarjeta asr__tarjeta asr__tarjeta--${ESTATUS[e].tono}`}>
                <dt><span aria-hidden="true" className="asr__icono">{ESTATUS[e].icono}</span> {ESTATUS[e].plural}</dt>
                <dd>{totales[e]}</dd>
              </div>
            ))}
            <div className="asi__tarjeta asr__tarjeta asr__tarjeta--ok">
              <dt>% de puntualidad</dt>
              <dd>{textoPorcentaje(pct)}<small>{diasEvaluados(totales)} días evaluados</small></dd>
            </div>
          </dl>
          <p className="asi__ayuda">{FORMULA_PUNTUALIDAD}</p>
          {hayFiltros && (
            <p className="asi__ayuda asr__filtrado">
              Solo los {filtradas.length} {filtradas.length === 1 ? "empleado mostrado" : "empleados mostrados"} en la tabla (con los filtros aplicados): {totalesFiltrados.falta} faltas,
              {" "}{totalesFiltrados.retardo} retardos, puntualidad {textoPorcentaje(porcentajePuntualidad(totalesFiltrados))}. Las tarjetas de arriba no cambian con los filtros.
            </p>
          )}
          {totalServidor > filas.length && <p className="asi__aviso asi__aviso--advertencia" role="alert">Se muestran {filas.length} de {totalServidor} empleados (tope de la consulta).</p>}

          <h2>Empleados</h2>
          <div className="asi__barra" role="group" aria-label="Filtros de empleados">
            <div className="asi__campo">
              <label htmlFor="res-texto">Empleado (nombre o nómina)</label>
              <input id="res-texto" type="search" value={filtros.texto} maxLength={100} onChange={cambiarFiltro("texto")} autoComplete="off" />
            </div>
            <div className="asi__campo">
              <label htmlFor="res-estatus">Con algún día…</label>
              <select id="res-estatus" value={filtros.estatus} onChange={cambiarFiltro("estatus")}>
                <option value="">Cualquier estatus</option>
                {ORDEN_TARJETAS.map((e) => <option key={e} value={e}>{ESTATUS[e].texto}</option>)}
              </select>
            </div>
            <div className="asi__campo">
              <label htmlFor="res-orden">Ordenar por</label>
              <select id="res-orden" value={filtros.orden} onChange={cambiarFiltro("orden")}>
                {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
              </select>
            </div>
            <button type="button" className="asi__btn" onClick={limpiarFiltros}>Limpiar filtros</button>
          </div>
          <div className="asi__barra" role="group" aria-label="Atajos para revisar">
            <span className="asi__ayuda asr__etiqueta">Para revisar:</span>
            {ATAJOS.map((a) => (
              <button key={a.id} type="button" className={`asi__btn asr__atajo${filtros.atajo === a.id ? " asr__atajo--activo" : ""}`} aria-pressed={filtros.atajo === a.id} title={a.ayuda} onClick={() => usarAtajo(a.id)}>
                {a.texto}
              </button>
            ))}
          </div>
          {filtros.atajo && <p className="asi__ayuda">{ATAJOS.find((a) => a.id === filtros.atajo).ayuda}.</p>}
          <div className="asi__barra">
            <p className="asr__conteo" role="status" aria-live="polite">{textoFiltrados(filtradas.length, filas.length)}</p>
            <span className="asi__barra-espacio" />
            <button type="button" className="asi__btn" onClick={() => exportar("resumen")} disabled={exportando || filtradas.length === 0}>Exportar resumen (CSV)</button>
            <button type="button" className="asi__btn" onClick={() => exportar("detalle")} disabled={exportando || filtradas.length === 0}>Exportar detalle (CSV)</button>
          </div>
          <div role="status" aria-live="polite">{avisoExport && <p className="asi__aviso asi__aviso--info">{avisoExport}</p>}</div>

          {filtradas.length === 0 ? (
            <p className="asi__estado">{filas.length === 0 ? "No hay días calculados en este periodo." : "Ningún empleado cumple los filtros."}</p>
          ) : (
            <>
              <div className="asi__tabla-caja" role="region" aria-label="Resumen por empleado" tabIndex={0}>
                <table className="asi__tabla asr__tabla">
                  <caption className="asi__sr">Conteo de días por estatus de cada empleado</caption>
                  <thead>
                    <tr>
                      <th scope="col">Empleado</th>
                      {ORDEN_TARJETAS.map((e) => <th key={e} scope="col" className="asi__num" title={ESTATUS[e].plural}>{ESTATUS[e].plural}</th>)}
                      <th scope="col" className="asi__num">Min. retardo</th>
                      <th scope="col" className="asi__num">Puntualidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pag.filas.map((f) => (
                      <tr key={f.empleado_id} className={empleado && empleado.id === f.empleado_id ? "asr__fila-activa" : undefined}>
                        <th scope="row">
                          <button type="button" className="asr__enlace" onClick={() => abrirEmpleado(f)} aria-label={`Ver la cuadrícula de ${nombreCompleto(f)}`}>
                            {nombreCompleto(f)}
                          </button>
                          <span className="asi__sec">{f.numero_nomina}{f.departamento ? ` · ${f.departamento}` : ""}</span>
                        </th>
                        {ORDEN_TARJETAS.map((e) => <td key={e} className={`asi__num${e === "falta" && f.falta > 0 ? " asr__num-falta" : ""}`}>{f[e]}</td>)}
                        <td className="asi__num">{f.minutos_retardo}</td>
                        <td className="asi__num">{textoPorcentaje(porcentajePuntualidad(f))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacion
                pagina={pag.pagina}
                paginasTotales={pag.paginasTotales}
                texto={`${(pag.pagina - 1) * FILAS_POR_PAGINA + 1}-${(pag.pagina - 1) * FILAS_POR_PAGINA + pag.filas.length} de ${filtradas.length}`}
                onCambiar={setPagina}
              />
            </>
          )}
        </>
      )}

      {empleado && aplicado && (
        <section aria-labelledby="res-cuad-titulo" className="asi__bloque">
          <h2 id="res-cuad-titulo" ref={tituloCuadRef} tabIndex={-1}>Cuadrícula de {empleado.nombre}</h2>
          <p className="asi__ayuda">Cada celda es un día. Usa las flechas para moverte e Intro para abrir el detalle.</p>
          <button type="button" className="asi__btn asi__btn--chico" onClick={() => setEmpleado(null)}>Cerrar cuadrícula</button>
          <EstadoCarga cargando={cargandoDias} error={errorDias} onReintentar={() => cargarDias(empleado)} />
          {!cargandoDias && !errorDias && (
            <CuadriculaAsistencia desde={aplicado.desde} hasta={aplicado.hasta} dias={diasEmpleado} onAbrirDia={setDiaAbierto} etiqueta={`Días de ${empleado.nombre}, ${aplicado.desde} a ${aplicado.hasta}`} />
          )}
        </section>
      )}

      <h2>Empleados sin identificador</h2>
      <p className="asi__sub">{AVISO_SIN_IDENTIFICADOR}</p>
      {errorSinId && <p className="asi__aviso asi__aviso--error" role="alert">{errorSinId}</p>}
      {sinId && (
        <>
          <p>
            {sinId.total === 0 ? "Todos los empleados tienen un identificador único." : `${sinId.total} ${sinId.total === 1 ? "empleado no se analiza" : "empleados no se analizan"}.`}
            {sinId.total > sinId.filas.length ? ` Se muestran ${sinId.filas.length} de ${sinId.total}.` : ""}
            {" "}<Link to="/rh/empleados">Ir a Empleados</Link> · <Link to="/rh/asistencia/marcas">Ir a Marcas (re-vincular)</Link>
          </p>
          {sinId.filas.length > 0 && (
            <div className="asi__tabla-caja" role="region" aria-label="Empleados sin identificador" tabIndex={0}>
              <table className="asi__tabla">
                <caption className="asi__sr">Empleados que el motor no analiza</caption>
                <thead><tr><th scope="col">Empleado</th><th scope="col">Nómina</th><th scope="col">Motivo</th></tr></thead>
                <tbody>
                  {sinId.filas.map((f) => (
                    <tr key={f.id}>
                      <th scope="row">{nombreCompleto(f)}</th>
                      <td className="asi__mono">{f.numero_nomina || "—"}</td>
                      <td>{MOTIVO_SIN_IDENTIFICADOR[f.motivo] || f.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {diaAbierto && empleado && (
        <DetalleDiaDialogo
          empleadoId={empleado.id}
          nombre={empleado.nombre}
          fecha={diaAbierto}
          puedeEscribir={acceso.puedeEscribir}
          onCerrar={() => setDiaAbierto("")}
          onCambio={alCambiarDia}
        />
      )}
    </div>
  );
}
