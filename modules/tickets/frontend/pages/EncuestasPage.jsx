import { useState, useEffect } from "react";
import { obtenerEstadisticasEncuestas } from "../services/encuestas.service";

export default function EncuestasPage() {
  const [estadisticas, setEstadisticas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    cargarEstadisticas();
  }, []);

  async function cargarEstadisticas() {
    try {
      const respuesta = await obtenerEstadisticasEncuestas();
      if (respuesta.exito) {
        setEstadisticas(respuesta.datos);
      } else {
        setError(respuesta.mensaje || "Error al cargar estadísticas");
      }
    } catch (err) {
      setError("Error de conexión al cargar estadísticas");
    } finally {
      setCargando(false);
    }
  }

  if (cargando) {
    return <div className="cargando">Cargando estadísticas...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="encuestas-page">
      <h1>Encuestas de Satisfacción</h1>

      {estadisticas ? (
        <div className="estadisticas-container">
          <div className="estadistica-card">
            <h3>Total Encuestas</h3>
            <p className="estadistica-valor">
              {estadisticas.total_encuestas || 0}
            </p>
          </div>
          <div className="estadistica-card">
            <h3>Promedio Calificación</h3>
            <p className="estadistica-valor">
              {estadisticas.promedio_calificacion
                ? parseFloat(estadisticas.promedio_calificacion).toFixed(1)
                : "N/A"}
            </p>
          </div>
        </div>
      ) : (
        <p>No hay estadísticas disponibles.</p>
      )}
    </div>
  );
}
