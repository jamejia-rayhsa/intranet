// modules/portal/backend/routes/noticia.routes.js
const { Router } = require("express");
const ControladorNoticia = require("../controllers/noticia.controller");
const { authenticateJWT } = require("../middleware/auth.middleware");
const { verificarPermiso } = require("../middleware/permisos.middleware");
const { subirImagenNoticia } = require("../middleware/upload.noticia.middleware");

const { validarIdNumerico } = require("../middleware/validar-id.middleware");

const router = Router();

// Todos los ids de ruta (:id, :imagenId) deben ser enteros positivos: 400 limpio, sin tocar la BD
router.param("id", validarIdNumerico);
router.param("imagenId", validarIdNumerico);

// Rutas públicas: noticias publicadas (sin auth — usadas en login y home)
router.get("/publicas", ControladorNoticia.listarPublicadas);
router.get("/publicadas", ControladorNoticia.listarPublicadas); // alias para PortalHome
router.get("/:id", ControladorNoticia.obtenerPublica); // solo publicadas

router.use(authenticateJWT);

router.get("/", verificarPermiso("portal", "Noticias", "consulta"), ControladorNoticia.listarTodas);
// Detalle para el panel (borradores incluidos); dos segmentos, no choca con "/:id" público
router.get("/admin/:id", verificarPermiso("portal", "Noticias", "consulta"), ControladorNoticia.obtener);
router.post("/", verificarPermiso("portal", "Noticias", "edicion"), ControladorNoticia.crear); // auditoría desde el controlador
router.put("/:id", verificarPermiso("portal", "Noticias", "edicion"), ControladorNoticia.actualizar);
router.delete("/:id", verificarPermiso("portal", "Noticias", "edicion"), ControladorNoticia.eliminar);

// Rutas de imágenes
router.post(
  "/:id/imagenes",
  verificarPermiso("portal", "Noticias", "edicion"),
  subirImagenNoticia.single("imagen"),
  ControladorNoticia.subirImagen,
);
// Reordenar (PUT; no choca con DELETE /:id/imagenes/:imagenId)
router.put(
  "/:id/imagenes/orden",
  verificarPermiso("portal", "Noticias", "edicion"),
  ControladorNoticia.reordenarImagenes,
);
router.delete(
  "/:id/imagenes/:imagenId",
  verificarPermiso("portal", "Noticias", "edicion"),
  ControladorNoticia.eliminarImagen,
);

module.exports = router;
