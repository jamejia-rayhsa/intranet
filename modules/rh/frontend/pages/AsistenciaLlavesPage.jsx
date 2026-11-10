import { useState, useEffect, useCallback } from "react";
import { listarLlaves, revocarLlave, mensajeDeError } from "../services/asistencia.service";
import { formatoLocal, instanteUtc } from "../utils/asistenciaFechas";
import {
  URL_INGESTA_TEXTO,
  ENCABEZADO_LLAVE,
  LONGITUD_LLAVE,
  etiquetaEstadoLlave,
  estaEnSolape,
  puedeRotar,
  puedeRevocar,
  puedeEditarIps,
  textoIps,
} from "../utils/asistenciaLlaves";
import { OPCION_INGESTA } from "../utils/asistenciaPermisos";
import useAccesoAsistencia from "../hooks/useAccesoAsistencia";
import useFocoTitulo from "../hooks/useFocoTitulo";
import EstadoCarga from "../components/asistencia/EstadoCarga";
import ConfirmarDialogo from "../components/asistencia/ConfirmarDialogo";
import LlaveSecretoDialogo from "../components/asistencia/LlaveSecretoDialogo";
import { CrearLlaveDialogo, RotarLlaveDialogo, EditarIpsDialogo } from "../components/asistencia/LlavesDialogos";
import "../styles/asistencia.css";

const CLASE_ESTADO = { activa: "asi__badge--ok", vencida: "asi__badge--neutro", pendiente: "asi__badge--aviso", revocada: "asi__badge--error" };

const Hora = ({ valor }) =>
  valor ? <time dateTime={valor} title={`UTC ${instanteUtc(valor)}`}>{formatoLocal(valor)}</time> : "—";

export default function AsistenciaLlavesPage() {
  const nivel = useAccesoAsistencia(OPCION_INGESTA);
  const { ref: tituloRef, enfocarSiPerdido } = useFocoTitulo();
  const puedeEditar = nivel === "edicion";
  const [llaves, setLlaves] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [dialogo, setDialogo] = useState(null); // { tipo: 'crear'|'rotar'|'revocar'|'ips', llave }
  const [secreto, setSecreto] = useState(null); // { llave, titulo, detalle } — SOLO mientras el diálogo está abierto

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await listarLlaves();
      setLlaves(r.datos || []);
    } catch (err) {
      setLlaves([]);
      setError(mensajeDeError(err, "No se pudieron cargar las llaves"));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (nivel) cargar();
  }, [nivel, cargar]);

  async function alCrear({ llave, fila, avisoIps }) {
    setDialogo(null);
    setSecreto({
      llave,
      titulo: `Llave creada: ${fila.nombre}`,
      detalle: avisoIps ? `Atención: ${avisoIps}` : "Configura esta llave en la interfaz (cabecera X-Api-Key) y ya podrá enviar marcas.",
    });
    setMensaje(`Llave «${fila.nombre}» creada (${fila.prefijo}).`);
    await cargar();
  }

  async function alRotar({ llave, fila, anterior, solape }) {
    setDialogo(null);
    setSecreto({
      llave,
      titulo: `Llave rotada: ${fila.nombre}`,
      detalle: anterior
        ? `La llave anterior (${anterior.prefijo}) seguirá válida ${solape === 0 ? "hasta este momento" : `hasta ${formatoLocal(anterior.vigente_hasta)} (hora de México)`}.`
        : "",
    });
    setMensaje(`Llave rotada: la nueva es ${fila.prefijo}.`);
    await cargar();
  }

  async function alCerrarSecreto() {
    setSecreto(null); // desmonta el diálogo: la llave deja de existir en el DOM y en el estado
    enfocarSiPerdido();
  }

  async function revocar() {
    const { llave } = dialogo;
    await revocarLlave(llave.id);
    setDialogo(null);
    setMensaje(`Llave ${llave.prefijo} revocada: ya no puede enviar marcas.`);
    await cargar();
    enfocarSiPerdido();
  }

  async function alEditarIps(texto) {
    setDialogo(null);
    setMensaje(texto);
    await cargar();
    enfocarSiPerdido();
  }

  if (nivel === null) {
    return (
      <div className="asi">
        <h1 ref={tituloRef} tabIndex={-1}>Llaves de ingesta</h1>
        <p className="asi__aviso asi__aviso--error" role="alert">No tienes permiso para ver las llaves de ingesta.</p>
      </div>
    );
  }

  return (
    <div className="asi">
      <h1 ref={tituloRef} tabIndex={-1}>Llaves de la ingesta de marcas</h1>
      <p className="asi__sub">La interfaz con BioTime se identifica con una llave. Aquí se crean, rotan y revocan; la llave completa solo se muestra al crearla o rotarla.</p>

      <section className="asi__bloque" aria-labelledby="llaves-como">
        <h2 id="llaves-como" style={{ marginTop: 0 }}>Cómo se usa</h2>
        <ul className="asi__lista">
          <li>Formato: <span className="asi__mono">rhk_&lt;8 hex&gt;_&lt;43 caracteres&gt;</span>, {LONGITUD_LLAVE} caracteres en total; los primeros 12 (rhk_ y 8 hex) son el prefijo visible en la tabla.</li>
          <li>La interfaz envía las marcas por POST a <span className="asi__mono">{URL_INGESTA_TEXTO}</span> (red interna).</li>
          <li>Debe incluir la cabecera <span className="asi__mono">{ENCABEZADO_LLAVE}</span> con la llave completa en cada petición.</li>
          <li>Restringe cada llave a la IP de la interfaz. Revocar o cambiar las IP surte efecto en el siguiente envío.</li>
        </ul>
      </section>

      <div className="asi__barra">
        {puedeEditar && (
          <button type="button" className="asi__btn asi__btn--primario" onClick={() => { setMensaje(""); setDialogo({ tipo: "crear" }); }}>
            Nueva llave
          </button>
        )}
        <button type="button" className="asi__btn" onClick={cargar} disabled={cargando}>Actualizar</button>
      </div>

      <div role="status" aria-live="polite">
        {mensaje && <p className="asi__aviso asi__aviso--ok">{mensaje}</p>}
      </div>

      <EstadoCarga
        cargando={cargando || nivel === undefined}
        error={error}
        vacio={!cargando && !error && llaves.length === 0}
        textoVacio="Todavía no hay llaves. Crea una con «Nueva llave»."
        onReintentar={cargar}
      />

      {!cargando && !error && llaves.length > 0 && (
        <div className="asi__tabla-caja" role="region" aria-label="Llaves de ingesta" tabIndex={0}>
          <table className="asi__tabla">
            <caption className="asi__sr">Llaves de la ingesta de marcas</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Prefijo</th>
                <th scope="col">Estado</th>
                <th scope="col">Vigencia (México)</th>
                <th scope="col">IP permitidas</th>
                <th scope="col">Último uso</th>
                {puedeEditar && <th scope="col">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {llaves.map((l) => (
                <tr key={l.id}>
                  <th scope="row">{l.nombre}</th>
                  <td className="asi__mono">{l.prefijo}</td>
                  <td>
                    <span className={`asi__badge ${CLASE_ESTADO[l.estado_efectivo] || "asi__badge--neutro"}`}>{etiquetaEstadoLlave(l)}</span>
                    {estaEnSolape(l) && <span className="asi__sec">Termina pronto (rotada o con vencimiento)</span>}
                  </td>
                  <td>
                    Desde <Hora valor={l.vigente_desde} />
                    <span className="asi__sec">{l.vigente_hasta ? <>Hasta <Hora valor={l.vigente_hasta} /></> : "Sin vencimiento"}</span>
                  </td>
                  <td>
                    {l.ips_permitidas && l.ips_permitidas.length ? (
                      <span className="asi__mono">{textoIps(l)}</span>
                    ) : (
                      <span className="asi__badge asi__badge--aviso">Sin restricción</span>
                    )}
                  </td>
                  <td>
                    <Hora valor={l.ultimo_uso} />
                    {l.ultima_ip && <span className="asi__sec asi__mono">IP {l.ultima_ip}</span>}
                  </td>
                  {puedeEditar && (
                    <td>
                      <div className="asi__acciones-celda">
                        {puedeEditarIps(l) && (
                          <button type="button" className="asi__btn asi__btn--chico" onClick={() => { setMensaje(""); setDialogo({ tipo: "ips", llave: l }); }} aria-label={`Editar IP de la llave ${l.prefijo}`}>Editar IP</button>
                        )}
                        {puedeRotar(l) && (
                          <button type="button" className="asi__btn asi__btn--chico" onClick={() => { setMensaje(""); setDialogo({ tipo: "rotar", llave: l }); }} aria-label={`Rotar la llave ${l.prefijo}`}>Rotar</button>
                        )}
                        {puedeRevocar(l) && (
                          <button type="button" className="asi__btn asi__btn--chico asi__btn--peligro" onClick={() => { setMensaje(""); setDialogo({ tipo: "revocar", llave: l }); }} aria-label={`Revocar la llave ${l.prefijo}`}>Revocar</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialogo && dialogo.tipo === "crear" && <CrearLlaveDialogo onCerrar={() => setDialogo(null)} onCreada={alCrear} onRespuestaPerdida={cargar} />}
      {dialogo && dialogo.tipo === "rotar" && <RotarLlaveDialogo llave={dialogo.llave} onCerrar={() => setDialogo(null)} onRotada={alRotar} onRespuestaPerdida={cargar} />}
      {dialogo && dialogo.tipo === "ips" && <EditarIpsDialogo llave={dialogo.llave} onCerrar={() => setDialogo(null)} onGuardado={alEditarIps} />}
      {dialogo && dialogo.tipo === "revocar" && (
        <ConfirmarDialogo titulo="Revocar llave" textoConfirmar="Revocar llave" peligro onConfirmar={revocar} onCancelar={() => setDialogo(null)}>
          <p>¿Revocar la llave «{dialogo.llave.nombre}» ({dialogo.llave.prefijo})? Dejará de funcionar de inmediato y no se puede deshacer.</p>
          <p className="asi__ayuda">Si la interfaz aún la usa, dejará de enviar marcas hasta que se configure otra llave.</p>
        </ConfirmarDialogo>
      )}
      {secreto && <LlaveSecretoDialogo llave={secreto.llave} titulo={secreto.titulo} detalle={secreto.detalle} onCerrar={alCerrarSecreto} />}
    </div>
  );
}
