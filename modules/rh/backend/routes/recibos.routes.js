const { Router } = require("express");
const ControladorReciboNomina = require("../controllers/reciboNomina.controller");
const { subirArchivo } = require("../middleware/upload.middleware");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();

router.use(authenticateJWT);

const ReciboNomina = require("../models/reciboNomina.model");
const {
  accesoEmpleado,
  validarId,
  validarPeriodo,
} = require("../middleware/acceso-empleado.middleware");

const empleadoDelRecibo = async (req) => {
  const recibo = await ReciboNomina.obtenerPorId(req.params.id);
  return recibo && recibo.empleado_id;
};
const consulta = verificarPermiso("rh", "Recibos", "consulta");

router.get(
  "/empleado/:empleadoId",
  consulta,
  validarId("empleadoId"),
  accesoEmpleado({ opcion: "Recibos", obtenerEmpleadoId: (req) => req.params.empleadoId }),
  ControladorReciboNomina.listar,
);
router.get(
  "/periodo/:periodo",
  consulta,
  validarPeriodo("periodo"),
  accesoEmpleado({ opcion: "Recibos", soloRH: true }),
  ControladorReciboNomina.listarPorPeriodo,
);
router.get(
  "/:id/url",
  consulta,
  validarId("id"),
  accesoEmpleado({ opcion: "Recibos", obtenerEmpleadoId: empleadoDelRecibo }),
  ControladorReciboNomina.obtenerUrl,
);
router.get(
  "/:id",
  consulta,
  validarId("id"),
  accesoEmpleado({ opcion: "Recibos", obtenerEmpleadoId: empleadoDelRecibo }),
  ControladorReciboNomina.obtener,
);
router.post(
  "/",
  verificarPermiso("rh", "Recibos", "edicion"),
  subirArchivo.single("archivo"),
  ControladorReciboNomina.crear,
);
router.delete(
  "/:id",
  verificarPermiso("rh", "Recibos", "edicion"),
  ControladorReciboNomina.eliminar,
);

module.exports = router;
