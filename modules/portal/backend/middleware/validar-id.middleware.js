// modules/portal/backend/middleware/validar-id.middleware.js
// Valida parámetros de ruta de id (entero positivo que cabe en INT4) antes de llegar a Postgres,
// para responder 400 limpio sin filtrar mensajes internos de la BD.
const MAX_INT4 = 2147483647;

function esIdValido(valor) {
  return /^\d{1,10}$/.test(String(valor)) && Number(valor) >= 1 && Number(valor) <= MAX_INT4;
}

// Para router.param('id', validarIdNumerico)
function validarIdNumerico(req, res, next, valor) {
  if (!esIdValido(valor)) {
    return res.status(400).json({ exito: false, mensaje: "El identificador debe ser un número entero positivo" });
  }
  next();
}

module.exports = { esIdValido, validarIdNumerico };
