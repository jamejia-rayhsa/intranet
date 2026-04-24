const path = require("path");
const fs = require("fs");

const ServicioArchivoRH = {
  obtenerRutaExpediente() {
    const ruta = path.join(process.cwd(), "uploads", "expedientes");
    if (!fs.existsSync(ruta)) {
      fs.mkdirSync(ruta, { recursive: true });
    }
    return ruta;
  },

  obtenerRutaRecibos() {
    const ruta = path.join(process.cwd(), "uploads", "recibos");
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

  validarTipoDocumento(tipoMime) {
    const tiposPermitidos = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    return tiposPermitidos.includes(tipoMime);
  },

  validarTipoRecibo(tipoMime) {
    return tipoMime === "application/pdf";
  },
};

module.exports = ServicioArchivoRH;
