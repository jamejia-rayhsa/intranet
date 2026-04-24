import { useState } from "react";

export default function ExpedienteUpload({
  empleadoId,
  tiposDocumento,
  onSubir,
}) {
  const [archivo, setArchivo] = useState(null);
  const [tipoDocumento, setTipoDocumento] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");

    if (!archivo) {
      setError("Selecciona un archivo");
      return;
    }

    if (!tipoDocumento) {
      setError("Selecciona un tipo de documento");
      return;
    }

    setCargando(true);

    try {
      await onSubir(archivo, tipoDocumento, descripcion);
      setArchivo(null);
      setTipoDocumento("");
      setDescripcion("");
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <form className="expediente-upload" onSubmit={manejarEnvio}>
      <h3>Subir Documento</h3>

      {error && <div className="mensaje-error">{error}</div>}

      <div className="campo">
        <label htmlFor="tipo-documento">Tipo de Documento</label>
        <select
          id="tipo-documento"
          value={tipoDocumento}
          onChange={(e) => setTipoDocumento(e.target.value)}
          required
        >
          <option value="">Selecciona un tipo</option>
          {tiposDocumento.map((tipo) => (
            <option key={tipo.valor} value={tipo.valor}>
              {tipo.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="archivo-expediente">Archivo</label>
        <input
          type="file"
          id="archivo-expediente"
          onChange={(e) => setArchivo(e.target.files[0])}
          accept="image/*,.pdf,.doc,.docx"
          required
        />
      </div>

      <div className="campo">
        <label htmlFor="descripcion-doc">Descripción (opcional)</label>
        <input
          type="text"
          id="descripcion-doc"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Descripción breve del documento"
        />
      </div>

      <button type="submit" disabled={cargando}>
        {cargando ? "Subiendo..." : "Subir Documento"}
      </button>
    </form>
  );
}
