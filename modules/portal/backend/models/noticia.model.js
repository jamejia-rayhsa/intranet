const { grupo } = require("../config/database");

const IMAGENES_AGG = `
  COALESCE((
    SELECT JSON_AGG(ni ORDER BY ni.orden ASC, ni.fecha_subida ASC)
    FROM noticia_imagenes ni
    WHERE ni.noticia_id = n.id
  ), '[]'::json) AS imagenes
`;

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
    } = datos;
    const consulta = `
      INSERT INTO noticias (titulo, subtitulo, contenido, tipo, fecha_publicacion, publicada, autor_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
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
    return resultado.rows;
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
    return resultado.rows;
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
    return resultado.rows[0];
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
    const orden = await this.contarImagenes(noticiaId);
    const consulta = `
      INSERT INTO noticia_imagenes (noticia_id, ruta_archivo, nombre_archivo, orden)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const resultado = await grupo.query(consulta, [
      noticiaId,
      rutaArchivo,
      nombreArchivo,
      orden,
    ]);
    return resultado.rows[0];
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
