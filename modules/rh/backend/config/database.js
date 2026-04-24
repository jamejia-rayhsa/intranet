const { grupo } = require("../../../portal/backend/config/database");

async function probarConexion() {
  try {
    await grupo.query("SELECT NOW()");
    console.log("Conexión a PostgreSQL establecida correctamente (módulo RH)");
  } catch (error) {
    console.error(
      "Error al conectar con PostgreSQL (módulo RH):",
      error.message,
    );
  }
}

module.exports = { grupo, probarConexion };
