import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listarSolicitudes } from '../services/solicitudesCredito.service';
import '../styles/comercial.css';

const ESTADOS = ['', 'borrador', 'guardada', 'enviada_mba3', 'aprobada', 'rechazada'];
const TIPOS = ['', 'INDUSTRIA', 'DISTRIBUCION'];

export default function SolicitudesListado() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ buscar: '', estado: '', tipo_cliente: '', pagina: 1 });
  const navigate = useNavigate();

  useEffect(() => {
    cargar();
  }, [filtros.estado, filtros.tipo_cliente, filtros.pagina]);

  async function cargar() {
    setCargando(true);
    const res = await listarSolicitudes(filtros);
    if (res?.exito) {
      setSolicitudes(res.datos.registros);
      setTotal(res.datos.total);
    }
    setCargando(false);
  }

  async function buscar(e) {
    e.preventDefault();
    cargar();
  }

  function badgeClass(estado) {
    return `credito-badge credito-badge-${estado}`;
  }

  return (
    <div className="pagina-contenedor">
      <div className="credito-listado-header">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Solicitudes de Crédito</h1>
        <button className="btn-primario credito-sin-impresion" onClick={() => navigate('/comercial/creditos/nueva')}>
          + Nueva Solicitud
        </button>
      </div>

      <form className="credito-filtros credito-sin-impresion" onSubmit={buscar}>
        <input
          type="text"
          placeholder="Buscar RFC, razón social, folio..."
          value={filtros.buscar}
          onChange={e => setFiltros(f => ({ ...f, buscar: e.target.value }))}
          style={{ minWidth: 220 }}
        />
        <select value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value, pagina: 1 }))}>
          <option value="">Todos los estados</option>
          {ESTADOS.filter(Boolean).map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filtros.tipo_cliente} onChange={e => setFiltros(f => ({ ...f, tipo_cliente: e.target.value, pagina: 1 }))}>
          <option value="">Todos los tipos</option>
          {TIPOS.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="submit" className="btn-secundario">Buscar</button>
      </form>

      {cargando ? (
        <p style={{ color: 'var(--color-texto-claro)', padding: '1rem' }}>Cargando...</p>
      ) : solicitudes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-texto-claro)' }}>
          <p>No hay solicitudes que mostrar.</p>
          <button className="btn-primario" onClick={() => navigate('/comercial/creditos/nueva')}>Crear primera solicitud</button>
        </div>
      ) : (
        <>
          <table className="credito-tabla">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Razón Social</th>
                <th>RFC</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th className="credito-sin-impresion">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.numero_solicitud || '—'}</strong></td>
                  <td>{s.razon_social}</td>
                  <td>{s.rfc}</td>
                  <td><span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{s.tipo_cliente}</span></td>
                  <td><span className={badgeClass(s.estado)}>{s.estado}</span></td>
                  <td style={{ fontSize: '0.78rem' }}>{new Date(s.fecha_creacion).toLocaleDateString('es-MX')}</td>
                  <td className="credito-sin-impresion" style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className="btn-secundario" style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => navigate(`/comercial/creditos/${s.id}/editar`)}>Editar</button>
                    <button className="btn-secundario" style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => navigate(`/comercial/creditos/${s.id}/editar`)}>PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-texto-claro)', marginTop: '0.5rem' }}>
            {total} solicitud{total !== 1 ? 'es' : ''} en total
          </p>
        </>
      )}
    </div>
  );
}
