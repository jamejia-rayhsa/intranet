const { Router } = require("express");
const ControladorCategoria = require("../controllers/categoria.controller");
const TicketCategoria = require("../models/ticketCategoria.model");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();

router.get("/public", async (req, res) => {
  try {
    const categorias = await TicketCategoria.obtenerTodos();
    res.json({ exito: true, datos: categorias });
  } catch (error) {
    res.status(500).json({
      exito: false,
      mensaje: "Error al listar categorías",
      error: error.message,
    });
  }
});

router.use(authenticateJWT);

router.get("/", verificarPermiso("tickets", "Categorías", "consulta"), ControladorCategoria.listar);
router.post("/", verificarPermiso("tickets", "Categorías", "edicion"), ControladorCategoria.crear);
router.put("/:id", verificarPermiso("tickets", "Categorías", "edicion"), ControladorCategoria.actualizar);
router.delete("/:id", verificarPermiso("tickets", "Categorías", "edicion"), ControladorCategoria.eliminar);

module.exports = router;
