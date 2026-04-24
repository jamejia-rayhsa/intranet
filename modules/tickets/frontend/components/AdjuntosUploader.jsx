import { useState, useRef } from "react";

const tiposPermitidos = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

export default function AdjuntosUploader({ ticketId, onSubir }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const entradaRef = useRef(null);

  function abrirExplorador() {
    if (entradaRef.current) {
      entradaRef.current.click();
    }
  }

  async function manejarSeleccionArchivo(evento) {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    if (!tiposPermitidos.includes(archivo.type)) {
      setError("Tipo de archivo no permitido");
      return;
    }

    if (archivo.size > 10 * 1024 * 1024) {
      setError("El archivo no debe superar los 10MB");
      return;
    }

    setError("");
    setCargando(true);

    try {
      await onSubir(archivo);
      if (entradaRef.current) {
        entradaRef.current.value = "";
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="adjuntos-uploader">
      <input
        ref={entradaRef}
        type="file"
        onChange={manejarSeleccionArchivo}
        disabled={cargando}
        accept={tiposPermitidos.join(",")}
        style={{ display: "none" }}
      />
      <button
        type="button"
        className="boton-subir-adjunto"
        onClick={abrirExplorador}
        disabled={cargando}
      >
        {cargando ? "Subiendo..." : "Seleccionar Archivo"}
      </button>
      {error && <span className="mensaje-error">{error}</span>}
    </div>
  );
}
