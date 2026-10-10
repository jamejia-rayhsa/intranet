// modules/portal/frontend/pages/PortalHome.jsx
//
// Home responsive con sistema visual Rayhsa.
// Consume `obtenerNoticiasPublicadas` y particiona el resultado en:
//   - publicaciones: noticias y comunicados -> carrusel a pantalla completa (las 10 más recientes)
//   - vacantes (tipo === 'oferta_empleo') -> cinta inferior

import { useState, useEffect, useMemo } from 'react';
import { usarAuth } from '../context/AuthContext';
import { obtenerNoticiasPublicadas } from '../services/noticias.service';

import NewsCarousel from '../components/NewsCarousel';
import JobsTicker from '../components/JobsTicker';
import ArticleModal from '../components/ArticleModal';

const MAX_PUBLICACIONES = 10;

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

  const { publicaciones, vacantes } = useMemo(() => {
    const vacantes = todas.filter(n => n.tipo === 'oferta_empleo');
    // Noticias y comunicados comparten el carrusel; se limita para que las barras de progreso sigan siendo legibles
    const publicaciones = todas.filter(n => n.tipo !== 'oferta_empleo').slice(0, MAX_PUBLICACIONES);
    return { publicaciones, vacantes };
  }, [todas]);

  if (cargando) {
    return <p style={{ color: 'var(--color-texto-claro)' }}>Cargando noticias…</p>;
  }

  return (
    <>
      {/* Hero opcional — descoméntalo si quieres bienvenida personalizada */}
      {/* <Hero usuario={usuario} stats={{ noticias: publicaciones.length, comunicados: 0, vacantes: vacantes.length }} /> */}

      {publicaciones.length > 0 && (
        <NewsCarousel
          noticias={publicaciones}
          onOpen={(n) => setModalItem({ kind: n.tipo === 'comunicado' ? 'comunicado' : 'news', noticia: n })}
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
