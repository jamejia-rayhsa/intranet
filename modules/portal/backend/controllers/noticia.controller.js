const path = require("path");
const fs = require("fs");
const Noticia = require("../models/noticia.model");

const MAX_IMAGENES = 5;

const ControladorNoticia = {
  async listarPublicadas(req, res) {
    try {
      const { pagina = 1, limite = 10 } = req.query;
      const noticias = await Noticia.obtenerPublicadas(pagina, limite);
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
      const { titulo, subtitulo, contenido, tipo, fecha_publicacion, publicada } = req.body;

      if (!titulo) {
        return res.status(400).json({ exito: false, mensaje: "El título de la noticia es obligatorio" });
      }

      const noticia = await Noticia.crear({
        titulo,
        subtitulo,
        contenido,
        tipo,
        fecha_publicacion,
        publicada,
        autor_id: req.user.usuario_id,
      });

      res.status(201).json({ exito: true, datos: noticia, mensaje: "Noticia creada exitosamente" });
    } catch (error) {
      res.status(400).json({ exito: false, mensaje: "Error al crear noticia", error: error.message });
    }
  },

  async actualizar(req, res) {
    try {
      const noticia = await Noticia.actualizar(req.params.id, req.body);
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
      const noticia = await Noticia.eliminar(req.params.id);
      if (!noticia) {
        return res.status(404).json({ exito: false, mensaje: "Noticia no encontrada" });
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

      const total = await Noticia.contarImagenes(id);
      if (total >= MAX_IMAGENES) {
        // Eliminar el archivo que acabó de subirse
        fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          exito: false,
          mensaje: `Límite de imágenes alcanzado. Máximo permitido: ${MAX_IMAGENES}`,
        });
      }

      const rutaRelativa = `/uploads/noticias/${req.file.filename}`;
      const imagen = await Noticia.agregarImagen(id, rutaRelativa, req.file.originalname);

      res.status(201).json({ exito: true, datos: imagen, mensaje: "Imagen subida exitosamente" });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al subir imagen", error: error.message });
    }
  },

  async eliminarImagen(req, res) {
    try {
      const imagen = await Noticia.obtenerImagen(req.params.imagenId);
      if (!imagen) {
        return res.status(404).json({ exito: false, mensaje: "Imagen no encontrada" });
      }

      // Eliminar archivo físico
      const rutaFisica = path.join(process.cwd(), imagen.ruta_archivo);
      await fs.promises.unlink(rutaFisica).catch(() => {});

      await Noticia.eliminarImagen(imagen.id);
      res.json({ exito: true, mensaje: "Imagen eliminada" });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al eliminar imagen", error: error.message });
    }
  },
};

module.exports = ControladorNoticia;
