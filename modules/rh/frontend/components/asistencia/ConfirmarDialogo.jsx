import { useState, useId } from "react";
import DialogoAsistencia from "./DialogoAsistencia";

/**
 * Confirmación de una acción. `onConfirmar` es async: si lanza, el mensaje del servidor se muestra dentro del
 * diálogo (role=alert) y no se cierra; si termina bien, el llamador cierra. Mientras corre, todo se bloquea.
 */
export default function ConfirmarDialogo({ titulo, children, textoConfirmar, peligro = false, onConfirmar, onCancelar }) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const errorId = useId();

  async function confirmar() {
    if (trabajando) return;
    setTrabajando(true);
    setError("");
    try {
      await onConfirmar();
    } catch (err) {
      setError((err && err.message) || "No se pudo completar la acción");
      setTrabajando(false);
    }
  }

  return (
    <DialogoAsistencia titulo={titulo} onCerrar={onCancelar} rol="alertdialog" bloqueado={trabajando} ancho="28rem">
      <div>{children}</div>
      {error && <div id={errorId} role="alert" className="asi__aviso asi__aviso--error">{error}</div>}
      <div className="asi__acciones">
        <button type="button" className="asi__btn" onClick={onCancelar} disabled={trabajando}>Cancelar</button>
        <button
          type="button"
          className={`asi__btn ${peligro ? "asi__btn--peligro" : "asi__btn--primario"}`}
          onClick={confirmar}
          disabled={trabajando}
          aria-describedby={error ? errorId : undefined}
        >
          {trabajando ? "Procesando…" : textoConfirmar}
        </button>
      </div>
    </DialogoAsistencia>
  );
}
