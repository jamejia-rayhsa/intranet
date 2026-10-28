const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");

// Auditoría de una importación masiva: solo conteos, nunca datos personales. La IP se recorta a 45 caracteres
// (ip_origen es VARCHAR(45): un X-Forwarded-For largo haría fallar el INSERT y se perdería el registro) y un fallo de
// la auditoría nunca bloquea la importación. `accion` admite hasta 20 caracteres (columna VARCHAR(20)).
async function auditarImportacion(req, tabla, accion, conteos, registroId = "importacion") {
  try {
    const xff = req.headers && req.headers["x-forwarded-for"];
    const reqAuditoria = {
      user: req.user,
      socket: req.socket,
      headers: { ...(req.headers || {}), "x-forwarded-for": xff ? String(xff).slice(0, 45) : undefined },
    };
    await registrarAccion(reqAuditoria, "rh", tabla, registroId, accion, null, conteos);
  } catch (errorAuditoria) {
    console.error("Error al registrar auditoría de la importación:", errorAuditoria.message);
  }
}

module.exports = { auditarImportacion };
