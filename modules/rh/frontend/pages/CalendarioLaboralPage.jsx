import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usarAuth } from "../../../portal/frontend/context/AuthContext";
import { listarCalendario, obtenerMisPermisos } from "../services/calendario.service";
import ModalFechaCalendario from "../components/ModalFechaCalendario";
import {
  TIPOS_CALENDARIO,
  NOMBRES_MESES,
  DIAS_SEMANA,
  infoTipo,
  construirCuadricula,
  rangoCuadricula,
  agruparPorFecha,
  itemsDelMes,
  fechaHoy,
  fechaLegible,
  fechaConDiaSemana,
  mesAnterior,
  mesSiguiente,
  mesDeFecha,
  aniosSelector,
  destinoTecla,
  formatearISO,
  puedeEditarCalendario,
  filtrarVisibles,
  accionClicDia,
  resolverListado,
  mensajeErrorRed,
  etiquetaDia,
  MENSAJE_ERROR_PERMISOS,
  MENSAJE_ERROR_LISTADO,
} from "../utils/calendarioLaboral";
import "../styles/calendario.css";

// Constantes de estilo — patrón VacacionesPage (fuera del componente); lo demás vive en calendario.css
const estiloEncabezado = { fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" };
const estiloSubtitulo = { color: "var(--color-texto-medio)", marginBottom: "1rem", fontSize: "0.9rem" };
const estiloPanelDia = {
  margin: "1rem 0",
  padding: "1rem",
  background: "var(--color-superficie)",
  border: "1px solid var(--color-borde)",
  borderRadius: "0.75rem",
};
const estiloVacio = { color: "var(--color-texto-medio)", padding: "0.75rem 0" };

const AYUDA =
  "Los días oficiales de ley y los descansos otorgados no descuentan del saldo de vacaciones. " +
  "Los eventos son informativos: no descuentan ni bloquean.";

function Marca({ item }) {
  const tipo = infoTipo(item.tipo);
  return (
    <span
      className={`calendario__marca calendario__marca--${item.tipo}${item.activo === false ? " calendario__marca--inactiva" : ""}`}
    >
      <span aria-hidden="true">{tipo.icono}</span>{" "}
      <span className="calendario__marca-texto">{item.nombre}</span>
    </span>
  );
}

function Chip({ tipo }) {
  const info = infoTipo(tipo);
  return (
    <span className={`calendario__chip calendario__chip--${tipo}`}>
      <span aria-hidden="true">{info.icono}</span> {info.etiqueta}
    </span>
  );
}

export default function CalendarioLaboralPage() {
  const { usuario } = usarAuth();
  const hoy = fechaHoy();
  const inicial = mesDeFecha(hoy);

  const [anio, setAnio] = useState(inicial.anio);
  const [mes, setMes] = useState(inicial.mes);
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [permisos, setPermisos] = useState(null);
  const [fechaFoco, setFechaFoco] = useState(hoy);
  const [modal, setModal] = useState(null); // { item, fecha }
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [errorPermisos, setErrorPermisos] = useState("");
  const [version, setVersion] = useState(0);
  const moverFoco = useRef(false);
  const rejillaRef = useRef(null);
  const tituloListaRef = useRef(null);
  const enfocarTrasGuardar = useRef(false);

  const puedeEditar = useMemo(() => puedeEditarCalendario(usuario, permisos), [usuario, permisos]);

  useEffect(() => {
    let activo = true;
    obtenerMisPermisos()
      .then((r) => {
        if (!activo) return;
        if (r && r.exito) setPermisos(r.datos);
        else setErrorPermisos(MENSAJE_ERROR_PERMISOS);
      })
      .catch(() => { if (activo) { setPermisos([]); setErrorPermisos(MENSAJE_ERROR_PERMISOS); } });
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    let activo = true;
    const { desde, hasta } = rangoCuadricula(anio, mes);
    setCargando(true);
    setErrorCarga("");
    listarCalendario({ desde, hasta })
      .then((r) => {
        if (!activo) return;
        const { items: lista, error } = resolverListado(r);
        setItems(lista);
        setErrorCarga(error);
      })
      .catch((err) => { if (activo) { setItems([]); setErrorCarga(mensajeErrorRed(err, MENSAJE_ERROR_LISTADO)); } })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [anio, mes, version]);

  // Tras guardar o eliminar, el botón que abrió el modal puede desaparecer (baja, panel cerrado):
  // si el foco quedó en <body>, pasa al título de la lista (elemento estable).
  useEffect(() => {
    if (cargando || !enfocarTrasGuardar.current) return;
    enfocarTrasGuardar.current = false;
    const activoEl = document.activeElement;
    if ((!activoEl || activoEl === document.body) && tituloListaRef.current) tituloListaRef.current.focus();
  }, [cargando]);

  // Tras navegar con el teclado, el foco sigue a la fecha activa (cuando el mes ya se dibujó)
  useEffect(() => {
    if (!moverFoco.current || !rejillaRef.current) return;
    const boton = rejillaRef.current.querySelector(`[data-fecha="${fechaFoco}"]`);
    if (boton) {
      boton.focus();
      moverFoco.current = false;
    }
  }, [fechaFoco, anio, mes]);

  const semanas = useMemo(() => construirCuadricula(anio, mes), [anio, mes]);
  const visibles = useMemo(() => filtrarVisibles(items, puedeEditar), [items, puedeEditar]);
  const porFecha = useMemo(() => agruparPorFecha(visibles), [visibles]);
  const delMes = useMemo(() => itemsDelMes(visibles, anio, mes), [visibles, anio, mes]);
  const anios = useMemo(() => aniosSelector(anio, mesDeFecha(hoy).anio), [anio, hoy]);

  // Fecha por omisión del mes mostrado: hoy si cae en él, si no el día 1
  const fechaBase = useMemo(() => {
    const prefijo = formatearISO(anio, mes, 1).slice(0, 8);
    return hoy.startsWith(prefijo) ? hoy : `${prefijo}01`;
  }, [anio, mes, hoy]);

  // La celda enfocable (roving tabindex) debe existir en el mes mostrado
  const fechaTab = useMemo(
    () => (semanas.some((s) => s.some((c) => c.fecha === fechaFoco)) ? fechaFoco : fechaBase),
    [semanas, fechaFoco, fechaBase],
  );

  function irAMes(destino, fechaDestino) {
    setAnio(destino.anio);
    setMes(destino.mes);
    setDiaSeleccionado(null);
    setFechaFoco(fechaDestino || formatearISO(destino.anio, destino.mes, 1));
  }

  function irAHoy() {
    const m = mesDeFecha(hoy);
    irAMes(m, hoy);
  }

  function alTecla(e, celda) {
    const destino = destinoTecla(celda.fecha, e.key);
    if (!destino) return;
    e.preventDefault();
    moverFoco.current = true;
    setFechaFoco(destino);
    const m = mesDeFecha(destino);
    if (m.anio !== anio || m.mes !== mes) irAMes(m, destino);
  }

  function alClicDia(celda) {
    setFechaFoco(celda.fecha);
    if (!puedeEditar) return;
    const accion = accionClicDia(porFecha[celda.fecha] || [], puedeEditar);
    if (accion === "alta") {
      setDiaSeleccionado(null);
      setModal({ item: null, fecha: celda.fecha });
    } else if (accion === "panel") {
      setDiaSeleccionado(celda.fecha);
    }
  }

  const cerrarModal = useCallback(() => setModal(null), []);

  function alGuardar(texto) {
    enfocarTrasGuardar.current = true;
    setModal(null);
    setMensaje(texto);
    setDiaSeleccionado(null);
    setVersion((v) => v + 1);
  }

  const tituloMes = `${NOMBRES_MESES[mes - 1]} de ${anio}`;
  const elementosDia = diaSeleccionado ? porFecha[diaSeleccionado] || [] : [];

  return (
    <div className={`calendario${puedeEditar ? " calendario--editable" : ""}`}>
      <h1 style={estiloEncabezado}>Calendario laboral</h1>
      <p style={estiloSubtitulo}>Días oficiales de ley, descansos otorgados y eventos de la empresa.</p>
      <p className="calendario__aviso calendario__aviso--ayuda">{AYUDA}</p>

      <div className="calendario__barra">
        <button type="button" className="calendario__boton" onClick={() => irAMes(mesAnterior(anio, mes))} aria-label="Mes anterior">
          ‹ Anterior
        </button>
        <button type="button" className="calendario__boton" onClick={() => irAMes(mesSiguiente(anio, mes))} aria-label="Mes siguiente">
          Siguiente ›
        </button>
        <button type="button" className="calendario__boton" onClick={irAHoy}>Hoy</button>
        <h2 className="calendario__titulo-mes" aria-live="polite">{tituloMes}</h2>
        <label htmlFor="cal-anio" className="sr-only-cal">Año</label>
        <select
          id="cal-anio"
          className="calendario__select"
          value={anio}
          onChange={(e) => irAMes({ anio: Number(e.target.value), mes })}
        >
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {puedeEditar && (
          <button
            type="button"
            className="calendario__boton calendario__boton--primario"
            onClick={() => setModal({ item: null, fecha: fechaBase })}
          >
            Agregar fecha
          </button>
        )}
      </div>

      <div role="status" aria-live="polite">
        {mensaje && <p className="calendario__aviso calendario__aviso--ok">{mensaje}</p>}
        {errorPermisos && <p className="calendario__aviso calendario__aviso--error" role="alert">{errorPermisos}</p>}
        {errorCarga && <p className="calendario__aviso calendario__aviso--error" role="alert">{errorCarga}</p>}
        {cargando && <p style={estiloVacio}>Cargando calendario...</p>}
      </div>

      <div
        className="calendario__rejilla"
        role="grid"
        aria-label={`Calendario de ${tituloMes}`}
        aria-busy={cargando}
        ref={rejillaRef}
      >
        <div className="calendario__semana" role="row">
          {DIAS_SEMANA.map((d) => (
            <div key={d.corto} className="calendario__encabezado" role="columnheader" aria-label={d.largo}>
              {d.corto}
            </div>
          ))}
        </div>
        {semanas.map((semana) => (
          <div className="calendario__semana" role="row" key={semana[0].fecha}>
            {semana.map((celda) => {
              const delDia = porFecha[celda.fecha] || [];
              const clases = ["calendario__celda"];
              if (celda.finDeSemana) clases.push("calendario__celda--finde");
              if (!celda.delMes) clases.push("calendario__celda--otro-mes");
              return (
                <div className={clases.join(" ")} role="gridcell" key={celda.fecha} aria-selected={diaSeleccionado === celda.fecha}>
                  <button
                    type="button"
                    className="calendario__dia"
                    data-fecha={celda.fecha}
                    tabIndex={celda.fecha === fechaTab ? 0 : -1}
                    aria-label={etiquetaDia(celda.fecha, delDia)}
                    aria-current={celda.fecha === hoy ? "date" : undefined}
                    onClick={() => alClicDia(celda)}
                    onFocus={() => setFechaFoco(celda.fecha)}
                    onKeyDown={(e) => alTecla(e, celda)}
                  >
                    <span className={`calendario__num${celda.fecha === hoy ? " calendario__num--hoy" : ""}`}>{celda.dia}</span>
                    {delDia.map((i) => <Marca key={i.id} item={i} />)}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {diaSeleccionado && puedeEditar && (
        <section style={estiloPanelDia} aria-label={`Fechas del ${fechaLegible(diaSeleccionado)}`}>
          <strong>{fechaConDiaSemana(diaSeleccionado)}</strong>
          <ul className="calendario__lista">
            {elementosDia.map((i) => (
              <li key={i.id} className="calendario__item calendario__item--panel">
                <span><Chip tipo={i.tipo} /> {i.nombre}</span>
                <button type="button" className="calendario__boton" onClick={() => setModal({ item: i, fecha: i.fecha })}>
                  Editar
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="calendario__boton" onClick={() => setModal({ item: null, fecha: diaSeleccionado })}>
            Agregar otra en esta fecha
          </button>
        </section>
      )}

      <ul className="calendario__leyenda" aria-label="Leyenda de tipos">
        {TIPOS_CALENDARIO.map((t) => <li key={t.valor}><Chip tipo={t.valor} /></li>)}
      </ul>

      <h2 className="calendario__lista-titulo" tabIndex={-1} ref={tituloListaRef}>Fechas de {tituloMes}</h2>
      {!cargando && delMes.length === 0 ? (
        <p style={estiloVacio}>No hay fechas registradas en este mes.</p>
      ) : (
        <div className="calendario__lista-caja">
        <ul className="calendario__lista">
          {delMes.map((i) => (
            <li key={i.id} className="calendario__item">
              <span>{fechaConDiaSemana(i.fecha)}</span>
              <span><Chip tipo={i.tipo} />{i.activo === false && " (inactivo)"}</span>
              <span>
                <strong>{i.nombre}</strong>
                {i.descripcion && <span className="calendario__item-desc"> — {i.descripcion}</span>}
                {puedeEditar && (
                  <>
                    {" "}
                    <button type="button" className="calendario__boton" onClick={() => setModal({ item: i, fecha: i.fecha })}>
                      Editar
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        </div>
      )}

      {modal && (
        <ModalFechaCalendario
          item={modal.item}
          fechaInicial={modal.fecha}
          onCerrar={cerrarModal}
          onGuardado={alGuardar}
        />
      )}
    </div>
  );
}
