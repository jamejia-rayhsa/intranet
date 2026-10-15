// modules/portal/backend/routes/noticia.routes.js
const { Router } = require("express");
const ControladorNoticia = require("../controllers/noticia.controller");
const { authenticateJWT } = require("../middleware/auth.middleware");
const { verificarPermiso } = require("../middleware/permisos.middleware");
const { auditoriaMiddleware } = require("../../../auditoria/backend/middleware/auditoria.middleware");
const { subirImagenNoticia } = require("../middleware/upload.noticia.middleware");

const router = Router();

// Rutas públicas: noticias publicadas (sin auth — usadas en login y home)
router.get("/publicas", ControladorNoticia.listarPublicadas);
router.get("/publicadas", ControladorNoticia.listarPublicadas); // alias para PortalHome
router.get("/:id", ControladorNoticia.obtenerPublica); // solo publicadas

router.use(authenticateJWT);

router.get("/", verificarPermiso("portal", "Noticias", "consulta"), ControladorNoticia.listarTodas);
// Detalle para el panel (borradores incluidos); dos segmentos, no choca con "/:id" público
router.get("/admin/:id", verificarPermiso("portal", "Noticias", "consulta"), ControladorNoticia.obtener);
router.post("/", verificarPermiso("portal", "Noticias", "edicion"), auditoriaMiddleware("portal", "noticias", "INSERT"), ControladorNoticia.crear);
router.put("/:id", verificarPermiso("portal", "Noticias", "edicion"), ControladorNoticia.actualizar);
router.delete("/:id", verificarPermiso("portal", "Noticias", "edicion"), ControladorNoticia.eliminar);

// Rutas de imágenes
router.post(
  "/:id/imagenes",
  verificarPermiso("portal", "Noticias", "edicion"),
  subirImagenNoticia.single("imagen"),
  ControladorNoticia.subirImagen,
);
router.delete(
  "/:id/imagenes/:imagenId",
  verificarPermiso("portal", "Noticias", "edicion"),
  ControladorNoticia.eliminarImagen,
);

module.exports = router;
