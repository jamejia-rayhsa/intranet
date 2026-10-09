const ServicioArchivoRH = {
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
