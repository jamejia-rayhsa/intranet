// modules/comercial/frontend/pages/ConveniosListado.jsx
// Listado y autorización mínima de convenios de compra (Fase 1).

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listarConvenios, autorizarConvenio, rechazarConvenio, cancelarConvenio,
} from '../services/convenios.service';
import PageHeader from '../../../portal/frontend/components/PageHeader';
import { usarAuth } from '../../../portal/frontend/context/AuthContext';
import '../styles/comercial.css';

const ESTATUS = ['', 'pendiente_autorizacion', 'autorizado', 'rechazado', 'cancelado'];

function badgeClass(estatus) {
  return `credito-badge credito-badge-${estatus === 'pendiente_autorizacion' ? 'guardada' : estatus === 'autorizado' ? 'aprobada' : estatus === 'rechazado' ? 'rechazada' : 'borrador'}`;
}

export default function ConveniosListado() {
  const { usuario } = usarAuth();
  // R-12 (parcial): el backend ya exige autoridad para autorizar/rechazar/cancelar-autorizado y
  // creador/super_admin para editar; aquí solo ocultamos lo que SIEMPRE está prohibido sin importar
  // si el usuario es autorizador (no sabemos eso en el front sin una llamada extra — deuda documentada
  // en code-notes.md). `esSuperAdmin` igual que AutorizadoresPage.jsx: /auth/perfil manda `roles[]`,
  // nunca `rol_nombre`.
  const esSuperAdmin = Array.isArray(usuario?.roles) && usuario.roles.includes('super_admin');
  const esCreador = (c) => usuario?.id !== undefined && String(c.creado_por_id) === String(usuario.id);
  const [convenios, setConvenios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ estatus: '', cliente_nombre: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await listarConvenios(filtros);
      if (res?.exito) setConvenios(res.datos);
    } catch (err) {
      setError(err.message || 'Error al listar convenios');
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  async function accion(fn, id, ...args) {
    setError('');
    try {
      await fn(id, ...args);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo completar la acción');
    }
  }

  async function onRechazar(id) {
    const motivo = window.prompt('Motivo del rechazo (obligatorio):');
    if (!motivo || !motivo.trim()) return;
    accion(rechazarConvenio, id, motivo);
  }

  return (
    <>
      <PageHeader
        eyebrow="Módulo · Comercial"
        title="Convenios de compra"
        subtitle="Compra de productos sin stock a mínimos de paquete, facturados periódicamente a un cliente"
        actions={
          <button className="btn-primario" onClick={() => navigate('/comercial/convenios/nuevo')}>
            + Nuevo convenio
          </button>
        }
      />

      {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}

      <form className="credito-filtros" onSubmit={e => { e.preventDefault(); cargar(); }}>
        <select value={filtros.estatus} onChange={e => setFiltros(f => ({ ...f, estatus: e.target.value }))}>
          <option value="">Todos los estatus</option>
          {ESTATUS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          placeholder="Cliente…"
          value={filtros.cliente_nombre}
          onChange={e => setFiltros(f => ({ ...f, cliente_nombre: e.target.value }))}
        />
        <button type="submit" className="btn-secundario">Buscar</button>
      </form>

      {cargando ? (
        <p style={{ color: 'var(--color-texto-claro)' }}>Cargando…</p>
      ) : convenios.length === 0 ? (
        <p style={{ color: 'var(--color-texto-claro)', padding: '1rem' }}>No hay convenios que mostrar.</p>
      ) : (
        <table className="credito-tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Inicio</th>
              <th>Vigencia</th>
              <th>Estatus</th>
              <th>Productos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {convenios.map(c => (
              <tr key={c.id}>
                <td>{c.cliente_nombre}</td>
                <td>{c.vendedor_nombre}</td>
                <td style={{ fontSize: '0.78rem' }}>{String(c.fecha_inicio).slice(0, 10)}</td>
                <td style={{ fontSize: '0.78rem' }}>
                  {c.vigente_hasta ? String(c.vigente_hasta).slice(0, 10) : 'Abierta'}
                  {c.vencido && <span style={{ color: 'var(--color-error)', marginLeft: '0.3rem' }}>vencido</span>}
                </td>
                <td><span className={badgeClass(c.estatus)}>{c.estatus}</span></td>
                <td>{c.total_productos}</td>
                <td style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button className="btn-secundario" onClick={() => navigate(`/comercial/convenios/${c.id}`)}>Ver</button>
                  {c.estatus === 'pendiente_autorizacion' && (
                    <>
                      {(esCreador(c) || esSuperAdmin) && (
                        <button className="btn-secundario" onClick={() => navigate(`/comercial/convenios/${c.id}/editar`)}>Editar</button>
                      )}
                      {!esCreador(c) && (
                        <>
                          <button className="btn-primario" onClick={() => accion(autorizarConvenio, c.id)}>Autorizar</button>
                          <button className="btn-secundario" onClick={() => onRechazar(c.id)}>Rechazar</button>
                        </>
                      )}
                    </>
                  )}
                  {c.estatus !== 'cancelado' && !(c.estatus === 'autorizado' && esCreador(c) && !esSuperAdmin) && (
                    <button className="btn-secundario" onClick={() => accion(cancelarConvenio, c.id)}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
