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
                  <a
                    href={recibo.ruta_archivo}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Descargar PDF
                  </a>
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
