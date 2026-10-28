import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DialogoAsistencia from "./DialogoAsistencia";
import EstatusInsignia from "./EstatusInsignia";
import EstadoCarga from "./EstadoCarga";
import { detalleDia, mensajeDeError } from "../../services/asistencia.service";
import { horaLocal, instanteUtc } from "../../utils/asistenciaFechas";
import { redactarDia, mensajeSinResultado, nombreDelDia, mensajeAnalisisDesde, AYUDA_CONTACTAR_RH } from "../../utils/asistenciaMiAsistencia";

/**
 * Detalle de un día en lenguaje de persona y SOLO LECTURA (sin justificar, anular ni cerrar: eso es de RH). Lo usan
 * «Mi asistencia» (persona 'yo') y «Mi equipo» (persona 'equipo'). Un día sin resultado explica por qué y qué hacer.
 */
export default function DetalleDiaPersonaDialogo({ empleadoId, nombre, fecha, persona, contexto, analisisDesde, hoy, tieneNomina = true, sinResultado: sinResultadoConocido = false, onCerrar }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [sinResultado, setSinResultado] = useState("");
  const solicitud = useRef(0);
  const anteriorAlAnalisis = Boolean(analisisDesde) && fecha < analisisDesde;

  const cargar = useCallback(async () => {
    const mia = ++solicitud.current;
    setError("");
    setSinResultado("");
    // Un día que la lista ya mostró «sin cálculo» (o anterior al análisis) no se pide al servidor: se explica aquí
    if (anteriorAlAnalisis || sinResultadoConocido) {
      setDatos(null);
      setCargando(false);
      setSinResultado(anteriorAlAnalisis ? mensajeAnalisisDesde(analisisDesde) : mensajeSinResultado({ fecha, hoy, analisisDesde, contexto, persona, tieneNomina }));
      return;
    }
    setCargando(true);
    try {
      const r = await detalleDia(empleadoId, fecha);
      if (mia !== solicitud.current) return;
      setDatos(r.datos);
    } catch (err) {
      if (mia !== solicitud.current) return;
      setDatos(null);
      if (err && err.status === 404) setSinResultado(mensajeSinResultado({ fecha, hoy, analisisDesde, contexto, persona, tieneNomina }));
      else setError(mensajeDeError(err, "No se pudo cargar el detalle del día"));
    } finally {
      if (mia === solicitud.current) setCargando(false);
    }
  }, [empleadoId, fecha, anteriorAlAnalisis, sinResultadoConocido, analisisDesde, hoy, contexto, persona, tieneNomina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const texto = useMemo(
    () => (datos ? redactarDia({ dia: datos.dia, marcas: datos.marcas, cruces: datos.cruces, hora: horaLocal, persona }) : null),
    [datos, persona],
  );
  const dia = datos && datos.dia;
  const titulo = persona === "equipo" ? `Día de ${nombre}` : "Tu día";

  return (
    <DialogoAsistencia titulo={titulo} onCerrar={onCerrar} ancho="40rem" clase="asm__dialogo">
      <p className="asi__sub">{nombreDelDia(fecha)} {fecha}</p>
      <EstadoCarga cargando={cargando && !datos} error={error} onReintentar={cargar} />
      {sinResultado && <p className="asi__aviso asi__aviso--info" role="status">{sinResultado}</p>}
      {texto && (
        <div className="asm__detalle">
          <section aria-labelledby="mdd-resultado">
            <h3 id="mdd-resultado">Resultado</h3>
            <p><EstatusInsignia estatus={dia.estatus} /></p>
            <p className="asm__frase">{texto.frase}</p>
            {texto.explicaciones.map((t) => <p key={t}>{t}</p>)}
            {texto.original && <p className="asi__ayuda">{texto.original}</p>}
            {dia.periodo_estado === "cerrado" && <p className="asi__aviso asi__aviso--ok">Quincena cerrada: resultado definitivo.</p>}
            {dia.periodo_estado === "abierto" && <p className="asi__ayuda">Quincena abierta: el resultado puede cambiar.</p>}
          </section>

          {texto.justificacion && (
            <section aria-labelledby="mdd-just" className="asm__justificacion">
              <h3 id="mdd-just">Justificación</h3>
              <p>Justificado por {texto.justificacion.quien}. Motivo: «{texto.justificacion.motivo}»</p>
            </section>
          )}

          <section aria-labelledby="mdd-marcas">
            <h3 id="mdd-marcas">{persona === "equipo" ? "Sus marcas" : "Tus marcas"} (hora de México)</h3>
            {texto.horario && <p>{texto.horario}</p>}
            {datos.marcas_truncadas && <p className="asi__aviso asi__aviso--advertencia" role="status">Solo se muestran las primeras {datos.marcas.length} marcas del día.</p>}
            {texto.marcas.length === 0 ? (
              <p className="asi__estado">No hay marcas este día.</p>
            ) : (
              <ul className="asm__marcas">
                {texto.marcas.map((m, i) => (
                  <li key={`${m.instante}-${i}`} className={`asm__marca asm__marca--${m.rol}`}>
                    <time dateTime={m.instante} title={`UTC ${instanteUtc(m.instante)}`} className="asi__rotulo-hora asm__hora">{m.hora}</time>
                    <span>{m.etiqueta}</span>
                  </li>
                ))}
              </ul>
            )}
            {texto.comida && <p>{texto.comida}</p>}
          </section>

          {(texto.cruce || texto.revisar.length > 0) && (
            <section aria-labelledby="mdd-notas">
              <h3 id="mdd-notas">Otras notas</h3>
              {texto.cruce && <p>{texto.cruce}</p>}
              {texto.revisar.length > 0 && <ul className="asi__lista">{texto.revisar.map((t) => <li key={t}>{t}</li>)}</ul>}
            </section>
          )}
          <p className="asi__ayuda">{AYUDA_CONTACTAR_RH}</p>
        </div>
      )}
      <div className="asi__acciones">
        <button type="button" className="asi__btn asm__cerrar" onClick={onCerrar}>Cerrar</button>
      </div>
    </DialogoAsistencia>
  );
}
