import { Link } from "react-router-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import DialogoAsistencia from "./DialogoAsistencia";
import EstatusInsignia from "./EstatusInsignia";
import EstadoCarga from "./EstadoCarga";
import { detalleDia, justificarDia, anularJustificacion, mensajeDeError } from "../../services/asistencia.service";
import { formatoLocal, instanteUtc } from "../../utils/asistenciaFechas";
import {
  filasDelTurno, banderasDelDia, reglaDelDia, ROLES_MARCA, accionesDelDia, validarMotivoJustificacion,
  MOTIVO_MAX, infoEstatus,
} from "../../utils/asistenciaResultados";

const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const nombreDia = (fecha) => NOMBRES_DIA[new Date(`${fecha}T12:00:00Z`).getUTCDay()];

/**
 * Detalle de un día de un empleado: turno usado (snapshot), marcas en hora de México (UTC al pasar el cursor),
 * la regla que produjo el estatus, banderas explicadas, cruces y, para RH, justificar / anular. Sin diálogos anidados:
 * el formulario y la confirmación de anulación van dentro del mismo diálogo.
 */
export default function DetalleDiaDialogo({ empleadoId, nombre, fecha, puedeEscribir, onCerrar, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");
  const [resultado, setResultado] = useState("");
  const [anulando, setAnulando] = useState(false);
  const motivoId = useId();
  const motivoRef = useRef(null);
  const solicitud = useRef(0);
  const vivoRef = useRef(null);
  // Tras justificar o anular el botón de origen desaparece: el foco pasa al aviso del resultado
  const enfocarResultado = () => setTimeout(() => vivoRef.current && vivoRef.current.focus(), 0);

  const cargar = useCallback(async () => {
    const mia = ++solicitud.current;
    setCargando(true);
    setError("");
    try {
      const r = await detalleDia(empleadoId, fecha);
      if (mia !== solicitud.current) return;
      setDatos(r.datos);
    } catch (err) {
      if (mia !== solicitud.current) return;
      setDatos(null);
      setError(mensajeDeError(err, "No se pudo cargar el detalle del día"));
    } finally {
      if (mia === solicitud.current) setCargando(false);
    }
  }, [empleadoId, fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const dia = datos && datos.dia;
  const cruces = datos && datos.cruces;
  const acciones = accionesDelDia({ dia, cruces, periodoEstado: dia && dia.periodo_estado, puedeEscribir });

  async function justificar(e) {
    e.preventDefault();
    if (trabajando) return;
    const problema = validarMotivoJustificacion(motivo);
    setErrorMotivo(problema);
    if (problema) {
      motivoRef.current && motivoRef.current.focus();
      return;
    }
    setTrabajando(true);
    setErrorAccion("");
    try {
      const r = await justificarDia({ empleado_id: empleadoId, fecha, motivo: motivo.trim() });
      setResultado(r.mensaje || "Día justificado");
      setMotivo("");
      await cargar();
      onCambio();
      enfocarResultado();
    } catch (err) {
      setErrorAccion(mensajeDeError(err, "No se pudo justificar el día"));
    } finally {
      setTrabajando(false);
    }
  }

  async function anular() {
    if (trabajando) return;
    setTrabajando(true);
    setErrorAccion("");
    try {
      const r = await anularJustificacion(cruces.justificacion.id);
      // si el motor estaba ocupado el día se recalcula en la siguiente vuelta: no se afirma lo contrario
      setResultado(r.datos && r.datos.recalculado ? "Justificación anulada: el día volvió a su resultado original." : (r.mensaje || "Justificación anulada; el día se recalculará en la siguiente vuelta del motor."));
      setAnulando(false);
      await cargar();
      onCambio();
      enfocarResultado();
    } catch (err) {
      setErrorAccion(mensajeDeError(err, "No se pudo anular la justificación"));
    } finally {
      setTrabajando(false);
    }
  }

  const regla = dia ? reglaDelDia(dia) : null;
  const detalle = (dia && dia.detalle) || {};
  const turno = filasDelTurno(dia);
  const banderas = banderasDelDia(dia);

  return (
    <DialogoAsistencia titulo={`Detalle del día · ${nombre}`} onCerrar={onCerrar} ancho="46rem" bloqueado={trabajando}>
      <p className="asi__sub">{nombreDia(fecha)} {fecha}</p>
      <EstadoCarga cargando={cargando && !datos} error={error} onReintentar={cargar} />
      <div role="status" aria-live="polite" className="asr__vivo" ref={vivoRef} tabIndex={-1}>{resultado && <p className="asi__aviso asi__aviso--ok">{resultado}</p>}</div>
      {dia && (
        <div className="asr__detalle">
          <section aria-labelledby="det-estatus">
            <h3 id="det-estatus">Resultado</h3>
            <p>
              <EstatusInsignia estatus={dia.estatus} />
              {Number(dia.minutos_retardo) > 0 && <span> · {dia.minutos_retardo} min de retardo</span>}
              {Number(dia.minutos_salida_anticipada) > 0 && <span> · {dia.minutos_salida_anticipada} min de salida anticipada</span>}
            </p>
            {detalle.calculo_original && (
              <p className="asi__ayuda">
                Cálculo original: {infoEstatus(detalle.calculo_original.estatus).texto}
                {Number(detalle.calculo_original.minutos_retardo) > 0 ? ` (${detalle.calculo_original.minutos_retardo} min de retardo)` : ""}
              </p>
            )}
            {detalle.calculo_provisional && <p className="asi__ayuda">Cálculo provisional: {infoEstatus(detalle.calculo_provisional).texto} (el día aún no termina).</p>}
            {detalle.minutos_comida !== undefined && (
              <p>
                Comida: {detalle.minutos_comida} min
                {detalle.exceso_comida_min ? ` (${detalle.exceso_comida_min} min más de lo que marca el turno; solo informativo)` : ""}
              </p>
            )}
            {dia.periodo_estado === "cerrado" && <p className="asi__aviso asi__aviso--info">Quincena {dia.periodo_inicio} a {dia.periodo_fin} cerrada: este resultado se calculó con el turno vigente en ese momento.</p>}
          </section>

          <section aria-labelledby="det-regla">
            <h3 id="det-regla">Regla que produjo el estatus</h3>
            <p className="asr__regla">{regla.titulo}</p>
            {regla.otras.length > 0 && <ul className="asi__lista">{regla.otras.map((t) => <li key={t}>{t}</li>)}</ul>}
          </section>

          <section aria-labelledby="det-marcas">
            <h3 id="det-marcas">Marcas del día (hora de México)</h3>
            {datos.marcas_truncadas && <p className="asi__aviso asi__aviso--advertencia" role="status">Se muestran solo las primeras {datos.marcas.length} marcas del día; hay más.</p>}
            {datos.marcas.length === 0 ? (
              <p className="asi__estado">No hay marcas de este empleado en el día.</p>
            ) : (
              <div className="asi__tabla-caja" role="region" aria-label="Marcas del día" tabIndex={0}>
                <table className="asi__tabla">
                  <caption className="asi__sr">Marcas del día y cuál se tomó como entrada, salida o comida</caption>
                  <thead>
                    <tr><th scope="col">Hora</th><th scope="col">Cómo se usó</th><th scope="col">Terminal</th></tr>
                  </thead>
                  <tbody>
                    {datos.marcas.map((m) => {
                      const rol = m.rol || "otra"; // lo entrega el servidor con las reglas del motor
                      return (
                        <tr key={m.id} className={rol === "entrada" || rol === "salida" ? "asr__marca-usada" : undefined}>
                          <td className="asi__nowrap">
                            <time dateTime={m.marca_ts} title={`UTC ${instanteUtc(m.marca_ts)}`} className="asi__rotulo-hora">{formatoLocal(m.marca_ts)}</time>
                            <span className="asi__sr"> (UTC {instanteUtc(m.marca_ts)})</span>
                          </td>
                          <td><span className={`asi__badge ${rol === "entrada" || rol === "salida" ? "asi__badge--ok" : rol === "comida" ? "asi__badge--aviso" : "asi__badge--neutro"}`}>{ROLES_MARCA[rol]}</span></td>
                          <td>{m.terminal_alias || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="det-turno">
            <h3 id="det-turno">Turno usado (así estaba al calcular)</h3>
            {turno.length === 0 ? (
              <p className="asi__estado">Sin turno asignado ese día.</p>
            ) : (
              <dl className="asr__dl">
                {turno.map((f) => (
                  <div key={f.etiqueta}><dt>{f.etiqueta}</dt><dd>{f.valor}</dd></div>
                ))}
              </dl>
            )}
          </section>

          {banderas.length > 0 && (
            <section aria-labelledby="det-banderas">
              <h3 id="det-banderas">Qué hay que revisar</h3>
              <ul className="asi__lista">
                {banderas.map((b) => <li key={b.clave}>{b.texto}</li>)}
              </ul>
            </section>
          )}

          <section aria-labelledby="det-cruces">
            <h3 id="det-cruces">Cruces con otros registros</h3>
            <ul className="asi__lista">
              {cruces.vacaciones && <li>Vacaciones {cruces.vacaciones.estatus}: del {cruces.vacaciones.fecha_inicial} al {cruces.vacaciones.fecha_final}.</li>}
              {cruces.permiso && <li>Permiso de ausencia ({cruces.permiso.tipo}, {cruces.permiso.estatus}): del {cruces.permiso.fecha_inicio} al {cruces.permiso.fecha_fin}.</li>}
              {cruces.festivo && <li>Festivo o descanso otorgado: {cruces.festivo.nombre} ({cruces.festivo.tipo}).</li>}
              {cruces.justificacion && (
                <li>
                  Justificación de RH{cruces.justificacion.creado_por_nombre ? ` por ${cruces.justificacion.creado_por_nombre}` : ""}
                  {cruces.justificacion.fecha_creacion ? ` el ${formatoLocal(cruces.justificacion.fecha_creacion)}` : ""}: «{cruces.justificacion.motivo}».
                </li>
              )}
              {!cruces.vacaciones && !cruces.permiso && !cruces.festivo && !cruces.justificacion && <li>Sin vacaciones, permiso, festivo ni justificación ese día.</li>}
            </ul>
          </section>

          <section aria-labelledby="det-acciones">
            <h3 id="det-acciones">Justificar o anular</h3>
            {acciones.motivoNo && !acciones.justificar && !acciones.anular && (
              <p className="asi__aviso asi__aviso--info">
                {acciones.motivoNo}
                {dia.periodo_estado === "cerrado" && <> <Link to="/rh/asistencia/periodos">Ir a Periodos</Link></>}
              </p>
            )}
            {acciones.justificar && (
              <form onSubmit={justificar} noValidate>
                <div className="asi__campo">
                  <label htmlFor={motivoId}>Motivo de la justificación (obligatorio)</label>
                  <textarea
                    id={motivoId}
                    ref={motivoRef}
                    rows={3}
                    maxLength={MOTIVO_MAX}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    aria-invalid={errorMotivo ? "true" : undefined}
                    aria-describedby={errorMotivo ? `${motivoId}-error` : undefined}
                    disabled={trabajando}
                  />
                  {errorMotivo && <p id={`${motivoId}-error`} className="asi__error-campo" role="alert">{errorMotivo}</p>}
                </div>
                <button type="submit" className="asi__btn asi__btn--primario" disabled={trabajando}>{trabajando ? "Guardando…" : "Justificar el día"}</button>
              </form>
            )}
            {acciones.anular && !anulando && (
              <button type="button" className="asi__btn" onClick={() => { setResultado(""); setAnulando(true); }} disabled={trabajando}>Anular la justificación</button>
            )}
            {acciones.anular && anulando && (
              <div className="asi__aviso asi__aviso--advertencia" role="group" aria-label="Confirmar la anulación">
                <p>El día volverá a su resultado original ({infoEstatus(detalle.calculo_original && detalle.calculo_original.estatus).texto}).</p>
                <button type="button" className="asi__btn asi__btn--peligro" onClick={anular} disabled={trabajando}>{trabajando ? "Procesando…" : "Sí, anular"}</button>
                <button type="button" className="asi__btn" onClick={() => setAnulando(false)} disabled={trabajando}>No anular</button>
              </div>
            )}
            {errorAccion && <p className="asi__aviso asi__aviso--error" role="alert">{errorAccion}</p>}
          </section>
        </div>
      )}
      <div className="asi__acciones">
        <button type="button" className="asi__btn" onClick={onCerrar} disabled={trabajando}>Cerrar</button>
      </div>
    </DialogoAsistencia>
  );
}
