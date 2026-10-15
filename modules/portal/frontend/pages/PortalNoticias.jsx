import { useState, useEffect } from 'react';
import { obtenerNoticiasPublicadas } from '../services/noticias.service';
import NoticiaCard from '../components/NoticiaCard';
import ArticleModal from '../components/ArticleModal';
import { TIPOS_NOTICIA, esMostrable } from '../utils/tiposNoticia';

export default function PortalNoticias() {
  const [noticias, setNoticias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [paginasTotales, setPaginasTotales] = useState(1);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modalItem, setModalItem] = useState(null);

  useEffect(() => {
    async function cargarNoticias() {
      setCargando(true);
      try {
        const respuesta = await obtenerNoticiasPublicadas(pagina, 12);
        if (respuesta.exito) {
          let filtradas = respuesta.datos.noticias.filter(esMostrable); // boletín sin imagen no se muestra
          if (filtroTipo) {
            filtradas = filtradas.filter((n) => n.tipo === filtroTipo);
          }
          setNoticias(filtradas);
          setPaginasTotales(respuesta.datos.paginas_totales);
        }
      } catch (error) {
        console.error('Error al cargar noticias:', error);
      } finally {
        setCargando(false);
      }
    }

    cargarNoticias();
  }, [pagina, filtroTipo]);

  return (
    <div className="portal-noticias">
      <h1>Noticias y Comunicados</h1>

      <div className="noticias-filtros">
        <select value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setPagina(1); }}>
          <option value="">Todos los tipos</option>
          {TIPOS_NOTICIA.map((t) => (
            <option key={t.valor} value={t.valor}>{t.plural}</option>
          ))}
        </select>
      </div>

      {cargando ? (
        <p>Cargando noticias...</p>
      ) : noticias.length === 0 ? (
        <p>No se encontraron noticias.</p>
      ) : (
        <>
          <div className="grid-noticias">
            {noticias.map((noticia) => (
              <NoticiaCard
                key={noticia.id}
                noticia={noticia}
                onAbrir={(n) => setModalItem({ kind: 'boletin', noticia: n })}
              />
            ))}
          </div>

          <div className="paginacion">
            <button disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
              Anterior
            </button>
            <span>Página {pagina} de {paginasTotales}</span>
            <button disabled={pagina >= paginasTotales} onClick={() => setPagina(pagina + 1)}>
              Siguiente
            </button>
          </div>
        </>
      )}
      {modalItem && <ArticleModal item={modalItem} onClose={() => setModalItem(null)} />}
    </div>
  );
}
