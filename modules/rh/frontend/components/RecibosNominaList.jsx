import { obtenerUrlRecibo } from "../services/recibos.service";

async function descargarRecibo(id) {
  try {
    const respuesta = await obtenerUrlRecibo(id);
    window.location.assign(respuesta.datos.url); // descarga forzada: no navega fuera de la página
  } catch (error) {
    console.error("Error al descargar recibo:", error);
    alert(error.message || "No se pudo descargar el recibo");
  }
}

export default function RecibosNominaList({ recibos }) {
  if (!recibos || recibos.length === 0) {
    return (
      <div className="recibos-vacios">
        <h2>Recibos de Nómina</h2>
        <p>No hay recibos disponibles.</p>
      </div>
    );
  }

  return (
    <div className="recibos-lista">
      <h2>Recibos de Nómina</h2>

      <table className="recibos-tabla">
        <thead>
          <tr>
            <th>Periodo</th>
            <th>Fecha de Pago</th>
            <th>Importe Total</th>
            <th>Archivo</th>
          </tr>
        </thead>
        <tbody>
          {recibos.map((recibo) => (
            <tr key={recibo.id}>
              <td>{recibo.periodo}</td>
              <td>
                {recibo.fecha_pago
                  ? new Date(recibo.fecha_pago).toLocaleDateString("es-MX")
                  : "-"}
              </td>
              <td>
                $
                {recibo.importe_total
                  ? parseFloat(recibo.importe_total).toFixed(2)
                  : "-"}
              </td>
              <td>
                {recibo.ruta_archivo ? (
                  <button
                    type="button"
                    onClick={() => descargarRecibo(recibo.id)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--color-primario)",
                      textDecoration: "underline",
                    }}
                  >
                    Descargar PDF
                  </button>
                ) : (
                  "Sin archivo"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
