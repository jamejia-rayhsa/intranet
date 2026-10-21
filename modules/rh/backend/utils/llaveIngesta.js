// Formato, generación y comparación de las llaves de la ingesta de marcas.
// Llave = "rhk_" + 8 hex (identificador público = prefijo visible "rhk_xxxxxxxx") + "_" + 43 caracteres
// base64url (32 bytes aleatorios = 256 bits). En BD solo se guarda el SHA-256 de la llave completa.
const crypto = require("crypto");

const FORMATO = /^(rhk_[0-9a-f]{8})_([A-Za-z0-9_-]{43})$/;
const LONGITUD_LLAVE = 4 + 8 + 1 + 43;

/** SHA-256 hexadecimal de la llave completa. */
const hashLlave = (llave) => crypto.createHash("sha256").update(llave, "utf8").digest("hex");

/** Crea una llave nueva: { llave (en claro, se muestra UNA vez), prefijo, hash }. */
function generarLlave() {
  const prefijo = `rhk_${crypto.randomBytes(4).toString("hex")}`;
  const llave = `${prefijo}_${crypto.randomBytes(32).toString("base64url")}`;
  return { llave, prefijo, hash: hashLlave(llave) };
}

/** Texto de la cabecera -> { prefijo } o null si no tiene el formato exacto. */
function analizarLlave(texto) {
  if (typeof texto !== "string" || texto.length !== LONGITUD_LLAVE) return null;
  const m = FORMATO.exec(texto);
  return m ? { prefijo: m[1] } : null;
}

/** Comparación de hashes hexadecimales en tiempo constante (longitudes distintas -> false). */
function hashesIguales(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { FORMATO, LONGITUD_LLAVE, hashLlave, generarLlave, analizarLlave, hashesIguales };
