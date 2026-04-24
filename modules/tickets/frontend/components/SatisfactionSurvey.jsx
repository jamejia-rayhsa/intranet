import { useState } from "react";

export default function SatisfactionSurvey({ ticketId, onEnviar }) {
  const [calificacion, setCalificacion] = useState(0);
  const [comentarios, setComentarios] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");

  async function manejarEnvio(evento) {
    evento.preventDefault();

    if (calificacion < 1 || calificacion > 5) {
      setError("Selecciona una calificación");
      return;
    }

    setError("");

    try {
      await onEnviar(calificacion, comentarios);
      setEnviado(true);
    } catch (err) {
      setError(err.message);
    }
  }

  if (enviado) {
    return (
      <div className="encuesta-exito">
        <h2>¡Gracias por tu retroalimentación!</h2>
        <p>Tu encuesta de satisfacción ha sido enviada.</p>
      </div>
    );
  }

  return (
    <div className="encuesta-satisfaccion">
      <h2>Encuesta de Satisfacción</h2>
      <p>¿Cómo calificarías la atención recibida?</p>

      {error && <div className="mensaje-error">{error}</div>}

      <form onSubmit={manejarEnvio}>
        <div className="calificacion-estrellas">
          {[1, 2, 3, 4, 5].map((valor) => (
            <button
              key={valor}
              type="button"
              className={`estrella ${valor <= calificacion ? "activa" : ""}`}
              onClick={() => setCalificacion(valor)}
            >
              ★
            </button>
          ))}
          <span className="calificacion-texto">{calificacion}/5</span>
        </div>

        <div className="campo">
          <label htmlFor="comentarios-encuesta">Comentarios (opcional)</label>
          <textarea
            id="comentarios-encuesta"
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            rows={3}
            placeholder="¿Tienes algún comentario adicional?"
          />
        </div>

        <button type="submit" disabled={calificacion === 0}>
          Enviar Encuesta
        </button>
      </form>
    </div>
  );
}
