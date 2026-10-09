const { Router } = require("express");
const ControladorAuth = require("../controllers/auth.controller");
const { authenticateJWT, soloLegacy } = require("../middleware/auth.middleware");

const router = Router();

// Rutas públicas
router.post("/registro", soloLegacy, ControladorAuth.registroLocal);
router.post("/inicio-sesion", soloLegacy, ControladorAuth.inicioSesionLocal);
router.get("/ms365", soloLegacy, ControladorAuth.redirigirMS365);
router.get("/ms365/callback", soloLegacy, ControladorAuth.callbackMS365);
router.post("/renovar", soloLegacy, ControladorAuth.renovarToken);
router.post("/recuperar-password", ControladorAuth.recuperarPassword);

// Rutas protegidas
router.get("/perfil", authenticateJWT, ControladorAuth.obtenerPerfil);
router.post(
  "/cambiar-password",
  authenticateJWT,
  ControladorAuth.cambiarPassword,
);

module.exports = router;
