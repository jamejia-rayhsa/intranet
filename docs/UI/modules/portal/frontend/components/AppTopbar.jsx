// modules/portal/frontend/components/AppTopbar.jsx
//
// Topbar de la intranet con buscador global, notificaciones y avatar.
// Reemplaza el header simple que vivía en main.jsx (LayoutConMenu).
//
// Compatible con el sidebar drawer mobile — recibe `onMenu` para abrir el sidebar.

import Icons from './Icons';
import { usarAuth } from '../context/AuthContext';

export default function AppTopbar({ onMenu, breadcrumb = ['Portal'] }) {
  const { usuario } = usarAuth();
  const inicial = usuario?.nombre?.charAt(0).toUpperCase() || '?';
  const nombreCorto = usuario?.nombre || 'Usuario';

  return (
    <header className="app-topbar">
      <button className="responsive-hamburger" onClick={onMenu} aria-label="Menú">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <span className="responsive-brand" aria-hidden="true">RAYHSA</span>

      <div className="topbar-breadcrumb">
        <strong>{breadcrumb[0]}</strong>
        {breadcrumb[1] && (<> · <span>{breadcrumb[1]}</span></>)}
      </div>

      <div className="topbar-buscador">
        {Icons.search}
        <input placeholder="Buscar en la intranet…" />
        <kbd>⌘K</kbd>
      </div>

      <div className="topbar-acciones">
        <button className="topbar-icon-btn" aria-label="Notificaciones">
          {Icons.bell}
          <span className="dot" />
        </button>
        <div className="topbar-usuario">
          <div className="topbar-avatar">{inicial}</div>
          <div className="topbar-nombre">
            {nombreCorto}
            {usuario?.correo && <small>{usuario.correo}</small>}
          </div>
        </div>
      </div>
    </header>
  );
}
