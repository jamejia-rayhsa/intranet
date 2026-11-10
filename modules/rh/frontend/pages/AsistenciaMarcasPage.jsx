import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  consultarMarcas,
  codigosSinEmpleado,
  empleadosSinNomina,
  revincularMarcas,
  registrarExportacionMarcas,
  mensajeDeError,
} from "../services/asistencia.service";
import { fechaMexicoHoy, sumarDias, validarRango, partesLocales, formatoLocal, instanteUtc, MAX_RANGO_DIAS } from "../utils/asistenciaFechas";
import {
  FILTROS_INICIALES,
  LIMITE_PAGINA,
  LIMITE_PAGINA_CSV,
  TOPE_FILAS_CSV,
  parametrosMarcas,
  construirCsv,
  filaParaCsv,
  recolectarPorClave,
  nombreArchivoCsv,
  textoRango,
  textoResultadoRevincular,
} from "../utils/asistenciaMarcas";
import { OPCION_INGESTA } from "../utils/asistenciaPermisos";
import useAccesoAsistencia from "../hooks/useAccesoAsistencia";
import useFocoTitulo from "../hooks/useFocoTitulo";
import EstadoCarga from "../components/asistencia/EstadoCarga";
import Paginacion from "../components/asistencia/Paginacion";
import ConfirmarDialogo from "../components/asistencia/ConfirmarDialogo";
import "../styles/asistencia.css";

const convertir = (iso) => {
  const p = partesLocales(iso);
  return p ? { fecha: p.fecha, hora: p.hora, utc: instanteUtc(iso) } : null;
};

export default function AsistenciaMarcasPage() {
  const nivel = useAccesoAsistencia(OPCION_INGESTA);
  const { ref: tituloRef, enfocarSiPerdido } = useFocoTitulo();
  const puedeEditar = nivel === "edicion";
  const hoy = useMemo(() => fechaMexicoHoy(), []);
  const inicial = useMemo(() => ({ ...FILTROS_INICIALES, desde: sumarDias(hoy, -6), hasta: hoy }), [hoy]);

  const [filtros, setFiltros] = useState(inicial);
  const [aplicados, setAplicados] = useState(inicial);
  const [errorFiltros, setErrorFiltros] = useState("");
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ marcas: [], total: 0, paginas_totales: 0 });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState(false);
  const [avisoExport, setAvisoExport] = useState("");
  const solicitud = useRef(0);

  const [codigos, setCodigos] = useState(null);
  const [errorCodigos, setErrorCodigos] = useState("");
  const [sinNomina, setSinNomina] = useState(null);
  const [errorSinNomina, setErrorSinNomina] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [resultadoRevincular, setResultadoRevincular] = useState("");

  const cargarMarcas = useCallback(async () => {
    const mia = ++solicitud.current;
    setCargando(true);
    setError("");
    try {
      const r = await consultarMarcas(parametrosMarcas(aplicados, { pagina, limite: LIMITE_PAGINA }));
      if (mia !== solicitud.current) return;
      setDatos(r.datos);
    } catch (err) {
      if (mia !== solicitud.current) return;
      setDatos({ marcas: [], total: 0, paginas_totales: 0 });
      setError(mensajeDeError(err, "No se pudieron cargar las marcas"));
    } finally {
      if (mia === solicitud.current) setCargando(false);
    }
  }, [aplicados, pagina]);

  const cargarResumenes = useCallback(async () => {
    setErrorCodigos("");
    setErrorSinNomina("");
    try {
      const r = await codigosSinEmpleado();
      setCodigos(r.datos);
    } catch (err) {
      setCodigos(null);
      setErrorCodigos(mensajeDeError(err, "No se pudo cargar el resumen de códigos sin empleado"));
    }
    try {
      const r = await empleadosSinNomina();
      setSinNomina(r.datos);
    } catch (err) {
      setSinNomina(null);
      setErrorSinNomina(mensajeDeError(err, "No se pudo cargar la lista de empleados sin nómina"));
    }
  }, []);

  useEffect(() => {
    if (nivel) cargarMarcas();
  }, [nivel, cargarMarcas]);
  useEffect(() => {
    if (nivel) cargarResumenes();
  }, [nivel, cargarResumenes]);

  const cambiar = (campo) => (e) => setFiltros((previo) => ({ ...previo, [campo]: e.target.value }));

  function consultar(e) {
    e.preventDefault();
    const problema = validarRango(filtros.desde, filtros.hasta);
    setErrorFiltros(problema);
    if (problema) return;
    setAvisoExport("");
    setPagina(1);
    setAplicados({ ...filtros });
  }

  function limpiar() {
    setFiltros(inicial);
    setErrorFiltros("");
    setAvisoExport("");
    setPagina(1);
    setAplicados(inicial);
  }

  async function exportar() {
    if (exportando) return;
    setExportando(true);
    setAvisoExport("");
    try {
      // Paginación por clave (id descendente): las marcas que entran durante la exportación no repiten ni omiten filas
      const marcas = await recolectarPorClave(async (antesId) => {
        const r = await consultarMarcas(parametrosMarcas(aplicados, { limite: LIMITE_PAGINA_CSV, contar: false, porClave: true, antesId }));
        return r.datos.marcas || [];
      });
      const filas = marcas.map((m) => filaParaCsv(m, convertir));
      const csv = construirCsv(filas);
      const blob = new Blob([csv.texto], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreArchivoCsv(aplicados.desde, aplicados.hasta);
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      // Rastro en la bitácora: solo el número de filas exportadas (sin datos personales)
      let sinAuditoria = "";
      try {
        await registrarExportacionMarcas(csv.filas);
      } catch (err) {
        sinAuditoria = ` No se pudo registrar la exportación en la bitácora: ${mensajeDeError(err, "error desconocido")}`;
      }
      setAvisoExport(
        (csv.truncado
          ? `Se exportaron las primeras ${csv.filas} marcas (tope de ${TOPE_FILAS_CSV}). Acota el rango o los filtros para obtener el resto.`
          : `Se exportaron ${csv.filas} ${csv.filas === 1 ? "marca" : "marcas"} a ${nombreArchivoCsv(aplicados.desde, aplicados.hasta)}.`) + sinAuditoria,
      );
    } catch (err) {
      setAvisoExport(`No se pudo exportar: ${mensajeDeError(err, "error desconocido")}`);
    } finally {
      setExportando(false);
    }
  }

  async function revincular() {
    const r = await revincularMarcas();
    setConfirmando(false);
    setResultadoRevincular(textoResultadoRevincular(r.datos));
    await Promise.all([cargarResumenes(), cargarMarcas()]);
    enfocarSiPerdido();
  }

  if (nivel === null) {
    return (
      <div className="asi">
        <h1 ref={tituloRef} tabIndex={-1}>Marcas</h1>
        <p className="asi__aviso asi__aviso--error" role="alert">No tienes permiso para consultar las marcas de asistencia.</p>
      </div>
    );
  }

  const enPagina = datos.marcas.length;

  return (
    <div className="asi">
      <h1 ref={tituloRef} tabIndex={-1}>Marcas del checador</h1>
      <p className="asi__sub">
        Marcas recibidas de la interfaz con BioTime. Las horas se muestran en hora de México; pasa el cursor sobre una hora para ver el instante UTC.
        Consulta de hasta {MAX_RANGO_DIAS} días.
      </p>

      {sinNomina && sinNomina.total > 0 && (
        <div className="asi__aviso asi__aviso--advertencia" role="region" aria-label="Empleados sin número de nómina">
          <div>
            <p>
              {sinNomina.total} {sinNomina.total === 1 ? "empleado activo no tiene" : "empleados activos no tienen"} número de nómina: sus marcas no se pueden vincular.
            </p>
            <details>
              <summary>Ver {sinNomina.empleados.length === sinNomina.total ? "la lista" : `los primeros ${sinNomina.empleados.length}`}</summary>
              <ul className="asi__lista">
                {sinNomina.empleados.map((e) => (
                  <li key={e.id}>{e.nombre}{e.departamento ? ` · ${e.departamento}` : ""}</li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      )}
      {errorSinNomina && <p className="asi__aviso asi__aviso--error" role="alert">{errorSinNomina}</p>}

      <form className="asi__barra" onSubmit={consultar} aria-label="Filtros de marcas" noValidate>
        <div className="asi__campo">
          <label htmlFor="marcas-desde">Desde</label>
          <input id="marcas-desde" type="date" value={filtros.desde} onChange={cambiar("desde")} required aria-invalid={errorFiltros ? "true" : undefined} aria-describedby={errorFiltros ? "marcas-error-filtros" : undefined} />
        </div>
        <div className="asi__campo">
          <label htmlFor="marcas-hasta">Hasta</label>
          <input id="marcas-hasta" type="date" value={filtros.hasta} onChange={cambiar("hasta")} required aria-invalid={errorFiltros ? "true" : undefined} />
        </div>
        <div className="asi__campo">
          <label htmlFor="marcas-buscar">Empleado (nombre, nómina o código)</label>
          <input id="marcas-buscar" type="text" value={filtros.buscar} maxLength={100} onChange={cambiar("buscar")} />
        </div>
        <div className="asi__campo">
          <label htmlFor="marcas-terminal">Terminal (alias o serie)</label>
          <input id="marcas-terminal" type="text" value={filtros.terminal} maxLength={100} onChange={cambiar("terminal")} />
        </div>
        <div className="asi__campo">
          <label htmlFor="marcas-vinc">Vinculación</label>
          <select id="marcas-vinc" value={filtros.vinculadas} onChange={cambiar("vinculadas")}>
            <option value="todas">Todas</option>
            <option value="si">Solo vinculadas</option>
            <option value="no">Solo sin vincular</option>
          </select>
        </div>
        <button type="submit" className="asi__btn asi__btn--primario">Consultar</button>
        <button type="button" className="asi__btn" onClick={limpiar}>Limpiar</button>
        <span className="asi__barra-espacio" />
        <button type="button" className="asi__btn" onClick={exportar} disabled={exportando || cargando || enPagina === 0}>
          {exportando ? "Exportando…" : "Exportar a CSV"}
        </button>
      </form>
      {errorFiltros && <p id="marcas-error-filtros" className="asi__aviso asi__aviso--error" role="alert">{errorFiltros}</p>}
      <div role="status" aria-live="polite">
        {avisoExport && <p className="asi__aviso asi__aviso--info">{avisoExport}</p>}
      </div>

      <EstadoCarga
        cargando={cargando || nivel === undefined}
        error={error}
        vacio={!cargando && !error && enPagina === 0}
        textoVacio="No hay marcas con estos filtros en el rango indicado."
        onReintentar={cargarMarcas}
      />
      {!cargando && !error && enPagina > 0 && (
        <>
          <div className="asi__tabla-caja" role="region" aria-label="Marcas" tabIndex={0}>
            <table className="asi__tabla">
              <caption className="asi__sr">Marcas del checador en hora de México</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha y hora (México)</th>
                  <th scope="col">Código</th>
                  <th scope="col">Empleado vinculado</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Verificación</th>
                  <th scope="col">Terminal</th>
                </tr>
              </thead>
              <tbody>
                {datos.marcas.map((m) => (
                  <tr key={m.id}>
                    <td className="asi__nowrap">
                      <time dateTime={m.marca_ts} title={`UTC ${instanteUtc(m.marca_ts)}`} className="asi__rotulo-hora">{formatoLocal(m.marca_ts)}</time>
                      <span className="asi__sr"> (UTC {instanteUtc(m.marca_ts)})</span>
                    </td>
                    <td className="asi__mono">{m.codigo_empleado}</td>
                    <td>{m.empleado_id ? m.empleado_nombre : <span className="asi__badge asi__badge--aviso">Sin empleado</span>}</td>
                    <td>{m.estado_marca ?? "—"}</td>
                    <td>{m.tipo_verificacion ?? "—"}</td>
                    <td>
                      {m.terminal_alias || "—"}
                      {m.terminal_sn && <span className="asi__sec asi__mono">{m.terminal_sn}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion
            pagina={pagina}
            paginasTotales={datos.paginas_totales}
            texto={textoRango(pagina, LIMITE_PAGINA, enPagina, datos.total)}
            onCambiar={setPagina}
            deshabilitado={cargando}
          />
        </>
      )}

      <h2>Códigos sin empleado</h2>
      <p className="asi__sub">
        Códigos del checador que no coinciden con el número de nómina de un solo empleado vigente. Si el empleado se da de alta o se corrige su nómina,
        usa «Re-vincular marcas».
      </p>
      {errorCodigos && <p className="asi__aviso asi__aviso--error" role="alert">{errorCodigos}</p>}
      <div role="status" aria-live="polite">
        {resultadoRevincular && <p className="asi__aviso asi__aviso--ok">{resultadoRevincular}</p>}
      </div>
      {codigos && (
        <>
          <div className="asi__barra">
            <p style={{ margin: 0 }}>
              {codigos.total_codigos} {codigos.total_codigos === 1 ? "código" : "códigos"} con {codigos.total_marcas} {codigos.total_marcas === 1 ? "marca" : "marcas"} sin empleado.
            </p>
            <span className="asi__barra-espacio" />
            {puedeEditar && (
              <button type="button" className="asi__btn asi__btn--primario" onClick={() => { setResultadoRevincular(""); setConfirmando(true); }} disabled={codigos.total_marcas === 0}>
                Re-vincular marcas
              </button>
            )}
          </div>
          {codigos.codigos.length === 0 ? (
            <p className="asi__estado">Todas las marcas están vinculadas a un empleado.</p>
          ) : (
            <div className="asi__tabla-caja" role="region" aria-label="Códigos sin empleado" tabIndex={0}>
              <table className="asi__tabla">
                <caption className="asi__sr">Resumen de marcas sin empleado por código</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col" className="asi__num">Marcas</th>
                    <th scope="col">Primera</th>
                    <th scope="col">Última</th>
                    <th scope="col">¿Marcó en los últimos 14 días?</th>
                    <th scope="col">Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {codigos.codigos.map((c) => (
                    <tr key={c.codigo}>
                      <th scope="row" className="asi__mono">{c.codigo}</th>
                      <td className="asi__num">{c.marcas}</td>
                      <td className="asi__nowrap">{formatoLocal(c.primera)}</td>
                      <td className="asi__nowrap">{formatoLocal(c.ultima)}</td>
                      <td>{c.reciente ? <span className="asi__badge asi__badge--aviso">Sí</span> : <span className="asi__badge asi__badge--neutro">No</span>}</td>
                      <td>{c.hay_empleado_con_codigo ? "Hay un empleado con esa nómina, pero no vigente en la fecha de la marca o está duplicada." : "Ningún empleado tiene esa nómina."}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {codigos.total_codigos > codigos.codigos.length && (
            <p className="asi__ayuda">Se muestran los {codigos.codigos.length} códigos con más marcas de {codigos.total_codigos}.</p>
          )}
        </>
      )}

      {confirmando && (
        <ConfirmarDialogo
          titulo="Re-vincular marcas"
          textoConfirmar="Re-vincular marcas"
          onConfirmar={revincular}
          onCancelar={() => setConfirmando(false)}
        >
          <p>Se buscará un empleado para las marcas sin vincular usando su número de nómina y su periodo de empleo. Solo se completa el empleado; la marca original no cambia.</p>
          <p className="asi__ayuda">La acción procesa hasta 5 000 marcas por ejecución; si quedan pendientes puedes repetirla.</p>
        </ConfirmarDialogo>
      )}
    </div>
  );
}
