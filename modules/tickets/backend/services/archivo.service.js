const ServicioArchivo = {
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
