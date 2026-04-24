module.exports = {
  permisos: {
    "tickets.view": "Ver tickets",
    "tickets.create": "Crear tickets",
    "tickets.admin": "Administrar todos los tickets",
    "tickets.technician": "Rol de técnico (cambiar estados, asignarse)",
  },

  estados: ["abierto", "en_progreso", "resuelto", "cerrado"],

  niveles: ["bajo", "medio", "alto", "critico"],

  categorias: [
    "Hardware",
    "Software",
    "Red",
    "Correo Electrónico",
    "Accesos",
    "Impresoras",
    "Otro",
  ],

  reglas: {
    crear: ["tickets.create", "tickets.admin", "super_admin"],
    verTodos: ["tickets.admin", "super_admin"],
    cambiarEstado: ["tickets.admin", "tickets.technician", "super_admin"],
    asignarTecnico: ["tickets.admin", "super_admin"],
    eliminar: ["tickets.admin", "super_admin"],
    subirAdjunto: [
      "tickets.create",
      "tickets.admin",
      "tickets.technician",
      "super_admin",
    ],
    eliminarAdjunto: ["tickets.admin", "super_admin"],
    enviarEncuesta: ["tickets.create", "super_admin"],
  },
};
