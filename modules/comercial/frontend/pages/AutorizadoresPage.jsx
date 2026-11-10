// modules/comercial/frontend/pages/AutorizadoresPage.jsx
// Administración de la lista de personas que pueden autorizar convenios de compra.
// Solo super_admin (el backend lo exige; aquí no se filtra por permiso granular de "Convenios").

import { useState, useEffect } from 'react';
import { solicitar } from '../../../portal/frontend/utils/api';
import { usarAuth } from '../../../portal/frontend/context/AuthContext';
import { listarAutorizadores, agregarAutorizador, quitarAutorizador } from '../services/convenios.service';
import PageHeader from '../../../portal/frontend/components/PageHeader';
import '../styles/comercial.css';

export default function AutorizadoresPage() {
  const { usuario } = usarAuth();
  // Trampa: /auth/perfil (ver auth.controller.js#obtenerPerfil) NUNCA manda un campo `rol_nombre` en
  // el perfil del propio usuario, solo `roles: string[]` (nombres de rol). `usuario?.rol_nombre` sería
  // siempre undefined y esta página nunca dejaría administrar la lista a un super_admin real.
  const esSuperAdmin = Array.isArray(usuario?.roles) && usuario.roles.includes('super_admin');
  const [autorizadores, setAutorizadores] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [seleccion, setSeleccion] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const [resAut, resUsu] = await Promise.all([listarAutorizadores(), solicitar('/usuarios')]);
      if (resAut.exito) setAutorizadores(resAut.datos);
      if (resUsu.exito) setUsuarios(resUsu.datos);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la lista de autorizadores');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (esSuperAdmin) cargar();
    else setCargando(false);
  }, [esSuperAdmin]);

  if (!esSuperAdmin) {
    return (
      <>
        <PageHeader eyebrow="Módulo · Comercial" title="Autorizadores de convenios" />
        <p style={{ color: 'var(--color-texto-claro)' }}>
          Solo un super_admin puede administrar la lista de autorizadores.
        </p>
      </>
    );
  }

  async function agregar(e) {
    e.preventDefault();
    if (!seleccion) return;
    try {
      await agregarAutorizador(Number(seleccion));
      setSeleccion('');
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo agregar el autorizador');
    }
  }

  async function quitar(usuarioId) {
    try {
      await quitarAutorizador(usuarioId);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo quitar el autorizador');
    }
  }

  const activos = autorizadores.filter(a => a.activo);
  const disponibles = usuarios.filter(u => !activos.some(a => a.usuario_id === u.id));

  return (
    <>
      <PageHeader
        eyebrow="Módulo · Comercial"
        title="Autorizadores de convenios"
        subtitle="Personas que pueden autorizar o rechazar convenios de compra (nunca el propio creador)"
      />

      {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}

      <form onSubmit={agregar} className="credito-filtros">
        <select value={seleccion} onChange={e => setSeleccion(e.target.value)}>
          <option value="">Seleccionar usuario…</option>
          {disponibles.map(u => (
            <option key={u.id} value={u.id}>{u.nombre} {u.apellido || ''} ({u.correo})</option>
          ))}
        </select>
        <button type="submit" className="btn-primario">Agregar</button>
      </form>

      {cargando ? (
        <p style={{ color: 'var(--color-texto-claro)' }}>Cargando…</p>
      ) : activos.length === 0 ? (
        <p style={{ color: 'var(--color-texto-claro)', padding: '1rem' }}>No hay autorizadores activos.</p>
      ) : (
        <table className="credito-tabla">
          <thead>
            <tr><th>Nombre</th><th>Correo</th><th>Agregado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {activos.map(a => (
              <tr key={a.usuario_id}>
                <td>{a.usuario_nombre} {a.usuario_apellido || ''}</td>
                <td>{a.usuario_correo}</td>
                <td style={{ fontSize: '0.78rem' }}>{new Date(a.fecha_agregado).toLocaleDateString('es-MX')}</td>
                <td><button className="btn-secundario" onClick={() => quitar(a.usuario_id)}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
