// Autenticación por llave (X-Api-Key) de la ingesta de marcas. NO usa Authorization/Bearer (authenticateJWT
// rechaza cualquier token que no sea de GoTrue) y solo se monta delante de las dos rutas de ingesta.
//
// Orden de comprobaciones (cada una más cara o más reveladora que la anterior):
//   1. cabecera presente y con el formato exacto          -> 401
//   2. el prefijo existe y el SHA-256 coincide (tiempo constante, también si el prefijo no existe) -> 401
//   3. la llave no está revocada y está dentro de su vigencia (reloj de la BD)                      -> 403
//   4. la IP del cliente está en la lista de la llave (lista vacía = cualquiera)                   -> 403
// Los pasos 3 y 4 solo se evalúan con una llave AUTÉNTICA, así quien no tiene la llave no puede averiguar si
// existió, si está revocada ni qué IP se espera. Los mensajes son genéricos; el motivo real solo queda en la
// auditoría acotada (asistencia_llaves_rechazos).
const LlaveIngesta = require("../models/llaveIngesta.model");
const { crearLimitador } = require("../utils/limiteTasa");
const { registrarRechazo } = require("../services/rechazosIngesta.service");
const { analizarLlave, hashLlave, hashesIguales } = require("../utils/llaveIngesta");
const { normalizarIp, ipPermitida } = require("../utils/ipPermitida");

const MENSAJE_401 = "Llave de acceso no válida";
const MENSAJE_403 = "Acceso denegado";
// Comparación ficticia cuando el prefijo no existe: el tiempo de respuesta no distingue "no existe" de "hash distinto"
const HASH_FICTICIO = "0".repeat(64);

/**
 * IP del cliente tal como la ve Express. Con TRUST_PROXY sin configurar (por defecto) es la dirección del
 * socket y X-Forwarded-For se ignora; con proxies de confianza declarados, Express toma la IP del extremo
 * derecho NO confiable (ver utils/trustProxy.js y docs/asistencia/operacion-ingesta.md).
 */
function ipDeLaPeticion(req) {
  return normalizarIp(req.ip) || normalizarIp(req.socket && req.socket.remoteAddress);
}

// Fallos de autenticación por IP y minuto antes de cortar SIN consultar la BD (INGESTA_LIMITE_FALLOS_IP_POR_MINUTO).
// Una ráfaga de llaves inválidas no debe saturar el pool compartido con el resto de la intranet.
const FALLOS_IP_POR_DEFECTO = 30;
function enteroEnv(nombre, defecto) {
  const n = Number.parseInt(process.env[nombre], 10);
  return Number.isInteger(n) && n > 0 ? n : defecto;
}

function crearAutenticadorLlave({
  modelo = LlaveIngesta,
  rechazo = registrarRechazo,
  ahora = () => Date.now(),
  intervaloUsoMs = 30000,
  fallosIpPorMinuto = enteroEnv("INGESTA_LIMITE_FALLOS_IP_POR_MINUTO", FALLOS_IP_POR_DEFECTO),
  limitadorIp = crearLimitador({ maximo: fallosIpPorMinuto, ventanaMs: 60000, ahora }),
} = {}) {
  const ultimoUso = new Map(); // llave_id -> ms del último UPDATE de ultimo_uso (evita una escritura por petición)

  async function autenticarLlave(req, res, next) {
    const ip = ipDeLaPeticion(req);
    const claveIp = ip || "desconocida";
    // IP con demasiados fallos recientes: 429 antes de cualquier consulta a la BD
    const bloqueo = limitadorIp.consultar(claveIp);
    if (!bloqueo.permitido) {
      res.set("Retry-After", String(bloqueo.reintentarEnSeg));
      return res.status(429).json({ exito: false, mensaje: "Demasiadas peticiones: espera antes de reintentar" });
    }
    const denegar = (estado, motivo, extra = {}) => {
      limitadorIp.intentar(claveIp);
      try {
        rechazo({ ip, motivo, ...extra });
      } catch (error) {
        console.error("[Ingesta] Error al auditar un rechazo:", error.message);
      }
      return res.status(estado).json({ exito: false, mensaje: estado === 401 ? MENSAJE_401 : MENSAJE_403 });
    };

    const cabecera = req.headers["x-api-key"];
    if (cabecera === undefined || cabecera === "") return denegar(401, "sin_llave");
    const analizada = analizarLlave(cabecera);
    if (!analizada) return denegar(401, "llave_malformada");

    let fila;
    try {
      fila = await modelo.buscarPorPrefijo(analizada.prefijo);
    } catch (error) {
      console.error("[Ingesta] Error al buscar la llave:", error.message);
      return res.status(500).json({ exito: false, mensaje: "Error interno del servidor" });
    }
    const coincide = hashesIguales(hashLlave(cabecera), fila ? fila.hash_llave : HASH_FICTICIO);
    if (!fila) return denegar(401, "llave_desconocida", { prefijo: analizada.prefijo });
    if (!coincide) return denegar(401, "llave_incorrecta", { prefijo: analizada.prefijo, llaveId: fila.id });

    // A partir de aquí la llave es auténtica
    const datos = { prefijo: fila.prefijo, llaveId: fila.id };
    if (fila.estado !== "activa") return denegar(403, "llave_revocada", datos);
    if (!fila.vigente_ahora) return denegar(403, "llave_fuera_de_vigencia", datos);
    if (!ipPermitida(ip, fila.ips_permitidas)) return denegar(403, "ip_no_permitida", datos);

    req.llave = { id: fila.id, nombre: fila.nombre, origen: fila.origen, prefijo: fila.prefijo };
    req.ipIngesta = ip;

    // ultimo_uso sin esperar y a lo más cada intervaloUsoMs por llave: ni frena la petición ni la tumba
    const t = ahora();
    if (t - (ultimoUso.get(fila.id) || 0) >= intervaloUsoMs) {
      ultimoUso.set(fila.id, t);
      Promise.resolve()
        .then(() => modelo.tocarUso(fila.id, ip))
        .catch((error) => console.error("[Ingesta] No se pudo actualizar ultimo_uso:", error.message));
    }
    return next();
  }
  autenticarLlave.limitadorIp = limitadorIp; // para reiniciarlo en pruebas
  return autenticarLlave;
}

/** Límite de tasa por llave y por ruta: responde 429 con Retry-After. `limitador` = crearLimitador(). */
function limitarPorLlave(limitador, nombre) {
  return (req, res, next) => {
    const r = limitador.intentar(`${req.llave.id}:${nombre}`);
    if (r.permitido) return next();
    res.set("Retry-After", String(r.reintentarEnSeg));
    return res.status(429).json({ exito: false, mensaje: "Demasiadas peticiones: espera antes de reintentar" });
  };
}

module.exports = {
  FALLOS_IP_POR_DEFECTO,
  crearAutenticadorLlave,
  autenticarLlave: crearAutenticadorLlave(),
  limitarPorLlave,
  ipDeLaPeticion,
  MENSAJE_401,
  MENSAJE_403,
};
