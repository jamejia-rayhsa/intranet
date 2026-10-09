const crypto = require("crypto");

const ALFABETO_TEMPORAL =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generarContraseñaTemporal(longitud = 12) {
  let resultado = "";
  for (let i = 0; i < longitud; i++) {
    resultado += ALFABETO_TEMPORAL[crypto.randomInt(ALFABETO_TEMPORAL.length)];
  }
  return resultado;
}

module.exports = { generarContraseñaTemporal };
