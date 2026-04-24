const { Router } = require("express");
const ControladorAuth = require("../controllers/auth.controller");
const { authenticateJWT } = require("../middleware/auth.middleware");

const router = Router();

// Rutas públicas
router.post("/registro", ControladorAuth.registroLocal);
router.post("/inicio-sesion", ControladorAuth.inicioSesionLocal);
router.get("/ms365", ControladorAuth.redirigirMS365);
router.get("/ms365/callback", ControladorAuth.callbackMS365);
router.post("/renovar", ControladorAuth.renovarToken);
router.post("/recuperar-password", ControladorAuth.recuperarPassword);

// Rutas protegidas
router.get("/perfil", authenticateJWT, ControladorAuth.obtenerPerfil);
router.post(
  "/cambiar-password",
  authenticateJWT,
  ControladorAuth.cambiarPassword,
);

module.exports = router;
