const { Router } = require("express");
const ControladorExpediente = require("../controllers/expediente.controller");
const { subirDocumentoExpediente } = require("../middleware/upload.middleware");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();

router.use(authenticateJWT);

const ExpedienteDocumento = require("../models/expedienteDocumento.model");
const { accesoEmpleado, validarId } = require("../middleware/acceso-empleado.middleware");

const consulta = verificarPermiso("rh", "Expedientes", "consulta");

router.get(
  "/:empleadoId",
  consulta,
  validarId("empleadoId"),
  accesoEmpleado({ opcion: "Expedientes", obtenerEmpleadoId: (req) => req.params.empleadoId }),
  ControladorExpediente.listar,
);
router.get(
  "/:id/url",
  consulta,
  validarId("id"),
  accesoEmpleado({
    opcion: "Expedientes",
    obtenerEmpleadoId: async (req) => {
      const doc = await ExpedienteDocumento.obtenerPorId(req.params.id);
      return doc && doc.empleado_id;
    },
  }),
  ControladorExpediente.obtenerUrl,
);
router.post(
  "/:empleadoId",
  verificarPermiso("rh", "Expedientes", "edicion"),
  subirDocumentoExpediente.single("archivo"),
  ControladorExpediente.subir,
);
router.delete(
  "/:id",
  verificarPermiso("rh", "Expedientes", "edicion"),
  ControladorExpediente.eliminar,
);

module.exports = router;
