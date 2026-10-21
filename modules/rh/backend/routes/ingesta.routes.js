// Rutas de la ingesta de marcas (POST /marcas y GET /estado), montadas en app.js en /api/asistencia/ingesta
// ANTES del parser JSON global (100 kb) y de /api/asistencia (que lleva authenticateJWT): aquí la
// autenticación es la llave X-Api-Key y el cuerpo tiene su propio límite de 1 MB.
const crypto = require("crypto");
const express = require("express");
const { Router } = express;
const IngestaControlador = require("../controllers/ingesta.controller");
const { autenticarLlave, limitarPorLlave } = require("../middleware/llaveIngesta.middleware");
const { crearLimitador } = require("../utils/limiteTasa");
const { esJsonInvalido, esCuerpoDemasiadoGrande } = require("../../../portal/backend/middleware/errores.middleware");

const LIMITE_CUERPO = "1mb";
const ENVIOS_POR_MINUTO = 60;

// Un limitador por proceso; cuenta por llave y por ruta (60 envíos/min en POST y 60 consultas/min en GET)
const limitador = crearLimitador({ maximo: ENVIOS_POR_MINUTO, ventanaMs: 60000 });

// El contrato es JSON UTF-8: un charset declarado distinto de utf-8 (utf-16, latin1...) -> 415, no un 400 confuso
function exigirUtf8(req, res, next) {
  const m = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(req.headers["content-type"] || "");
  if (m && !/^utf-8$/i.test(m[1])) {
    return res.status(415).json({ exito: false, mensaje: "Tipo de contenido o codificación no admitidos: usa JSON en UTF-8" });
  }
  return next();
}

const router = Router();
router.use(autenticarLlave);

router.get("/estado", limitarPorLlave(limitador, "estado"), IngestaControlador.estado);
router.post(
  "/marcas",
  limitarPorLlave(limitador, "marcas"),
  exigirUtf8,
  express.json({
    limit: LIMITE_CUERPO,
    // Huella del cuerpo recibido (asistencia_sync_lotes.hash_cuerpo); no se guarda el contenido
    verify: (req, _res, buf) => {
      req.hashCuerpo = crypto.createHash("sha256").update(buf).digest("hex");
    },
  }),
  IngestaControlador.recibir,
);

router.use((_req, res) => res.status(404).json({ exito: false, mensaje: "Ruta no encontrada" }));

// Errores del parser y cualquier imprevisto: mensajes genéricos (nunca error.message, tampoco en development)
// eslint-disable-next-line no-unused-vars
router.use((error, _req, res, _next) => {
  if (esJsonInvalido(error)) return res.status(400).json({ exito: false, mensaje: "JSON inválido" });
  if (esCuerpoDemasiadoGrande(error)) {
    return res.status(413).json({ exito: false, mensaje: "El cuerpo supera 1 MB: envía menos marcas" });
  }
  if (error && error.status === 415) {
    return res.status(415).json({ exito: false, mensaje: "Tipo de contenido o codificación no admitidos" });
  }
  if (error && Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
    return res.status(400).json({ exito: false, mensaje: "Petición no válida" });
  }
  console.error("[Ingesta] Error no controlado:", error && error.message);
  return res.status(500).json({ exito: false, mensaje: "Error interno del servidor" });
});

module.exports = router;
module.exports.LIMITE_CUERPO = LIMITE_CUERPO;
module.exports.ENVIOS_POR_MINUTO = ENVIOS_POR_MINUTO;
module.exports.limitador = limitador;
module.exports.limitadorIp = autenticarLlave.limitadorIp;
