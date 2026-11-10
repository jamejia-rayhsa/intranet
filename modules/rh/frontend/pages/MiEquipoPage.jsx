import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listarPeriodos, listarResultados, resumenResultados, miEquipoHoy, mensajeDeError } from "../services/asistencia.service";
import useContextoAsistencia, { invalidarContextoAsistencia } from "../hooks/useContextoAsistencia";
import useFocoTitulo from "../hooks/useFocoTitulo";
import EstadoCarga from "../components/asistencia/EstadoCarga";
import CuadriculaAsistencia from "../components/asistencia/CuadriculaAsistencia";
import DetalleDiaPersonaDialogo from "../components/asistencia/DetalleDiaPersonaDialogo";
import { ESTATUS, ORDEN_TARJETAS, FORMULA_PUNTUALIDAD, porcentajePuntualidad, textoPorcentaje, diasEvaluados, totalesDeResumen } from "../utils/asistenciaResultados";
import { horaLocal, partesLocales } from "../utils/asistenciaFechas";
import {
  quincenasVisibles, quincenaPorOmision, desdeEfectivo, claveQuincena, textoQuincena, avisoDelPeriodo, esJefe, estadoDeCuenta, combinarEquipo, filtrarEquipo,
  textoEquipoFiltrado, incidenciasDeFila, nombrePersona, resumenHoy, ATAJOS_EQUIPO, AVISO_MOTOR, MSG_NO_ES_JEFE, MSG_EQUIPO_ACOTADO,
  VISUAL_HOY,
} from "../utils/asistenciaMiAsistencia";
import "../styles/asistencia.css";
import "../styles/asistenciaResultados.css";
import "../styles/miAsistencia.css";

const REFRESCO_HOY_MS = 5 * 60 * 1000;
const COLUMNAS = ORDEN_TARJETAS.filter((e) => e !== "sin_turno");

function EstadoHoy({ estado }) {
  const v = VISUAL_HOY[estado.clave] || { tono: "neutro", icono: "·" };
  return (
    <span className={`asr__estatus asr__estatus--${v.tono}`}>
      <span aria-hidden="true" className="asr__icono">{v.icono}</span>
      <span>{estado.etiqueta}</span>
    </span>
  );
}

/** «Mi equipo»: panel de hoy y quincena de los subordinados DIRECTOS del jefe inmediato vigente. Solo lectura. */
export default function MiEquipoPage() {
  const { ref: tituloRef } = useFocoTitulo();
  const ctx = useContextoAsistencia();
  const contexto = ctx.datos;
  const jefe = esJefe(contexto);

  const [equipoHoy, setEquipoHoy] = useState(null); // respuesta de /mi-equipo/hoy
  const [errorHoy, setErrorHoy] = useState("");
  const [cargandoHoy, setCargandoHoy] = useState(false);
  const [avisoHoy, setAvisoHoy] = useState("");
  const [periodos, setPeriodos] = useState([]);
  const [errorPeriodos, setErrorPeriodos] = useState("");
  const [seleccion, setSeleccion] = useState("");
  const [resumen, setResumen] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [filtros, setFiltros] = useState({ texto: "", atajo: "" });
  const [persona, setPersona] = useState(null); // { id, nombre, sinNomina }
  const [diasPersona, setDiasPersona] = useState([]);
  const [cargandoDias, setCargandoDias] = useState(false);
  const [errorDias, setErrorDias] = useState("");
  const [diaAbierto, setDiaAbierto] = useState("");
  const solicitud = useRef(0);
  const solicitudDias = useRef(0);
  const tituloPersonaRef = useRef(null);
  const tituloQuincenaRef = useRef(null);

  const hoy = contexto ? contexto.hoy : "";
  const analisisDesde = contexto ? contexto.analisis_desde : "";
  const quincenas = useMemo(
    () => (contexto ? quincenasVisibles(periodos, analisisDesde, hoy, contexto.periodo_actual) : []),
    [contexto, periodos, analisisDesde, hoy],
  );
  const quincena = quincenas.find((q) => claveQuincena(q) === seleccion) || null;

  // --- Hoy ---
  const cargarHoy = useCallback(async (manual = false) => {
    setCargandoHoy(true);
    if (manual) setAvisoHoy("");
    try {
      const r = await miEquipoHoy();
      setEquipoHoy(r.datos);
      setErrorHoy("");
      if (manual) setAvisoHoy(`Estado de hoy actualizado a las ${horaLocal(r.datos.ahora)}.`);
    } catch (err) {
      setErrorHoy(mensajeDeError(err, "No se pudo cargar el estado de hoy de tu equipo"));
      if (err && err.status === 403) { invalidarContextoAsistencia(); ctx.reintentar(); } // ya no eres jefe: se relee tu contexto
    } finally {
      setCargandoHoy(false);
    }
  }, [ctx.reintentar]);

  useEffect(() => {
    if (!jefe) return undefined;
    cargarHoy();
    const t = setInterval(() => { if (document.visibilityState === "visible") cargarHoy(); }, REFRESCO_HOY_MS);
    return () => clearInterval(t);
  }, [jefe, cargarHoy]);

  // --- Quincenas ---
  const cargarPeriodos = useCallback(async () => {
    setErrorPeriodos("");
    try {
      const r = await listarPeriodos({ limite: 100 });
      setPeriodos(r.datos || []);
    } catch (err) {
      setErrorPeriodos(mensajeDeError(err, "No se pudieron cargar las quincenas"));
    }
  }, []);
  useEffect(() => {
    if (jefe) cargarPeriodos();
  }, [jefe, cargarPeriodos]);
  useEffect(() => {
    if (!seleccion && quincenas.length > 0) {
      const q = quincenaPorOmision(quincenas, hoy);
      if (q) setSeleccion(claveQuincena(q));
    }
  }, [seleccion, quincenas, hoy]);

  // --- Resumen del equipo en la quincena (solo directos: equipo=1) ---
  const cargarResumen = useCallback(async () => {
    if (!quincena) return;
    const mia = ++solicitud.current;
    setCargando(true);
    setError("");
    try {
      const r = await resumenResultados({ desde: desdeEfectivo(quincena, analisisDesde), hasta: quincena.fecha_fin, soloEquipo: true, limite: 500 });
      if (mia !== solicitud.current) return;
      setResumen(r.datos || []);
    } catch (err) {
      if (mia !== solicitud.current) return;
      setResumen([]);
      setError(mensajeDeError(err, "No se pudo cargar el resumen de tu equipo"));
    } finally {
      if (mia === solicitud.current) setCargando(false);
    }
  }, [quincena, analisisDesde]);
  useEffect(() => {
    if (jefe && quincena) {
      setPersona(null);
      cargarResumen();
    }
  }, [jefe, quincena, cargarResumen]);

  // --- Cuadrícula de una persona ---
  const cargarDias = useCallback(async () => {
    if (!persona || !quincena) return;
    const mia = ++solicitudDias.current;
    setCargandoDias(true);
    setErrorDias("");
    try {
      const r = await listarResultados({ desde: desdeEfectivo(quincena, analisisDesde), hasta: quincena.fecha_fin, empleadoId: persona.id, soloEquipo: true, limite: 100 });
      if (mia !== solicitudDias.current) return;
      setDiasPersona(r.datos || []);
    } catch (err) {
      if (mia !== solicitudDias.current) return;
      setDiasPersona([]);
      setErrorDias(mensajeDeError(err, "No se pudo cargar la quincena de esta persona"));
    } finally {
      if (mia === solicitudDias.current) setCargandoDias(false);
    }
  }, [persona, quincena, analisisDesde]);
  useEffect(() => {
    if (persona) cargarDias();
  }, [persona, cargarDias]);

  const ahoraMin = equipoHoy && equipoHoy.ahora ? (partesLocales(equipoHoy.ahora) || {}).minutos ?? null : null;
  const filas = useMemo(
    () => combinarEquipo(equipoHoy ? equipoHoy.equipo : [], resumen, { hora: horaLocal, ahoraMin }),
    [equipoHoy, resumen, ahoraMin],
  );
  const visibles = useMemo(() => filtrarEquipo(filas, filtros), [filas, filtros]);
  const estadosHoy = useMemo(() => filas.filter((f) => f.hoy && !f.de_baja).map((f) => f.hoy), [filas]);
  const aviso = quincena ? avisoDelPeriodo(quincena.estado, { equipo: true }) : null;
  const sinNomina = filas.filter((f) => f.sin_nomina);
  const nominaRepetida = filas.filter((f) => f.nomina_repetida);

  function abrirPersona(f) {
    setPersona({ id: f.empleado_id, nombre: nombrePersona(f), sinNomina: f.sin_nomina || f.nomina_repetida });
    setTimeout(() => tituloPersonaRef.current && tituloPersonaRef.current.focus(), 0);
  }
  // Al cerrar la cuadrícula el foco vuelve al nombre de esa persona (el botón que la cerró desaparece del DOM)
  function cerrarCuadricula() {
    const id = persona && persona.id;
    setPersona(null);
    setTimeout(() => {
      const visible = [...document.querySelectorAll(`[data-persona="${id}"]`)].find((el) => el.offsetParent !== null);
      if (visible) visible.focus();
      else if (tituloQuincenaRef.current) tituloQuincenaRef.current.focus();
    }, 0);
  }

  const totales = useMemo(() => totalesDeResumen(resumen), [resumen]);

  return (
    <div className="asi asr asm">
      <h1 ref={tituloRef} tabIndex={-1}>Mi equipo</h1>
      <p className="asi__sub">
        La asistencia de las personas que te reportan directamente, en lenguaje claro y solo para consultar. Si algo no cuadra,
        avisa a RH: justificar y cerrar quincenas son tareas de RH. {MSG_EQUIPO_ACOTADO}
      </p>

      <EstadoCarga cargando={ctx.cargando} error={ctx.error} onReintentar={ctx.reintentar} />

      {contexto && !jefe && (
        <p className="asi__aviso asi__aviso--info" role="status">
          {(estadoDeCuenta(contexto) || {}).tipo === "inactivo" ? estadoDeCuenta(contexto).mensaje : MSG_NO_ES_JEFE}
        </p>
      )}

      {jefe && (
        <>
          <section aria-labelledby="eq-hoy">
            <h2 id="eq-hoy">Hoy</h2>
            <p className="asi__ayuda">{AVISO_MOTOR}</p>
            <div className="asi__barra">
              <button type="button" className="asi__btn" onClick={() => cargarHoy(true)} disabled={cargandoHoy}>{cargandoHoy ? "Actualizando…" : "Actualizar ahora"}</button>
              {equipoHoy && <span className="asi__ayuda asm__actualizado">Consultado a las {horaLocal(equipoHoy.ahora)}</span>}
            </div>
            <div role="status" aria-live="polite" className="asi__sr">{avisoHoy}</div>
            {errorHoy && (
              <div className="asi__aviso asi__aviso--error" role="alert">
                <span>{errorHoy}</span>
                <button type="button" className="asi__btn asi__btn--chico" onClick={() => cargarHoy(true)}>Reintentar</button>
              </div>
            )}
            {!equipoHoy && !errorHoy && <p className="asi__estado" role="status">Cargando…</p>}
            {equipoHoy && (
              <>
                <p className="asm__resumen-hoy">{resumenHoy(estadosHoy)}</p>
                <ul className="asm__hoy" aria-label="Estado de hoy de tu equipo">
                  {filas.filter((f) => f.hoy && !f.de_baja).map((f) => (
                    <li key={f.empleado_id} className="asm__hoy-item">
                      <span className="asm__nombre">{nombrePersona(f)}</span>
                      <EstadoHoy estado={f.hoy} />
                      <span className="asm__hoy-texto">{f.hoy.texto}</span>
                    </li>
                  ))}
                </ul>
                {equipoHoy.truncado && <p className="asi__aviso asi__aviso--advertencia" role="status">Se muestran las primeras personas de tu equipo (tope de la consulta).</p>}
              </>
            )}
          </section>

          <section aria-labelledby="eq-quincena">
            <h2 id="eq-quincena" ref={tituloQuincenaRef} tabIndex={-1}>Quincena</h2>
            {errorPeriodos && (
              <div className="asi__aviso asi__aviso--error" role="alert">
                <span>{errorPeriodos}</span>
                <button type="button" className="asi__btn asi__btn--chico" onClick={cargarPeriodos}>Reintentar</button>
              </div>
            )}
            <div className="asi__barra">
              <div className="asi__campo asm__selector">
                <label htmlFor="eq-sel">Quincena</label>
                <select id="eq-sel" value={seleccion} onChange={(e) => setSeleccion(e.target.value)} disabled={quincenas.length === 0}>
                  {quincenas.map((q) => <option key={claveQuincena(q)} value={claveQuincena(q)}>{textoQuincena(q, hoy)}</option>)}
                </select>
              </div>
            </div>
            {aviso && <p className={`asi__aviso asi__aviso--${aviso.tono}`}>{aviso.texto}</p>}
            <EstadoCarga cargando={cargando} error={error} onReintentar={cargarResumen} />

            {quincena && !cargando && !error && (
              <>
                <p className="asi__ayuda">
                  Puntualidad del equipo en la quincena: <strong>{textoPorcentaje(porcentajePuntualidad(totales))}</strong>
                  {" "}({diasEvaluados(totales)} días evaluados). {FORMULA_PUNTUALIDAD}
                </p>
                {sinNomina.length > 0 && (
                  <p className="asi__aviso asi__aviso--advertencia" role="status">
                    {sinNomina.length === 1 ? "1 persona de tu equipo no tiene" : `${sinNomina.length} personas de tu equipo no tienen`} número de nómina y no se analiza(n): {sinNomina.map(nombrePersona).join(", ")}. Avisa a RH.
                  </p>
                )}
                {nominaRepetida.length > 0 && (
                  <p className="asi__aviso asi__aviso--advertencia" role="status">
                    Nómina repetida (RH debe corregirla; mientras tanto no se analiza): {nominaRepetida.map(nombrePersona).join(", ")}.
                  </p>
                )}

                <div className="asi__barra" role="group" aria-label="Filtros del equipo">
                  <div className="asi__campo">
                    <label htmlFor="eq-buscar">Buscar por nombre o nómina</label>
                    <input id="eq-buscar" type="search" maxLength={100} autoComplete="off" value={filtros.texto} onChange={(e) => setFiltros((f) => ({ ...f, texto: e.target.value }))} />
                  </div>
                </div>
                <div className="asi__barra" role="group" aria-label="Atajos para revisar">
                  <span className="asi__ayuda asr__etiqueta">Para revisar:</span>
                  {ATAJOS_EQUIPO.map((a) => (
                    <button key={a.id} type="button" className={`asi__btn asr__atajo${filtros.atajo === a.id ? " asr__atajo--activo" : ""}`} aria-pressed={filtros.atajo === a.id} title={a.ayuda}
                      onClick={() => setFiltros((f) => ({ ...f, atajo: f.atajo === a.id ? "" : a.id }))}>
                      {a.texto}
                    </button>
                  ))}
                </div>
                {filtros.atajo && <p className="asi__ayuda">{ATAJOS_EQUIPO.find((a) => a.id === filtros.atajo).ayuda}.</p>}
                <p className="asr__conteo" role="status" aria-live="polite">{textoEquipoFiltrado(visibles.length, filas.length)}</p>

                {visibles.length === 0 ? (
                  <p className="asi__estado">{filas.length === 0 ? "No hay personas ni días calculados en esta quincena." : "Nadie cumple el filtro."}</p>
                ) : (
                  <>
                    <div className="asi__tabla-caja asm__tabla-ancha" role="region" aria-label="Resumen de tu equipo" tabIndex={0}>
                      <table className="asi__tabla asr__tabla">
                        <caption className="asi__sr">Conteo de días por resultado de cada persona de tu equipo</caption>
                        <thead>
                          <tr>
                            <th scope="col">Persona</th>
                            {COLUMNAS.map((e) => <th key={e} scope="col" className="asi__num">{ESTATUS[e].plural}</th>)}
                            <th scope="col" className="asi__num">Puntualidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibles.map((f) => (
                            <tr key={f.empleado_id} className={persona && persona.id === f.empleado_id ? "asr__fila-activa" : undefined}>
                              <th scope="row">
                                <button type="button" className="asr__enlace" data-persona={f.empleado_id} onClick={() => abrirPersona(f)}>{nombrePersona(f)}</button>
                                <span className="asi__sec">{f.numero_nomina || "Sin nómina"}{f.de_baja ? " · baja" : ""}</span>
                              </th>
                              {f.sin_nomina || f.nomina_repetida ? (
                                <td colSpan={COLUMNAS.length + 1}>{f.sin_nomina ? "Sin nómina: no se analiza" : "Su nómina está repetida: RH debe corregirla"}</td>
                              ) : (
                                <>
                                  {COLUMNAS.map((e) => <td key={e} className={`asi__num${e === "falta" && f.falta > 0 ? " asr__num-falta" : ""}`}>{f[e]}</td>)}
                                  <td className="asi__num">{textoPorcentaje(porcentajePuntualidad(f))}</td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <ul className="asm__equipo" aria-label="Tu equipo en la quincena">
                      {visibles.map((f) => (
                        <li key={f.empleado_id} className="asm__persona">
                          <button type="button" className="asr__enlace" data-persona={f.empleado_id} onClick={() => abrirPersona(f)}>{nombrePersona(f)}</button>
                          <span className="asi__sec">{f.numero_nomina || "Sin nómina"}{f.de_baja ? " · baja" : ""}</span>
                          {f.sin_nomina || f.nomina_repetida ? (
                            <p className="asm__persona-aviso">{f.sin_nomina ? "Sin nómina: no se analiza" : "Su nómina está repetida: RH debe corregirla"}</p>
                          ) : (
                            <>
                              <p className="asm__persona-resumen">{incidenciasDeFila(f)}</p>
                              <p className="asi__ayuda">Puntualidad {textoPorcentaje(porcentajePuntualidad(f))}</p>
                              <ul className="asm__chips">
                                {COLUMNAS.filter((e) => f[e] > 0).map((e) => (
                                  <li key={e} className={`asr__estatus asr__estatus--${ESTATUS[e].tono}`}>
                                    <span aria-hidden="true" className="asr__icono">{ESTATUS[e].icono}</span> {f[e]} {f[e] === 1 ? ESTATUS[e].texto.toLowerCase() : ESTATUS[e].plural.toLowerCase()}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>

          {persona && quincena && (
            <section aria-labelledby="eq-persona" className="asi__bloque">
              <h2 id="eq-persona" ref={tituloPersonaRef} tabIndex={-1}>Quincena de {persona.nombre}</h2>
              <p className="asi__ayuda">Cada cuadro es un día. Toca uno (o muévete con las flechas e Intro) para ver su detalle.</p>
              <button type="button" className="asi__btn asi__btn--chico" onClick={cerrarCuadricula}>Cerrar cuadrícula</button>
              <EstadoCarga cargando={cargandoDias} error={errorDias} onReintentar={cargarDias} />
              {!cargandoDias && !errorDias && (
                <CuadriculaAsistencia
                  desde={quincena.fecha_inicio}
                  hasta={quincena.fecha_fin}
                  dias={diasPersona}
                  hoy={hoy}
                  analisisDesde={analisisDesde}
                  abrirSinCalculo
                  onAbrirDia={setDiaAbierto}
                  etiqueta={`Días de ${persona.nombre}, ${quincena.fecha_inicio} a ${quincena.fecha_fin}`}
                />
              )}
            </section>
          )}
        </>
      )}

      {diaAbierto && persona && contexto && (
        <DetalleDiaPersonaDialogo
          empleadoId={persona.id}
          nombre={persona.nombre}
          fecha={diaAbierto}
          persona="equipo"
          contexto={contexto}
          analisisDesde={analisisDesde}
          hoy={hoy}
          tieneNomina={!persona.sinNomina}
          sinResultado={!diasPersona.some((d) => d.fecha === diaAbierto)}
          onCerrar={() => setDiaAbierto("")}
        />
      )}
    </div>
  );
}
