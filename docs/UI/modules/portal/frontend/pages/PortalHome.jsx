// modules/portal/frontend/pages/PortalHome.jsx
//
// Home responsive con sistema visual Rayhsa.
// Consume `obtenerNoticiasPublicadas` y particiona el resultado en:
//   - noticias (tipo === 'noticia' u otros)
//   - comunicados (tipo === 'comunicado')
//   - vacantes (tipo === 'oferta_empleo')

import { useState, useEffect, useMemo } from 'react';
import { usarAuth } from '../context/AuthContext';
import { obtenerNoticiasPublicadas } from '../services/noticias.service';

import NewsCarousel from '../components/NewsCarousel';
import ComunicadosGrid from '../components/ComunicadosGrid';
import JobsTicker from '../components/JobsTicker';
import ArticleModal from '../components/ArticleModal';

function Hero({ usuario, stats }) {
  const nombre = usuario?.nombre || 'colaborador';
  const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <section className="hero">
      <h1 className="hero-titulo">Hola, {nombre}.</h1>
      <p className="hero-sub">
        {fecha[0].toUpperCase() + fecha.slice(1)} ·{' '}
        Bienvenido al portal de Rayhsa.
      </p>
      <div className="hero-kpis">
        <div className="hero-kpi">
          <span className="hero-kpi-valor">{stats.noticias}</span>
          <span className="hero-kpi-label">Noticias activas</span>
        </div>
        <div className="hero-kpi">
          <span className="hero-kpi-valor">{stats.comunicados}</span>
          <span className="hero-kpi-label">Comunicados</span>
        </div>
        <div className="hero-kpi">
          <span className="hero-kpi-valor">{stats.vacantes}</span>
          <span className="hero-kpi-label">Vacantes</span>
        </div>
      </div>
    </section>
  );
}

export default function PortalHome() {
  const { usuario } = usarAuth();
  const [todas, setTodas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalItem, setModalItem] = useState(null);

  useEffect(() => {
    obtenerNoticiasPublicadas(1, 50)
      .then(r => { if (r.exito) setTodas(r.datos?.noticias || r.datos || []); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  const { noticias, comunicados, vacantes } = useMemo(() => {
    const noticias = todas.filter(n => !n.tipo || n.tipo === 'noticia');
    const comunicados = todas.filter(n => n.tipo === 'comunicado');
    const vacantes = todas.filter(n => n.tipo === 'oferta_empleo');
    return { noticias, comunicados, vacantes };
  }, [todas]);

  if (cargando) {
    return <p style={{ color: 'var(--color-texto-claro)' }}>Cargando noticias…</p>;
  }

  return (
    <>
      {/* Hero opcional — descoméntalo si quieres bienvenida personalizada */}
      {/* <Hero usuario={usuario} stats={{ noticias: noticias.length, comunicados: comunicados.length, vacantes: vacantes.length }} /> */}

      {noticias.length > 0 && (
        <NewsCarousel
          noticias={noticias}
          onOpen={(n) => setModalItem({ kind: 'news', noticia: n })}
        />
      )}

      {comunicados.length > 0 && (
        <ComunicadosGrid
          comunicados={comunicados}
          onOpen={(c) => setModalItem({ kind: 'comunicado', noticia: c })}
          verArchivoTo="/noticias?tipo=comunicado"
        />
      )}

      {vacantes.length > 0 && (
        <JobsTicker
          vacantes={vacantes.map(v => ({
            id: v.id,
            titulo: v.titulo,
            ubicacion: v.ubicacion,
            departamento: v.departamento || v.area,
          }))}
        />
      )}

      {modalItem && (
        <ArticleModal item={modalItem} onClose={() => setModalItem(null)} />
      )}
    </>
  );
}
