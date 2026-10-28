import { useEffect, useId, useState } from "react";
import ConfirmarDialogo from "./asistencia/ConfirmarDialogo";
import { obtenerCuentasDisponibles, cambiarCuentaEmpleado } from "../services/empleados.service";
import "../styles/asistencia.css";

/**
 * Cuenta de usuario del empleado (empleados.usuario_id): muestra la cuenta vinculada y, solo para RH (`puedeEditar`),
 * permite vincular una cuenta SIN empleado con un selector buscable o desvincularla (con confirmación). No crea cuentas ni
 * toca roles o contraseñas: eso es de la administración de usuarios.
 */
export default function CuentaEmpleado({ empleadoId, nombreEmpleado, usuarioId, usuarioCorreo, enBaja, puedeEditar, onCambio }) {
  const [busqueda, setBusqueda] = useState("");
  const [consulta, setConsulta] = useState("");
  const [lista, setLista] = useState({ cuentas: [], total: 0 });
  const [cargando, setCargando] = useState(false);
  const [errorLista, setErrorLista] = useState("");
  const [elegida, setElegida] = useState(null);
  const [entiendo, setEntiendo] = useState(false);
  const [confirmar, setConfirmar] = useState(null); // 'vincular' | 'desvincular'
  const [aviso, setAviso] = useState("");
  const buscarId = useId();
  const privId = useId();
  const vinculada = Boolean(usuarioId);

  useEffect(() => {
    const t = setTimeout(() => setConsulta(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    if (!puedeEditar || vinculada || enBaja) return undefined;
    let activo = true;
    setCargando(true);
    setErrorLista("");
    obtenerCuentasDisponibles({ busqueda: consulta, pagina: 1, limite: 8 })
      .then((r) => { if (activo) setLista(r.exito ? r.datos : { cuentas: [], total: 0 }); })
      .catch((e) => { if (activo) setErrorLista((e && e.message) || "No se pudieron cargar las cuentas"); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [consulta, puedeEditar, vinculada, enBaja]);

  async function ejecutar() {
    if (confirmar === "desvincular") {
      await cambiarCuentaEmpleado(empleadoId, null);
      setAviso("Cuenta desvinculada. La persona ya no verá la asistencia de este empleado.");
    } else {
      if (elegida.privilegiada && !entiendo) throw new Error("Marca la casilla de confirmación aparte para la cuenta con rol privilegiado");
      const r = await cambiarCuentaEmpleado(empleadoId, elegida.id, { confirmarPrivilegiada: entiendo });
      setAviso(
        r.datos && r.datos.sin_acceso_asistencia
          ? "Cuenta vinculada. No tiene un rol con acceso a Asistencia: no verá \"Mi asistencia\" hasta que el administrador de usuarios se lo asigne."
          : "Cuenta vinculada.",
      );
    }
    setConfirmar(null);
    setElegida(null);
    setEntiendo(false);
    setBusqueda("");
    onCambio && onCambio();
  }

  const nombreCuenta = elegida ? [elegida.nombre, elegida.apellido].filter(Boolean).join(" ") : "";
  return (
    <div className="cuenta-empleado" style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "0.35rem", minWidth: 0 }} role="group" aria-label="Cuenta de usuario del empleado">
      <strong style={{ color: "var(--color-primario)" }}>Cuenta de usuario (acceso a la intranet)</strong>
      {aviso && <div role="status" className="asi__aviso asi__aviso--ok"><p>{aviso}</p></div>}
      {vinculada ? (
        <>
          <span>Vinculada a: <strong>{usuarioCorreo || `cuenta ${usuarioId}`}</strong></span>
          {puedeEditar && <div><button type="button" className="asi__btn asi__btn--chico" onClick={() => { setAviso(""); setConfirmar("desvincular"); }}>Desvincular cuenta</button></div>}
        </>
      ) : (
        <>
          <span>Sin cuenta vinculada: esta persona no puede ver su asistencia ni sus vacaciones.</span>
          {puedeEditar && enBaja && <small>Un empleado dado de baja no se vincula a una cuenta.</small>}
          {puedeEditar && !enBaja && (
            <div className="asi__campo" style={{ marginTop: "0.5rem" }}>
              <label htmlFor={buscarId}>Buscar cuenta sin empleado (nombre o correo)</label>
              <input id={buscarId} type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoComplete="off" maxLength={100} />
              {errorLista && <div role="alert" className="asi__aviso asi__aviso--error"><p>{errorLista}</p></div>}
              <fieldset style={{ border: "1px solid var(--color-borde)", borderRadius: "0.5rem", padding: "0.5rem", margin: "0.5rem 0 0", minWidth: 0 }}>
                <legend className="asi__sec" aria-live="polite">{cargando ? "Buscando…" : `${lista.total} cuenta(s) sin empleado`}</legend>
                {lista.cuentas.map((c) => (
                  <label key={c.id} className="asi__campo asi__campo--casilla" style={{ marginBottom: "0.3rem", alignItems: "flex-start" }}>
                    <input type="radio" name={`cuenta-${empleadoId}`} checked={elegida ? elegida.id === c.id : false} onChange={() => { setElegida(c); setEntiendo(false); setAviso(""); }} />
                    <span style={{ overflowWrap: "anywhere" }}>
                      <strong>{[c.nombre, c.apellido].filter(Boolean).join(" ")}</strong>
                      <span className="asi__sec">{c.correo}</span>
                      {c.privilegiada && <span className="asi__sec"><strong>Rol privilegiado</strong></span>}
                      {!c.con_acceso_asistencia && <span className="asi__sec">Sin rol con acceso a Asistencia</span>}
                      {!c.activo && <span className="asi__sec">Cuenta inactiva</span>}
                    </span>
                  </label>
                ))}
                {!cargando && lista.cuentas.length === 0 && <span className="asi__sec">No hay cuentas disponibles con ese criterio.</span>}
              </fieldset>
              <div style={{ marginTop: "0.5rem" }}>
                <button type="button" className="asi__btn asi__btn--primario" disabled={!elegida} onClick={() => setConfirmar("vincular")}>Vincular cuenta seleccionada…</button>
              </div>
            </div>
          )}
        </>
      )}

      {confirmar && (
        <ConfirmarDialogo
          titulo={confirmar === "vincular" ? "Vincular cuenta" : "Desvincular cuenta"}
          textoConfirmar={confirmar === "vincular" ? "Vincular" : "Desvincular"}
          peligro={confirmar === "desvincular"}
          onConfirmar={ejecutar}
          onCancelar={() => { setConfirmar(null); setEntiendo(false); }}
        >
          {confirmar === "vincular" ? (
            <>
              <p>Vincular la cuenta <strong>{nombreCuenta}</strong> ({elegida.correo}) con el empleado <strong>{nombreEmpleado}</strong>.</p>
              <p>Esa persona verá la asistencia y las vacaciones de este empleado: revisa que sean la misma persona.</p>
              {!elegida.con_acceso_asistencia && <p>La cuenta no tiene un rol con acceso a Asistencia: no verá "Mi asistencia" hasta que el administrador de usuarios se lo asigne.</p>}
              {elegida.privilegiada && (
                <div className="asi__campo asi__campo--casilla">
                  <input id={privId} type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} />
                  <label htmlFor={privId}>Es una cuenta con rol privilegiado (administrador): entiendo que vincularla le da su asistencia a ese usuario.</label>
                </div>
              )}
            </>
          ) : (
            <p>Desvincular la cuenta <strong>{usuarioCorreo}</strong> del empleado <strong>{nombreEmpleado}</strong>. La persona dejará de ver la asistencia y las vacaciones de este empleado; la cuenta no se borra.</p>
          )}
        </ConfirmarDialogo>
      )}
    </div>
  );
}
