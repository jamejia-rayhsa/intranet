import { urlImagenNoticia } from "../utils/storage";
// modules/portal/frontend/components/ArticleModal.jsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icons from './Icons';


/**
 * ArticleModal — modal de lectura para una noticia o comunicado.
 *
 * Acepta dos formas de uso:
 *   1. `item={ kind: 'news', noticia }` — abre una noticia con sus imágenes y contenido.
 *   2. `item={ kind: 'comunicado', noticia }` — abre como comunicado con folio + banner urgente.
 *
 * Donde `noticia` es la entidad cruda de la API (`/api/noticias/:id`).
 */
export default function ArticleModal({ item, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!item) return null;
  const { kind = 'news', noticia } = item;
  if (!noticia) return null;

  const isNews = kind === 'news';
  const primeraImagen = noticia.imagenes?.[0];
  const onOverlay = (e) => { if (e.target === e.currentTarget) onClose(); };

  const meta = [
    noticia.tipo || (isNews ? 'Noticia' : 'Comunicado'),
    noticia.fecha_publicacion ? new Date(noticia.fecha_publicacion).toLocaleDateString('es-MX') : null,
    noticia.tiempo_lectura ? `${noticia.tiempo_lectura} min de lectura` : null,
    noticia.autor_nombre ? `Por ${noticia.autor_nombre} ${noticia.autor_apellido || ''}`.trim() : null,
  ].filter(Boolean);

  const folio = noticia.folio || noticia.codigo || (noticia.id ? `N-${String(noticia.id).padStart(3, '0')}` : null);
  const isUrgente = noticia.urgente || noticia.es_urgente;

  const content = (
    <div className="rayhsa-modal-overlay" onClick={onOverlay}>
      <div className="rayhsa-modal" role="dialog" aria-modal="true" style={{ position: 'relative' }}>
        <button className="rayhsa-modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>

        {isNews ? (
          <>
            <div className="rayhsa-modal__media" style={primeraImagen ? {
              backgroundImage: `url(${urlImagenNoticia(primeraImagen)}), linear-gradient(135deg, #002E6D 0%, #001e47 100%)`,
              backgroundSize: 'cover, cover',
              backgroundPosition: 'center, center',
            } : undefined}>
              <span className="badge badge-noticia">{noticia.tipo || 'Noticia'}</span>
              {!primeraImagen && <span className="ph">Sin imagen</span>}
            </div>
            <div className="rayhsa-modal__body">
              <div className="rayhsa-modal__meta">
                {meta.map((m, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    {m}{i < meta.length - 1 && <span className="sep" />}
                  </span>
                ))}
              </div>
              <h2 className="rayhsa-modal__titulo">{noticia.titulo}</h2>
              {noticia.subtitulo && <p className="rayhsa-modal__lead">{noticia.subtitulo}</p>}
              {noticia.contenido && (
                <div className="rayhsa-modal__contenido">
                  {noticia.contenido.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
                </div>
              )}
            </div>
            <div className="rayhsa-modal__acciones">
              <button className="rayhsa-modal__btn rayhsa-modal__btn--primario">Marcar como leído</button>
              <button className="rayhsa-modal__btn rayhsa-modal__btn--secundario">Compartir</button>
              {noticia.autor_nombre && (
                <span className="rayhsa-modal__acciones-meta">
                  Publicado por {noticia.autor_nombre} {noticia.autor_apellido}
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="rayhsa-modal__media rayhsa-modal__media--com">
              <span className={`badge ${isUrgente ? 'badge-urgente' : 'badge-comunicado'}`}>
                {isUrgente ? 'Urgente' : (noticia.tipo || 'Comunicado')}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#1a1f36', fontWeight: 600 }}>
                Comunicado oficial
              </span>
              {folio && <span className="rayhsa-modal__code">#{folio}</span>}
            </div>
            <div className="rayhsa-modal__body">
              {isUrgente && (
                <div className="rayhsa-modal__urgente">
                  {Icons.bell} Este comunicado requiere acción de tu parte.
                </div>
              )}
              <div className="rayhsa-modal__meta">
                {meta.map((m, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    {m}{i < meta.length - 1 && <span className="sep" />}
                  </span>
                ))}
              </div>
              <h2 className="rayhsa-modal__titulo">{noticia.titulo}</h2>
              {noticia.subtitulo && <p className="rayhsa-modal__lead">{noticia.subtitulo}</p>}
              {noticia.contenido && (
                <div className="rayhsa-modal__contenido">
                  {noticia.contenido.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
                </div>
              )}
            </div>
            <div className="rayhsa-modal__acciones">
              <button className="rayhsa-modal__btn rayhsa-modal__btn--primario">
                {isUrgente ? 'Confirmar recibido' : 'Marcar como leído'}
              </button>
              <button className="rayhsa-modal__btn rayhsa-modal__btn--secundario">Descargar PDF</button>
              {folio && (
                <span className="rayhsa-modal__acciones-meta">
                  Folio {folio}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
