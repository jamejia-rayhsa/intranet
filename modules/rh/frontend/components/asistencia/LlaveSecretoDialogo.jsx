import { useState, useId, useRef } from "react";
import DialogoAsistencia from "./DialogoAsistencia";
import { LONGITUD_LLAVE } from "../../utils/asistenciaLlaves";

// ¿El navegador permite escribir en el portapapeles? (requiere contexto seguro / HTTPS o localhost)
const puedeCopiar = () =>
  typeof navigator !== "undefined" && Boolean(navigator.clipboard) && typeof navigator.clipboard.writeText === "function";

/**
 * Muestra la llave COMPLETA una sola vez. La llave vive únicamente en la prop `llave` mientras el diálogo está
 * abierto: no se guarda en localStorage/sessionStorage ni en otro estado, no se escribe en la consola y al cerrar
 * el componente se desmonta (el DOM ya no la contiene). Cerrar exige confirmar que se guardó.
 */
export default function LlaveSecretoDialogo({ llave, titulo, detalle, onCerrar }) {
  const id = useId();
  const [guardada, setGuardada] = useState(false);
  const [errorCierre, setErrorCierre] = useState("");
  const [estadoCopia, setEstadoCopia] = useState("");
  const casillaRef = useRef(null);
  const copiar = puedeCopiar();

  function intentarCerrar() {
    if (!guardada) {
      setErrorCierre("Confirma que guardaste la llave antes de cerrar: no se volverá a mostrar.");
      if (casillaRef.current) casillaRef.current.focus();
      return;
    }
    onCerrar();
  }

  async function copiarLlave() {
    try {
      await navigator.clipboard.writeText(llave);
      setEstadoCopia("Llave copiada al portapapeles. Pégala en tu gestor de contraseñas.");
    } catch {
      setEstadoCopia("No se pudo copiar automáticamente. Selecciona la llave y cópiala con Ctrl+C.");
    }
  }

  return (
    <DialogoAsistencia titulo={titulo} onCerrar={intentarCerrar} ancho="40rem">
      <p className="asi__aviso asi__aviso--advertencia" role="alert">
        Esta llave no se volverá a mostrar. Guárdala ahora en un gestor de contraseñas.
      </p>
      {detalle && <p>{detalle}</p>}
      <p id={`${id}-etiqueta`} className="asi__ayuda">Llave completa ({LONGITUD_LLAVE} caracteres):</p>
      <code className="asi__llave-caja" aria-labelledby={`${id}-etiqueta`} data-llave="visible">{llave}</code>
      <div className="asi__barra">
        <button type="button" className="asi__btn asi__btn--primario" onClick={copiarLlave} disabled={!copiar} aria-describedby={copiar ? undefined : `${id}-sin-copia`}>
          Copiar llave
        </button>
        {!copiar && (
          <span id={`${id}-sin-copia`} className="asi__ayuda">
            Tu navegador no permite copiar con el botón (requiere una conexión segura): selecciona la llave y cópiala manualmente.
          </span>
        )}
      </div>
      <div role="status" aria-live="polite">{estadoCopia && <p className="asi__aviso asi__aviso--info">{estadoCopia}</p>}</div>
      <div className="asi__campo asi__campo--casilla">
        <input
          id={`${id}-guardada`}
          ref={casillaRef}
          type="checkbox"
          checked={guardada}
          onChange={(e) => { setGuardada(e.target.checked); if (e.target.checked) setErrorCierre(""); }}
          aria-describedby={errorCierre ? `${id}-error` : undefined}
        />
        <label htmlFor={`${id}-guardada`}>Ya guardé la llave en un lugar seguro</label>
      </div>
      {errorCierre && <p id={`${id}-error`} role="alert" className="asi__error-campo">{errorCierre}</p>}
      <div className="asi__acciones">
        <button type="button" className="asi__btn asi__btn--primario" onClick={intentarCerrar}>Cerrar</button>
      </div>
    </DialogoAsistencia>
  );
}
