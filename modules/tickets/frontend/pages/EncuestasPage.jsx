import { useState, useEffect } from "react";
import { obtenerEstadisticasEncuestas } from "../services/encuestas.service";

const PERIODOS = [
  { valor: "30", etiqueta: "Últimos 30 días" },
  { valor: "90", etiqueta: "Últimos 90 días" },
  { valor: "365", etiqueta: "Último año" },
  { valor: "", etiqueta: "Todo el historial" },
];

function rangoDe(dias) {
  if (!dias) return {};
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - Number(dias) * 86400000);
  const iso = (f) => f.toISOString().slice(0, 10);
  return { desde: iso(desde), hasta: iso(hoy) };
}

function Estrellas({ valor }) {
  return (
    <span className="encuesta-estrellas" aria-label={`${valor} de 5`}>
      {"★".repeat(valor)}
      {"☆".repeat(5 - valor)}
    </span>
  );
}

function TablaPromedios({ titulo, filas, columna, clave }) {
  if (!filas?.length) return null;
  return (
    <section className="encuestas-bloque">
      <h2>{titulo}</h2>
      <table className="encuestas-tabla">
        <thead>
          <tr>
            <th>{columna}</th>
            <th>Respuestas</th>
            <th>Promedio</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila[clave] ?? fila[columna.toLowerCase()]}>
              <td>{fila.tecnico ?? fila.categoria}</td>
              <td>{fila.total}</td>
              <td>{parseFloat(fila.promedio).toFixed(2)} / 5</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function EncuestasPage() {
  const [estadisticas, setEstadisticas] = useState(null);
  const [periodo, setPeriodo] = useState("30");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    obtenerEstadisticasEncuestas(rangoDe(periodo))
      .then((respuesta) => {
        if (!vigente) return;
        if (respuesta.exito) {
          setEstadisticas(respuesta.datos);
          setError(null);
        } else {
          setError(respuesta.mensaje || "Error al cargar estadísticas");
        }
      })
      .catch((err) => vigente && setError(err.message || "Error de conexión al cargar estadísticas"))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [periodo]);

  if (error) {
    return <div className="error">{error}</div>;
  }

  const total = estadisticas?.total_encuestas || 0;
  const distribucion = estadisticas
    ? [
        [5, estadisticas.excelentes],
        [4, estadisticas.buenas],
        [3, estadisticas.regulares],
        [2, estadisticas.estrellas_2],
        [1, estadisticas.estrellas_1],
      ]
    : [];
  const maximo = Math.max(1, ...distribucion.map(([, n]) => n));

  return (
    <div className="encuestas-page">
      <div className="encuestas-encabezado">
        <h1>Encuestas de Satisfacción</h1>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          aria-label="Periodo"
        >
          {PERIODOS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {estadisticas?.alcance === "propio" && (
        <p className="encuestas-nota">Resultados de los tickets que has atendido.</p>
      )}

      {cargando && !estadisticas ? (
        <div className="cargando">Cargando estadísticas...</div>
      ) : (
        estadisticas && (
          <div className={cargando ? "encuestas-actualizando" : undefined}>
            <div className="estadisticas-container">
              <div className="estadistica-card">
                <h3>Total encuestas</h3>
                <p className="estadistica-valor">{total}</p>
              </div>
              <div className="estadistica-card">
                <h3>Promedio</h3>
                <p className="estadistica-valor">
                  {total ? `${parseFloat(estadisticas.promedio).toFixed(1)} / 5` : "N/A"}
                </p>
              </div>
              <div className="estadistica-card">
                <h3>Satisfechos (4-5)</h3>
                <p className="estadistica-valor">
                  {total ? `${Math.round((estadisticas.satisfechos / total) * 100)} %` : "N/A"}
                </p>
              </div>
            </div>

            {total === 0 ? (
              <p>No hay encuestas respondidas en este periodo.</p>
            ) : (
              <section className="encuestas-bloque">
                <h2>Distribución</h2>
                {distribucion.map(([estrellas, n]) => (
                  <div className="encuestas-barra" key={estrellas}>
                    <span className="encuestas-barra-etiqueta">{estrellas} ★</span>
                    <span className="encuestas-barra-pista">
                      <span
                        className="encuestas-barra-relleno"
                        style={{ width: `${(n / maximo) * 100}%` }}
                      />
                    </span>
                    <span className="encuestas-barra-valor">{n}</span>
                  </div>
                ))}
              </section>
            )}

            <TablaPromedios titulo="Por técnico" filas={estadisticas.por_tecnico} columna="Técnico" clave="tecnico_id" />
            <TablaPromedios titulo="Por categoría" filas={estadisticas.por_categoria} columna="Categoría" clave="categoria" />

            {estadisticas.comentarios?.length > 0 && (
              <section className="encuestas-bloque">
                <h2>Comentarios recientes</h2>
                <ul className="encuestas-comentarios">
                  {estadisticas.comentarios.map((c) => (
                    <li key={c.id} className={c.calificacion <= 2 ? "baja" : undefined}>
                      <div>
                        <Estrellas valor={c.calificacion} />{" "}
                        <a href={`/tickets/lista?ticket=${c.ticket_id}`}>
                          #{c.ticket_id} · {c.titulo}
                        </a>
                      </div>
                      <p>{c.comentarios}</p>
                      <small>
                        {new Date(c.fecha_respuesta).toLocaleDateString("es-MX")}
                        {c.tecnico ? ` · ${c.tecnico}` : ""}
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )
      )}
    </div>
  );
}
