import { useState, useEffect, useMemo, useRef } from "react";
import { consultarOcupacion } from "../services/vacaciones.service";
import {
  NOMBRES_MESES,
  DIAS_SEMANA,
  rangoCuadricula,
  fechaHoy,
  mesDeFecha,
  mesAnterior,
  mesSiguiente,
  destinoTecla,
  formatearISO,
  fechaLegible,
  construirMesOcupacion,
  detalleMesOcupacion,
  mensajeErrorRed,
} from "../utils/calendarioLaboral";
import "../styles/calendario.css";
import "../styles/vacacionesOcupacion.css";

const MENSAJE_ERROR = "No se pudo cargar el calendario de ocupación";

// Calendario mensual compacto del departamento del solicitante. No muestra nombres de compañeros
// (el backend solo entrega fechas llenas, no hábiles y eventos). Fechas siempre como texto.
// `cupo`: undefined = aún desconocido, null = el empleado no tiene departamento (sin cupo).
export default function CalendarioOcupacion({ inicio, fin, cupo, version = 0, onElegir }) {
  const hoy = fechaHoy();
  const base = mesDeFecha(inicio) || mesDeFecha(hoy);
  const [anio, setAnio] = useState(base.anio);
  const [mes, setMes] = useState(base.mes);
  const [fechaFoco, setFechaFoco] = useState(inicio || hoy);
  const [ocupacion, setOcupacion] = useState(null);
  const [estado, setEstado] = useState("cargando");
  const [error, setError] = useState("");
  const [reintento, setReintento] = useState(0);
  const moverFoco = useRef(false);
  const rejillaRef = useRef(null);

  // Si la fecha inicial (tecleada) queda fuera de la cuadrícula visible, el calendario va a su mes
  useEffect(() => {
    const m = mesDeFecha(inicio);
    if (!m) return;
    const { desde, hasta } = rangoCuadricula(anio, mes);
    if (inicio < desde || inicio > hasta) {
      setAnio(m.anio);
      setMes(m.mes);
      setFechaFoco(inicio);
    }
    // solo reacciona a la fecha inicial; el mes visible lo cambian los botones
  }, [inicio]);

  // Una petición por mes visible; la respuesta de una petición vieja se descarta (carrera)
  useEffect(() => {
    let activo = true;
    const { desde, hasta } = rangoCuadricula(anio, mes);
    setEstado("cargando");
    setError("");
    consultarOcupacion({ desde, hasta })
      .then((r) => {
        if (!activo) return;
        if (r && r.exito === true && r.datos) {
          setOcupacion(r.datos);
          setEstado("listo");
        } else {
          setOcupacion(null);
          setError((r && r.mensaje) || MENSAJE_ERROR);
          setEstado("error");
        }
      })
      .catch((err) => {
        if (!activo) return;
        setOcupacion(null);
        setError(mensajeErrorRed(err, MENSAJE_ERROR));
        setEstado("error");
      });
    return () => { activo = false; };
  }, [anio, mes, version, reintento]);

  useEffect(() => {
    if (!moverFoco.current || !rejillaRef.current) return;
    const boton = rejillaRef.current.querySelector(`[data-fecha="${fechaFoco}"]`);
    if (boton) {
      boton.focus();
      moverFoco.current = false;
    }
  }, [fechaFoco, anio, mes]);

  const semanas = useMemo(
    () => construirMesOcupacion(anio, mes, ocupacion, { inicio, fin, hoy }),
    [anio, mes, ocupacion, inicio, fin, hoy],
  );
  const detalle = useMemo(() => detalleMesOcupacion(anio, mes, ocupacion), [anio, mes, ocupacion]);

  const fechaBase = hoy.startsWith(formatearISO(anio, mes, 1).slice(0, 8)) ? hoy : formatearISO(anio, mes, 1);
  const fechaTab = semanas.some((s) => s.some((c) => c.fecha === fechaFoco)) ? fechaFoco : fechaBase;
  const tituloMes = `${NOMBRES_MESES[mes - 1]} de ${anio}`;

  function irAMes(destino) {
    setAnio(destino.anio);
    setMes(destino.mes);
    setFechaFoco(formatearISO(destino.anio, destino.mes, 1));
  }

  function alTecla(e, celda) {
    const destino = destinoTecla(celda.fecha, e.key);
    if (!destino) return;
    e.preventDefault();
    moverFoco.current = true;
    setFechaFoco(destino);
    const m = mesDeFecha(destino);
    if (m.anio !== anio || m.mes !== mes) {
      setAnio(m.anio);
      setMes(m.mes);
    }
  }

  function alClic(celda) {
    setFechaFoco(celda.fecha);
    if (celda.seleccionable && onElegir) onElegir(celda.fecha);
  }

  return (
    <section className="calendario ocupacion" aria-labelledby="ocupacion-titulo">
      <h2 id="ocupacion-titulo" className="ocupacion__titulo">Calendario de tu departamento</h2>
      {cupo === null && (
        <p className="calendario__aviso calendario__aviso--ayuda">
          No tienes departamento asignado, por eso no hay cupo de vacaciones que mostrar. Solo se señalan los días no
          hábiles y los eventos.
        </p>
      )}
      <div className="calendario__barra">
        <button type="button" className="calendario__boton" onClick={() => irAMes(mesAnterior(anio, mes))} aria-label="Mes anterior">
          ‹
        </button>
        <button type="button" className="calendario__boton" onClick={() => irAMes(mesSiguiente(anio, mes))} aria-label="Mes siguiente">
          ›
        </button>
        <h3 className="calendario__titulo-mes ocupacion__mes" aria-live="polite">{tituloMes}</h3>
      </div>

      <div role="status" aria-live="polite" className="ocupacion__estado">
        {estado === "cargando" && <span>Cargando calendario…</span>}
      </div>
      {estado === "error" && (
        <p className="calendario__aviso calendario__aviso--error" role="alert">
          {error}{" "}
          <button type="button" className="calendario__boton" onClick={() => setReintento((n) => n + 1)}>Reintentar</button>
        </p>
      )}

      <div
        className="calendario__rejilla"
        role="grid"
        aria-label={`Ocupación de ${tituloMes}`}
        aria-busy={estado === "cargando"}
        ref={rejillaRef}
      >
        <div className="calendario__semana" role="row">
          {DIAS_SEMANA.map((d) => (
            <div key={d.corto} className="calendario__encabezado" role="columnheader" aria-label={d.largo}>{d.corto}</div>
          ))}
        </div>
        {semanas.map((semana) => (
          <div className="calendario__semana" role="row" key={semana[0].fecha}>
            {semana.map((celda) => {
              const clases = ["calendario__celda"];
              if (celda.finDeSemana) clases.push("calendario__celda--finde");
              if (!celda.delMes) clases.push("calendario__celda--otro-mes");
              const dia = ["calendario__dia", "ocupacion__dia"];
              if (celda.enRango) dia.push("ocupacion__dia--rango");
              if (celda.esInicio || celda.esFin) dia.push("ocupacion__dia--extremo");
              if (celda.seleccionable) dia.push("ocupacion__dia--libre");
              return (
                <div className={clases.join(" ")} role="gridcell" key={celda.fecha} aria-selected={celda.enRango || celda.esInicio}>
                  <button
                    type="button"
                    className={dia.join(" ")}
                    data-fecha={celda.fecha}
                    tabIndex={celda.fecha === fechaTab ? 0 : -1}
                    aria-label={celda.etiqueta}
                    aria-disabled={celda.seleccionable ? undefined : "true"}
                    onClick={() => alClic(celda)}
                    onKeyDown={(e) => alTecla(e, celda)}
                  >
                    <span className={`calendario__num${celda.esHoy ? " calendario__num--hoy" : ""}`}>{celda.dia}</span>
                    {celda.lleno && (
                      <span className="calendario__marca ocupacion__marca--lleno">
                        <span className="ocupacion__icono" aria-hidden="true">⛔</span> <span className="calendario__marca-texto"><span className="ocupacion__texto-corto">Lleno</span><span className="ocupacion__texto-largo">Cupo lleno</span></span>
                      </span>
                    )}
                    {celda.bloqueado && (
                      <span className="calendario__marca ocupacion__marca--bloqueado">
                        <span className="ocupacion__icono" aria-hidden="true">■</span>{" "}
                        <span className="calendario__marca-texto">
                          <span className="ocupacion__bloq-corto">Bloq</span>
                          <span className="ocupacion__bloq-largo">Bloqueado: {celda.bloqueado}</span>
                        </span>
                      </span>
                    )}
                    {celda.noHabil && (
                      <span className={`calendario__marca calendario__marca--${celda.noHabil.tipo}`}>
                        <span aria-hidden="true">{celda.noHabil.icono}</span>
                      </span>
                    )}
                    {celda.eventos.length > 0 && (
                      <span className="calendario__marca calendario__marca--evento">
                        <span aria-hidden="true">●</span>
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="calendario__leyenda ocupacion__leyenda" aria-label="Leyenda">
        <li><span className="calendario__marca ocupacion__marca--lleno"><span aria-hidden="true">⛔</span> Cupo lleno</span></li>
        <li><span className="calendario__marca ocupacion__marca--bloqueado"><span aria-hidden="true">■</span> Bloqueado (Día Actividad Empresa)</span></li>
        <li><span className="calendario__marca calendario__marca--oficial"><span aria-hidden="true">★</span> Oficial</span></li>
        <li><span className="calendario__marca calendario__marca--otorgado"><span aria-hidden="true">◆</span> Descanso otorgado</span></li>
        <li><span className="calendario__marca calendario__marca--evento"><span aria-hidden="true">●</span> Evento</span></li>
        <li><span className="calendario__marca ocupacion__marca--finde">Fin de semana</span></li>
        <li><span className="calendario__marca ocupacion__marca--rango">Rango elegido</span></li>
      </ul>
      <p className="ocupacion__ayuda">
        Elige un día hábil libre para fijar la fecha inicial y otro para la final (o escribe las fechas arriba).
      </p>

      {estado === "listo" && detalle.length > 0 && (
        <ul className="ocupacion__detalle" aria-label={`Detalle de ${tituloMes}`}>
          {detalle.map((f) => (
            <li key={`${f.fecha}-${f.clase}-${f.texto}`} className={`ocupacion__fila ocupacion__fila--${f.clase}`}>
              <strong>{fechaLegible(f.fecha)}</strong>: {f.texto}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
