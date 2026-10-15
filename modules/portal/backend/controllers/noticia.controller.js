const Noticia = require("../models/noticia.model");
const Storage = require("../services/storage.service");

const { esTipoValido, limiteImagenes, mensajeTipoInvalido, paraPublico, validarCamposEvento, validarFechaEvento, validarLugarEvento } = require("../utils/tiposNoticia");

// Borra el objeto de Storage; un fallo de limpieza no debe impedir borrar la fila.
// Las rutas legadas (/uploads/...) aún no migradas no están en Storage.
async function limpiarObjeto(ruta) {
  if (!ruta || ruta.startsWith("/uploads/")) return;
  try {
    await Storage.eliminar(Storage.BUCKETS.NOTICIAS, ruta);
  } catch (err) {
    console.warn(`No se pudo borrar el objeto de Storage ${ruta}: ${err.message}`);
  }
}

const tipoVacio = (tipo) => tipo === undefined || tipo === null || tipo === "";

const ControladorNoticia = {
  async listarPublicadas(req, res) {
    try {
      const { pagina = 1, limite = 10 } = req.query;
      const noticias = (await Noticia.obtenerPublicadas(pagina, limite)).map(paraPublico);
      const total = await Noticia.contarPublicadas();

      res.json({
        exito: true,
        datos: {
          noticias,
          total,
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          paginas_totales: Math.ceil(total / limite),
        },
      });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al listar noticias", error: error.message });
    }
  },

  async listarTodas(req, res) {
    try {
      const { pagina = 1, limite = 20 } = req.query;
      const noticias = await Noticia.obtenerTodas(pagina, limite);
      const total = await Noticia.contarTodas();

      res.json({
        exito: true,
        datos: {
          noticias,
          total,
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          paginas_totales: Math.ceil(total / limite),
        },
      });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al listar noticias", error: error.message });
    }
  },

  // Público (sin auth): solo publicadas; borrador e inexistente responden igual (404). Boletín sin campos de texto.
  async obtenerPublica(req, res) {
    try {
      const noticia = await Noticia.obtenerPorId(req.params.id);
      if (!noticia || !noticia.publicada) {
        return res.status(404).json({ exito: false, mensaje: "Noticia no encontrada" });
      }
      res.json({ exito: true, datos: paraPublico(noticia) });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al obtener noticia", error: error.message });
    }
  },

  // Panel (autenticado, Noticias:consulta): cualquier noticia, borradores incluidos, con todos los campos
  async obtener(req, res) {
    try {
      const noticia = await Noticia.obtenerPorId(req.params.id);
      if (!noticia) {
        return res.status(404).json({ exito: false, mensaje: "Noticia no encontrada" });
      }
      res.json({ exito: true, datos: noticia });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al obtener noticia", error: error.message });
    }
  },

  async crear(req, res) {
    try {
      const { titulo, subtitulo, contenido, tipo, fecha_publicacion, publicada, fecha_evento, lugar } = req.body;

      if (!titulo) {
        return res.status(400).json({ exito: false, mensaje: "El título de la noticia es obligatorio" });
      }

      // Regla de tipo (crear y actualizar): ausente, null o "" = "no indicado" (crear: el modelo
      // aplica el default "noticia"; actualizar: no se modifica). Cualquier otro valor debe ser válido.
      if (!tipoVacio(tipo) && !esTipoValido(tipo)) {
        return res.status(400).json({ exito: false, mensaje: mensajeTipoInvalido() });
      }

      // Evento: fecha_evento y lugar obligatorios; en otros tipos se ignoran (quedan NULL)
      let datosEvento = { fecha_evento: null, lugar: null };
      if (tipo === "evento") {
        const v = validarCamposEvento({ fecha_evento, lugar });
        if (v.error) return res.status(400).json({ exito: false, mensaje: v.error });
        datosEvento = v;
      }

      const noticia = await Noticia.crear({
        titulo,
        subtitulo,
        contenido,
        tipo,
        fecha_publicacion,
        publicada,
        autor_id: req.user.usuario_id,
        fecha_evento: datosEvento.fecha_evento,
        lugar: datosEvento.lugar,
      });

      res.status(201).json({ exito: true, datos: noticia, mensaje: "Noticia creada exitosamente" });
    } catch (error) {
      res.status(400).json({ exito: false, mensaje: "Error al crear noticia", error: error.message });
    }
  },

  async actualizar(req, res) {
    try {
      const { tipo, ...resto } = req.body;
      if (!tipoVacio(tipo) && !esTipoValido(tipo)) {
        return res.status(400).json({ exito: false, mensaje: mensajeTipoInvalido() });
      }
      // tipo vacío = no cambiar: se omite para no escribir NULL en la columna
      const datos = tipoVacio(tipo) ? resto : { ...resto, tipo };

      // Cambiar a un tipo con menor límite de imágenes que las que ya tiene no está permitido
      if (!tipoVacio(tipo)) {
        const previa = await Noticia.obtenerPorId(req.params.id);
        if (previa && previa.tipo !== tipo) {
          const total = await Noticia.contarImagenes(req.params.id);
          const maximo = limiteImagenes(tipo);
          if (total > maximo) {
            return res.status(400).json({
              exito: false,
              mensaje: `Esta publicación tiene ${total} imágenes; el tipo ${tipo} admite ${maximo}. Quita imágenes antes de cambiar el tipo.`,
            });
          }
        }
      }

      // Evento: tipo explícito 'evento' exige fecha y lugar; sin tipo en el cuerpo, si la publicación
      // ya es evento se validan los campos que lleguen; fuera de evento se ignoran y, al cambiar
      // de tipo, se ponen a NULL.
      const tocaEvento = resto.fecha_evento !== undefined || resto.lugar !== undefined;
      let tipoEfectivo = tipo;
      if (tipoVacio(tipo) && tocaEvento) {
        const actual = await Noticia.obtenerPorId(req.params.id);
        tipoEfectivo = actual && actual.tipo;
      }
      if (!tipoVacio(tipo) && tipo === "evento") {
        // Se declara evento: ambos campos obligatorios
        const v = validarCamposEvento({ fecha_evento: resto.fecha_evento, lugar: resto.lugar });
        if (v.error) return res.status(400).json({ exito: false, mensaje: v.error });
        datos.fecha_evento = v.fecha_evento;
        datos.lugar = v.lugar;
      } else if (tipoEfectivo === "evento") {
        // Ya es evento y el cuerpo no cambia el tipo: se validan solo los campos que lleguen
        if (resto.fecha_evento !== undefined) {
          const f = validarFechaEvento(resto.fecha_evento);
          if (f.error) return res.status(400).json({ exito: false, mensaje: f.error });
          datos.fecha_evento = f.valor;
        }
        if (resto.lugar !== undefined) {
          const l = validarLugarEvento(resto.lugar);
          if (l.error) return res.status(400).json({ exito: false, mensaje: l.error });
          datos.lugar = l.valor;
        }
      } else if (!tipoVacio(tipo)) {
        datos.fecha_evento = null; // cambia a un tipo que no es evento
        datos.lugar = null;
      } else {
        delete datos.fecha_evento; // no es evento: se ignoran
        delete datos.lugar;
      }

      const noticia = await Noticia.actualizar(req.params.id, datos);
      if (!noticia) {
        return res.status(404).json({ exito: false, mensaje: "Noticia no encontrada" });
      }
      res.json({ exito: true, datos: noticia, mensaje: "Noticia actualizada exitosamente" });
    } catch (error) {
      res.status(400).json({ exito: false, mensaje: "Error al actualizar noticia", error: error.message });
    }
  },

  async eliminar(req, res) {
    try {
      const previa = await Noticia.obtenerPorId(req.params.id);
      const noticia = await Noticia.eliminar(req.params.id);
      if (!noticia) {
        return res.status(404).json({ exito: false, mensaje: "Noticia no encontrada" });
      }
      for (const img of (previa && previa.imagenes) || []) {
        await limpiarObjeto(img.ruta_archivo);
      }
      res.json({ exito: true, mensaje: "Noticia eliminada exitosamente" });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al eliminar noticia", error: error.message });
    }
  },

  // --- Imágenes ---

  async subirImagen(req, res) {
    try {
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ exito: false, mensaje: "No se recibió ningún archivo" });
      }

      const publicacion = await Noticia.obtenerPorId(id);
      if (!publicacion) {
        return res.status(404).json({ exito: false, mensaje: "Noticia no encontrada" });
      }

      const maximo = limiteImagenes(publicacion.tipo);
      const total = await Noticia.contarImagenes(id);
      if (total >= maximo) {
        return res.status(400).json({
          exito: false,
          mensaje: `Límite de imágenes alcanzado. Máximo permitido: ${maximo}`,
        });
      }

      const clave = Storage.claveSegura(req.file.originalname);
      await Storage.subir(Storage.BUCKETS.NOTICIAS, clave, req.file.buffer, req.file.mimetype);
      let imagen;
      try {
        imagen = await Noticia.agregarImagen(id, clave, req.file.originalname);
      } catch (errorBd) {
        await Storage.eliminar(Storage.BUCKETS.NOTICIAS, clave).catch(() => {});
        throw errorBd;
      }
      imagen = { ...imagen, url: Storage.urlPublica(Storage.BUCKETS.NOTICIAS, clave) };

      res.status(201).json({ exito: true, datos: imagen, mensaje: "Imagen subida exitosamente" });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al subir imagen", error: error.message });
    }
  },

  // Reordena las imágenes de una publicación: { orden: [idImagen, ...] } con exactamente sus imágenes
  async reordenarImagenes(req, res) {
    try {
      const { id } = req.params;
      const { orden } = req.body || {};
      if (!Array.isArray(orden) || orden.some((x) => !Number.isInteger(x)) || new Set(orden).size !== orden.length) {
        return res.status(400).json({ exito: false, mensaje: "orden debe ser una lista de ids de imagen sin repetir" });
      }
      const publicacion = await Noticia.obtenerPorId(id);
      if (!publicacion) {
        return res.status(404).json({ exito: false, mensaje: "Noticia no encontrada" });
      }
      const actuales = await Noticia.idsImagenes(id);
      const mismas = actuales.length === orden.length && actuales.every((x) => orden.includes(x));
      if (!mismas) {
        return res.status(400).json({
          exito: false,
          mensaje: "La lista debe contener exactamente las imágenes de la publicación",
        });
      }
      await Noticia.reordenarImagenes(id, orden);
      res.json({ exito: true, mensaje: "Orden actualizado" });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al reordenar imágenes", error: error.message });
    }
  },

  async eliminarImagen(req, res) {
    try {
      const imagen = await Noticia.obtenerImagen(req.params.imagenId);
      if (!imagen) {
        return res.status(404).json({ exito: false, mensaje: "Imagen no encontrada" });
      }

      await limpiarObjeto(imagen.ruta_archivo);

      await Noticia.eliminarImagen(imagen.id);
      res.json({ exito: true, mensaje: "Imagen eliminada" });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al eliminar imagen", error: error.message });
    }
  },
};

module.exports = ControladorNoticia;
