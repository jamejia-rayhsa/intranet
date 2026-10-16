import { useState, useEffect, useId } from "react";
import useFocoModal from "../../../portal/frontend/hooks/useFocoModal";
import { TIPOS_CALENDARIO, fechaConDiaSemana, ayudaDelTipo, mensajeAvisosActividad } from "../utils/calendarioLaboral";
import {
  crearFechaCalendario,
  actualizarFechaCalendario,
  eliminarFechaCalendario,
} from "../services/calendario.service";

const MAX_NOMBRE = 150;
const MAX_DESCRIPCION = 1000;

/**
 * Modal de alta/edición/baja de una fecha del calendario laboral.
 * @param {{ item: object|null, fechaInicial: string, onCerrar: () => void, onGuardado: (mensaje: string) => void }} props
 *   item = fila a editar (null = alta).
 */
export default function ModalFechaCalendario({ item, fechaInicial, onCerrar, onGuardado }) {
  const dialogoRef = useFocoModal(true);
  const tituloId = useId();
  const errorId = useId();
  const editando = Boolean(item);

  const [formulario, setFormulario] = useState({
    fecha: item?.fecha || fechaInicial || "",
    tipo: item?.tipo || "oficial",
    nombre: item?.nombre || "",
    descripcion: item?.descripcion || "",
    activo: item ? item.activo !== false : true,
  });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);

  useEffect(() => {
    function alTecla(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!guardando) onCerrar();
      }
    }
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [guardando, onCerrar]);

  function cambiar(e) {
    const { name, value, type, checked } = e.target;
    setFormulario((previo) => ({ ...previo, [name]: type === "checkbox" ? checked : value }));
  }

  async function guardar(e) {
    e.preventDefault();
    if (guardando) return;
    setError("");
    setGuardando(true);
    const cuerpo = {
      fecha: formulario.fecha,
      tipo: formulario.tipo,
      nombre: formulario.nombre.trim(),
      descripcion: formulario.descripcion.trim() || null,
      activo: formulario.activo,
    };
    try {
      const respuesta = editando
        ? await actualizarFechaCalendario(item.id, cuerpo)
        : await crearFechaCalendario(cuerpo);
      // Si la fecha quedó como Día Actividad Empresa, el servidor cuenta las solicitudes afectadas
      const aviso = cuerpo.tipo === "actividad" && respuesta ? mensajeAvisosActividad(respuesta.avisos) : null;
      onGuardado(editando ? "Fecha del calendario actualizada" : "Fecha agregada al calendario", aviso);
    } catch (err) {
      // 400 (validación), 409 (duplicada), 404 (ya no existe): se muestra el mensaje del backend
      setError(err.message || "No se pudo guardar la fecha");
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (guardando) return;
    setError("");
    setGuardando(true);
    try {
      await eliminarFechaCalendario(item.id);
      onGuardado("Fecha eliminada del calendario");
    } catch (err) {
      setError(err.message || "No se pudo eliminar la fecha");
      setGuardando(false);
      setConfirmandoBaja(false);
    }
  }

  return (
    <div className="rayhsa-modal-overlay">
      <div
        className="rayhsa-modal calendario__modal"
        ref={dialogoRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
      >
        <h2 id={tituloId}>{editando ? "Editar fecha del calendario" : "Agregar fecha al calendario"}</h2>
        {editando && <p style={{ margin: "0 0 1rem" }}>{fechaConDiaSemana(item.fecha)}</p>}

        {error && (
          <div id={errorId} role="alert" className="calendario__aviso calendario__aviso--error">
            {error}
          </div>
        )}

        <form onSubmit={guardar}>
          <div className="calendario__campo">
            <label htmlFor="cal-fecha">Fecha</label>
            <input
              id="cal-fecha"
              type="date"
              name="fecha"
              value={formulario.fecha}
              onChange={cambiar}
              required
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          <div className="calendario__campo">
            <label htmlFor="cal-tipo">Tipo</label>
            <select id="cal-tipo" name="tipo" value={formulario.tipo} onChange={cambiar} required aria-describedby="cal-tipo-ayuda">
              {TIPOS_CALENDARIO.map((t) => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
            <p id="cal-tipo-ayuda" className={`calendario__ayuda-tipo${formulario.tipo === "actividad" ? " calendario__ayuda-tipo--actividad" : ""}`}>
              {formulario.tipo === "actividad" && <span aria-hidden="true">■ </span>}
              {ayudaDelTipo(formulario.tipo)}
            </p>
          </div>
          <div className="calendario__campo">
            <label htmlFor="cal-nombre">Nombre</label>
            <input
              id="cal-nombre"
              type="text"
              name="nombre"
              value={formulario.nombre}
              onChange={cambiar}
              maxLength={MAX_NOMBRE}
              required
            />
          </div>
          <div className="calendario__campo">
            <label htmlFor="cal-descripcion">Descripción (opcional)</label>
            <textarea
              id="cal-descripcion"
              name="descripcion"
              rows={3}
              value={formulario.descripcion}
              onChange={cambiar}
              maxLength={MAX_DESCRIPCION}
            />
          </div>
          <div className="calendario__campo calendario__campo--casilla">
            <input id="cal-activo" type="checkbox" name="activo" checked={formulario.activo} onChange={cambiar} />
            <label htmlFor="cal-activo">Activo (los inactivos no se aplican)</label>
          </div>

          {confirmandoBaja ? (
            <div role="group" aria-label="Confirmar eliminación" className="calendario__acciones">
              <span style={{ flexBasis: "100%" }}>
                ¿Eliminar «{item.nombre}» del calendario? Esta acción no se puede deshacer.
              </span>
              <button type="button" className="calendario__boton calendario__boton--peligro" onClick={eliminar} disabled={guardando}>
                Sí, eliminar
              </button>
              <button type="button" autoFocus className="calendario__boton" onClick={() => setConfirmandoBaja(false)} disabled={guardando}>
                No, conservar
              </button>
            </div>
          ) : (
            <div className="calendario__acciones">
              <button type="submit" className="calendario__boton calendario__boton--primario" disabled={guardando}>
                {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Agregar"}
              </button>
              <button type="button" className="calendario__boton" onClick={onCerrar} disabled={guardando}>
                Cancelar
              </button>
              {editando && (
                <>
                  <span className="calendario__acciones-espacio" />
                  <button type="button" className="calendario__boton calendario__boton--peligro" onClick={() => setConfirmandoBaja(true)} disabled={guardando}>
                    Eliminar
                  </button>
                </>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
