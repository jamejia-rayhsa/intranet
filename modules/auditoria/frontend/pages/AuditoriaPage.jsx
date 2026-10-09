import { useState, useEffect } from 'react';
import { obtenerToken } from '../../../portal/frontend/utils/token';
import AuditoriaFiltros from '../components/AuditoriaFiltros';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [filtros, setFiltros] = useState({});

  async function cargarRegistros() {
    setCargando(true);
    try {
      const token = await obtenerToken();
      const parametros = new URLSearchParams({
        pagina,
        limite: 20,
        ...filtros,
      });

      const respuesta = await fetch(`${API_URL}/auditoria?${parametros}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const datos = await respuesta.json();

      if (datos.exito) {
        setRegistros(datos.datos.registros);
        setTotalPaginas(datos.datos.paginas_totales);
      }
    } catch (error) {
      console.error('Error al cargar auditoría:', error);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarRegistros();
  }, [pagina, filtros]);

  function aplicarFiltros(nuevosFiltros) {
    setFiltros(nuevosFiltros);
    setPagina(1);
  }

  function formatoAccion(accion) {
    const colores = {
      INSERT: 'verde',
      UPDATE: 'amarillo',
      DELETE: 'rojo',
      VIEW: 'azul',
    };
    return colores[accion] || 'gris';
  }

  if (cargando) {
    return <div className="auditoria-cargando">Cargando registros de auditoría...</div>;
  }

  return (
    <div className="auditoria-pagina">
      <h1>Auditoría del Sistema</h1>

      <AuditoriaFiltros onAplicarFiltros={aplicarFiltros} />

      <table className="auditoria-tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Usuario</th>
            <th>Módulo</th>
            <th>Tabla</th>
            <th>Acción</th>
            <th>Registro ID</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((registro) => (
            <tr key={registro.id}>
              <td>{new Date(registro.fecha).toLocaleString('es-MX')}</td>
              <td>{registro.nombre} {registro.apellido}</td>
              <td>{registro.modulo}</td>
              <td>{registro.tabla}</td>
              <td>
                <span className={`badge badge-${formatoAccion(registro.accion)}`}>
                  {registro.accion}
                </span>
              </td>
              <td>{registro.registro_id}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="auditoria-paginacion">
        <button
          disabled={pagina <= 1}
          onClick={() => setPagina(pagina - 1)}
        >
          Anterior
        </button>
        <span>Página {pagina} de {totalPaginas}</span>
        <button
          disabled={pagina >= totalPaginas}
          onClick={() => setPagina(pagina + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
