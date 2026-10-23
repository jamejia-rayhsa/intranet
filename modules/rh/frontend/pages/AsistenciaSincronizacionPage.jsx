import { useState, useEffect, useCallback, useRef } from "react";
import { estadoSincronizacion, lotesSincronizacion, mensajeDeError } from "../services/asistencia.service";
import { formatoLocal, instanteUtc, evaluarRetraso } from "../utils/asistenciaFechas";
import {
  INTERVALO_REFRESCO_MS,
  LOTES_POR_PAGINA,
  formatoEntero,
  porcentaje,
  infoEstatusLote,
  textoTotalMarcas,
} from "../utils/asistenciaSync";
import { textoRango } from "../utils/asistenciaMarcas";
import { OPCION_INGESTA } from "../utils/asistenciaPermisos";
import useAccesoAsistencia from "../hooks/useAccesoAsistencia";
import EstadoCarga from "../components/asistencia/EstadoCarga";
import Paginacion from "../components/asistencia/Paginacion";
import "../styles/asistencia.css";

function Tarjeta({ titulo, children, detalle }) {
  return (
    <div className="asi__tarjeta">
      <dt>{titulo}</dt>
      <dd>
        {children}
        {detalle && <small>{detalle}</small>}
      </dd>
    </div>
  );
}

const Hora = ({ valor }) =>
  valor ? <time dateTime={valor} title={`UTC ${instanteUtc(valor)}`}>{formatoLocal(valor)}</time> : "—";

export default function AsistenciaSincronizacionPage() {
  const nivel = useAccesoAsistencia(OPCION_INGESTA);
  const [estado, setEstado] = useState(null);
  const [errorEstado, setErrorEstado] = useState("");
  const [cargandoEstado, setCargandoEstado] = useState(true);
  const [lotes, setLotes] = useState({ lotes: [], total: 0, paginas_totales: 0 });
  const [errorLotes, setErrorLotes] = useState("");
  const [cargandoLotes, setCargandoLotes] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [actualizado, setActualizado] = useState("");
  const paginaRef = useRef(1);
  paginaRef.current = pagina;

  const cargarEstado = useCallback(async () => {
    try {
      const r = await estadoSincronizacion();
      setEstado(r.datos);
      setErrorEstado("");
      setActualizado(r.datos.ahora);
    } catch (err) {
      setErrorEstado(mensajeDeError(err, "No se pudo cargar el estado de la sincronización"));
    } finally {
      setCargandoEstado(false);
    }
  }, []);

  const cargarLotes = useCallback(async (p) => {
    try {
      const r = await lotesSincronizacion({ pagina: p, limite: LOTES_POR_PAGINA });
      setLotes(r.datos);
      setErrorLotes("");
    } catch (err) {
      setErrorLotes(mensajeDeError(err, "No se pudo cargar el historial de lotes"));
    } finally {
      setCargandoLotes(false);
    }
  }, []);

  const refrescar = useCallback(() => {
    cargarEstado();
    cargarLotes(paginaRef.current);
  }, [cargarEstado, cargarLotes]);

  // Carga inicial y al cambiar de página
  useEffect(() => {
    if (!nivel) return;
    setCargandoLotes(true);
    cargarLotes(pagina);
  }, [nivel, pagina, cargarLotes]);
  useEffect(() => {
    if (nivel) cargarEstado();
  }, [nivel, cargarEstado]);

  // Refresco automático cada 60 s (sin tocar el foco ni anunciar cada actualización)
  useEffect(() => {
    if (!nivel) return undefined;
    const t = setInterval(refrescar, INTERVALO_REFRESCO_MS);
    return () => clearInterval(t);
  }, [nivel, refrescar]);

  if (nivel === null) {
    return (
      <div className="asi">
        <h1>Sincronización</h1>
        <p className="asi__aviso asi__aviso--error" role="alert">No tienes permiso para consultar la sincronización de marcas.</p>
      </div>
    );
  }

  const ultimoLote = estado && estado.ultimo_lote;
  // El aviso se basa en la última COMUNICACIÓN de la interfaz (un día sin marcas solo consulta /estado y no envía lotes)
  const retraso = estado ? evaluarRetraso({ ahora: estado.ahora, ultimaComunicacion: estado.ultima_comunicacion }) : null;

  return (
    <div className="asi">
      <h1>Sincronización con BioTime</h1>
      <p className="asi__sub">
        La interfaz se comunica cada 15 minutos todos los días (07:00-20:00, hora de México). Esta pantalla se actualiza sola cada 60 segundos.
        {actualizado && <> Última actualización: <Hora valor={actualizado} /> (hora de México).</>}
      </p>
      <div className="asi__barra">
        <button type="button" className="asi__btn" onClick={refrescar}>Actualizar ahora</button>
      </div>

      <EstadoCarga cargando={cargandoEstado || nivel === undefined} error={errorEstado} onReintentar={cargarEstado} />

      {estado && retraso && (
        <div role="status" aria-live="polite">
          {retraso.estado === "retraso" && <p className="asi__aviso asi__aviso--advertencia"><span aria-hidden="true">⚠ </span>{retraso.texto}</p>}
          {retraso.estado === "ok" && <p className="asi__aviso asi__aviso--ok">{retraso.texto}</p>}
          {(retraso.estado === "fuera_de_horario" || retraso.estado === "sin_datos") && <p className="asi__aviso asi__aviso--info">{retraso.texto}</p>}
        </div>
      )}

      {estado && (
        <dl className="asi__tarjetas" aria-label="Estado de la sincronización">
          <Tarjeta titulo="Última comunicación de la interfaz" detalle="Cualquier petición con llave activa, aunque no envíe marcas">
            <Hora valor={estado.ultima_comunicacion} />
          </Tarjeta>
          <Tarjeta titulo="Último id externo (cursor)"><span className="asi__mono">{estado.ultimo_id_externo ?? "—"}</span></Tarjeta>
          <Tarjeta titulo="Última marca recibida"><Hora valor={estado.ultima_marca_ts} /></Tarjeta>
          <Tarjeta titulo="Última subida del checador"><Hora valor={estado.ultima_subida_ts} /></Tarjeta>
          <Tarjeta titulo="Último envío de marcas" detalle={ultimoLote ? `Estatus: ${infoEstatusLote(ultimoLote.estatus).texto}` : undefined}>
            <Hora valor={ultimoLote ? ultimoLote.fecha_recepcion : null} />
          </Tarjeta>
          <Tarjeta titulo="Último envío correcto"><Hora valor={estado.ultimo_exito || estado.ultimo_lote_ok} /></Tarjeta>
          <Tarjeta titulo="Último error">
            {estado.ultimo_error ? <span className="asi__badge asi__badge--error">{estado.ultimo_error}</span> : "Sin errores"}
          </Tarjeta>
          <Tarjeta
            titulo="Total de marcas"
            detalle={estado.total_marcas_estimado ? "Cifra estimada (se actualiza con el mantenimiento de la base)" : "Conteo exacto"}
          >
            {textoTotalMarcas(estado.total_marcas, estado.total_marcas_estimado)}
          </Tarjeta>
          <Tarjeta titulo="Marcas sin vincular" detalle={`${estado.total_marcas_estimado ? "≈ " : ""}${porcentaje(estado.marcas_sin_vincular, estado.total_marcas)} del total`}>
            {formatoEntero(estado.marcas_sin_vincular)}
          </Tarjeta>
        </dl>
      )}

      <h2>Historial de envíos</h2>
      <EstadoCarga
        cargando={cargandoLotes && lotes.lotes.length === 0}
        error={errorLotes}
        vacio={!cargandoLotes && !errorLotes && lotes.lotes.length === 0}
        textoVacio="Todavía no se ha recibido ningún envío."
        onReintentar={() => cargarLotes(pagina)}
      />
      {lotes.lotes.length > 0 && !errorLotes && (
        <>
          <div className="asi__tabla-caja" role="region" aria-label="Historial de lotes" tabIndex={0}>
            <table className="asi__tabla">
              <caption className="asi__sr">Lotes recibidos de la interfaz, del más reciente al más antiguo</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha (México)</th>
                  <th scope="col">Llave</th>
                  <th scope="col" className="asi__num">Recibidas</th>
                  <th scope="col" className="asi__num">Insertadas</th>
                  <th scope="col" className="asi__num">Duplicadas</th>
                  <th scope="col" className="asi__num">Rechazadas</th>
                  <th scope="col" className="asi__num">Sin empleado</th>
                  <th scope="col">Estatus</th>
                  <th scope="col">Error</th>
                </tr>
              </thead>
              <tbody>
                {lotes.lotes.map((l) => {
                  const info = infoEstatusLote(l.estatus);
                  return (
                    <tr key={l.id}>
                      <td className="asi__nowrap"><Hora valor={l.fecha_recepcion} /></td>
                      <td>{l.llave_nombre || "—"}{l.llave_prefijo && <span className="asi__sec asi__mono">{l.llave_prefijo}</span>}</td>
                      <td className="asi__num">{l.recibidas}</td>
                      <td className="asi__num">{l.insertadas}</td>
                      <td className="asi__num">{l.duplicadas}</td>
                      <td className="asi__num">{l.rechazadas}</td>
                      <td className="asi__num">{l.sin_empleado}</td>
                      <td><span className={`asi__badge ${info.clase}`}>{info.texto}</span></td>
                      <td>{l.error || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Paginacion
            pagina={pagina}
            paginasTotales={lotes.paginas_totales}
            texto={textoRango(pagina, LOTES_POR_PAGINA, lotes.lotes.length, lotes.total)}
            onCambiar={setPagina}
            deshabilitado={cargandoLotes}
          />
        </>
      )}
    </div>
  );
}
