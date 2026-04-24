const multer = require("multer");
const path = require("path");
const ServicioArchivo = require("../services/archivo.service");

const almacenamiento = multer.diskStorage({
  destination: (req, file, cb) => {
    const ruta = ServicioArchivo.obtenerRutaAlmacenamiento();
    cb(null, ruta);
  },
  filename: (req, file, cb) => {
    const nombre = ServicioArchivo.generarNombreArchivo(file.originalname);
    cb(null, nombre);
  },
});

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
