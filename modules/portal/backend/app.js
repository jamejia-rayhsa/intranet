const express = require("express");
const cors = require("cors");
const { probarConexion } = require("./config/database");
const Storage = require("./services/storage.service");
const { manejadorErrores } = require("./middleware/errores.middleware");
const { leerTrustProxy } = require("../../rh/backend/utils/trustProxy");
const {
  leerConfigIngesta,
  montarIngestaEnPrincipal,
  abrirServidorIngesta,
  cerrarTodos,
} = require("../../rh/backend/servidorIngesta");

const app = express();
const PUERTO = process.env.PORT || 4000;

// Puerta de ingesta dedicada (INGESTA_PORT). Una configuración inválida es un error de arranque (falla rápida).
let configIngesta;
try {
  configIngesta = leerConfigIngesta(process.env, PUERTO);
} catch (error) {
  console.error(`[Ingesta] Configuración inválida: ${error.message}`);
  process.exit(1);
}
if (configIngesta.aviso) console.warn(`[Ingesta] ${configIngesta.aviso}`);

// Probar conexión a la base de datos al iniciar
probarConexion();

// Crear buckets de Storage si faltan (no fatal; reintenta una vez)
function prepararBuckets(reintentar) {
  Storage.asegurarBuckets().catch((err) => {
    console.warn(`No se pudieron asegurar los buckets de Storage: ${err.message}`);
    if (reintentar) setTimeout(() => prepararBuckets(false), 10000);
  });
}
prepararBuckets(true);

// Proxies de confianza (TRUST_PROXY): define qué IP ve req.ip y por tanto la lista de IP permitidas de las
// llaves de ingesta. Por defecto ninguno (se ignora X-Forwarded-For); ver docs/asistencia/operacion-ingesta.md
const trustProxy = leerTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== false) app.set("trust proxy", trustProxy);

// Middleware global
app.use(cors());

// Ingesta de marcas de asistencia: autenticación por llave X-Api-Key y parser JSON propio de 1 MB.
// DEBE ir antes del parser global (100 kb), que cortaría los envíos de hasta 500 marcas con 413.
// Con INGESTA_PORT definido (y INGESTA_SOLO_PUERTO_DEDICADO != false) aquí responde 404: la ingesta solo vive en
// la puerta dedicada (ver rh/backend/servidorIngesta.js y docs/asistencia/operacion-ingesta.md).
montarIngestaEnPrincipal(app, configIngesta);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use("/api/calendario-laboral", require("../../rh/backend/routes/calendario.routes"));
app.use("/api/asistencia", require("../../rh/backend/routes/asistencia.routes"));
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

// Manejo de errores global (JSON inválido -> 400, cuerpo grande -> 413, resto -> 500 genérico)
app.use(manejadorErrores);

// Iniciar servidores (solo al ejecutar el archivo: importarlo en pruebas no abre puertos).
async function iniciar() {
  let dedicado = null;
  if (configIngesta.puerto) {
    try {
      dedicado = await abrirServidorIngesta({ puerto: configIngesta.puerto });
    } catch (error) {
      console.error(`[Ingesta] No se pudo abrir la puerta de ingesta en el puerto ${configIngesta.puerto}: ${error.code || error.message}`);
      process.exit(1);
    }
    console.log(
      `Puerta de ingesta dedicada escuchando en el puerto ${configIngesta.puerto} (solo rutas de ingesta; sin trust proxy)` +
        (configIngesta.soloDedicado ? "; el puerto principal ya no sirve la ingesta" : "; la ingesta también sigue en el principal"),
    );
  }
  const principal = app.listen(PUERTO, () => {
    console.log(`Servidor backend escuchando en el puerto ${PUERTO}`);
    console.log(`Entorno: ${process.env.NODE_ENV || "desarrollo"}`);
  });
  principal.once("error", (error) => {
    console.error(`No se pudo abrir el puerto ${PUERTO}: ${error.code || error.message}`);
    process.exit(1);
  });

  // Cierre ordenado de ambos servidores
  let cerrando = false;
  const apagar = async (senal) => {
    if (cerrando) return;
    cerrando = true;
    console.log(`${senal} recibida: cerrando servidores`);
    await cerrarTodos([principal, dedicado]);
    process.exit(0);
  };
  process.on("SIGTERM", () => apagar("SIGTERM"));
  process.on("SIGINT", () => apagar("SIGINT"));
}
if (require.main === module) iniciar();

module.exports = app;
