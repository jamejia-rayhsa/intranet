// modules/portal/frontend/pages/PermisosAdminPage.jsx
import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function obtenerToken() {
  return localStorage.getItem('token');
}

export default function PermisosAdminPage() {
  const [roles, setRoles] = useState([]);
  const [rolSeleccionado, setRolSeleccionado] = useState('');
  const [opciones, setOpciones] = useState({});
  const [permisos, setPermisos] = useState({});
  const [moduloAbierto, setModuloAbierto] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const [mensajes, setMensajes] = useState({});

  useEffect(() => {
    fetch(`${API}/roles`, { headers: { Authorization: `Bearer ${obtenerToken()}` } })
      .then(r => r.json())
      .then(j => { if (j.exito) setRoles(j.datos); });
  }, []);

  useEffect(() => {
    fetch(`${API}/permisos/opciones`, { headers: { Authorization: `Bearer ${obtenerToken()}` } })
      .then(r => r.json())
      .then(j => {
        if (!j.exito) return;
        const agrupadas = {};
        j.datos.forEach(o => {
          if (!agrupadas[o.modulo]) agrupadas[o.modulo] = [];
          agrupadas[o.modulo].push(o);
        });
        setOpciones(agrupadas);
      });
  }, []);

  useEffect(() => {
    if (!rolSeleccionado) return;
    fetch(`${API}/permisos/rol/${rolSeleccionado}`, { headers: { Authorization: `Bearer ${obtenerToken()}` } })
      .then(r => r.json())
      .then(j => {
        if (!j.exito) return;
        const mapa = {};
        j.datos.forEach(p => {
          if (!mapa[p.opcion_id]) mapa[p.opcion_id] = new Set();
          mapa[p.opcion_id].add(p.tipo);
        });
        setPermisos(mapa);
      });
  }, [rolSeleccionado]);

  function togglePermiso(opcion_id, tipo) {
    setPermisos(prev => {
      const nuevo = { ...prev };
      if (!nuevo[opcion_id]) nuevo[opcion_id] = new Set();
      else nuevo[opcion_id] = new Set(nuevo[opcion_id]);

      if (tipo === 'edicion') {
        if (nuevo[opcion_id].has('edicion')) {
          nuevo[opcion_id].delete('edicion');
          nuevo[opcion_id].delete('consulta');
        } else {
          nuevo[opcion_id].add('edicion');
          nuevo[opcion_id].add('consulta');
        }
      } else {
        if (nuevo[opcion_id].has('edicion')) return prev;
        if (nuevo[opcion_id].has('consulta')) nuevo[opcion_id].delete('consulta');
        else nuevo[opcion_id].add('consulta');
      }
      return nuevo;
    });
  }

  async function guardarModulo(modulo) {
    setGuardando(modulo);
    const opcionesModulo = opciones[modulo] || [];
    const payload = opcionesModulo.map(o => ({
      opcion_id: o.id,
      tipos: Array.from(permisos[o.id] || []),
    }));

    try {
      const resp = await fetch(`${API}/permisos/rol/${rolSeleccionado}/modulo/${modulo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${obtenerToken()}` },
        body: JSON.stringify({ permisos: payload }),
      });
      const json = await resp.json();
      setMensajes(prev => ({ ...prev, [modulo]: { tipo: json.exito ? 'exito' : 'error', texto: json.mensaje } }));
    } catch {
      setMensajes(prev => ({ ...prev, [modulo]: { tipo: 'error', texto: 'Error de conexión' } }));
    } finally {
      setGuardando(null);
      setTimeout(() => setMensajes(prev => { const n = { ...prev }; delete n[modulo]; return n; }), 3000);
    }
  }

  return (
    <div className="contenido-principal">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Administración de Permisos</h1>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ fontWeight: 600, marginRight: '0.75rem' }}>Rol:</label>
        <select
          value={rolSeleccionado}
          onChange={e => setRolSeleccionado(e.target.value)}
          style={{ padding: '0.5rem 1rem', border: '1px solid var(--color-borde)', borderRadius: '6px', fontSize: '0.95rem' }}
        >
          <option value="">— Selecciona un rol —</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </div>

      {!rolSeleccionado && (
        <p style={{ color: 'var(--color-texto-claro)' }}>Selecciona un rol para ver y editar sus permisos.</p>
      )}

      {rolSeleccionado && Object.entries(opciones).map(([modulo, opcionesModulo]) => (
        <div key={modulo} style={{ border: '1px solid var(--color-borde)', borderRadius: '8px', marginBottom: '0.75rem', overflow: 'hidden' }}>
          <button
            onClick={() => setModuloAbierto(moduloAbierto === modulo ? null : modulo)}
            style={{ width: '100%', padding: '0.875rem 1rem', background: moduloAbierto === modulo ? 'var(--color-primario)' : 'var(--color-superficie)', color: moduloAbierto === modulo ? '#fff' : 'var(--color-texto)', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, fontSize: '0.95rem', textTransform: 'capitalize' }}
          >
            <span>{modulo}</span>
            <span>{moduloAbierto === modulo ? '▲' : '▼'}</span>
          </button>

          {moduloAbierto === modulo && (
            <div style={{ padding: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--color-texto-claro)', fontWeight: 600 }}>Opción</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--color-texto-claro)', fontWeight: 600 }}>Consulta</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--color-texto-claro)', fontWeight: 600 }}>Edición</th>
                  </tr>
                </thead>
                <tbody>
                  {opcionesModulo.map(o => (
                    <tr key={o.id} style={{ borderTop: '1px solid var(--color-borde)' }}>
                      <td style={{ padding: '0.5rem' }}>{o.nombre}</td>
                      <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                        <input type="checkbox" checked={permisos[o.id]?.has('consulta') || false} onChange={() => togglePermiso(o.id, 'consulta')} />
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                        <input type="checkbox" checked={permisos[o.id]?.has('edicion') || false} onChange={() => togglePermiso(o.id, 'edicion')} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
                {mensajes[modulo] && (
                  <span style={{ fontSize: '0.85rem', color: mensajes[modulo].tipo === 'exito' ? 'var(--color-exito)' : 'var(--color-error)' }}>
                    {mensajes[modulo].texto}
                  </span>
                )}
                <button
                  onClick={() => guardarModulo(modulo)}
                  disabled={guardando === modulo}
                  style={{ padding: '0.5rem 1.25rem', background: 'var(--color-primario)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                >
                  {guardando === modulo ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
