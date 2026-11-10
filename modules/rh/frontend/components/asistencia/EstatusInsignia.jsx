import { infoEstatus } from "../../utils/asistenciaResultados";

/** Estatus con color + ícono + texto (el color nunca va solo). El ícono es decorativo. */
export default function EstatusInsignia({ estatus }) {
  const info = infoEstatus(estatus);
  return (
    <span className={`asr__estatus asr__estatus--${info.tono}`}>
      <span aria-hidden="true" className="asr__icono">{info.icono}</span>
      <span>{info.texto}</span>
    </span>
  );
}
