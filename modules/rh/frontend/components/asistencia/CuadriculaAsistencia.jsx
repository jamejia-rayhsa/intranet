import { useEffect, useMemo, useRef, useState } from "react";
import { construirCuadricula, celdaSiguiente, fechaLargaCelda, infoEstatus, DIAS_SEMANA } from "../../utils/asistenciaResultados";

const CONSULTA_ESTRECHA = "(max-width: 600px)";

/** true cuando la cuadrícula se apila en una sola columna (pantallas estrechas) */
function useEstrecha() {
  const [estrecha, setEstrecha] = useState(() => typeof window !== "undefined" && window.matchMedia ? window.matchMedia(CONSULTA_ESTRECHA).matches : false);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(CONSULTA_ESTRECHA);
    const alCambiar = () => setEstrecha(mq.matches);
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);
  return estrecha;
}

/**
 * Cuadrícula (role=grid) de la quincena de un empleado: un día por celda con color + ícono + texto; fines de semana
 * y festivos distinguibles. Teclado: flechas, Inicio/Fin, Intro/Espacio abren el detalle. Foco itinerante (una sola
 * celda en el orden de tabulación).
 */
export default function CuadriculaAsistencia({ desde, hasta, dias, onAbrirDia, etiqueta, abrirSinCalculo = false, hoy = "" }) {
  const { celdas } = useMemo(() => construirCuadricula(desde, hasta, dias), [desde, hasta, dias]);
  const estrecha = useEstrecha();
  const columnas = estrecha ? 1 : 7;
  const primera = useMemo(() => celdas.findIndex((c) => !c.vacia), [celdas]);
  const [activa, setActiva] = useState(primera);
  const refs = useRef([]);
  const enfocar = useRef(false);

  useEffect(() => {
    setActiva(primera);
  }, [primera, desde, hasta]);
  useEffect(() => {
    if (enfocar.current && refs.current[activa]) {
      refs.current[activa].focus();
      enfocar.current = false;
    }
  }, [activa]);

  function alTecla(e, indice) {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const destino = celdaSiguiente(celdas, indice, e.key, columnas);
    if (destino !== indice) {
      enfocar.current = true;
      setActiva(destino);
    }
  }

  const filas = [];
  for (let i = 0; i < celdas.length; i += 7) filas.push(celdas.slice(i, i + 7));

  return (
    <div className="asr__cuad" role="grid" aria-label={etiqueta} aria-colcount={7}>
      <div className="asr__cuad-cab" role="row">
        {DIAS_SEMANA.map((d, i) => (
          <div key={d} role="columnheader" className={`asr__cuad-dia${i >= 5 ? " asr__cuad-dia--fin" : ""}`}>{d}</div>
        ))}
      </div>
      {filas.map((fila, f) => (
        <div key={fila[0].clave} className="asr__cuad-fila" role="row">
          {fila.map((c, k) => {
            const indice = f * 7 + k;
            if (c.vacia) return <div key={c.clave} role="gridcell" aria-hidden="true" className="asr__celda asr__celda--vacia" />;
            const porLlegar = !c.dia && hoy && c.fecha > hoy;
            const info = c.dia ? infoEstatus(c.dia.estatus) : { texto: porLlegar ? "Aún no llega" : "Sin cálculo", icono: "–", tono: "neutro" };
            const festivo = c.dia && c.dia.estatus === "festivo";
            return (
              <div key={c.clave} role="gridcell" className="asr__celda-caja">
                <button
                  type="button"
                  ref={(el) => { refs.current[indice] = el; }}
                  tabIndex={indice === activa ? 0 : -1}
                  className={`asr__celda asr__celda--${info.tono}${c.finDeSemana ? " asr__celda--fin" : ""}${festivo ? " asr__celda--festivo" : ""}${hoy && c.fecha === hoy ? " asr__celda--hoy" : ""}`}
                  onKeyDown={(e) => alTecla(e, indice)}
                  onFocus={() => setActiva(indice)}
                  aria-disabled={c.dia || abrirSinCalculo ? undefined : "true"}
                  onClick={() => (c.dia || abrirSinCalculo) && onAbrirDia(c.fecha)}
                >
                  <span className="asr__celda-fecha">
                    <span className="asr__celda-semana">{DIAS_SEMANA[c.diaSemana - 1]}</span> {Number(c.fecha.slice(8))}
                    {c.finDeSemana && <span className="asr__celda-nota"> · fin de semana</span>}
                    {hoy && c.fecha === hoy && <strong className="asr__celda-hoy"> · hoy</strong>}
                  </span>
                  <span className="asr__celda-estatus">
                    <span aria-hidden="true" className="asr__icono">{info.icono}</span> {info.texto}
                  </span>
                  {c.dia && Number(c.dia.minutos_retardo) > 0 && <span className="asr__celda-min">{c.dia.minutos_retardo} min</span>}
                  {/* el nombre accesible nace del contenido: el texto visible va primero y esto solo añade el día completo */}
                  <span className="asi__sr">, {fechaLargaCelda(c)}</span>
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
