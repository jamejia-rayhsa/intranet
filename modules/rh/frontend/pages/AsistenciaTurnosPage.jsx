import { useState, useEffect, useCallback } from "react";
import {
  listarTurnos,
  obtenerTurno,
  usoDeTurnos,
  actualizarTurno,
  eliminarTurno,
  mensajeDeError,
} from "../services/asistencia.service";
import { resumirHorario, resumirTolerancias, resumirUso } from "../utils/asistenciaTurnos";
import { OPCION_TURNOS } from "../utils/asistenciaPermisos";
import useAccesoAsistencia from "../hooks/useAccesoAsistencia";
import useFocoTitulo from "../hooks/useFocoTitulo";
import EstadoCarga from "../components/asistencia/EstadoCarga";
import TurnoFormulario from "../components/asistencia/TurnoFormulario";
import ConfirmarDialogo from "../components/asistencia/ConfirmarDialogo";
import "../styles/asistencia.css";

export default function AsistenciaTurnosPage() {
  const nivel = useAccesoAsistencia(OPCION_TURNOS);
  const { ref: tituloRef, enfocarSiPerdido } = useFocoTitulo();
  const [turnos, setTurnos] = useState([]);
  const [uso, setUso] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [avisoUso, setAvisoUso] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [formulario, setFormulario] = useState(null); // { turno } (turno null = alta)
  const [confirmacion, setConfirmacion] = useState(null); // { tipo: 'eliminar' | 'desactivar', turno }

  const puedeEditar = nivel === "edicion";

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    setAvisoUso("");
    try {
      const lista = await listarTurnos();
      // El listado no trae el detalle por día: se pide uno por turno (el catálogo es pequeño)
      const conDetalle = await Promise.all(
        (lista.datos || []).map(async (t) => {
          try {
            const d = await obtenerTurno(t.id);
            return d.exito ? d.datos : t;
          } catch {
            return t;
          }
        }),
      );
      setTurnos(conDetalle);
      try {
        const u = await usoDeTurnos();
        setUso(Object.fromEntries((u.datos || []).map((x) => [x.turno_id, x])));
      } catch (err) {
        setUso({});
        setAvisoUso(`No se pudo cargar cuántos departamentos y empleados usan cada turno: ${mensajeDeError(err, "error desconocido")}`);
      }
    } catch (err) {
      setTurnos([]);
      setError(mensajeDeError(err, "No se pudieron cargar los turnos"));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (nivel === undefined) return;
    if (nivel === null) {
      setCargando(false);
      return;
    }
    cargar();
  }, [nivel, cargar]);

  async function abrirEdicion(t) {
    setMensaje("");
    if (t.dias) {
      setFormulario({ turno: t });
      return;
    }
    try {
      const d = await obtenerTurno(t.id);
      setFormulario({ turno: d.datos });
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo cargar el turno"));
    }
  }

  async function alGuardar(texto) {
    setFormulario(null);
    setMensaje(texto);
    await cargar();
    enfocarSiPerdido();
  }

  async function confirmar() {
    const { tipo, turno } = confirmacion;
    if (tipo === "eliminar") await eliminarTurno(turno.id);
    else await actualizarTurno(turno.id, { activo: false });
    setConfirmacion(null);
    setMensaje(tipo === "eliminar" ? `Turno "${turno.nombre}" eliminado` : `Turno "${turno.nombre}" desactivado`);
    await cargar();
    enfocarSiPerdido();
  }

  async function activar(t) {
    setMensaje("");
    try {
      await actualizarTurno(t.id, { activo: true });
      setMensaje(`Turno "${t.nombre}" activado`);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo activar el turno"));
    }
  }

  if (nivel === null) {
    return (
      <div className="asi">
        <h1 ref={tituloRef} tabIndex={-1}>Turnos</h1>
        <p className="asi__aviso asi__aviso--error" role="alert">No tienes permiso para ver los turnos.</p>
      </div>
    );
  }

  return (
    <div className="asi">
      <h1 ref={tituloRef} tabIndex={-1}>Turnos de trabajo</h1>
      <p className="asi__sub">
        Un turno define el horario semanal, las tolerancias y las ventanas de marcaje. Se asigna a departamentos o empleados en la pantalla de asignaciones.
      </p>

      <div className="asi__barra">
        {puedeEditar && (
          <button type="button" className="asi__btn asi__btn--primario" onClick={() => { setMensaje(""); setFormulario({ turno: null }); }}>
            Nuevo turno
          </button>
        )}
        <button type="button" className="asi__btn" onClick={cargar} disabled={cargando}>Actualizar</button>
      </div>

      <div role="status" aria-live="polite">
        {mensaje && <p className="asi__aviso asi__aviso--ok">{mensaje}</p>}
      </div>
      {avisoUso && <p className="asi__aviso asi__aviso--advertencia" role="alert">{avisoUso}</p>}

      <EstadoCarga
        cargando={cargando || nivel === undefined}
        error={error}
        vacio={!cargando && !error && turnos.length === 0}
        textoVacio="Todavía no hay turnos. Crea el primero con «Nuevo turno»."
        onReintentar={cargar}
      />

      {!cargando && !error && turnos.length > 0 && (
        <div className="asi__tabla-caja" role="region" aria-label="Lista de turnos" tabIndex={0}>
          <table className="asi__tabla">
            <caption className="asi__sr">Turnos de trabajo</caption>
            <thead>
              <tr>
                <th scope="col">Turno</th>
                <th scope="col">Horario</th>
                <th scope="col">Tolerancias</th>
                <th scope="col">Estado</th>
                <th scope="col">En uso hoy</th>
                {puedeEditar && <th scope="col">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id}>
                  <th scope="row">
                    {t.nombre}
                    {t.descripcion && <span className="asi__sec">{t.descripcion}</span>}
                  </th>
                  <td>
                    {t.dias ? resumirHorario(t.dias) : "—"}
                    {t.descanso_min > 0 && <span className="asi__sec">Descanso {t.descanso_inicio} · {t.descanso_min} min</span>}
                  </td>
                  <td>{resumirTolerancias(t)}</td>
                  <td>
                    <span className={`asi__badge ${t.activo ? "asi__badge--ok" : "asi__badge--neutro"}`}>{t.activo ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td>{resumirUso(uso[t.id])}</td>
                  {puedeEditar && (
                    <td>
                      <div className="asi__acciones-celda">
                        <button type="button" className="asi__btn asi__btn--chico" onClick={() => abrirEdicion(t)} aria-label={`Editar ${t.nombre}`}>Editar</button>
                        {t.activo ? (
                          <button type="button" className="asi__btn asi__btn--chico" onClick={() => setConfirmacion({ tipo: "desactivar", turno: t })} aria-label={`Desactivar ${t.nombre}`}>Desactivar</button>
                        ) : (
                          <button type="button" className="asi__btn asi__btn--chico" onClick={() => activar(t)} aria-label={`Activar ${t.nombre}`}>Activar</button>
                        )}
                        <button type="button" className="asi__btn asi__btn--chico asi__btn--peligro" onClick={() => setConfirmacion({ tipo: "eliminar", turno: t })} aria-label={`Eliminar ${t.nombre}`}>Eliminar</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formulario && (
        <TurnoFormulario turno={formulario.turno} onCerrar={() => setFormulario(null)} onGuardado={alGuardar} />
      )}

      {confirmacion && confirmacion.tipo === "eliminar" && (
        <ConfirmarDialogo
          titulo="Eliminar turno"
          textoConfirmar="Eliminar turno"
          peligro
          onConfirmar={confirmar}
          onCancelar={() => setConfirmacion(null)}
        >
          <p>¿Eliminar el turno «{confirmacion.turno.nombre}»? Esta acción no se puede deshacer.</p>
          <p className="asi__ayuda">Si el turno está asignado a un departamento o empleado, o ya tiene asistencia calculada, el servidor no lo permite: desactívalo en su lugar.</p>
        </ConfirmarDialogo>
      )}
      {confirmacion && confirmacion.tipo === "desactivar" && (
        <ConfirmarDialogo
          titulo="Desactivar turno"
          textoConfirmar="Desactivar turno"
          onConfirmar={confirmar}
          onCancelar={() => setConfirmacion(null)}
        >
          <p>¿Desactivar el turno «{confirmacion.turno.nombre}»? Ya no se podrá asignar a nuevas personas o departamentos; las asignaciones vigentes se conservan.</p>
        </ConfirmarDialogo>
      )}
    </div>
  );
}
