const { grupo } = require("../../../portal/backend/config/database");

async function probarConexion() {
  try {
    await grupo.query("SELECT NOW()");
    console.log(
      "Conexión a PostgreSQL establecida correctamente (módulo tickets)",
    );
  } catch (error) {
    console.error(
      "Error al conectar con PostgreSQL (módulo tickets):",
      error.message,
    );
  }
}

module.exports = { grupo, probarConexion };
