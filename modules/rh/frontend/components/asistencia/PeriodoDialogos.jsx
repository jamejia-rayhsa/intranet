import { useEffect, useId, useState } from "react";
import DialogoAsistencia from "./DialogoAsistencia";
import { cerrarPeriodo, reabrirPeriodo, resolverAjuste, sinIdentificador } from "../../services/asistencia.service";
import {
  ADVERTENCIA_CIERRE, MOTIVO_REAPERTURA_MAX, MOTIVO_REAPERTURA_MIN, NOTA_MAX, resumenCierre, validarMotivoReapertura, validarNotaAjuste,
  esConflictoOcupado, mensajeAccionPeriodo, MOTIVO_AJUSTE,
} from "../../utils/asistenciaPeriodos";

/** Pie común: error (409 de «ocupado» como aviso amable con reintento) y botones. */
function PieAccion({ error, ocupado, trabajando, textoConfirmar, textoReintento, peligro, onCancelar, deshabilitado = false }) {
  return (
    <>
      {error && (
        <div role={ocupado ? "status" : "alert"} className={`asi__aviso ${ocupado ? "asi__aviso--info" : "asi__aviso--error"}`}>
          {error}
        </div>
      )}
      <div className="asi__acciones">
        <button type="button" className="asi__btn" onClick={onCancelar} disabled={trabajando}>Cancelar</button>
        <button type="submit" className={`asi__btn ${peligro ? "asi__btn--peligro" : "asi__btn--primario"}`} disabled={trabajando || deshabilitado}>
          {trabajando ? "Procesando…" : ocupado ? textoReintento : textoConfirmar}
        </button>
      </div>
    </>
  );
}

function useAccion(accion, alTerminar) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function ejecutar() {
    if (trabajando) return;
    setTrabajando(true);
    setError("");
    setOcupado(false);
    try {
      const r = await accion();
      await alTerminar(r);
    } catch (err) {
      setOcupado(esConflictoOcupado(err));
      setError(mensajeAccionPeriodo(err, "No se pudo completar la acción"));
      setTrabajando(false);
    }
  }
  return { trabajando, error, ocupado, ejecutar };
}

/** Cierre con confirmación: muestra días pendientes, ajustes sin resolver y empleados sin identificador antes de congelar. */
export function CerrarPeriodoDialogo({ periodo, onCerrado, onCancelar }) {
  const [sinId, setSinId] = useState(null);
  const [errorSinId, setErrorSinId] = useState("");
  useEffect(() => {
    let activo = true;
    sinIdentificador({ pagina: 1, limite: 1 })
      .then((r) => { if (activo) setSinId(r.paginacion ? r.paginacion.total : (r.datos || []).length); })
      .catch(() => { if (activo) setErrorSinId("No se pudo consultar cuántos empleados no tienen identificador."); });
    return () => { activo = false; };
  }, []);
  const { trabajando, error, ocupado, ejecutar } = useAccion(() => cerrarPeriodo(periodo.id), onCerrado);
  const r = resumenCierre(periodo, sinId);
  return (
    <DialogoAsistencia titulo={`Cerrar la quincena ${periodo.fecha_inicio} a ${periodo.fecha_fin}`} onCerrar={onCancelar} rol="alertdialog" bloqueado={trabajando} ancho="30rem">
      <form onSubmit={(e) => { e.preventDefault(); ejecutar(); }}>
        <p className="asi__aviso asi__aviso--advertencia">{ADVERTENCIA_CIERRE}</p>
        <p>Antes de cerrar, esto es lo que queda sin resolver:</p>
        <ul className="asi__lista">
          <li><strong>{r.pendientes}</strong> {r.pendientes === 1 ? "día pendiente de calificar" : "días pendientes de calificar"}</li>
          <li><strong>{r.ajustes}</strong> {r.ajustes === 1 ? "ajuste pendiente sin resolver" : "ajustes pendientes sin resolver"} (marcas llegadas después del cierre)</li>
          <li>
            {sinId === null && !errorSinId && <span>Consultando empleados sin identificador…</span>}
            {sinId !== null && <><strong>{sinId}</strong> {sinId === 1 ? "empleado sin identificador" : "empleados sin identificador"} (no se analizan)</>}
            {errorSinId && <span>{errorSinId}</span>}
          </li>
        </ul>
        {r.hayRiesgo && <p className="asi__ayuda">Puedes cerrar de todos modos, pero lo pendiente quedará fuera del resultado congelado.</p>}
        <PieAccion error={error} ocupado={ocupado} trabajando={trabajando} textoConfirmar="Cerrar la quincena" textoReintento="Reintentar" peligro onCancelar={onCancelar} />
      </form>
    </DialogoAsistencia>
  );
}

export function ReabrirPeriodoDialogo({ periodo, onReabierto, onCancelar }) {
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState("");
  const id = useId();
  const { trabajando, error, ocupado, ejecutar } = useAccion(() => reabrirPeriodo(periodo.id, motivo.trim()), onReabierto);
  function enviar(e) {
    e.preventDefault();
    const problema = validarMotivoReapertura(motivo);
    setErrorMotivo(problema);
    if (!problema) ejecutar();
  }
  return (
    <DialogoAsistencia titulo={`Reabrir la quincena ${periodo.fecha_inicio} a ${periodo.fecha_fin}`} onCerrar={onCancelar} rol="alertdialog" bloqueado={trabajando} ancho="30rem">
      <form onSubmit={enviar} noValidate>
        <p>La quincena volverá a calcularse con los turnos y registros actuales y <strong>ya no se cerrará sola</strong>: tendrás que cerrarla a mano. Queda registrado quién la reabrió y por qué.</p>
        <div className="asi__campo">
          <label htmlFor={id}>Motivo (obligatorio, mínimo {MOTIVO_REAPERTURA_MIN} caracteres)</label>
          <textarea id={id} rows={3} maxLength={MOTIVO_REAPERTURA_MAX} value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-invalid={errorMotivo ? "true" : undefined} aria-describedby={errorMotivo ? `${id}-e` : undefined} disabled={trabajando} />
          {errorMotivo && <p id={`${id}-e`} className="asi__error-campo" role="alert">{errorMotivo}</p>}
        </div>
        <PieAccion error={error} ocupado={ocupado} trabajando={trabajando} textoConfirmar="Reabrir la quincena" textoReintento="Reintentar" peligro onCancelar={onCancelar} />
      </form>
    </DialogoAsistencia>
  );
}

export function ResolverAjusteDialogo({ ajuste, nombre, onResuelto, onCancelar }) {
  const [nota, setNota] = useState("");
  const [errorNota, setErrorNota] = useState("");
  const id = useId();
  const { trabajando, error, ocupado, ejecutar } = useAccion(() => resolverAjuste(ajuste.id, nota.trim()), onResuelto);
  function enviar(e) {
    e.preventDefault();
    const problema = validarNotaAjuste(nota);
    setErrorNota(problema);
    if (!problema) ejecutar();
  }
  return (
    <DialogoAsistencia titulo="Resolver el ajuste pendiente" onCerrar={onCancelar} bloqueado={trabajando} ancho="30rem">
      <form onSubmit={enviar} noValidate>
        <p>{nombre} · {ajuste.fecha}: {MOTIVO_AJUSTE[ajuste.motivo] || ajuste.motivo}.</p>
        <p className="asi__ayuda">Marcar como resuelto no recalcula nada: si la marca debe contar, reabre la quincena primero. La nota queda registrada.</p>
        <div className="asi__campo">
          <label htmlFor={id}>Nota (opcional, hasta {NOTA_MAX} caracteres)</label>
          <textarea id={id} rows={3} maxLength={NOTA_MAX} value={nota} onChange={(e) => setNota(e.target.value)} aria-invalid={errorNota ? "true" : undefined} aria-describedby={errorNota ? `${id}-e` : undefined} disabled={trabajando} />
          {errorNota && <p id={`${id}-e`} className="asi__error-campo" role="alert">{errorNota}</p>}
        </div>
        <PieAccion error={error} ocupado={ocupado} trabajando={trabajando} textoConfirmar="Marcar como resuelto" textoReintento="Reintentar" onCancelar={onCancelar} />
      </form>
    </DialogoAsistencia>
  );
}
