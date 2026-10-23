import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  listarPeriodos, listarAjustes, listarEjecuciones, recalcularRango, buscarEmpleados, mensajeDeError,
} from "../services/asistencia.service";
import { fechaMexicoHoy, formatoLocal } from "../utils/asistenciaFechas";
import { OPCION_ASISTENCIA, OPCION_EMPLEADOS, accesoGestionAsistencia } from "../utils/asistenciaPermisos";
import {
  AVISO_CIERRE_AUTOMATICO, MAX_DIAS_RECALCULO, estadoCerrar, textoCierre, validarRecalculo, avisoRecalculo, textoResultadoRecalculo,
  esConflictoOcupado, mensajeAccionPeriodo, MOTIVO_AJUSTE, TIPO_EJECUCION, ESTADO_EJECUCION, textoErrorEjecucion,
} from "../utils/asistenciaPeriodos";
import useAccesoAsistencia from "../hooks/useAccesoAsistencia";
import useFocoTitulo from "../hooks/useFocoTitulo";
import EstadoCarga from "../components/asistencia/EstadoCarga";
import { CerrarPeriodoDialogo, ReabrirPeriodoDialogo, ResolverAjusteDialogo } from "../components/asistencia/PeriodoDialogos";
import "../styles/asistencia.css";
import "../styles/asistenciaResultados.css";

const nombreDe = (f) => [f.nombre, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(" ");

export default function AsistenciaPeriodosPage() {
  const nivelAsis = useAccesoAsistencia(OPCION_ASISTENCIA);
  const nivelEmp = useAccesoAsistencia(OPCION_EMPLEADOS);
  const acceso = accesoGestionAsistencia(nivelAsis, nivelEmp);
  const { ref: tituloRef, enfocarSiPerdido } = useFocoTitulo();
  const hoy = useMemo(() => fechaMexicoHoy(), []);

  const [periodos, setPeriodos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [dialogo, setDialogo] = useState(null); // { tipo: 'cerrar'|'reabrir'|'ajuste', periodo|ajuste }
  const [aviso, setAviso] = useState("");

  const [ajustes, setAjustes] = useState(null);
  const [errorAjustes, setErrorAjustes] = useState("");
  const [ejecuciones, setEjecuciones] = useState(null);
  const [errorEjecuciones, setErrorEjecuciones] = useState("");

  const [recalc, setRecalc] = useState({ desde: hoy, hasta: hoy, q: "" });
  const [candidatos, setCandidatos] = useState(null);
  const [empleadoId, setEmpleadoId] = useState("");
  const [errorBusqueda, setErrorBusqueda] = useState("");
  const [errorRecalc, setErrorRecalc] = useState("");
  const [recalculando, setRecalculando] = useState(false);
  const [estadoRecalc, setEstadoRecalc] = useState({ tipo: "", texto: "" });
  const solicitud = useRef(0);

  const cargarPeriodos = useCallback(async () => {
    const mia = ++solicitud.current;
    setError("");
    try {
      const r = await listarPeriodos({ limite: 100 });
      if (mia !== solicitud.current) return;
      setPeriodos(r.datos || []);
    } catch (err) {
      if (mia !== solicitud.current) return;
      setPeriodos([]);
      setError(mensajeDeError(err, "No se pudieron cargar las quincenas"));
    } finally {
      if (mia === solicitud.current) setCargando(false);
    }
  }, []);
  const cargarAjustes = useCallback(async () => {
    setErrorAjustes("");
    try {
      const r = await listarAjustes({ limite: 100 });
      setAjustes({ filas: r.datos || [], total: r.paginacion ? r.paginacion.total : (r.datos || []).length });
    } catch (err) {
      setAjustes(null);
      setErrorAjustes(mensajeDeError(err, "No se pudieron cargar los ajustes pendientes"));
    }
  }, []);
  const cargarEjecuciones = useCallback(async () => {
    setErrorEjecuciones("");
    try {
      const r = await listarEjecuciones(20);
      setEjecuciones(r.datos || []);
    } catch (err) {
      setEjecuciones(null);
      setErrorEjecuciones(mensajeDeError(err, "No se pudo cargar la bitácora del motor"));
    }
  }, []);

  useEffect(() => {
    if (!acceso.puedeLeer) return;
    cargarPeriodos();
    cargarAjustes();
    cargarEjecuciones();
  }, [acceso.puedeLeer, cargarPeriodos, cargarAjustes, cargarEjecuciones]);

  // Rango del recálculo por omisión: la quincena abierta más reciente
  const rangoInicial = useRef(false);
  useEffect(() => {
    if (rangoInicial.current || periodos.length === 0) return;
    rangoInicial.current = true;
    const abierto = periodos.find((p) => p.estado === "abierto") || periodos[0];
    setRecalc((r) => ({ ...r, desde: abierto.fecha_inicio, hasta: abierto.fecha_fin }));
  }, [periodos]);

  async function despuesDeAccion(texto) {
    setDialogo(null);
    // el aviso se anuncia cuando la tabla ya refleja el cambio
    await Promise.all([cargarPeriodos(), cargarAjustes(), cargarEjecuciones()]);
    setAviso(texto);
    enfocarSiPerdido();
  }

  async function buscar(e) {
    e.preventDefault();
    setErrorBusqueda("");
    setCandidatos(null);
    setEmpleadoId("");
    const q = recalc.q.trim();
    if (!q) {
      setErrorBusqueda("Escribe un nombre o una nómina para buscar.");
      return;
    }
    try {
      const r = await buscarEmpleados({ q, pagina: 1, limite: 20 });
      setCandidatos(r.datos.empleados || []);
    } catch (err) {
      setErrorBusqueda(mensajeDeError(err, "No se pudo buscar al empleado"));
    }
  }

  async function recalcular(e) {
    e.preventDefault();
    if (recalculando) return;
    const problema = validarRecalculo(recalc);
    setErrorRecalc(problema);
    if (problema) return;
    setRecalculando(true);
    setEstadoRecalc({ tipo: "", texto: "" });
    try {
      const cuerpo = { desde: recalc.desde, hasta: recalc.hasta };
      if (empleadoId) cuerpo.empleado_id = Number(empleadoId);
      const r = await recalcularRango(cuerpo);
      setEstadoRecalc({ tipo: "ok", texto: textoResultadoRecalculo(r.datos) });
      await Promise.all([cargarPeriodos(), cargarEjecuciones()]);
    } catch (err) {
      setEstadoRecalc({ tipo: esConflictoOcupado(err) ? "ocupado" : "error", texto: mensajeAccionPeriodo(err, "No se pudo recalcular") });
    } finally {
      setRecalculando(false);
    }
  }

  const avisoRango = useMemo(() => (validarRecalculo(recalc) ? null : avisoRecalculo(recalc.desde, recalc.hasta, periodos)), [recalc, periodos]);
  const nombreAjuste = (a) => nombreDe(a) || `Empleado ${a.empleado_id}`;

  if (acceso.cargando) {
    return (
      <div className="asi asr">
        <h1 ref={tituloRef} tabIndex={-1}>Periodos de asistencia</h1>
        <p className="asi__estado" role="status">Cargando…</p>
      </div>
    );
  }
  if (!acceso.puedeLeer) {
    return (
      <div className="asi asr">
        <h1 ref={tituloRef} tabIndex={-1}>Periodos de asistencia</h1>
        <p className="asi__aviso asi__aviso--error" role="alert">No tienes permiso para consultar la gestión de asistencia.</p>
      </div>
    );
  }
  const puedeEscribir = acceso.puedeEscribir;

  return (
    <div className="asi asr">
      <h1 ref={tituloRef} tabIndex={-1}>Periodos de asistencia</h1>
      <p className="asi__sub">Quincenas calculadas por el motor. Cierra una quincena cuando la hayas validado; reábrela solo si hay que corregirla.</p>
      <p className="asi__aviso asi__aviso--info">{AVISO_CIERRE_AUTOMATICO}</p>
      {!puedeEscribir && <p className="asi__aviso asi__aviso--info">Tu rol puede consultar, pero no cerrar, reabrir ni recalcular.</p>}
      <div role="status" aria-live="polite">{aviso && <p className="asi__aviso asi__aviso--ok">{aviso}</p>}</div>

      <EstadoCarga cargando={cargando} error={error} vacio={!cargando && !error && periodos.length === 0} textoVacio="Aún no hay quincenas calculadas." onReintentar={cargarPeriodos} />
      {!cargando && !error && periodos.length > 0 && (
        <div className="asi__tabla-caja" role="region" aria-label="Quincenas" tabIndex={0}>
          <table className="asi__tabla">
            <caption className="asi__sr">Quincenas de asistencia, su estado y cierre</caption>
            <thead>
              <tr>
                <th scope="col">Quincena</th>
                <th scope="col">Estado</th>
                <th scope="col">Cierre</th>
                <th scope="col">Reapertura</th>
                <th scope="col" className="asi__num">Días pendientes</th>
                <th scope="col" className="asi__num">Ajustes pendientes</th>
                {puedeEscribir && <th scope="col">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => {
                const c = estadoCerrar(p, hoy);
                return (
                  <tr key={p.id}>
                    <th scope="row" className="asi__nowrap">{p.fecha_inicio} a {p.fecha_fin}</th>
                    <td><span className={`asi__badge ${p.estado === "cerrado" ? "asi__badge--neutro" : "asi__badge--ok"}`}>{p.estado === "cerrado" ? "Cerrada" : "Abierta"}</span></td>
                    <td>
                      {textoCierre(p, formatoLocal)}
                      {p.estado === "cerrado" && p.cerrado_por_nombre && <span className="asi__sec">por {p.cerrado_por_nombre}</span>}
                      {p.estado === "abierto" && p.no_cerrar_automatico && <span className="asi__sec">No se cerrará sola (fue reabierta)</span>}
                    </td>
                    <td>
                      {p.veces_reabierto > 0 ? (
                        <>
                          {p.veces_reabierto} {p.veces_reabierto === 1 ? "vez" : "veces"}
                          {p.reabierto_en && <span className="asi__sec">última: {formatoLocal(p.reabierto_en)}{p.reabierto_por_nombre ? ` por ${p.reabierto_por_nombre}` : ""}</span>}
                          {p.reabierto_motivo && <span className="asi__sec">Motivo: {p.reabierto_motivo}</span>}
                        </>
                      ) : "—"}
                    </td>
                    <td className="asi__num">{p.dias_pendientes}</td>
                    <td className="asi__num">{p.ajustes_pendientes}</td>
                    {puedeEscribir && (
                      <td>
                        {p.estado === "abierto" ? (
                          <>
                            <button type="button" className="asi__btn" onClick={() => { setAviso(""); setDialogo({ tipo: "cerrar", periodo: p }); }} disabled={!c.puede} aria-describedby={!c.puede ? `nocerrar-${p.id}` : undefined}>Cerrar</button>
                            {!c.puede && <span id={`nocerrar-${p.id}`} className="asi__sec">{c.motivo}</span>}
                          </>
                        ) : (
                          <button type="button" className="asi__btn" onClick={() => { setAviso(""); setDialogo({ tipo: "reabrir", periodo: p }); }}>Reabrir</button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {puedeEscribir && (
        <section aria-labelledby="per-recalc">
          <h2 id="per-recalc">Recalcular</h2>
          <p className="asi__sub">Vuelve a calificar los días de un rango (hasta {MAX_DIAS_RECALCULO} días) con las reglas, turnos, vacaciones y permisos actuales. Solo afecta a las quincenas abiertas. Úsalo después de registrar vacaciones, permisos o festivos.</p>
          <form onSubmit={recalcular} noValidate className="asi__barra" aria-label="Recalcular un rango">
            <div className="asi__campo">
              <label htmlFor="rc-desde">Desde</label>
              <input id="rc-desde" type="date" value={recalc.desde} onChange={(e) => setRecalc((r) => ({ ...r, desde: e.target.value }))} required aria-invalid={errorRecalc ? "true" : undefined} />
            </div>
            <div className="asi__campo">
              <label htmlFor="rc-hasta">Hasta</label>
              <input id="rc-hasta" type="date" value={recalc.hasta} onChange={(e) => setRecalc((r) => ({ ...r, hasta: e.target.value }))} required aria-invalid={errorRecalc ? "true" : undefined} />
            </div>
            <button type="submit" className="asi__btn asi__btn--primario" disabled={recalculando}>{recalculando ? "Recalculando…" : estadoRecalc.tipo === "ocupado" ? "Reintentar" : "Recalcular"}</button>
          </form>
          <form onSubmit={buscar} noValidate className="asi__barra" aria-label="Limitar a un empleado (opcional)">
            <div className="asi__campo">
              <label htmlFor="rc-q">Solo un empleado (opcional): nombre o nómina</label>
              <input id="rc-q" type="search" value={recalc.q} maxLength={100} onChange={(e) => setRecalc((r) => ({ ...r, q: e.target.value }))} autoComplete="off" />
            </div>
            <button type="submit" className="asi__btn">Buscar</button>
            {candidatos && (
              <div className="asi__campo">
                <label htmlFor="rc-emp">Empleado</label>
                <select id="rc-emp" value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
                  <option value="">Todos los empleados</option>
                  {candidatos.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}{c.numero_nomina ? ` (${c.numero_nomina})` : ""}</option>)}
                </select>
              </div>
            )}
          </form>
          {candidatos && candidatos.length === 0 && <p className="asi__ayuda" role="status">Ningún empleado coincide.</p>}
          {errorBusqueda && <p className="asi__aviso asi__aviso--error" role="alert">{errorBusqueda}</p>}
          {errorRecalc && <p className="asi__aviso asi__aviso--error" role="alert">{errorRecalc}</p>}
          {avisoRango && avisoRango.texto && <p className={`asi__aviso ${avisoRango.sinAbiertas ? "asi__aviso--advertencia" : "asi__aviso--info"}`}>{avisoRango.texto}</p>}
          <div role="status" aria-live="polite">
            {estadoRecalc.texto && (
              <p className={`asi__aviso ${estadoRecalc.tipo === "ok" ? "asi__aviso--ok" : estadoRecalc.tipo === "ocupado" ? "asi__aviso--info" : "asi__aviso--error"}`}>{estadoRecalc.texto}</p>
            )}
          </div>
        </section>
      )}

      <h2>Ajustes pendientes</h2>
      <p className="asi__sub">Marcas que llegaron (o se vincularon a un empleado) después de cerrar la quincena. No cambian el resultado: decide si hay que reabrirla y marca el ajuste como resuelto.</p>
      {errorAjustes && <p className="asi__aviso asi__aviso--error" role="alert">{errorAjustes} <button type="button" className="asi__btn asi__btn--chico" onClick={cargarAjustes}>Reintentar</button></p>}
      {ajustes && ajustes.filas.length === 0 && <p className="asi__estado">No hay ajustes pendientes.</p>}
      {ajustes && ajustes.filas.length > 0 && (
        <>
          <p>{ajustes.total} {ajustes.total === 1 ? "ajuste pendiente" : "ajustes pendientes"}{ajustes.total > ajustes.filas.length ? ` (se muestran ${ajustes.filas.length})` : ""}.</p>
          <div className="asi__tabla-caja" role="region" aria-label="Ajustes pendientes" tabIndex={0}>
            <table className="asi__tabla">
              <caption className="asi__sr">Marcas posteriores al cierre de una quincena</caption>
              <thead><tr><th scope="col">Empleado</th><th scope="col">Día</th><th scope="col">Motivo</th><th scope="col">Detectado</th>{puedeEscribir && <th scope="col">Acción</th>}</tr></thead>
              <tbody>
                {ajustes.filas.map((a) => (
                  <tr key={a.id}>
                    <th scope="row">{nombreAjuste(a)}<span className="asi__sec">{a.numero_nomina}</span></th>
                    <td className="asi__nowrap">{a.fecha}</td>
                    <td>{MOTIVO_AJUSTE[a.motivo] || a.motivo}</td>
                    <td className="asi__nowrap">{formatoLocal(a.detectado_en)}</td>
                    {puedeEscribir && <td><button type="button" className="asi__btn" onClick={() => { setAviso(""); setDialogo({ tipo: "ajuste", ajuste: a }); }} aria-label={`Resolver el ajuste de ${nombreAjuste(a)} del ${a.fecha}`}>Resolver</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p><Link to="/rh/asistencia/resultados">Ir a Resultados</Link></p>

      <h2>Bitácora del motor</h2>
      <p className="asi__sub">Últimas ejecuciones (cada 15 minutos corre una vuelta). Hora de México.</p>
      {errorEjecuciones && <p className="asi__aviso asi__aviso--error" role="alert">{errorEjecuciones} <button type="button" className="asi__btn asi__btn--chico" onClick={cargarEjecuciones}>Reintentar</button></p>}
      {ejecuciones && ejecuciones.length === 0 && <p className="asi__estado">Aún no hay ejecuciones registradas.</p>}
      {ejecuciones && ejecuciones.length > 0 && (
        <div className="asi__tabla-caja" role="region" aria-label="Bitácora del motor" tabIndex={0}>
          <table className="asi__tabla">
            <caption className="asi__sr">Últimas ejecuciones del motor de asistencia</caption>
            <thead>
              <tr><th scope="col">Hora</th><th scope="col">Tipo</th><th scope="col">Estado</th><th scope="col" className="asi__num">Días calculados</th><th scope="col" className="asi__num">Días modificados</th><th scope="col">Error</th></tr>
            </thead>
            <tbody>
              {ejecuciones.map((x) => {
                const est = ESTADO_EJECUCION[x.estado] || { texto: x.estado, tono: "neutro" };
                return (
                  <tr key={x.id}>
                    <td className="asi__nowrap">{formatoLocal(x.inicio)}</td>
                    <td>{TIPO_EJECUCION[x.tipo] || x.tipo}</td>
                    <td><span className={`asi__badge asi__badge--${est.tono === "info" ? "neutro" : est.tono}`}>{est.texto}</span></td>
                    <td className="asi__num">{x.dias_evaluados}</td>
                    <td className="asi__num">{x.dias_modificados}</td>
                    <td>{textoErrorEjecucion(x.error) || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialogo && dialogo.tipo === "cerrar" && (
        <CerrarPeriodoDialogo periodo={dialogo.periodo} onCancelar={() => setDialogo(null)} onCerrado={() => despuesDeAccion(`Quincena ${dialogo.periodo.fecha_inicio} a ${dialogo.periodo.fecha_fin} cerrada.`)} />
      )}
      {dialogo && dialogo.tipo === "reabrir" && (
        <ReabrirPeriodoDialogo periodo={dialogo.periodo} onCancelar={() => setDialogo(null)} onReabierto={() => despuesDeAccion(`Quincena ${dialogo.periodo.fecha_inicio} a ${dialogo.periodo.fecha_fin} reabierta y recalculada.`)} />
      )}
      {dialogo && dialogo.tipo === "ajuste" && (
        <ResolverAjusteDialogo ajuste={dialogo.ajuste} nombre={nombreAjuste(dialogo.ajuste)} onCancelar={() => setDialogo(null)} onResuelto={() => despuesDeAccion("Ajuste marcado como resuelto.")} />
      )}
    </div>
  );
}
