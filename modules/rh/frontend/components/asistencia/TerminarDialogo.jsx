import { useState, useId } from "react";
import DialogoAsistencia from "./DialogoAsistencia";
import { terminarAsignacion } from "../../services/asistencia.service";
import { validarTerminar, textoVigencia, avisoTerminarPasado } from "../../utils/asistenciaAsignaciones";

/** Termina una asignación fijando su fecha final (solo acorta). Confirmación explícita con el error del servidor. */
export default function TerminarDialogo({ tipo, asignacion, nombreDestino, hoy, onCerrar, onTerminada }) {
  const id = useId();
  const [hasta, setHasta] = useState(hoy < asignacion.vigente_desde ? asignacion.vigente_desde : hoy);
  const [errorCampo, setErrorCampo] = useState("");
  const [errorServidor, setErrorServidor] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [confirmoPasado, setConfirmoPasado] = useState(false);
  const aviso = avisoTerminarPasado(hasta, hoy);

  async function enviar(e) {
    e.preventDefault();
    if (trabajando) return;
    setErrorServidor("");
    const mensaje = validarTerminar(asignacion, hasta);
    setErrorCampo(mensaje);
    if (mensaje) return;
    if (aviso && !confirmoPasado) {
      setConfirmoPasado(true); // primer envío: muestra el aviso; el segundo ("Confirmar y terminar") ejecuta
      return;
    }
    setTrabajando(true);
    try {
      await terminarAsignacion(tipo, asignacion.id, hasta);
      onTerminada(`Asignación de «${asignacion.turno_nombre}» de ${nombreDestino} terminada el ${hasta}`);
    } catch (err) {
      setErrorServidor((err && err.message) || "No se pudo terminar la asignación");
      setTrabajando(false);
    }
  }

  return (
    <DialogoAsistencia titulo="Terminar asignación" onCerrar={onCerrar} bloqueado={trabajando} rol="alertdialog" ancho="28rem">
      <form onSubmit={enviar} noValidate>
        <p>
          ¿Terminar la asignación de «{asignacion.turno_nombre}» de {nombreDestino} ({textoVigencia(asignacion)})?
          Solo se puede acortar la vigencia; el historial se conserva.
        </p>
        {errorServidor && <div role="alert" className="asi__aviso asi__aviso--error">{errorServidor}</div>}
        <div className="asi__campo">
          <label htmlFor={`${id}-hasta`}>Último día de vigencia</label>
          <input
            id={`${id}-hasta`}
            type="date"
            value={hasta}
            onChange={(e) => { setHasta(e.target.value); setConfirmoPasado(false); }}
            aria-invalid={errorCampo ? "true" : undefined}
            aria-describedby={errorCampo ? `${id}-e` : undefined}
          />
          {errorCampo && <p id={`${id}-e`} className="asi__error-campo">{errorCampo}</p>}
        </div>
        {aviso && confirmoPasado && (
          <div role="alert" className="asi__aviso asi__aviso--advertencia">{aviso}</div>
        )}
        <div className="asi__acciones">
          <button type="button" className="asi__btn" onClick={onCerrar} disabled={trabajando}>Cancelar</button>
          <button type="submit" className="asi__btn asi__btn--peligro" disabled={trabajando}>{trabajando ? "Terminando…" : aviso && confirmoPasado ? "Confirmar y terminar" : "Terminar asignación"}</button>
        </div>
      </form>
    </DialogoAsistencia>
  );
}
