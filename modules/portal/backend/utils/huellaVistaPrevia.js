// Huella de vista previa de "Importar usuarios": prueba, firmada por el servidor, de que cada fila VÁLIDA pasó por la vista previa
// del mismo super_admin hace poco. La vista previa devuelve una huella por fila y la aplicación exige la huella de cada fila que
// va a escribir; sin ella, 400 y no se escribe nada. Es HMAC-SHA256 (sin estado en el servidor) sobre el usuario, la caducidad y la
// fila normalizada: cambiar cualquier dato de la fila, usar la de otro usuario o esperar más de la caducidad la invalida.
const crypto = require("crypto");

const VIGENCIA_MS = 30 * 60 * 1000;
// Sin SUPABASE_JWT_SECRET (no debería pasar) se usa un secreto aleatorio del proceso: las huellas no sobreviven a un reinicio
const SECRETO_PROCESO = crypto.randomBytes(32);
const secreto = () => process.env.SUPABASE_JWT_SECRET || SECRETO_PROCESO;

function carga(usuarioId, fila) {
  return JSON.stringify([usuarioId, fila.fila, fila.correo, fila.nombre, fila.apellido, fila.numero_nomina, fila.curp]);
}

function firmar(usuarioId, fila, vence) {
  return crypto.createHmac("sha256", secreto()).update(`${vence}|${carga(usuarioId, fila)}`).digest("hex");
}

// `fila`: la fila normalizada (salida de prepararFilaUsuario). Devuelve "<vence>.<hmac>".
function crearHuella(usuarioId, fila, ahora = Date.now()) {
  const vence = ahora + VIGENCIA_MS;
  return `${vence}.${firmar(usuarioId, fila, vence)}`;
}

function huellaValida(usuarioId, fila, huella, ahora = Date.now()) {
  if (typeof huella !== "string" || huella.length > 120) return false;
  const [venceTexto, firma] = huella.split(".");
  const vence = Number(venceTexto);
  if (!Number.isSafeInteger(vence) || vence < ahora || vence > ahora + VIGENCIA_MS + 1000 || typeof firma !== "string") return false;
  const esperada = Buffer.from(firmar(usuarioId, fila, vence), "hex");
  const recibida = Buffer.from(firma, "hex");
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

module.exports = { VIGENCIA_MS, crearHuella, huellaValida };
