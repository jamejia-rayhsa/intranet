const { grupo } = require("../../../portal/backend/config/database");

async function probarConexion() {
  try {
    await grupo.query("SELECT 1");
    console.log("Conexión a la base de datos de auditoría exitosa");
  } catch (error) {
    console.error("Error al conectar a la base de datos de auditoría:", error);
  }
}

module.exports = { grupo, probarConexion };
