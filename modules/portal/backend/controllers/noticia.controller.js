const Noticia = require("../models/noticia.model");
const Storage = require("../services/storage.service");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");

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

// Auditoría desde el controlador, tras el éxito: ids y campos cambiados, nunca contenido ni archivos.
// Un fallo de auditoría no interrumpe la operación.
async function auditar(req, tabla, registroId, accion, previos, nuevos) {
  try {
    await registrarAccion(req, "portal", tabla, registroId, accion, previos || null, nuevos || null);
  } catch (error) {
    console.error("Error al registrar auditoría de noticias:", error.message);
  }
}

// Endpoints públicos: el detalle técnico va al log del servidor, no al cliente
function errorPublico(res, contexto, error) {
  console.error(`${contexto}:`, error);
  return res.status(500).json({ exito: false, mensaje: contexto });
}

// Listado público: tope de registros por página y OFFSET que cabe en INT4 (si no, Postgres responde 500)
const LIMITE_MAXIMO_PUBLICO = 100;
const MAX_INT4 = 2147483647;

const tipoVacio = (tipo) => tipo === undefined || tipo === null || tipo === "";

const ControladorNoticia = {
  async listarPublicadas(req, res) {
    try {
      const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina);
      const limite = req.query.limite === undefined ? 10 : Number(req.query.limite);
      if (!Number.isInteger(pagina) || pagina < 1 || !Number.isInteger(limite) || limite < 1) {
        return res.status(400).json({ exito: false, mensaje: "pagina y limite deben ser enteros positivos" });
      }
      if (limite > LIMITE_MAXIMO_PUBLICO) {
        return res.status(400).json({ exito: false, mensaje: `limite no puede superar ${LIMITE_MAXIMO_PUBLICO}` });
      }
      if ((pagina - 1) * limite > MAX_INT4) {
        return res.status(400).json({ exito: false, mensaje: "pagina fuera de rango" });
      }
      // Filtro opcional por tipo, validado contra la lista única; se aplica en SQL antes de paginar
      const { tipo } = req.query;
      const filtroTipo = tipoVacio(tipo) ? null : tipo;
      if (filtroTipo && !esTipoValido(filtroTipo)) {
        return res.status(400).json({ exito: false, mensaje: mensajeTipoInvalido() });
      }

      const noticias = (await Noticia.obtenerPublicadas(pagina, limite, filtroTipo)).map(paraPublico);
      const total = await Noticia.contarPublicadas(filtroTipo);

      res.json({
        exito: true,
        datos: {
          noticias,
          total,
          pagina,
          limite,
          paginas_totales: Math.ceil(total / limite),
        },
      });
    } catch (error) {
      errorPublico(res, "Error al listar noticias", error);
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
      errorPublico(res, "Error al obtener noticia", error);
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

      // Auditoría tras el éxito, sin contenido: solo id y datos de clasificación
      await auditar(req, "noticias", noticia.id, "INSERT", null, { tipo: noticia.tipo, publicada: noticia.publicada });
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
      await auditar(req, "noticias", req.params.id, "UPDATE", null, {
        campos: Object.keys(datos),
        ...(datos.tipo !== undefined && { tipo: datos.tipo }),
        ...(datos.publicada !== undefined && { publicada: datos.publicada }),
      });
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
      await auditar(req, "noticias", req.params.id, "DELETE", {
        titulo: noticia.titulo,
        tipo: noticia.tipo,
        imagenes: ((previa && previa.imagenes) || []).length,
      }, null);
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

      // Rechazo rápido sin subir nada (no autoritativo: el límite definitivo se comprueba bajo bloqueo)
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
      let resultado;
      try {
        // Transacción con la noticia bloqueada: límite + orden + INSERT atómicos
        resultado = await Noticia.agregarImagenConLimite(id, clave, req.file.originalname);
      } catch (errorBd) {
        await Storage.eliminar(Storage.BUCKETS.NOTICIAS, clave).catch(() => {});
        throw errorBd;
      }
      if (resultado.noExiste || resultado.limiteAlcanzado) {
        await Storage.eliminar(Storage.BUCKETS.NOTICIAS, clave).catch(() => {});
        if (resultado.noExiste) {
          return res.status(404).json({ exito: false, mensaje: "Noticia no encontrada" });
        }
        return res.status(400).json({
          exito: false,
          mensaje: `Límite de imágenes alcanzado. Máximo permitido: ${resultado.limiteAlcanzado}`,
        });
      }
      const imagen = { ...resultado.imagen, url: Storage.urlPublica(Storage.BUCKETS.NOTICIAS, clave) };
      await auditar(req, "noticia_imagenes", imagen.id, "INSERT", null, { noticia_id: Number(id), orden: imagen.orden });

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
      // Existencia, conjunto de ids y UPDATE se resuelven dentro de una sola transacción con bloqueo
      const resultado = await Noticia.reordenarImagenesAtomico(id, orden);
      if (resultado.noExiste) {
        return res.status(404).json({ exito: false, mensaje: "Noticia no encontrada" });
      }
      if (resultado.conjuntoDistinto) {
        return res.status(400).json({
          exito: false,
          mensaje: "La lista debe contener exactamente las imágenes de la publicación",
        });
      }
      await auditar(req, "noticia_imagenes", id, "UPDATE", null, { reordenar: orden });
      res.json({ exito: true, mensaje: "Orden actualizado" });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al reordenar imágenes", error: error.message });
    }
  },

  async eliminarImagen(req, res) {
    try {
      // Solo imágenes de la noticia de la URL; si no pertenece responde 404 sin tocar Storage ni la fila
      const imagen = await Noticia.obtenerImagen(req.params.imagenId, req.params.id);
      if (!imagen) {
        return res.status(404).json({ exito: false, mensaje: "Imagen no encontrada" });
      }

      await limpiarObjeto(imagen.ruta_archivo);

      await Noticia.eliminarImagen(imagen.id, req.params.id);
      await auditar(req, "noticia_imagenes", imagen.id, "DELETE", { noticia_id: imagen.noticia_id }, null);
      res.json({ exito: true, mensaje: "Imagen eliminada" });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: "Error al eliminar imagen", error: error.message });
    }
  },
};

module.exports = ControladorNoticia;
