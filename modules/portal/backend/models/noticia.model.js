const { grupo } = require("../config/database");

const IMAGENES_AGG = `
  COALESCE((
    SELECT JSON_AGG(ni ORDER BY ni.orden ASC, ni.id ASC)
    FROM noticia_imagenes ni
    WHERE ni.noticia_id = n.id
  ), '[]'::json) AS imagenes
`;

const { urlPublica, BUCKETS } = require("../services/storage.service");

// Agrega imagenes[].url a las filas con clave de Storage (las legadas /uploads/ la conservan)
function conUrls(noticia) {
  if (!noticia || !Array.isArray(noticia.imagenes)) return noticia;
  noticia.imagenes = noticia.imagenes.map((img) =>
    img && img.ruta_archivo && !img.ruta_archivo.startsWith("/uploads/")
      ? { ...img, url: urlPublica(BUCKETS.NOTICIAS, img.ruta_archivo) }
      : img,
  );
  return noticia;
}

const Noticia = {
  async crear(datos) {
    const {
      titulo,
      subtitulo,
      contenido,
      tipo,
      fecha_publicacion,
      publicada,
      autor_id,
      fecha_evento,
      lugar,
    } = datos;
    const consulta = `
      INSERT INTO noticias (titulo, subtitulo, contenido, tipo, fecha_publicacion, publicada, autor_id, fecha_evento, lugar)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const valores = [
      titulo,
      subtitulo || null,
      contenido || null,
      tipo || "noticia",
      fecha_publicacion || new Date(),
      publicada || false,
      autor_id,
      fecha_evento || null,
      lugar || null,
    ];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerPublicadas(pagina = 1, limite = 10) {
    const desplazamiento = (pagina - 1) * limite;
    const consulta = `
      SELECT n.*, u.nombre as autor_nombre, u.apellido as autor_apellido,
        ${IMAGENES_AGG}
      FROM noticias n
      LEFT JOIN usuarios u ON n.autor_id = u.id
      WHERE n.publicada = true
      ORDER BY n.fecha_publicacion DESC
      LIMIT $1 OFFSET $2
    `;
    const resultado = await grupo.query(consulta, [limite, desplazamiento]);
    return resultado.rows.map(conUrls);
  },

  async obtenerTodas(pagina = 1, limite = 20) {
    const desplazamiento = (pagina - 1) * limite;
    const consulta = `
      SELECT n.*, u.nombre as autor_nombre, u.apellido as autor_apellido,
        ${IMAGENES_AGG}
      FROM noticias n
      LEFT JOIN usuarios u ON n.autor_id = u.id
      ORDER BY n.fecha_creacion DESC
      LIMIT $1 OFFSET $2
    `;
    const resultado = await grupo.query(consulta, [limite, desplazamiento]);
    return resultado.rows.map(conUrls);
  },

  async obtenerPorId(id) {
    const consulta = `
      SELECT n.*, u.nombre as autor_nombre, u.apellido as autor_apellido,
        ${IMAGENES_AGG}
      FROM noticias n
      LEFT JOIN usuarios u ON n.autor_id = u.id
      WHERE n.id = $1
    `;
    const resultado = await grupo.query(consulta, [id]);
    return conUrls(resultado.rows[0]);
  },

  async actualizar(id, datos) {
    const campos = [];
    const valores = [];
    let contador = 1;

    if (datos.titulo !== undefined) {
      campos.push(`titulo = $${contador}`);
      valores.push(datos.titulo);
      contador++;
    }
    if (datos.subtitulo !== undefined) {
      campos.push(`subtitulo = $${contador}`);
      valores.push(datos.subtitulo);
      contador++;
    }
    if (datos.contenido !== undefined) {
      campos.push(`contenido = $${contador}`);
      valores.push(datos.contenido);
      contador++;
    }
    if (datos.tipo !== undefined) {
      campos.push(`tipo = $${contador}`);
      valores.push(datos.tipo);
      contador++;
    }
    if (datos.fecha_publicacion !== undefined) {
      campos.push(`fecha_publicacion = $${contador}`);
      valores.push(datos.fecha_publicacion);
      contador++;
    }
    if (datos.fecha_evento !== undefined) {
      campos.push(`fecha_evento = $${contador}`);
      valores.push(datos.fecha_evento);
      contador++;
    }
    if (datos.lugar !== undefined) {
      campos.push(`lugar = $${contador}`);
      valores.push(datos.lugar);
      contador++;
    }
    if (datos.publicada !== undefined) {
      campos.push(`publicada = $${contador}`);
      valores.push(datos.publicada);
      contador++;
    }

    campos.push("fecha_actualizacion = NOW()");
    valores.push(id);

    const consulta = `UPDATE noticias SET ${campos.join(", ")} WHERE id = $${contador} RETURNING *`;
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async eliminar(id) {
    const consulta = "DELETE FROM noticias WHERE id = $1 RETURNING *";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async contarPublicadas() {
    const resultado = await grupo.query(
      "SELECT COUNT(*) FROM noticias WHERE publicada = true",
    );
    return parseInt(resultado.rows[0].count);
  },

  async contarTodas() {
    const resultado = await grupo.query("SELECT COUNT(*) FROM noticias");
    return parseInt(resultado.rows[0].count);
  },

  // --- Gestión de imágenes ---

  async contarImagenes(noticiaId) {
    const resultado = await grupo.query(
      "SELECT COUNT(*) FROM noticia_imagenes WHERE noticia_id = $1",
      [noticiaId],
    );
    return parseInt(resultado.rows[0].count);
  },

  async agregarImagen(noticiaId, rutaArchivo, nombreArchivo) {
    // Siempre al final: máximo actual + 1 (contar duplicaría el orden tras borrar una imagen intermedia)
    const consulta = `
      INSERT INTO noticia_imagenes (noticia_id, ruta_archivo, nombre_archivo, orden)
      VALUES ($1, $2, $3, (SELECT COALESCE(MAX(orden), -1) + 1 FROM noticia_imagenes WHERE noticia_id = $1))
      RETURNING *
    `;
    const resultado = await grupo.query(consulta, [
      noticiaId,
      rutaArchivo,
      nombreArchivo,
    ]);
    return resultado.rows[0];
  },

  async idsImagenes(noticiaId) {
    const resultado = await grupo.query(
      "SELECT id FROM noticia_imagenes WHERE noticia_id = $1 ORDER BY orden ASC, id ASC",
      [noticiaId],
    );
    return resultado.rows.map((fila) => fila.id);
  },

  // Reasigna orden = posición en la lista (0..n-1) en una sola transacción
  async reordenarImagenes(noticiaId, idsEnOrden) {
    const cliente = await grupo.connect();
    try {
      await cliente.query("BEGIN");
      for (let posicion = 0; posicion < idsEnOrden.length; posicion++) {
        await cliente.query(
          "UPDATE noticia_imagenes SET orden = $1 WHERE id = $2 AND noticia_id = $3",
          [posicion, idsEnOrden[posicion], noticiaId],
        );
      }
      await cliente.query("COMMIT");
    } catch (error) {
      await cliente.query("ROLLBACK");
      throw error;
    } finally {
      cliente.release();
    }
  },

  async obtenerImagen(id) {
    const consulta = "SELECT * FROM noticia_imagenes WHERE id = $1";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async eliminarImagen(id) {
    const consulta =
      "DELETE FROM noticia_imagenes WHERE id = $1 RETURNING *";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },
};

module.exports = Noticia;
