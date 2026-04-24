const path = require("path");
const fs = require("fs");

const ServicioArchivo = {
  obtenerRutaAlmacenamiento() {
    const ruta = path.join(process.cwd(), "uploads", "tickets");
    if (!fs.existsSync(ruta)) {
      fs.mkdirSync(ruta, { recursive: true });
    }
    return ruta;
  },

  generarNombreArchivo(nombreOriginal) {
    const extension = path.extname(nombreOriginal);
    const nombreBase = path
      .basename(nombreOriginal, extension)
      .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, "_");
    const marcaTiempo = Date.now();
    const aleatorio = Math.random().toString(36).substring(2, 8);
    return `${marcaTiempo}_${aleatorio}_${nombreBase}${extension}`;
  },

  async eliminarArchivo(rutaArchivo) {
    const rutaCompleta = path.join(process.cwd(), rutaArchivo);
    if (fs.existsSync(rutaCompleta)) {
      fs.unlinkSync(rutaCompleta);
    }
  },

  validarTipoArchivo(tipoMime) {
    const tiposPermitidos = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ];

    return tiposPermitidos.includes(tipoMime);
  },
};

module.exports = ServicioArchivo;
