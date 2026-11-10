import { useState, useId } from "react";
import DialogoAsistencia from "./DialogoAsistencia";
import { asignarTurno } from "../../services/asistencia.service";
import { validarAlta } from "../../utils/asistenciaAsignaciones";

/**
 * Asigna un turno ACTIVO a un departamento o empleado con vigencia. El error de traslape (409) del servidor se
 * muestra tal cual. `tipo` = 'departamento' | 'empleado'; `destino` = { id, nombre }.
 */
export default function AsignarDialogo({ tipo, destino, turnos, hoy, onCerrar, onAsignado }) {
  const prefijo = useId();
  const columna = tipo === "departamento" ? "departamento_id" : "empleado_id";
  const [turnoId, setTurnoId] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState("");
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const activos = turnos.filter((t) => t.activo);

  async function enviar(e) {
    e.preventDefault();
    if (guardando) return;
    setErrorServidor("");
    const { errores: nuevos } = validarAlta({ turno_id: turnoId, vigente_desde: desde, vigente_hasta: hasta });
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    setGuardando(true);
    try {
      await asignarTurno(tipo, { [columna]: destino.id, turno_id: Number(turnoId), vigente_desde: desde, vigente_hasta: hasta || null });
      const turno = activos.find((t) => String(t.id) === String(turnoId));
      onAsignado(`Turno «${turno ? turno.nombre : ""}» asignado a ${destino.nombre} desde ${desde}${hasta ? ` hasta ${hasta}` : ""}`);
    } catch (err) {
      setErrorServidor((err && err.message) || "No se pudo asignar el turno");
      setGuardando(false);
    }
  }

  return (
    <DialogoAsistencia titulo={`Asignar turno a ${destino.nombre}`} onCerrar={onCerrar} bloqueado={guardando}>
      <form onSubmit={enviar} noValidate>
        {errorServidor && <div role="alert" className="asi__aviso asi__aviso--error">{errorServidor}</div>}
        <div className="asi__campo">
          <label htmlFor={`${prefijo}-turno`}>Turno (solo activos)</label>
          <select
            id={`${prefijo}-turno`}
            value={turnoId}
            onChange={(e) => setTurnoId(e.target.value)}
            aria-invalid={errores.turno_id ? "true" : undefined}
            aria-describedby={errores.turno_id ? `${prefijo}-turno-e` : undefined}
          >
            <option value="">Elige un turno…</option>
            {activos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          {errores.turno_id && <p id={`${prefijo}-turno-e`} className="asi__error-campo">{errores.turno_id}</p>}
          {activos.length === 0 && <p className="asi__ayuda">No hay turnos activos. Crea o activa uno en la pantalla de turnos.</p>}
        </div>
        <div className="asi__rejilla">
          <div className="asi__campo">
            <label htmlFor={`${prefijo}-desde`}>Vigente desde</label>
            <input
              id={`${prefijo}-desde`}
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              aria-invalid={errores.vigente_desde ? "true" : undefined}
              aria-describedby={errores.vigente_desde ? `${prefijo}-desde-e` : undefined}
            />
            {errores.vigente_desde && <p id={`${prefijo}-desde-e`} className="asi__error-campo">{errores.vigente_desde}</p>}
          </div>
          <div className="asi__campo">
            <label htmlFor={`${prefijo}-hasta`}>Vigente hasta (opcional)</label>
            <input
              id={`${prefijo}-hasta`}
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              aria-invalid={errores.vigente_hasta ? "true" : undefined}
              aria-describedby={errores.vigente_hasta ? `${prefijo}-hasta-e` : `${prefijo}-hasta-a`}
            />
            {errores.vigente_hasta && <p id={`${prefijo}-hasta-e`} className="asi__error-campo">{errores.vigente_hasta}</p>}
            <p id={`${prefijo}-hasta-a`} className="asi__ayuda">Vacía = sin fecha final (abierta).</p>
          </div>
        </div>
        <div className="asi__acciones">
          <button type="button" className="asi__btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="asi__btn asi__btn--primario" disabled={guardando}>{guardando ? "Asignando…" : "Asignar turno"}</button>
        </div>
      </form>
    </DialogoAsistencia>
  );
}
