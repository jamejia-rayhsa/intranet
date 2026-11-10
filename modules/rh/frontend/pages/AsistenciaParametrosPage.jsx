import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { obtenerParametros, guardarParametros, listarPeriodos, mensajeDeError } from "../services/asistencia.service";
import {
  PARAMETROS, FRASE_REFORZADA, valoresIniciales, validarTodo, cambiosDe, textosDeImpacto, requiereConfirmacionReforzada,
} from "../utils/asistenciaParametros";
import { formatoLocal, fechaMexicoHoy } from "../utils/asistenciaFechas";
import useAccesoGestion from "../hooks/useAccesoGestion";
import SinAccesoGestion from "../components/asistencia/SinAccesoGestion";
import useFocoTitulo from "../hooks/useFocoTitulo";
import EstadoCarga from "../components/asistencia/EstadoCarga";
import ConfirmarDialogo from "../components/asistencia/ConfirmarDialogo";
import "../styles/asistencia.css";
import "../styles/asistenciaResultados.css";

const GRUPOS = ["Comida", "Cierre", "Cálculo", "Planificador"];

export default function AsistenciaParametrosPage() {
  const acceso = useAccesoGestion();
  const { ref: tituloRef, enfocarSiPerdido } = useFocoTitulo();

  const [servidor, setServidor] = useState(null); // [{clave, valor, descripcion, fecha_actualizacion}]
  const [originales, setOriginales] = useState({});
  const [valores, setValores] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errores, setErrores] = useState({});
  const [confirmando, setConfirmando] = useState(null); // cambios
  const [aviso, setAviso] = useState("");
  const refs = useRef({});
  const [periodos, setPeriodos] = useState([]);
  const hoy = useMemo(() => fechaMexicoHoy(), []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await obtenerParametros();
      const v = valoresIniciales(r.datos);
      setServidor(r.datos);
      setOriginales(v);
      setValores(v);
    } catch (err) {
      setServidor(null);
      setError(mensajeDeError(err, "No se pudieron cargar los parámetros"));
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    if (!acceso.puedeLeer) return;
    cargar();
    // las quincenas sirven para nombrar cuáles se cerrarían solas con los nuevos valores de cierre
    listarPeriodos({ limite: 100 }).then((r) => setPeriodos(r.datos || [])).catch(() => setPeriodos([]));
  }, [acceso.puedeLeer, cargar]);

  const cambios = useMemo(() => cambiosDe(originales, valores), [originales, valores]);
  const hayCambios = Object.keys(cambios).length > 0;
  const puedeEscribir = acceso.puedeEscribir;
  const info = (clave) => (servidor || []).find((p) => p.clave === clave) || {};

  function revisar(e) {
    e.preventDefault();
    setAviso("");
    const errs = validarTodo(valores);
    setErrores(errs);
    const primera = PARAMETROS.find((p) => errs[p.clave]);
    if (primera) {
      refs.current[primera.clave] && refs.current[primera.clave].focus();
      return;
    }
    if (hayCambios) setConfirmando(cambios);
  }

  async function guardar() {
    await guardarParametros(confirmando, requiereConfirmacionReforzada(confirmando) ? FRASE_REFORZADA : undefined);
    setConfirmando(null);
    setAviso("Parámetros guardados.");
    await cargar();
    enfocarSiPerdido();
  }

  if (acceso.cargando || acceso.error || !acceso.puedeLeer) return <SinAccesoGestion acceso={acceso} tituloRef={tituloRef} titulo="Parámetros de asistencia" />;

  return (
    <div className="asi asr">
      <h1 ref={tituloRef} tabIndex={-1}>Parámetros de asistencia</h1>
      <p className="asi__sub">Ajustes del motor que calcula la asistencia. Las tolerancias, ventanas de entrada y salida y el descanso son de cada turno (pantalla Turnos), no de aquí.</p>
      {!puedeEscribir && <p className="asi__aviso asi__aviso--info">Tu rol puede consultar los parámetros, pero no modificarlos.</p>}
      <div role="status" aria-live="polite">{aviso && <p className="asi__aviso asi__aviso--ok">{aviso}</p>}</div>
      <EstadoCarga cargando={cargando} error={error} onReintentar={cargar} />
      {servidor && !cargando && (
        <form onSubmit={revisar} noValidate>
          {GRUPOS.map((g) => (
            <fieldset key={g} className="asi__grupo">
              <legend>{g}</legend>
              {PARAMETROS.filter((p) => p.grupo === g).map((p) => {
                const id = `par-${p.clave}`;
                const e = errores[p.clave];
                const fecha = info(p.clave).fecha_actualizacion;
                return (
                  <div key={p.clave} className="asi__campo asr__param">
                    <label htmlFor={id}>{p.etiqueta}</label>
                    <input
                      id={id}
                      ref={(el) => { refs.current[p.clave] = el; }}
                      type={p.tipo === "fecha" ? "date" : p.tipo === "hora" ? "time" : "number"}
                      inputMode={p.tipo === "entero" ? "numeric" : undefined}
                      min={p.tipo === "entero" ? p.minimo : undefined}
                      max={p.tipo === "entero" ? p.maximo : undefined}
                      step={p.tipo === "hora" ? 60 : undefined}
                      value={valores[p.clave] ?? ""}
                      onChange={(ev) => setValores((v) => ({ ...v, [p.clave]: ev.target.value }))}
                      disabled={!puedeEscribir}
                      aria-invalid={e ? "true" : undefined}
                      aria-describedby={`${id}-ayuda${e ? ` ${id}-error` : ""}`}
                    />
                    <p id={`${id}-ayuda`} className="asi__ayuda">
                      {p.ayuda}
                      {info(p.clave).descripcion ? ` (${info(p.clave).descripcion})` : ""}
                      {fecha ? ` Última edición: ${formatoLocal(fecha)}.` : ""}
                    </p>
                    {e && <p id={`${id}-error`} className="asi__error-campo" role="alert">{e}</p>}
                  </div>
                );
              })}
            </fieldset>
          ))}
          {puedeEscribir && (
            <div className="asi__barra">
              <button type="submit" className="asi__btn asi__btn--primario" disabled={!hayCambios}>Revisar y guardar</button>
              <button type="button" className="asi__btn" onClick={() => { setValores(originales); setErrores({}); }} disabled={!hayCambios}>Descartar cambios</button>
              <span className="asi__ayuda" role="status">{hayCambios ? `${Object.keys(cambios).length} ${Object.keys(cambios).length === 1 ? "cambio sin guardar" : "cambios sin guardar"}` : "Sin cambios"}</span>
            </div>
          )}
        </form>
      )}

      {confirmando && (
        <ConfirmarDialogo
          titulo="Guardar parámetros"
          textoConfirmar="Guardar"
          peligro={requiereConfirmacionReforzada(confirmando)}
          frase={requiereConfirmacionReforzada(confirmando) ? FRASE_REFORZADA : ""}
          onConfirmar={guardar}
          onCancelar={() => setConfirmando(null)}
        >
          <p>Se cambiará:</p>
          <ul className="asi__lista">
            {Object.entries(confirmando).map(([clave, nuevo]) => {
              const def = PARAMETROS.find((p) => p.clave === clave);
              return <li key={clave}><strong>{def.etiqueta}</strong>: {originales[clave]} → {String(nuevo)}</li>;
            })}
          </ul>
          {textosDeImpacto(confirmando, { periodos, hoy, originales }).map((t) => <p key={t} className="asi__aviso asi__aviso--advertencia">{t}</p>)}
        </ConfirmarDialogo>
      )}
    </div>
  );
}
