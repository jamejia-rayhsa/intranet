import { useEffect, useId, useState } from "react";
import DialogoAsistencia from "./DialogoAsistencia";
import { cerrarPeriodo, reabrirPeriodo, resolverAjuste, contadoresPeriodo, mensajeDeError } from "../../services/asistencia.service";
import {
  ADVERTENCIA_CIERRE, MOTIVO_REAPERTURA_MAX, MOTIVO_REAPERTURA_MIN, NOTA_MAX, resumenCierre, validarMotivoReapertura, validarNotaAjuste,
  esConflictoOcupado, esDatosCambiaron, esperadosDeCierre, mensajeAccionPeriodo, MOTIVO_AJUSTE,
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

/**
 * Cierre con confirmación. Al abrir consulta contadores FRESCOS (días pendientes, ajustes sin resolver, sin identificador) y
 * los envía como `esperados`: si el servidor ve otros valores responde 409 «los datos cambiaron» y aquí se recargan.
 * Con días pendientes no se puede cerrar (lo exige también el servidor).
 */
export function CerrarPeriodoDialogo({ periodo, onCerrado, onCancelar }) {
  const [contadores, setContadores] = useState(null);
  const [errorContadores, setErrorContadores] = useState("");
  const [recargado, setRecargado] = useState("");
  const cargar = () => {
    setContadores(null);
    setErrorContadores("");
    return contadoresPeriodo(periodo.id)
      .then((r) => setContadores(r.datos))
      .catch((err) => setErrorContadores(mensajeDeError(err, "No se pudieron consultar los datos del cierre")));
  };
  useEffect(() => {
    cargar();
  }, [periodo.id]);
  const accion = async () => {
    try {
      return await cerrarPeriodo(periodo.id, esperadosDeCierre(contadores));
    } catch (err) {
      if (esDatosCambiaron(err)) {
        await cargar();
        setRecargado("Los datos cambiaron desde que abriste la confirmación. Ya se actualizaron los números: revísalos y confirma de nuevo.");
      }
      throw err;
    }
  };
  const { trabajando, error, ocupado, ejecutar } = useAccion(accion, onCerrado);
  const r = resumenCierre(contadores);
  return (
    <DialogoAsistencia titulo={`Cerrar la quincena ${periodo.fecha_inicio} a ${periodo.fecha_fin}`} onCerrar={onCancelar} rol="alertdialog" bloqueado={trabajando} ancho="30rem">
      <form onSubmit={(e) => { e.preventDefault(); setRecargado(""); ejecutar(); }}>
        <p className="asi__aviso asi__aviso--advertencia">{ADVERTENCIA_CIERRE}</p>
        <p>Antes de cerrar, esto es lo que hay ahora mismo:</p>
        {!contadores && !errorContadores && <p className="asi__estado" role="status">Consultando los datos del cierre…</p>}
        {errorContadores && (
          <div className="asi__aviso asi__aviso--error" role="alert">
            <span>{errorContadores}</span>
            <button type="button" className="asi__btn asi__btn--chico" onClick={cargar}>Reintentar</button>
          </div>
        )}
        {contadores && (
          <ul className="asi__lista">
            <li><strong>{r.pendientes}</strong> {r.pendientes === 1 ? "día pendiente de calificar" : "días pendientes de calificar"}</li>
            <li><strong>{r.ajustes}</strong> {r.ajustes === 1 ? "ajuste pendiente sin resolver" : "ajustes pendientes sin resolver"} (marcas llegadas después del cierre)</li>
            <li><strong>{r.sinIdentificador}</strong> {r.sinIdentificador === 1 ? "empleado sin identificador" : "empleados sin identificador"} (no se analizan)</li>
          </ul>
        )}
        {contadores && r.bloqueado && <p className="asi__aviso asi__aviso--error" role="alert">{r.motivoBloqueo}</p>}
        {contadores && !r.bloqueado && r.hayRiesgo && <p className="asi__ayuda">Puedes cerrar, pero lo que quede sin resolver quedará fuera del resultado congelado.</p>}
        <div role="status" aria-live="polite">{recargado && <p className="asi__aviso asi__aviso--info">{recargado}</p>}</div>
        <PieAccion error={recargado ? "" : error} ocupado={ocupado} trabajando={trabajando} textoConfirmar="Cerrar la quincena" textoReintento="Reintentar" peligro onCancelar={onCancelar} deshabilitado={!contadores || r.bloqueado} />
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
