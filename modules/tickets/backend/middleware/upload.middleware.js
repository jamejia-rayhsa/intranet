const multer = require("multer");
const ServicioArchivo = require("../services/archivo.service");

// Memoria: el buffer se sube a Supabase Storage desde el controlador (tope 10 MB).
const almacenamiento = multer.memoryStorage();

const filtroArchivos = (req, file, cb) => {
  if (ServicioArchivo.validarTipoArchivo(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Tipo de archivo no permitido"), false);
  }
};

const subirArchivo = multer({
  storage: almacenamiento,
  fileFilter: filtroArchivos,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

module.exports = { subirArchivo };
