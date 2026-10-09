const multer = require("multer");
const ServicioArchivoRH = require("../services/archivo.service");

const MSG_TIPO_EXPEDIENTE =
  "Tipo de archivo no válido. Formatos permitidos: JPG, PNG, GIF, PDF, DOC, DOCX (máx. 10 MB)";
const MSG_TIPO_RECIBO =
  "Tipo de archivo no válido. Solo se permiten archivos PDF (máx. 5 MB)";
const MSG_TAMANO =
  "Archivo demasiado grande. Tamaño máximo permitido: {max}";

function errorTipo(mensaje) {
  const err = new Error(mensaje);
  err.codigo = "TIPO_NO_VALIDO";
  return err;
}

// Documentos de expediente: imágenes, PDF, Word — máx. 10 MB
const subirDocumentoExpediente = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (ServicioArchivoRH.validarTipoDocumento(file.mimetype)) {
      cb(null, true);
    } else {
      cb(errorTipo(MSG_TIPO_EXPEDIENTE));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Recibos de nómina: solo PDF — máx. 5 MB
const subirRecibo = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (ServicioArchivoRH.validarTipoRecibo(file.mimetype)) {
      cb(null, true);
    } else {
      cb(errorTipo(MSG_TIPO_RECIBO));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Compatibilidad con código anterior
const subirArchivo = subirDocumentoExpediente;

module.exports = { subirArchivo, subirDocumentoExpediente, subirRecibo };
