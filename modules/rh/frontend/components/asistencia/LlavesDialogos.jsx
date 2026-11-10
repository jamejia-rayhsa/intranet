import { useState, useId } from "react";
import DialogoAsistencia from "./DialogoAsistencia";
import { crearLlave, rotarLlave, editarIpsLlave } from "../../services/asistencia.service";
import { parsearIps, validarAltaLlave, validarEdicionIps, esErrorSinRespuesta, MENSAJE_RESPUESTA_PERDIDA, MAX_IPS } from "../../utils/asistenciaLlaves";
import { finDeDiaMexicoISO } from "../../utils/asistenciaFechas";

const textoDeIps = (lista) => (lista || []).join("\n");

/** Alta de llave. Al terminar entrega la llave en claro a `onCreada` (que la muestra una sola vez). */
export function CrearLlaveDialogo({ onCerrar, onCreada, onRespuestaPerdida }) {
  const id = useId();
  const [nombre, setNombre] = useState("");
  const [ipsTexto, setIpsTexto] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const [sinIps, setSinIps] = useState(false);
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const ips = parsearIps(ipsTexto);

  async function enviar(e) {
    e.preventDefault();
    if (guardando) return;
    setErrorServidor("");
    const nuevos = validarAltaLlave({ nombre, ips, vencimiento, permitirSinIps: sinIps });
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    setGuardando(true);
    try {
      const cuerpo = { nombre: nombre.trim(), ips_permitidas: ips };
      if (vencimiento) cuerpo.vigente_hasta = finDeDiaMexicoISO(vencimiento);
      const r = await crearLlave(cuerpo);
      const { llave, ...fila } = r.datos; // la fila pública no conserva la llave
      onCreada({ llave, fila, avisoIps: r.aviso_ips || "" });
    } catch (err) {
      if (esErrorSinRespuesta(err)) {
        setErrorServidor(MENSAJE_RESPUESTA_PERDIDA);
        onRespuestaPerdida();
      } else {
        setErrorServidor((err && err.message) || "No se pudo crear la llave");
      }
      setGuardando(false);
    }
  }

  return (
    <DialogoAsistencia titulo="Nueva llave de ingesta" onCerrar={onCerrar} bloqueado={guardando}>
      <form onSubmit={enviar} noValidate>
        {errorServidor && <div role="alert" className="asi__aviso asi__aviso--error">{errorServidor}</div>}
        <div className="asi__campo">
          <label htmlFor={`${id}-nombre`}>Nombre</label>
          <input id={`${id}-nombre`} type="text" value={nombre} maxLength={100} onChange={(e) => setNombre(e.target.value)} required aria-required="true"
            aria-invalid={errores.nombre ? "true" : undefined} aria-describedby={errores.nombre ? `${id}-nombre-e` : undefined} />
          {errores.nombre && <p id={`${id}-nombre-e`} className="asi__error-campo">{errores.nombre}</p>}
        </div>
        <div className="asi__campo">
          <label htmlFor={`${id}-ips`}>IP permitidas (una por línea o separadas por comas)</label>
          <textarea id={`${id}-ips`} rows={3} value={ipsTexto} onChange={(e) => setIpsTexto(e.target.value)}
            aria-invalid={errores.ips ? "true" : undefined} aria-describedby={`${id}-ips-a${errores.ips ? ` ${id}-ips-e` : ""}`} />
          <p id={`${id}-ips-a`} className="asi__ayuda">Escribe la IP de la interfaz (o un rango CIDR). Máximo {MAX_IPS}. Solo las IP de esta lista podrán usar la llave.</p>
          {errores.ips && <p id={`${id}-ips-e`} className="asi__error-campo">{errores.ips}</p>}
        </div>
        {ips.length === 0 && (
          <div className="asi__aviso asi__aviso--advertencia">
            <div>
              <p>Sin IP permitidas, la llave funcionaría desde cualquier IP: si se filtra, cualquiera podría enviar marcas.</p>
              <div className="asi__campo asi__campo--casilla" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                <input id={`${id}-sinips`} type="checkbox" checked={sinIps} onChange={(e) => setSinIps(e.target.checked)} />
                <label htmlFor={`${id}-sinips`}>Entiendo el riesgo y acepto crearla sin restricción de IP</label>
              </div>
            </div>
          </div>
        )}
        <div className="asi__campo">
          <label htmlFor={`${id}-venc`}>Vence el (opcional, fin de ese día, hora de México)</label>
          <input id={`${id}-venc`} type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)}
            aria-invalid={errores.vencimiento ? "true" : undefined} />
          {errores.vencimiento && <p className="asi__error-campo">{errores.vencimiento}</p>}
        </div>
        <div className="asi__acciones">
          <button type="button" className="asi__btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="asi__btn asi__btn--primario" disabled={guardando}>{guardando ? "Creando…" : "Crear llave"}</button>
        </div>
      </form>
    </DialogoAsistencia>
  );
}

/** Rotación con solape: la llave anterior sigue válida `solape` horas. */
export function RotarLlaveDialogo({ llave, onCerrar, onRotada, onRespuestaPerdida }) {
  const id = useId();
  const [solape, setSolape] = useState("24");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (guardando) return;
    const horas = /^\d{1,3}$/.test(solape) ? Number(solape) : NaN;
    if (!Number.isFinite(horas) || horas < 0 || horas > 720) {
      setError("El solape debe ser un entero de 0 a 720 horas.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      const r = await rotarLlave(llave.id, { solape_horas: horas });
      const { llave: nueva, anterior, ...fila } = r.datos;
      onRotada({ llave: nueva, fila, anterior, solape: horas });
    } catch (err) {
      if (esErrorSinRespuesta(err)) {
        setError(MENSAJE_RESPUESTA_PERDIDA.replace("la llave sí se haya creado", "la llave sí se haya rotado").replace("revoca la creada y crea otra", "revoca la creada (la de nombre igual y más reciente) y rota de nuevo"));
        onRespuestaPerdida();
      } else {
        setError((err && err.message) || "No se pudo rotar la llave");
      }
      setGuardando(false);
    }
  }

  return (
    <DialogoAsistencia titulo={`Rotar la llave ${llave.prefijo}`} onCerrar={onCerrar} bloqueado={guardando} rol="alertdialog" ancho="30rem">
      <form onSubmit={enviar} noValidate>
        <p>
          Se creará una llave nueva con el mismo nombre e IP permitidas. La llave actual seguirá funcionando durante el solape para que
          puedas actualizar la interfaz sin cortar el envío; después dejará de ser válida.
        </p>
        {error && <div role="alert" className="asi__aviso asi__aviso--error">{error}</div>}
        <div className="asi__campo">
          <label htmlFor={`${id}-solape`}>Solape (horas, 0 = la actual termina ya)</label>
          <input id={`${id}-solape`} type="number" min="0" max="720" step="1" inputMode="numeric" value={solape} onChange={(e) => setSolape(e.target.value)} />
        </div>
        <div className="asi__acciones">
          <button type="button" className="asi__btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="asi__btn asi__btn--primario" disabled={guardando}>{guardando ? "Rotando…" : "Rotar llave"}</button>
        </div>
      </form>
    </DialogoAsistencia>
  );
}

/** Edita la lista de IP permitidas de una llave activa (efecto inmediato). */
export function EditarIpsDialogo({ llave, onCerrar, onGuardado }) {
  const id = useId();
  const [texto, setTexto] = useState(textoDeIps(llave.ips_permitidas));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmoSinIps, setConfirmoSinIps] = useState(false);
  const ips = parsearIps(texto);

  async function enviar(e) {
    e.preventDefault();
    if (guardando) return;
    const problema = validarEdicionIps(ips, confirmoSinIps);
    if (problema) {
      setError(problema);
      return;
    }
    setError("");
    setGuardando(true);
    try {
      await editarIpsLlave(llave.id, ips);
      onGuardado(`IP permitidas de la llave ${llave.prefijo} actualizadas`);
    } catch (err) {
      setError((err && err.message) || "No se pudieron actualizar las IP");
      setGuardando(false);
    }
  }

  return (
    <DialogoAsistencia titulo={`IP permitidas de la llave ${llave.prefijo}`} onCerrar={onCerrar} bloqueado={guardando} ancho="30rem">
      <form onSubmit={enviar} noValidate>
        {error && <div role="alert" className="asi__aviso asi__aviso--error">{error}</div>}
        <div className="asi__campo">
          <label htmlFor={`${id}-ips`}>IP permitidas (una por línea o separadas por comas)</label>
          <textarea id={`${id}-ips`} rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} aria-describedby={`${id}-ayuda`} />
          <p id={`${id}-ayuda`} className="asi__ayuda">El cambio aplica de inmediato a los siguientes envíos.</p>
        </div>
        {ips.length === 0 && (
          <div className="asi__aviso asi__aviso--advertencia">
            <div>
              <p>Sin IP permitidas la llave funcionaría desde cualquier IP: si se filtra, cualquiera podría enviar marcas. Se recomienda siempre restringirla.</p>
              <div className="asi__campo asi__campo--casilla" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                <input id={`${id}-sinips`} type="checkbox" checked={confirmoSinIps} onChange={(e) => setConfirmoSinIps(e.target.checked)} />
                <label htmlFor={`${id}-sinips`}>Entiendo el riesgo y acepto dejar la llave sin restricción de IP</label>
              </div>
            </div>
          </div>
        )}
        <div className="asi__acciones">
          <button type="button" className="asi__btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="asi__btn asi__btn--primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </DialogoAsistencia>
  );
}
