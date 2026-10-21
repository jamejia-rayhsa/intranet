// Puerta de ingesta DEDICADA de las marcas de asistencia (INGESTA_PORT).
//
// Por qué existe: staging solo es alcanzable por Cloudflare Tunnel -> Traefik -> nginx -> backend, y por ese camino
// la IP interna de la interfaz con BioTime nunca llega al backend (la lista de IP permitidas de las llaves no
// serviría). La puerta dedicada es un SEGUNDO servidor http en el mismo proceso que sirve SOLO las dos rutas de
// ingesta, se publica únicamente en la IP interna del servidor y NO usa trust proxy: req.ip es la IP del socket,
// la de la interfaz, sin intermediarios y sin cabeceras falsificables (X-Forwarded-For, CF-Connecting-IP).
//
// Comparte con el puerto principal (mismo proceso) el router de ingesta y por tanto: la llave, el parser de 1 MB,
// los contadores del límite de tasa por llave y de fallos por IP, el pool y la lógica. Nada de esto se duplica.
const http = require("http");
const express = require("express");

const RUTA_INGESTA = "/api/asistencia/ingesta";
const VERDADEROS = new Set(["true", "1", "si", "sí", "yes"]);
const FALSOS = new Set(["false", "0", "no"]);

/**
 * Lee la configuración de la puerta dedicada.
 *  - INGESTA_PORT vacío/ausente: sin listener dedicado (puerto = null) y la ingesta sigue en el principal.
 *  - INGESTA_PORT definido: entero 1..65535 distinto del principal; si no, error (falla rápida).
 *  - INGESTA_SOLO_PUERTO_DEDICADO: con puerto definido, por defecto TRUE (seguro por defecto: el puerto principal
 *    deja de servir la ingesta). Solo FALSE explícito mantiene ambos. Un valor desconocido cuenta como TRUE.
 * Devuelve { puerto, soloDedicado, aviso? } o lanza Error con el motivo.
 */
function leerConfigIngesta(env = process.env, puertoPrincipal = Number(env.PORT) || 4000) {
  const crudo = env.INGESTA_PORT === undefined || env.INGESTA_PORT === null ? "" : String(env.INGESTA_PORT).trim();
  if (crudo === "") return { puerto: null, soloDedicado: false };
  if (!/^\d{1,5}$/.test(crudo) || Number(crudo) < 1 || Number(crudo) > 65535) {
    throw new Error(`INGESTA_PORT="${crudo}" no es un puerto válido (1-65535)`);
  }
  const puerto = Number(crudo);
  if (puerto === Number(puertoPrincipal)) {
    throw new Error(`INGESTA_PORT (${puerto}) no puede ser el puerto principal del backend`);
  }
  const bruto = env.INGESTA_SOLO_PUERTO_DEDICADO === undefined ? "" : String(env.INGESTA_SOLO_PUERTO_DEDICADO).trim().toLowerCase();
  let soloDedicado = true;
  let aviso;
  if (FALSOS.has(bruto)) soloDedicado = false;
  else if (bruto !== "" && !VERDADEROS.has(bruto)) aviso = `INGESTA_SOLO_PUERTO_DEDICADO="${bruto}" no se reconoce: se usa true`;
  return { puerto, soloDedicado, ...(aviso ? { aviso } : {}) };
}

/** Respuesta de "ruta inexistente" (idéntica a la del manejador global de app.js). */
const rutaNoEncontrada = (req, res) =>
  res.status(404).json({ exito: false, mensaje: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });

/**
 * App Express de la puerta dedicada: SOLO las rutas de ingesta (con su llave, parser de 1 MB y límites); cualquier
 * otra ruta -> 404. trust proxy desactivado a propósito, sea cual sea TRUST_PROXY del puerto principal.
 */
function crearAppIngesta(router = require("./routes/ingesta.routes")) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(RUTA_INGESTA, router);
  app.use(rutaNoEncontrada);
  return app;
}

/**
 * Puerto principal: en modo "solo puerto dedicado" la ingesta NO se monta y responde 404 con la forma de una ruta
 * inexistente (sin pasar por la llave ni revelar que existe); si no, se monta como siempre (ANTES del parser global
 * de 100 kb, que cortaría los envíos grandes).
 */
function montarIngestaEnPrincipal(app, config, router = require("./routes/ingesta.routes")) {
  if (config.puerto && config.soloDedicado) app.use(RUTA_INGESTA, rutaNoEncontrada);
  else app.use(RUTA_INGESTA, router);
}

/** Abre el servidor dedicado. Rechaza si el puerto no se puede abrir (EADDRINUSE, EACCES...). */
function abrirServidorIngesta({ puerto, app = crearAppIngesta() }) {
  return new Promise((resolver, rechazar) => {
    const servidor = http.createServer(app);
    servidor.once("error", rechazar);
    servidor.listen(puerto, () => {
      servidor.removeListener("error", rechazar);
      resolver(servidor);
    });
  });
}

/** Cierra ordenadamente (deja terminar las peticiones en curso y cierra las conexiones ociosas). */
function cerrarServidor(servidor, esperaMs = 10000) {
  return new Promise((resolver) => {
    if (!servidor || !servidor.listening) return resolver();
    const temporizador = setTimeout(() => {
      if (typeof servidor.closeAllConnections === "function") servidor.closeAllConnections();
    }, esperaMs);
    if (typeof temporizador.unref === "function") temporizador.unref();
    // Las conexiones keep-alive que quedan ociosas al terminar su petición en curso se cierran enseguida
    // (si no, close() esperaría el keepAliveTimeout de Node, unos 5 s)
    const barrido = setInterval(() => {
      if (typeof servidor.closeIdleConnections === "function") servidor.closeIdleConnections();
    }, 25);
    if (typeof barrido.unref === "function") barrido.unref();
    servidor.close(() => {
      clearTimeout(temporizador);
      clearInterval(barrido);
      resolver();
    });
    if (typeof servidor.closeIdleConnections === "function") servidor.closeIdleConnections();
  });
}

/** Cierra varios servidores a la vez (los nulos se ignoran); resuelve cuando todos terminaron. */
const cerrarTodos = (servidores, esperaMs) => Promise.all(servidores.map((s) => cerrarServidor(s, esperaMs)));

module.exports = {
  RUTA_INGESTA,
  cerrarTodos,
  leerConfigIngesta,
  crearAppIngesta,
  montarIngestaEnPrincipal,
  abrirServidorIngesta,
  cerrarServidor,
  rutaNoEncontrada,
};
