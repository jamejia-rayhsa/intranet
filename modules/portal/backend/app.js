const express = require("express");
const cors = require("cors");
const path = require("path");
const { probarConexion } = require("./config/database");

const app = express();
const PUERTO = process.env.PORT || 4000;

// Probar conexión a la base de datos al iniciar
probarConexion();

// Middleware global
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos subidos
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Registro de solicitudes (desarrollo)
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });
}

// Rutas de autenticación
app.use("/api/auth", require("./routes/auth.routes"));

// Rutas de módulos
app.use("/api/modulos", require("./routes/modulo.routes"));
app.use("/api/roles", require("./routes/rol.routes"));
app.use("/api/permisos", require("./routes/permiso.routes"));
app.use("/api/noticias", require("./routes/noticia.routes"));
app.use("/api/usuarios", require("./routes/usuario.routes"));

// Rutas de RH
app.use("/api/rh", require("../../rh/backend/routes/rh.dashboard.routes"));
app.use("/api/empleados", require("../../rh/backend/routes/empleados.routes"));
app.use("/api/permisos-rh", require("../../rh/backend/routes/permisos.routes"));
app.use("/api/vacaciones", require("../../rh/backend/routes/vacaciones.routes"));
app.use("/api/recibos", require("../../rh/backend/routes/recibos.routes"));
app.use(
  "/api/expediente",
  require("../../rh/backend/routes/expediente.routes"),
);
app.use("/api/areas",        require("../../rh/backend/routes/areas.routes"));
app.use("/api/puestos",      require("../../rh/backend/routes/puestos.routes"));
app.use("/api/departamentos", require("../../rh/backend/routes/departamentos.routes"));
app.use(
  "/api/ubicaciones",
  require("../../rh/backend/routes/ubicaciones.routes"),
);

// Rutas de Tickets
app.use("/api/tickets", require("../../tickets/backend/routes/tickets.dashboard.routes"));
app.use("/api/tickets", require("../../tickets/backend/routes/tickets.routes"));
app.use(
  "/api/adjuntos",
  require("../../tickets/backend/routes/adjuntos.routes"),
);
app.use(
  "/api/comentarios",
  require("../../tickets/backend/routes/comentarios.routes"),
);
app.use(
  "/api/categorias",
  require("../../tickets/backend/routes/categorias.routes"),
);

// Rutas de auditoría
app.use(
  "/api/auditoria",
  require("../../auditoria/backend/routes/auditoria.routes"),
);

// Rutas de Comercial
app.use('/api/comercial/solicitudes', require('../../comercial/backend/routes/solicitudesCredito.routes'));

// Ruta de salud
app.get("/api/salud", (req, res) => {
  res.json({
    exito: true,
    mensaje: "Intranet corporativa - API funcionando",
    entorno: process.env.NODE_ENV || "desarrollo",
    fecha: new Date().toISOString(),
  });
});

// Ruta raíz
app.get("/", (req, res) => {
  res.json({
    mensaje: "Bienvenido a la API de la Intranet Corporativa",
    version: "1.0.0",
    documentacion: "/api/salud",
  });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    exito: false,
    mensaje: `Ruta no encontrada: ${req.method} ${req.url}`,
  });
});

// Manejo de errores de multer (tipo y tamaño de archivo)
app.use((error, req, res, next) => {
  const multer = require("multer");
  if (error instanceof multer.MulterError) {
    const mensaje =
      error.code === "LIMIT_FILE_SIZE"
        ? "Tipo o tamaño no válido: el archivo supera el tamaño máximo permitido"
        : "Tipo o tamaño no válido";
    return res.status(400).json({ exito: false, mensaje });
  }
  if (error?.codigo === "TIPO_NO_VALIDO") {
    return res.status(400).json({ exito: false, mensaje: error.message });
  }
  next(error);
});

// Manejo de errores global
app.use((error, req, res, next) => {
  console.error("Error no controlado:", error);
  res.status(500).json({
    exito: false,
    mensaje: "Error interno del servidor",
    ...(process.env.NODE_ENV === "development" && { detalle: error.message }),
  });
});

// Iniciar servidor
app.listen(PUERTO, () => {
  console.log(`Servidor backend escuchando en el puerto ${PUERTO}`);
  console.log(`Entorno: ${process.env.NODE_ENV || "desarrollo"}`);
});

module.exports = app;
