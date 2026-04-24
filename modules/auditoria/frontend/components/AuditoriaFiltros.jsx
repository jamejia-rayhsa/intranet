import { useState } from 'react';

export default function AuditoriaFiltros({ onAplicarFiltros }) {
  const [modulo, setModulo] = useState('');
  const [tabla, setTabla] = useState('');
  const [accion, setAccion] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  function manejarBusqueda(evento) {
    evento.preventDefault();
    const filtros = {};
    if (modulo) filtros.modulo = modulo;
    if (tabla) filtros.tabla = tabla;
    if (accion) filtros.accion = accion;
    if (fechaDesde) filtros.fecha_desde = fechaDesde;
    if (fechaHasta) filtros.fecha_hasta = fechaHasta;
    onAplicarFiltros(filtros);
  }

  function limpiarFiltros() {
    setModulo('');
    setTabla('');
    setAccion('');
    setFechaDesde('');
    setFechaHasta('');
    onAplicarFiltros({});
  }

  return (
    <form className="auditoria-filtros" onSubmit={manejarBusqueda}>
      <div className="filtros-grupo">
        <label htmlFor="filtro-modulo">Módulo</label>
        <select
          id="filtro-modulo"
          value={modulo}
          onChange={(e) => setModulo(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="portal">Portal</option>
          <option value="tickets">Tickets</option>
          <option value="rh">Recursos Humanos</option>
          <option value="bi">BI</option>
          <option value="comercial">Comercial</option>
        </select>
      </div>

      <div className="filtros-grupo">
        <label htmlFor="filtro-accion">Acción</label>
        <select
          id="filtro-accion"
          value={accion}
          onChange={(e) => setAccion(e.target.value)}
        >
          <option value="">Todas</option>
          <option value="INSERT">Alta</option>
          <option value="UPDATE">Modificación</option>
          <option value="DELETE">Eliminación</option>
          <option value="VIEW">Consulta</option>
        </select>
      </div>

      <div className="filtros-grupo">
        <label htmlFor="filtro-desde">Desde</label>
        <input
          type="date"
          id="filtro-desde"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
        />
      </div>

      <div className="filtros-grupo">
        <label htmlFor="filtro-hasta">Hasta</label>
        <input
          type="date"
          id="filtro-hasta"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
        />
      </div>

      <div className="filtros-botones">
        <button type="submit">Buscar</button>
        <button type="button" onClick={limpiarFiltros}>
          Limpiar
        </button>
      </div>
    </form>
  );
}
