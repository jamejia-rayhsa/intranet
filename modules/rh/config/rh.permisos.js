module.exports = {
  permisos: {
    "rh.view": "Ver datos de RH",
    "rh.admin": "Administrar RH completo",
    "rh.gestionar-permisos": "Gestionar permisos y ausencias",
    "rh.ver-recibos": "Ver recibos de nómina",
  },

  estatusEmpleado: ["activo", "baja", "suspendido"],

  tiposPermiso: ["vacaciones", "incapacidad", "asunto_personal", "otro"],

  estatusPermiso: ["pendiente", "aprobado", "rechazado"],

  tiposDocumento: [
    "acta_nacimiento",
    "comprobante_domicilio",
    "identificacion",
    "curp",
    "rfc",
    "cef",
    "otro",
  ],

  reglas: {
    listarEmpleados: ["rh.admin", "super_admin"],
    crearEmpleado: ["rh.admin", "super_admin"],
    actualizarEmpleado: ["rh.admin", "super_admin"],
    darBajaEmpleado: ["rh.admin", "super_admin"],
    verExpediente: ["rh.admin", "super_admin"],
    subirDocumento: ["rh.admin", "super_admin"],
    eliminarDocumento: ["rh.admin", "super_admin"],
    solicitarPermiso: ["rh.view", "rh.admin", "super_admin"],
    aprobarPermiso: ["rh.admin", "rh.gestionar-permisos", "super_admin"],
    verRecibos: ["rh.view", "rh.ver-recibos", "super_admin"],
    crearRecibo: ["rh.admin", "super_admin"],
    eliminarRecibo: ["rh.admin", "super_admin"],
  },
};
