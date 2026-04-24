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
    await grupo.query("SELECT NOW()");
    console.log("Conexión a PostgreSQL establecida correctamente");
  } catch (error) {
    console.error("Error al conectar con PostgreSQL:", error.message);
  }
}

module.exports = { grupo, probarConexion };
