import { useState, useId } from "react";
import DialogoAsistencia from "./DialogoAsistencia";
import { crearTurno, actualizarTurno } from "../../services/asistencia.service";
import {
  DIAS_SEMANA,
  CAMPOS_MINUTOS,
  MAX_NOMBRE,
  MAX_DESCRIPCION,
  AYUDA_TOLERANCIAS,
  AYUDA_VENTANAS,
  AYUDA_DESCANSO,
  formularioVacio,
  formularioDesdeTurno,
  validarFormularioTurno,
  construirCuerpoTurno,
} from "../../utils/asistenciaTurnos";

const CAMPOS_TOLERANCIA = ["tolerancia_retardo_min", "umbral_falta_min", "tolerancia_salida_min"];
const CAMPOS_VENTANA = ["ventana_entrada_antes_min", "ventana_entrada_despues_min", "ventana_salida_antes_min", "ventana_salida_despues_min"];
const etiquetaDe = (campo) => CAMPOS_MINUTOS.find((c) => c.campo === campo).etiqueta;

/**
 * Alta o edición de un turno. `turno` = detalle del servidor (con dias) o null para uno nuevo.
 * Valida con las mismas reglas del backend antes de enviar y muestra el mensaje del servidor si aún así falla.
 */
export default function TurnoFormulario({ turno, onCerrar, onGuardado }) {
  const editando = Boolean(turno);
  const prefijo = useId();
  const [f, setF] = useState(() => (turno ? formularioDesdeTurno(turno) : formularioVacio()));
  const [errores, setErrores] = useState({});
  const [resumen, setResumen] = useState([]);
  const [errorServidor, setErrorServidor] = useState("");
  const [guardando, setGuardando] = useState(false);

  const id = (campo) => `${prefijo}-${campo}`;
  const cambiar = (campo, valor) => setF((previo) => ({ ...previo, [campo]: valor }));
  const cambiarDia = (numero, cambios) =>
    setF((previo) => ({ ...previo, dias: previo.dias.map((d) => (d.dia_semana === numero ? { ...d, ...cambios } : d)) }));

  function campoMinutos(campo) {
    return (
      <div className="asi__campo" key={campo}>
        <label htmlFor={id(campo)}>{etiquetaDe(campo)}</label>
        <input
          id={id(campo)}
          type="number"
          inputMode="numeric"
          min="0"
          max="720"
          step="1"
          value={f[campo]}
          onChange={(e) => cambiar(campo, e.target.value)}
          aria-invalid={errores[campo] ? "true" : undefined}
          aria-describedby={errores[campo] ? `${id(campo)}-error` : undefined}
        />
        {errores[campo] && <p id={`${id(campo)}-error`} className="asi__error-campo">{errores[campo]}</p>}
      </div>
    );
  }

  async function guardar(e) {
    e.preventDefault();
    if (guardando) return;
    setErrorServidor("");
    const { errores: nuevos, lista } = validarFormularioTurno(f);
    setErrores(nuevos);
    setResumen(lista);
    if (lista.length) return;
    setGuardando(true);
    try {
      const cuerpo = construirCuerpoTurno(f);
      if (editando) await actualizarTurno(turno.id, cuerpo);
      else await crearTurno(cuerpo);
      onGuardado(editando ? `Turno "${cuerpo.nombre}" actualizado` : `Turno "${cuerpo.nombre}" creado`);
    } catch (err) {
      setErrorServidor((err && err.message) || "No se pudo guardar el turno");
      setGuardando(false);
    }
  }

  return (
    <DialogoAsistencia titulo={editando ? "Editar turno" : "Nuevo turno"} onCerrar={onCerrar} bloqueado={guardando} ancho="46rem">
      <form onSubmit={guardar} noValidate>
        {(resumen.length > 0 || errorServidor) && (
          <div role="alert" className="asi__aviso asi__aviso--error">
            {errorServidor ? (
              <p>{errorServidor}</p>
            ) : (
              <div>
                <p>Corrige lo siguiente para guardar:</p>
                <ul className="asi__lista">
                  {resumen.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
        {editando && (
          <p className="asi__aviso asi__aviso--info">
            Los cambios se aplican a todos los días que usen este turno; los periodos de asistencia ya cerrados no se recalculan.
          </p>
        )}

        <div className="asi__campo">
          <label htmlFor={id("nombre")}>Nombre</label>
          <input
            id={id("nombre")}
            type="text"
            value={f.nombre}
            maxLength={MAX_NOMBRE}
            onChange={(e) => cambiar("nombre", e.target.value)}
            required
            aria-required="true"
            aria-invalid={errores.nombre ? "true" : undefined}
            aria-describedby={errores.nombre ? `${id("nombre")}-error` : undefined}
          />
          {errores.nombre && <p id={`${id("nombre")}-error`} className="asi__error-campo">{errores.nombre}</p>}
        </div>
        <div className="asi__campo">
          <label htmlFor={id("descripcion")}>Descripción (opcional)</label>
          <textarea
            id={id("descripcion")}
            rows={2}
            value={f.descripcion}
            maxLength={MAX_DESCRIPCION}
            onChange={(e) => cambiar("descripcion", e.target.value)}
            aria-invalid={errores.descripcion ? "true" : undefined}
          />
          {errores.descripcion && <p className="asi__error-campo">{errores.descripcion}</p>}
        </div>
        <div className="asi__campo asi__campo--casilla">
          <input id={id("activo")} type="checkbox" checked={f.activo} onChange={(e) => cambiar("activo", e.target.checked)} />
          <label htmlFor={id("activo")}>Turno activo (solo los turnos activos se pueden asignar)</label>
        </div>

        <fieldset className="asi__grupo">
          <legend>Tolerancias</legend>
          <p className="asi__ayuda" id={id("ayuda-tol")}>{AYUDA_TOLERANCIAS}</p>
          <div className="asi__rejilla">{CAMPOS_TOLERANCIA.map(campoMinutos)}</div>
        </fieldset>

        <fieldset className="asi__grupo">
          <legend>Ventanas de marcaje</legend>
          <p className="asi__ayuda">{AYUDA_VENTANAS}</p>
          <div className="asi__rejilla">{CAMPOS_VENTANA.map(campoMinutos)}</div>
        </fieldset>

        <fieldset className="asi__grupo">
          <legend>Descanso</legend>
          <p className="asi__ayuda">{AYUDA_DESCANSO}</p>
          <div className="asi__rejilla">
            <div className="asi__campo">
              <label htmlFor={id("descanso_inicio")}>Inicio del descanso</label>
              <input
                id={id("descanso_inicio")}
                type="time"
                value={f.descanso_inicio}
                onChange={(e) => cambiar("descanso_inicio", e.target.value)}
                aria-invalid={errores.descanso_inicio ? "true" : undefined}
                aria-describedby={errores.descanso_inicio ? `${id("descanso_inicio")}-error` : undefined}
              />
              {errores.descanso_inicio && <p id={`${id("descanso_inicio")}-error`} className="asi__error-campo">{errores.descanso_inicio}</p>}
            </div>
            {campoMinutos("descanso_min")}
          </div>
        </fieldset>

        <fieldset className="asi__grupo">
          <legend>Días de la semana (hora de México)</legend>
          <p className="asi__ayuda">Marca los días laborables y su hora de entrada y de salida. Si la salida es anterior a la entrada, la jornada cruza la medianoche.</p>
          {errores.dias && <p className="asi__error-campo">{errores.dias}</p>}
          <div className="asi__dias">
            {DIAS_SEMANA.map((dia) => {
              const d = f.dias.find((x) => x.dia_semana === dia.numero);
              return (
                <div key={dia.numero} className="asi__dia">
                  <label className="asi__dia-nombre" htmlFor={id(`lab-${dia.numero}`)}>
                    <input
                      id={id(`lab-${dia.numero}`)}
                      type="checkbox"
                      checked={d.laborable}
                      onChange={(e) => cambiarDia(dia.numero, { laborable: e.target.checked })}
                    />
                    {dia.nombre}
                  </label>
                  {d.laborable ? (
                    <>
                      <div className="asi__campo">
                        <label htmlFor={id(`ent-${dia.numero}`)}>Entrada<span className="asi__sr"> {dia.nombre}</span></label>
                        <input
                          id={id(`ent-${dia.numero}`)}
                          type="time"
                          value={d.hora_entrada}
                          onChange={(e) => cambiarDia(dia.numero, { hora_entrada: e.target.value })}
                          aria-invalid={errores[`dia_${dia.numero}`] ? "true" : undefined}
                          aria-describedby={errores[`dia_${dia.numero}`] ? `${id(`dia-${dia.numero}`)}-error` : undefined}
                        />
                      </div>
                      <div className="asi__campo">
                        <label htmlFor={id(`sal-${dia.numero}`)}>Salida<span className="asi__sr"> {dia.nombre}</span></label>
                        <input
                          id={id(`sal-${dia.numero}`)}
                          type="time"
                          value={d.hora_salida}
                          onChange={(e) => cambiarDia(dia.numero, { hora_salida: e.target.value })}
                          aria-invalid={errores[`dia_${dia.numero}`] ? "true" : undefined}
                        />
                      </div>
                      {errores[`dia_${dia.numero}`] && (
                        <p id={`${id(`dia-${dia.numero}`)}-error`} className="asi__error-campo" style={{ gridColumn: "1 / -1" }}>
                          {errores[`dia_${dia.numero}`]}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="asi__dia-nolab">Día de descanso</span>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="asi__acciones">
          <button type="button" className="asi__btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="asi__btn asi__btn--primario" disabled={guardando}>
            {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear turno"}
          </button>
        </div>
      </form>
    </DialogoAsistencia>
  );
}
