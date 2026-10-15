// modules/portal/frontend/hooks/useFocoModal.js
import { useEffect, useRef } from 'react';

const SELECTOR_ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * useFocoModal — manejo de foco accesible para un diálogo modal.
 *
 * Al activarse: guarda el elemento que tenía el foco y lo mueve al diálogo; mientras está activo
 * atrapa Tab / Shift+Tab dentro del diálogo; al desactivarse (cierre) devuelve el foco al elemento
 * que abrió el modal. Esc y clic fuera los maneja el propio componente.
 *
 * @param {boolean} activo — true mientras el modal está abierto
 * @returns {React.RefObject} ref para el elemento del diálogo (con tabIndex={-1})
 */
export default function useFocoModal(activo) {
  const dialogoRef = useRef(null);

  useEffect(() => {
    if (!activo) return undefined;
    const apertura = document.activeElement;
    const dialogo = dialogoRef.current;
    if (dialogo) dialogo.focus({ preventScroll: true });

    const atraparTab = (e) => {
      if (e.key !== 'Tab' || !dialogoRef.current) return;
      const enfocables = Array.from(dialogoRef.current.querySelectorAll(SELECTOR_ENFOCABLES));
      if (enfocables.length === 0) {
        e.preventDefault();
        dialogoRef.current.focus();
        return;
      }
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const actual = document.activeElement;
      const dentro = dialogoRef.current.contains(actual) && actual !== dialogoRef.current;
      if (e.shiftKey && (!dentro || actual === primero)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (!dentro || actual === ultimo)) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', atraparTab);

    return () => {
      document.removeEventListener('keydown', atraparTab);
      if (apertura && typeof apertura.focus === 'function' && document.contains(apertura)) {
        apertura.focus({ preventScroll: true });
      }
    };
  }, [activo]);

  return dialogoRef;
}
