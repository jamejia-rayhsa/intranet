const { Pool } = require("pg");

const grupo = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || "intranet_dev",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "dev_password_123",
});

async function probarConexion() {
  try {
    await grupo.query("SELECT 1");
    console.log("Conexión a la base de datos de auditoría exitosa");
  } catch (error) {
    console.error("Error al conectar a la base de datos de auditoría:", error);
  }
}

module.exports = { grupo, probarConexion };
