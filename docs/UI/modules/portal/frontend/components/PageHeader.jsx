// modules/portal/frontend/components/PageHeader.jsx
/**
 * PageHeader — eyebrow + h1 + subtitle + acciones a la derecha.
 */
export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="pagina-encabezado">
      <div className="pagina-titulo-grupo">
        {eyebrow && <span className="pagina-eyebrow">{eyebrow}</span>}
        <h1 className="pagina-h1">{title}</h1>
        {subtitle && <p className="pagina-sub">{subtitle}</p>}
      </div>
      {actions && <div className="pagina-acciones">{actions}</div>}
    </div>
  );
}
