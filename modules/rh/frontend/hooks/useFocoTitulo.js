import { useCallback, useRef } from "react";

/**
 * Tras una acción que quita del DOM el botón que abrió un diálogo (baja, cierre de lista), el foco queda en <body>.
 * `enfocarSiPerdido` lo lleva al título de la página (h1 con tabIndex -1 y ref) solo en ese caso.
 */
export default function useFocoTitulo() {
  const ref = useRef(null);
  const enfocarSiPerdido = useCallback(() => {
    setTimeout(() => {
      const activo = document.activeElement;
      if ((!activo || activo === document.body) && ref.current) ref.current.focus();
    }, 50);
  }, []);
  return { ref, enfocarSiPerdido };
}
