const multer = require("multer");

const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function errorTipo() {
  const err = new Error(
    "Tipo de archivo no válido. Solo se permiten imágenes: JPG, PNG, GIF, WebP (máx. 5 MB)",
  );
  err.codigo = "TIPO_NO_VALIDO";
  return err;
}

const subirImagenNoticia = multer({
  storage: multer.memoryStorage(),
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
