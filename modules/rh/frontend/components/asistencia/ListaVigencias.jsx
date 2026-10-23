import {
  clasificarVigencia,
  etiquetaEstadoVigencia,
  textoVigencia,
  puedeTerminar,
} from "../../utils/asistenciaAsignaciones";

const CLASE = { vigente: "asi__badge--ok", futura: "asi__badge--aviso", cerrada: "asi__badge--neutro" };

/**
 * Vigencias de un destino: las vigentes y futuras a la vista y las cerradas en «Historial». `onTerminar` es opcional
 * (las del departamento en la ficha de un empleado son solo lectura).
 */
export default function ListaVigencias({ lista, hoy, nombreDestino, onTerminar }) {
  if (!lista || lista.length === 0) return <span className="asi__sec">Sin asignaciones</span>;
  const activas = lista.filter((a) => clasificarVigencia(a, hoy) !== "cerrada");
  const cerradas = lista.filter((a) => clasificarVigencia(a, hoy) === "cerrada");
  const fila = (a) => {
    const estado = clasificarVigencia(a, hoy);
    return (
      <li key={a.id}>
        <span className={`asi__badge ${CLASE[estado]}`}>{etiquetaEstadoVigencia(estado)}</span>{" "}
        <strong>{a.turno_nombre}</strong> · {textoVigencia(a)}{" "}
        {onTerminar && puedeTerminar(a, hoy) && (
          <button
            type="button"
            className="asi__btn asi__btn--chico"
            onClick={() => onTerminar(a)}
            aria-label={`Terminar la asignación de ${a.turno_nombre} de ${nombreDestino} (${textoVigencia(a)})`}
          >
            Terminar
          </button>
        )}
      </li>
    );
  };
  return (
    <>
      {activas.length > 0 && <ul className="asi__lista asi__lista--plana">{activas.map(fila)}</ul>}
      {cerradas.length > 0 && (
        <details>
          <summary>Historial ({cerradas.length})</summary>
          <ul className="asi__lista asi__lista--plana">{cerradas.map(fila)}</ul>
        </details>
      )}
    </>
  );
}
