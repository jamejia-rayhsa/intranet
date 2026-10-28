import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listarPeriodos, listarResultados, mensajeDeError } from "../services/asistencia.service";
import useContextoAsistencia from "../hooks/useContextoAsistencia";
import useFocoTitulo from "../hooks/useFocoTitulo";
import EstadoCarga from "../components/asistencia/EstadoCarga";
import CuadriculaAsistencia from "../components/asistencia/CuadriculaAsistencia";
import DetalleDiaPersonaDialogo from "../components/asistencia/DetalleDiaPersonaDialogo";
import { ESTATUS, ORDEN_TARJETAS, FORMULA_PUNTUALIDAD, porcentajePuntualidad, textoPorcentaje, diasEvaluados } from "../utils/asistenciaResultados";
import {
  quincenasVisibles, quincenaPorOmision, claveQuincena, textoQuincena, avisoDelPeriodo, estadoDeCuenta, contarDias, AYUDA_CONTACTAR_RH,
} from "../utils/asistenciaMiAsistencia";
import "../styles/asistencia.css";
import "../styles/asistenciaResultados.css";
import "../styles/miAsistencia.css";

/** «Mi asistencia»: la quincena del propio empleado, en lenguaje claro y solo lectura. */
export default function MiAsistenciaPage() {
  const { ref: tituloRef } = useFocoTitulo();
  const ctx = useContextoAsistencia();
  const contexto = ctx.datos;
  const cuenta = contexto ? estadoDeCuenta(contexto) : null;
  const listo = Boolean(contexto) && !(cuenta && cuenta.bloquea);

  const [periodos, setPeriodos] = useState([]);
  const [errorPeriodos, setErrorPeriodos] = useState("");
  const [cargandoPeriodos, setCargandoPeriodos] = useState(false);
  const [seleccion, setSeleccion] = useState("");
  const [dias, setDias] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [cargadoDe, setCargadoDe] = useState("");
  const [diaAbierto, setDiaAbierto] = useState("");
  const solicitud = useRef(0);

  const hoy = contexto ? contexto.hoy : "";
  const analisisDesde = contexto ? contexto.analisis_desde : "";
  const quincenas = useMemo(
    () => (contexto ? quincenasVisibles(periodos, analisisDesde, hoy, contexto.periodo_actual) : []),
    [contexto, periodos, analisisDesde, hoy],
  );
  const quincena = quincenas.find((q) => claveQuincena(q) === seleccion) || null;

  const cargarPeriodos = useCallback(async () => {
    setCargandoPeriodos(true);
    setErrorPeriodos("");
    try {
      const r = await listarPeriodos({ limite: 100 });
      setPeriodos(r.datos || []);
    } catch (err) {
      setErrorPeriodos(mensajeDeError(err, "No se pudieron cargar las quincenas"));
    } finally {
      setCargandoPeriodos(false);
    }
  }, []);

  useEffect(() => {
    if (listo) cargarPeriodos();
  }, [listo, cargarPeriodos]);

  // La quincena actual por omisión, una vez que hay lista
  useEffect(() => {
    if (!seleccion && quincenas.length > 0) {
      const q = quincenaPorOmision(quincenas, hoy);
      if (q) setSeleccion(claveQuincena(q));
    }
  }, [seleccion, quincenas, hoy]);

  const cargarDias = useCallback(async () => {
    if (!contexto || !quincena) return;
    const mia = ++solicitud.current;
    setCargando(true);
    setError("");
    try {
      const r = await listarResultados({ desde: quincena.fecha_inicio, hasta: quincena.fecha_fin, empleadoId: contexto.empleado.id, limite: 100 });
      if (mia !== solicitud.current) return;
      setDias(r.datos || []);
      setCargadoDe(claveQuincena(quincena));
    } catch (err) {
      if (mia !== solicitud.current) return;
      setDias([]);
      setError(mensajeDeError(err, "No se pudo cargar tu quincena"));
    } finally {
      if (mia === solicitud.current) setCargando(false);
    }
  }, [contexto, quincena]);

  useEffect(() => {
    if (listo && quincena) cargarDias();
  }, [listo, quincena, cargarDias]);

  const conteo = useMemo(() => contarDias(dias), [dias]);
  const aviso = quincena ? avisoDelPeriodo(quincena.estado) : null;
  const pct = porcentajePuntualidad(conteo);
  const tarjetas = ORDEN_TARJETAS.filter((e) => e !== "sin_turno" || conteo.sin_turno > 0);
  // Región viva estable: solo cambia cuando termina de cargar otra quincena (no al recargar lo mismo)
  const anuncio = quincena && cargadoDe === claveQuincena(quincena) && !cargando && !error ? `Quincena ${quincena.fecha_inicio} a ${quincena.fecha_fin}: ${dias.length} ${dias.length === 1 ? "día" : "días"} con resultado.` : "";

  return (
    <div className="asi asr asm">
      <h1 ref={tituloRef} tabIndex={-1}>Mi asistencia</h1>
      <p className="asi__sub">
        Tus entradas, salidas y resultados de cada quincena, explicados en palabras sencillas. Aquí solo puedes consultar: si algo
        no cuadra, avisa a RH. Las horas están en hora de México.
      </p>

      <EstadoCarga cargando={ctx.cargando} error={ctx.error} onReintentar={ctx.reintentar} />

      {contexto && cuenta && (
        <p className={`asi__aviso ${cuenta.bloquea ? "asi__aviso--advertencia" : "asi__aviso--info"}`} role="status">{cuenta.mensaje}</p>
      )}

      {listo && (
        <>
          <p className="asm__enlace-vacaciones">
            ¿Necesitas días libres? <Link to="/rh/vacaciones">Solicita tus vacaciones</Link>
          </p>
          {errorPeriodos && (
            <div className="asi__aviso asi__aviso--error" role="alert">
              <span>{errorPeriodos}</span>
              <button type="button" className="asi__btn asi__btn--chico" onClick={cargarPeriodos}>Reintentar</button>
            </div>
          )}
          <div className="asi__barra">
            <div className="asi__campo asm__selector">
              <label htmlFor="mi-quincena">Quincena</label>
              <select id="mi-quincena" value={seleccion} onChange={(e) => setSeleccion(e.target.value)} disabled={quincenas.length === 0}>
                {quincenas.map((q) => <option key={claveQuincena(q)} value={claveQuincena(q)}>{textoQuincena(q, hoy)}</option>)}
              </select>
            </div>
          </div>
          {cargandoPeriodos && <p className="asi__estado" role="status">Cargando quincenas…</p>}
          {!cargandoPeriodos && quincenas.length === 0 && !errorPeriodos && (
            <p className="asi__estado">Todavía no hay quincenas para mostrar. Aparecen cuando el sistema empieza a calcular tu asistencia.</p>
          )}
          <div className="asi__sr" role="status" aria-live="polite">{anuncio}</div>

          {aviso && <p className={`asi__aviso asi__aviso--${aviso.tono}`}>{aviso.texto}</p>}

          <EstadoCarga cargando={cargando} error={error} onReintentar={cargarDias} />

          {quincena && !cargando && !error && (
            <>
              {dias.length === 0 && (
                <p className="asi__aviso asi__aviso--info">
                  Todavía no hay días calculados en esta quincena. Se calculan cada 15 minutos aproximadamente; si ya pasó tiempo, avisa a RH.
                </p>
              )}
              <h2>Resumen de la quincena</h2>
              <dl className="asi__tarjetas asr__tarjetas asm__tarjetas" aria-label="Resumen de tu quincena">
                {tarjetas.map((e) => (
                  <div key={e} className={`asi__tarjeta asr__tarjeta asr__tarjeta--${ESTATUS[e].tono}`}>
                    <dt><span aria-hidden="true" className="asr__icono">{ESTATUS[e].icono}</span> {ESTATUS[e].plural}</dt>
                    <dd>{conteo[e]}</dd>
                  </div>
                ))}
                <div className="asi__tarjeta asr__tarjeta asr__tarjeta--ok">
                  <dt>% de puntualidad</dt>
                  <dd>{textoPorcentaje(pct)}<small>{diasEvaluados(conteo)} {diasEvaluados(conteo) === 1 ? "día evaluado" : "días evaluados"}</small></dd>
                </div>
              </dl>
              <p className="asi__ayuda">{FORMULA_PUNTUALIDAD}</p>

              <h2 id="mi-cuadricula">Tus días</h2>
              <p className="asi__ayuda">Cada cuadro es un día. Toca uno (o muévete con las flechas e Intro) para ver su detalle.</p>
              <CuadriculaAsistencia
                desde={quincena.fecha_inicio}
                hasta={quincena.fecha_fin}
                dias={dias}
                hoy={hoy}
                abrirSinCalculo
                onAbrirDia={setDiaAbierto}
                etiqueta={`Tus días, ${quincena.fecha_inicio} a ${quincena.fecha_fin}`}
              />
            </>
          )}
          <p className="asi__ayuda asm__pie">{AYUDA_CONTACTAR_RH}</p>
        </>
      )}

      {diaAbierto && contexto && (
        <DetalleDiaPersonaDialogo
          empleadoId={contexto.empleado.id}
          fecha={diaAbierto}
          persona="yo"
          contexto={contexto}
          analisisDesde={analisisDesde}
          hoy={hoy}
          sinResultado={!dias.some((d) => d.fecha === diaAbierto)}
          onCerrar={() => setDiaAbierto("")}
        />
      )}
    </div>
  );
}
