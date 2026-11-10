/* eslint-disable */
// Proxy HTTP delante del GoTrue REAL (supabase/gotrue, la misma versión del compose) para inyectar fallos en las pruebas:
//   POST /__modo  { modo: "normal" | "colgar" | "http500" | "lento", ms? }   (afecta a POST /admin/users)
//   GET  /__log                      -> peticiones a /admin/users recibidas (método, ruta y cuerpo SIN la clave)
// "despues": REENVÍA a GoTrue (la cuenta SÍ se crea) y luego falla la respuesta al cliente: { modo:"despues", codigo: 500|502|504 } responde ese
// HTTP, { modo:"despues", sinJson:true } responde 200 con cuerpo vacío, { modo:"despues", colgar:true } no responde (tiempo agotado).
// "colgar": no responde (el cliente agota su tiempo: resultado INCIERTO); "http500": responde 500 SIN reenviar a GoTrue
// (resultado INCIERTO: un 5xx puede llegar tras aplicar); "http400": responde un 4xx SIN reenviar (rechazo definitivo, GoTrue no aplicó nada); "lento": retrasa `ms` antes de reenviar.
const http = require("http");
const DESTINO = process.env.VERIF_GOTRUE_REAL || "http://127.0.0.1:9998";
const PUERTO = Number(process.env.VERIF_GOTRUE_PROXY_PORT || 9999);
let modo = { modo: "normal", ms: 0 };
const log = [];
http.createServer(async (req, res) => {
  res.setHeader("Connection", "close"); // sin conexiones reutilizadas: un cierre del proxy no se confunde con un tiempo agotado
  const trozos = [];
  for await (const t of req) trozos.push(t);
  const cuerpo = Buffer.concat(trozos);
  if (req.url === "/__modo" && req.method === "POST") { modo = JSON.parse(cuerpo.toString()); res.end("{}"); return; }
  if (req.url === "/__log") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(log)); return; }
  if (req.url.startsWith("/admin/users")) log.push({ metodo: req.method, ruta: req.url, cuerpo: cuerpo.length ? JSON.parse(cuerpo.toString()) : null });
  if (req.method === "POST" && req.url === "/admin/users") {
    if (modo.modo === "colgar") return; // sin respuesta
    if (modo.modo === "http400") { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end('{"code":400,"msg":"rechazo simulado"}'); return; }
    if (modo.modo === "http500") { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end('{"code":500,"msg":"fallo simulado"}'); return; }
    if (modo.modo === "lento") await new Promise((r) => setTimeout(r, modo.ms || 1000));
    if (modo.modo === "despues") {
      await fetch(DESTINO + req.url, { method: "POST", headers: { apikey: req.headers.apikey || "", authorization: req.headers.authorization || "", "content-type": "application/json" }, body: cuerpo });
      if (modo.colgar) return;
      if (modo.sinJson) { res.statusCode = 200; res.end(""); return; }
      res.statusCode = modo.codigo || 502; res.setHeader("Content-Type", "text/html"); res.end("<html>error del intermediario</html>"); return;
    }
  }
  const r = await fetch(DESTINO + req.url, { method: req.method, headers: { apikey: req.headers.apikey || "", authorization: req.headers.authorization || "", "content-type": "application/json" }, body: ["GET", "HEAD"].includes(req.method) ? undefined : cuerpo });
  res.statusCode = r.status;
  res.setHeader("Content-Type", "application/json");
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PUERTO, "127.0.0.1", () => console.log(`proxy GoTrue en ${PUERTO} -> ${DESTINO}`));
