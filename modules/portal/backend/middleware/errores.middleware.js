// modules/portal/backend/middleware/errores.middleware.js
// Manejador global de errores de Express. Va en un archivo propio para poder probarlo
// sin levantar app.js (que abre el puerto al cargarse).

/** Cuerpo JSON inválido: body-parser lanza SyntaxError con status 400 y type 'entity.parse.failed'. */
function esJsonInvalido(error) {
  return (
    error?.type === "entity.parse.failed" ||
    (error instanceof SyntaxError && error.status === 400 && "body" in error)
  );
}

/** Cuerpo demasiado grande (body-parser: type 'entity.too.large', status 413). */
function esCuerpoDemasiadoGrande(error) {
  return error?.type === "entity.too.large";
}

// eslint-disable-next-line no-unused-vars
function manejadorErrores(error, req, res, next) {
  if (esJsonInvalido(error)) {
    return res.status(400).json({ exito: false, mensaje: "JSON inválido" });
  }
  if (esCuerpoDemasiadoGrande(error)) {
    return res
      .status(413)
      .json({ exito: false, mensaje: "El cuerpo de la petición es demasiado grande" });
  }
  console.error("Error no controlado:", error);
  res.status(500).json({
    exito: false,
    mensaje: "Error interno del servidor",
    ...(process.env.NODE_ENV === "development" && { detalle: error.message }),
  });
}

module.exports = { manejadorErrores, esJsonInvalido, esCuerpoDemasiadoGrande };
