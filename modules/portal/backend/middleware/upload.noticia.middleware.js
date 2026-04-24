const multer = require("multer");
const path = require("path");
const fs = require("fs");

function obtenerRutaNoticias() {
  const ruta = path.join(process.cwd(), "uploads", "noticias");
  if (!fs.existsSync(ruta)) {
    fs.mkdirSync(ruta, { recursive: true });
  }
  return ruta;
}

function generarNombreArchivo(nombreOriginal) {
  const extension = path.extname(nombreOriginal);
  const nombreBase = path
    .basename(nombreOriginal, extension)
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, "_");
  const marcaTiempo = Date.now();
  const aleatorio = Math.random().toString(36).substring(2, 8);
  return `${marcaTiempo}_${aleatorio}_${nombreBase}${extension}`;
}

const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function errorTipo() {
  const err = new Error(
    "Tipo de archivo no válido. Solo se permiten imágenes: JPG, PNG, GIF, WebP (máx. 5 MB)",
  );
  err.codigo = "TIPO_NO_VALIDO";
  return err;
}

const subirImagenNoticia = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, obtenerRutaNoticias()),
    filename: (req, file, cb) =>
      cb(null, generarNombreArchivo(file.originalname)),
  }),
  fileFilter: (req, file, cb) => {
    if (TIPOS_IMAGEN.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(errorTipo());
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = { subirImagenNoticia };
