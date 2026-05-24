// modules/portal/frontend/components/JobsTicker.jsx
import { Link } from 'react-router-dom';
import Icons from './Icons';

/**
 * JobsTicker — marquee continuo de ofertas internas.
 *
 * Acepta lista de entidades con { id, titulo, ubicacion|area, departamento }.
 * El ticker duplica la lista para que el loop CSS sea seamless.
 */
export default function JobsTicker({ vacantes = [], totalAbiertas, verTodasTo = '/noticias?tipo=oferta_empleo' }) {
  if (!vacantes.length) return null;
  const loop = [...vacantes, ...vacantes];

  return (
    <section className="seccion">
      <div className="jobs-card">
        <div className="jobs-head">
          <h2 className="jobs-head__titulo">
            {Icons.briefcase}
            Ofertas de empleo internas
            <span className="jobs-head__count">{totalAbiertas ?? vacantes.length} abiertas</span>
          </h2>
          <Link to={verTodasTo} className="jobs-head__cta">
            Ver todas las vacantes {Icons.arrUR}
          </Link>
        </div>

        <div className="jobs-ticker">
          <div className="jobs-track">
            {loop.map((v, i) => (
              <span className="job-item" key={`${v.id}-${i}`}>
                <span className="job-item__icon">{Icons.briefcase}</span>
                <span>
                  <span className="job-item__title">{v.titulo}</span>{' '}
                  <span className="job-item__loc">
                    · {v.ubicacion || ''}{v.ubicacion && v.departamento ? ' · ' : ''}{v.departamento || ''}
                  </span>
                </span>
                <span className="job-item__apply">Aplicar</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
