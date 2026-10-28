import { useCallback, useEffect, useId, useRef, useState } from "react";
import DialogoAsistencia from "./asistencia/DialogoAsistencia";
import ConfirmarDialogo from "./asistencia/ConfirmarDialogo";
import Paginacion from "./asistencia/Paginacion";
import { obtenerVistaPreviaCuentas, vincularCuentas } from "../services/empleados.service";
import {
  ETIQUETAS_SUGERENCIA, TAMANO_LOTE_VINCULAR, AVISO_ALCANCE, MENSAJE_SOLO_ACTIVOS,
  dividirLotes, resumirSeleccion, textoConfirmacion, seleccionarExactasSeguras,
} from "../utils/cuentasEmpleado";
import "../styles/asistencia.css";

const POR_PAGINA = 15;

function Avisos({ cuenta }) {
  return (
    <>
      {cuenta.privilegiada && <span className="asi__sec"><strong>Rol privilegiado</strong>: vincularla da la asistencia de ese empleado a un administrador</span>}
      {!cuenta.con_acceso_asistencia && <span className="asi__sec">Sin rol con acceso a Asistencia</span>}
      {!cuenta.activo && <span className="asi__sec">Cuenta inactiva</span>}
      {cuenta.correo_duplicado && <span className="asi__sec"><strong>Correo duplicado entre cuentas</strong> (solo difiere en mayúsculas): no se vincula; corrígelo en la administración de usuarios</span>}
    </>
  );
}

function descripcionCandidato(c) {
  return [
    c.nombre, c.numero_nomina && `nómina ${c.numero_nomina}`, c.departamento || "sin departamento",
    c.subordinados > 0 && `jefe de ${c.subordinados}`,
  ].filter(Boolean).join(" · ");
}

/**
 * Acción "Vincular cuentas": vista previa (sin cambios) de las cuentas de usuario sin empleado con la sugerencia por nombre.
 * RH marca qué aplicar (nada se aplica solo) y confirma; el servidor revalida y responde 409 si algo cambió. Solo escribe
 * empleados.usuario_id: no crea cuentas ni toca roles o contraseñas.
 */
export default function VincularCuentasDialogo({ onCerrar, onVinculado }) {
  const [vista, setVista] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [pagina, setPagina] = useState(1);
  const [estado, setEstado] = useState("");
  const [seleccion, setSeleccion] = useState(() => new Map());
  const [confirmando, setConfirmando] = useState(false);
  const [entiendoPrivilegiadas, setEntiendoPrivilegiadas] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [avisoAtajo, setAvisoAtajo] = useState("");
  const resultadoRef = useRef(null);
  const filtroId = useId();
  const privId = useId();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await obtenerVistaPreviaCuentas({ pagina, limite: POR_PAGINA, estado });
      if (!r.exito) throw new Error(r.mensaje || "No se pudo cargar la vista previa");
      setVista(r.datos);
    } catch (e) {
      setError((e && e.message) || "No se pudo cargar la vista previa");
    } finally {
      setCargando(false);
    }
  }, [pagina, estado]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (resultado && resultadoRef.current) resultadoRef.current.focus(); }, [resultado]);

  const resumen = resumirSeleccion(seleccion);

  function marcar(cuenta, candidato) {
    setSeleccion((previa) => {
      const nueva = new Map(previa);
      if (candidato) nueva.set(cuenta.id, { cuenta, candidato });
      else nueva.delete(cuenta.id);
      return nueva;
    });
  }

  // Solo marca las exactas SEGURAS: privilegiadas, correos duplicados e inactivas se dejan para marcarlas a mano
  function marcarExactas() {
    const { marcadas, omitidas } = seleccionarExactasSeguras((vista && vista.cuentas) || []);
    setSeleccion((previa) => {
      const nueva = new Map(previa);
      for (const m of marcadas) nueva.set(m.cuenta.id, m);
      return nueva;
    });
    const partes = [];
    if (omitidas.privilegiadas) partes.push(`${omitidas.privilegiadas} con rol privilegiado`);
    if (omitidas.duplicadas) partes.push(`${omitidas.duplicadas} con correo duplicado`);
    if (omitidas.inactivas) partes.push(`${omitidas.inactivas} inactivas`);
    setAvisoAtajo(`Se marcaron ${marcadas.length} coincidencias exactas.${partes.length ? ` Se dejaron fuera, para marcarlas a mano: ${partes.join(", ")}.` : ""}`);
  }

  async function aplicar() {
    if (resumen.privilegiadas > 0 && !entiendoPrivilegiadas) {
      throw new Error("Marca la casilla de confirmación aparte para las cuentas con rol privilegiado");
    }
    const lotes = dividirLotes(resumen.pares, TAMANO_LOTE_VINCULAR);
    const acumulado = { vinculadas: 0, omitidas: 0, sin_acceso_asistencia: 0, privilegiadas: 0 };
    const aplicados = new Set();
    for (const lote of lotes) {
      let r;
      try {
        r = await vincularCuentas(lote, { confirmarPrivilegiadas: entiendoPrivilegiadas });
      } catch (e) {
        // Ante CUALQUIER error del lote se recarga la vista previa; los pares que el servidor reporta en conflicto salen de la selección
        const conflictos = (e && e.datos && Array.isArray(e.datos.conflictos)) ? e.datos.conflictos : [];
        setSeleccion((previa) => {
          const n = new Map(previa);
          aplicados.forEach((id) => n.delete(id));
          conflictos.forEach((c) => n.delete(c.usuario_id));
          return n;
        });
        if (aplicados.size) {
          setResultado({ ...acumulado, interrumpido: true });
          onVinculado && onVinculado();
        }
        cargar();
        throw new Error(`${(e && e.message) || "No se pudo vincular"}${aplicados.size ? ` Ya se vincularon ${acumulado.vinculadas} antes del fallo; el resto no se aplicó.` : ""} Se actualizó la vista previa: revisa la selección.`);
      }
      const d = r.datos;
      acumulado.vinculadas += d.vinculadas;
      acumulado.omitidas += d.omitidas;
      acumulado.sin_acceso_asistencia += d.sin_acceso_asistencia;
      acumulado.privilegiadas += d.privilegiadas;
      lote.forEach((p) => aplicados.add(p.usuario_id));
    }
    setSeleccion(new Map());
    setEntiendoPrivilegiadas(false);
    setConfirmando(false);
    setResultado(acumulado);
    onVinculado && onVinculado();
    await cargar();
  }

  const c = vista && vista.contadores;
  return (
    <>
    <DialogoAsistencia titulo="Vincular cuentas con empleados" onCerrar={onCerrar} ancho="72rem" bloqueado={confirmando}>
      <p className="asi__sec" style={{ marginTop: 0 }}>
        Relaciona cada cuenta de usuario (creada por el administrador de usuarios) con su empleado. Esta acción solo
        escribe el vínculo: no crea cuentas ni cambia roles o contraseñas. Las coincidencias son sugerencias por nombre y no
        se aplica nada sin que las marques y confirmes. {MENSAJE_SOLO_ACTIVOS}
      </p>
      <div className="asi__aviso asi__aviso--advertencia"><p>{AVISO_ALCANCE}</p></div>

      {error && <div role="alert" className="asi__aviso asi__aviso--error"><p>{error}</p> <button type="button" className="asi__btn asi__btn--chico" onClick={cargar}>Reintentar</button></div>}

      {resultado && (
        <div ref={resultadoRef} tabIndex={-1} role="status" className={`asi__aviso ${resultado.interrumpido ? "asi__aviso--advertencia" : "asi__aviso--ok"}`}>
          <p>
            Vinculadas: <strong>{resultado.vinculadas}</strong>. Omitidas (ya estaban vinculadas): <strong>{resultado.omitidas}</strong>.
            {resultado.interrumpido && " La operación se interrumpió: revisa la vista previa."}
          </p>
          {resultado.sin_acceso_asistencia > 0 && (
            <p>{resultado.sin_acceso_asistencia} sin un rol con acceso a Asistencia: no verán "Mi asistencia" hasta que el administrador de usuarios les asigne el rol (esta acción no lo cambia).</p>
          )}
          {resultado.privilegiadas > 0 && <p>{resultado.privilegiadas} con rol privilegiado: esas personas ahora ven la asistencia del empleado vinculado.</p>}
        </div>
      )}

      {c && (
        <dl className="asi__tarjetas" aria-label="Resumen de la vista previa">
          <div className="asi__tarjeta"><dt>Cuentas sin empleado</dt><dd>{c.cuentas_sin_empleado}</dd></div>
          <div className="asi__tarjeta"><dt>Empleados activos sin cuenta</dt><dd>{c.empleados_activos_sin_cuenta}</dd></div>
          <div className="asi__tarjeta"><dt>{ETIQUETAS_SUGERENCIA.exacta}</dt><dd>{c.coincidencia_exacta}</dd></div>
          <div className="asi__tarjeta"><dt>{ETIQUETAS_SUGERENCIA.varias}</dt><dd>{c.varias_posibles}</dd></div>
          <div className="asi__tarjeta"><dt>{ETIQUETAS_SUGERENCIA.sin_coincidencia}</dt><dd>{c.sin_coincidencia}</dd></div>
          <div className="asi__tarjeta"><dt>Sin rol con acceso a Asistencia</dt><dd>{c.sin_acceso_asistencia}</dd></div>
          <div className="asi__tarjeta"><dt>Con rol privilegiado</dt><dd>{c.privilegiadas}</dd></div>
          {c.correos_duplicados > 0 && <div className="asi__tarjeta"><dt>Correo duplicado entre cuentas</dt><dd>{c.correos_duplicados}</dd></div>}
        </dl>
      )}
      {vista && vista.avisos && (
        <>
          {vista.avisos.falta_unique_usuario_id && <div role="alert" className="asi__aviso asi__aviso--error"><p>Falta la restricción única sobre empleados.usuario_id (migración 010 sin aplicar): pide al administrador del sistema que corrija los duplicados y vuelva a ejecutar el db-init.</p></div>}
          {vista.avisos.total_usuarios_con_varios_empleados > 0 && (
            <div role="alert" className="asi__aviso asi__aviso--error">
              <p>Hay {vista.avisos.total_usuarios_con_varios_empleados} cuenta(s) vinculada(s) a más de un empleado (cuenta/empleados: {vista.avisos.usuarios_con_varios_empleados.map((d) => `${d.usuario_id}/${d.empleados.join("+")}`).join(", ")}). Desvincula la equivocada desde el perfil del empleado.</p>
            </div>
          )}
          {vista.avisos.total_vinculadas_a_no_activos > 0 && (
            <div role="status" className="asi__aviso asi__aviso--advertencia">
              <p>{vista.avisos.total_vinculadas_a_no_activos} empleado(s) suspendido(s) o dado(s) de baja siguen vinculados a una cuenta (empleado: {vista.avisos.vinculadas_a_no_activos.map((d) => `${d.empleado_id} ${d.estatus}`).join(", ")}). Revisa si conviene desvincularlos desde su perfil.</p>
            </div>
          )}
        </>
      )}
      {avisoAtajo && <div role="status" className="asi__aviso asi__aviso--info"><p>{avisoAtajo}</p></div>}

      <div className="asi__campo" style={{ maxWidth: "22rem" }}>
        <label htmlFor={filtroId}>Mostrar</label>
        <select id={filtroId} value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }}>
          <option value="">Todas las cuentas sin empleado</option>
          <option value="exacta">{ETIQUETAS_SUGERENCIA.exacta}</option>
          <option value="varias">{ETIQUETAS_SUGERENCIA.varias}</option>
          <option value="sin_coincidencia">{ETIQUETAS_SUGERENCIA.sin_coincidencia}</option>
        </select>
      </div>
      <div style={{ marginBottom: "0.8rem" }}>
        <button type="button" className="asi__btn asi__btn--chico" onClick={() => { setAvisoAtajo(""); cargar(); }} disabled={cargando}>Actualizar vista previa</button>
      </div>

      {cargando && <p role="status">Cargando vista previa…</p>}
      {!cargando && vista && vista.cuentas.length === 0 && <p role="status">No hay cuentas sin empleado con ese filtro.</p>}
      {!cargando && vista && vista.cuentas.length > 0 && (
        <>
          <div className="asi__tabla-caja" role="region" aria-label="Cuentas sin empleado y empleado sugerido" tabIndex={0}>
            <table className="asi__tabla">
              <thead>
                <tr><th scope="col">Cuenta de usuario</th><th scope="col">Sugerencia</th><th scope="col">Empleado a vincular (nombre, nómina y departamento)</th></tr>
              </thead>
              <tbody>
                {vista.cuentas.map((cu) => {
                  const nombre = [cu.nombre, cu.apellido].filter(Boolean).join(" ");
                  const marcado = seleccion.get(cu.id);
                  const cand = cu.sugerencia.candidatos;
                  return (
                    <tr key={cu.id}>
                      <td>
                        <strong>{nombre}</strong>
                        <span className="asi__sec">{cu.correo}</span>
                        <span className="asi__sec">{cu.roles.length ? `Roles: ${cu.roles.join(", ")}` : "Sin rol"}</span>
                        <Avisos cuenta={cu} />
                      </td>
                      <td>{ETIQUETAS_SUGERENCIA[cu.sugerencia.estado]}</td>
                      <td>
                        {cu.correo_duplicado && <span className="asi__sec">No se sugiere: correo duplicado entre cuentas.</span>}
                        {!cu.correo_duplicado && cu.sugerencia.estado === "exacta" && (
                          <label className="asi__campo asi__campo--casilla" style={{ marginBottom: 0 }}>
                            <input type="checkbox" checked={Boolean(marcado)} onChange={(e) => marcar(cu, e.target.checked ? cand[0] : null)} />
                            <span>
                              <span className="asi__sec" style={{ display: "inline" }}>Vincular {cu.correo} con </span>
                              <strong>{descripcionCandidato(cand[0])}</strong>
                            </span>
                          </label>
                        )}
                        {!cu.correo_duplicado && cu.sugerencia.estado === "varias" && (
                          <div className="asi__campo" style={{ marginBottom: 0 }}>
                            <label htmlFor={`cand-${cu.id}`} className="asi__sec">Elige el empleado de {cu.correo}</label>
                            <select
                              id={`cand-${cu.id}`}
                              value={marcado ? String(marcado.candidato.id) : ""}
                              onChange={(e) => marcar(cu, cand.find((x) => String(x.id) === e.target.value) || null)}
                            >
                              <option value="">No vincular todavía</option>
                              {cand.map((x) => <option key={x.id} value={x.id}>{descripcionCandidato(x)}</option>)}
                            </select>
                            {cu.sugerencia.candidatos_total > cand.length && (
                              <span className="asi__sec">Hay más candidatos ({cu.sugerencia.candidatos_total - cand.length} más): vincula esta cuenta desde el perfil del empleado.</span>
                            )}
                          </div>
                        )}
                        {!cu.correo_duplicado && cu.sugerencia.estado === "sin_coincidencia" && <span className="asi__sec">Sin sugerencia: vincúlala desde el perfil del empleado.</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Paginacion
            pagina={vista.pagina}
            paginasTotales={vista.paginas_totales}
            texto={`${vista.total} cuentas`}
            onCambiar={(p) => setPagina(Math.max(1, p))}
            deshabilitado={cargando}
          />
        </>
      )}

      {resumen.repetidos.length > 0 && (
        <div role="alert" className="asi__aviso asi__aviso--error"><p>Hay un empleado elegido para más de una cuenta: corrige la selección antes de vincular.</p></div>
      )}
      <div className="asi__acciones" style={{ justifyContent: "space-between" }}>
        <span role="status" aria-live="polite">{resumen.total} {resumen.total === 1 ? "vínculo marcado" : "vínculos marcados"}</span>
        <span className="asi__acciones-celda">
          <button type="button" className="asi__btn" onClick={marcarExactas} disabled={cargando || !vista}>Marcar las coincidencias exactas de esta página</button>
          <button type="button" className="asi__btn" onClick={() => setSeleccion(new Map())} disabled={resumen.total === 0}>Limpiar selección</button>
          <button type="button" className="asi__btn asi__btn--primario" onClick={() => { setResultado(null); setConfirmando(true); }} disabled={resumen.total === 0 || resumen.repetidos.length > 0}>Vincular las marcadas…</button>
          <button type="button" className="asi__btn" onClick={onCerrar}>Cerrar</button>
        </span>
      </div>

    </DialogoAsistencia>
      {confirmando && (
        <ConfirmarDialogo
          titulo="Confirmar la vinculación"
          textoConfirmar={`Vincular ${resumen.total}`}
          onConfirmar={aplicar}
          onCancelar={() => { setConfirmando(false); setEntiendoPrivilegiadas(false); }}
        >
          <p>{textoConfirmacion(resumen)}</p>
          {resumen.inactivas > 0 && <p>{resumen.inactivas} cuenta(s) inactiva(s): no podrán entrar hasta que el administrador de usuarios las active.</p>}
          {resumen.privilegiadas > 0 && (
            <div className="asi__campo asi__campo--casilla">
              <input id={privId} type="checkbox" checked={entiendoPrivilegiadas} onChange={(e) => setEntiendoPrivilegiadas(e.target.checked)} />
              <label htmlFor={privId}>
                {resumen.privilegiadas} cuenta(s) con rol privilegiado (administrador): entiendo que vincularlas le da a ese usuario la asistencia del empleado.
              </label>
            </div>
          )}
          <p className="asi__sec">Se aplican en lotes de {TAMANO_LOTE_VINCULAR}. El servidor vuelve a validar cada vínculo y, si algo cambió, no aplica el lote.</p>
        </ConfirmarDialogo>
      )}
    </>
  );
}
