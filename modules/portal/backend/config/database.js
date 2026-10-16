const { Pool } = require("pg");

// Lee un entero positivo de una variable de entorno; si falta o no es válido usa el valor por defecto.
// Una variable definida pero inválida cae al valor por defecto CON aviso (no en silencio).
function enteroEnv(nombre, defecto) {
  const crudo = process.env[nombre];
  const valor = Number.parseInt(crudo, 10);
  if (Number.isInteger(valor) && valor > 0) return valor;
  if (crudo !== undefined && crudo !== "") {
    console.warn(
      `Variable ${nombre}="${crudo}" no es un entero positivo: se usa el valor por defecto (${defecto})`,
    );
  }
  return defecto;
}

// Único pool de la aplicación: lo comparten portal, RH, tickets y auditoría.
// - connectionTimeoutMillis: un pool agotado falla rápido (error -> 500 genérico) en vez de colgar la petición.
// - idle_in_transaction_session_timeout: Postgres cierra la sesión que deja una transacción abierta sin actividad.
// - No se define statement_timeout global: hay consultas legítimamente largas (reportes, auditoría).
const grupo = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || "postgres",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "dev_password_123",
  max: enteroEnv("PG_POOL_MAX", 10),
  idleTimeoutMillis: enteroEnv("PG_POOL_IDLE_TIMEOUT_MS", 30000),
  connectionTimeoutMillis: enteroEnv("PG_POOL_CONNECTION_TIMEOUT_MS", 5000),
  idle_in_transaction_session_timeout: enteroEnv(
    "PG_IDLE_IN_TRANSACTION_TIMEOUT_MS",
    30000,
  ),
});

// Un error en un cliente inactivo del pool (Postgres cierra la sesión por idle_in_transaction_session_timeout
// o se reinicia) no debe tumbar el proceso. pg lo emite como 'error' del pool si el cliente está libre,
// pero si el cliente está PRESTADO (transacción olvidada) lo emite en el propio cliente y, sin
// listener, Node lo trata como excepción no capturada y se cae el proceso: por eso cada cliente
// nuevo lleva su listener. La siguiente consulta sobre ese cliente falla y la petición responde 500.
function registrarErrorDeCliente(error) {
  console.error("Error en una conexión de PostgreSQL:", error.message);
}
grupo.on("error", registrarErrorDeCliente);
grupo.on("connect", (cliente) => cliente.on("error", registrarErrorDeCliente));

async function probarConexion() {
  try {
    await grupo.query("SELECT NOW()");
    console.log("Conexión a PostgreSQL establecida correctamente");
  } catch (error) {
    console.error("Error al conectar con PostgreSQL:", error.message);
  }
}

module.exports = { grupo, probarConexion, enteroEnv };
