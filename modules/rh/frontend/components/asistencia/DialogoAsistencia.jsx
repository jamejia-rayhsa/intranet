import { useEffect, useId } from "react";
import useFocoModal from "../../../../portal/frontend/hooks/useFocoModal";

/**
 * Diálogo modal accesible: role dialog/alertdialog, aria-modal, foco atrapado y devuelto al cerrar
 * (useFocoModal), Escape cierra (salvo `bloqueado`). Los hijos van dentro del cuerpo desplazable.
 */
export default function DialogoAsistencia({ titulo, onCerrar, children, rol = "dialog", bloqueado = false, ancho = "34rem", clase = "" }) {
  const dialogoRef = useFocoModal(true);
  const tituloId = useId();

  useEffect(() => {
    function alTecla(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!bloqueado) onCerrar();
      }
    }
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [bloqueado, onCerrar]);

  return (
    <div className="rayhsa-modal-overlay asi__overlay">
      <div
        className={`rayhsa-modal asi__modal${clase ? ` ${clase}` : ""}`}
        style={{ maxWidth: `min(${ancho}, 100%)` }}
        ref={dialogoRef}
        tabIndex={-1}
        role={rol}
        aria-modal="true"
        aria-labelledby={tituloId}
      >
        <h2 id={tituloId} className="asi__modal-titulo">{titulo}</h2>
        <div className="asi__modal-cuerpo">{children}</div>
      </div>
    </div>
  );
}
