const { Router } = require("express");
const ControladorAuth = require("../controllers/auth.controller");
const { authenticateJWT } = require("../middleware/auth.middleware");

const router = Router();

// Login, registro y recuperación los gestiona Supabase Auth (GoTrue) desde el
// frontend; aquí solo quedan las rutas que necesitan el usuario local.
router.get("/perfil", authenticateJWT, ControladorAuth.obtenerPerfil);
router.post(
  "/cambiar-password",
  authenticateJWT,
  ControladorAuth.cambiarPassword,
);

module.exports = router;
