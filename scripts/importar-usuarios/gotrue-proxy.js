/* eslint-disable */
// Proxy HTTP delante del GoTrue REAL (supabase/gotrue, la misma versión del compose) para inyectar fallos en las pruebas:
//   POST /__modo  { modo: "normal" | "colgar" | "http500" | "lento", ms? }   (afecta a POST /admin/users)
//   GET  /__log                      -> peticiones a /admin/users recibidas (método, ruta y cuerpo SIN la clave)
// "colgar": no responde (el cliente agota su tiempo: resultado INCIERTO); "http500": responde 500 SIN reenviar a GoTrue
// (fallo definitivo, GoTrue no aplicó nada); "lento": retrasa `ms` antes de reenviar.
const http = require("http");
const DESTINO = process.env.VERIF_GOTRUE_REAL || "http://127.0.0.1:9998";
const PUERTO = Number(process.env.VERIF_GOTRUE_PROXY_PORT || 9999);
let modo = { modo: "normal", ms: 0 };
const log = [];
http.createServer(async (req, res) => {
  const trozos = [];
  for await (const t of req) trozos.push(t);
  const cuerpo = Buffer.concat(trozos);
  if (req.url === "/__modo" && req.method === "POST") { modo = JSON.parse(cuerpo.toString()); res.end("{}"); return; }
  if (req.url === "/__log") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(log)); return; }
  if (req.url.startsWith("/admin/users")) log.push({ metodo: req.method, ruta: req.url, cuerpo: cuerpo.length ? JSON.parse(cuerpo.toString()) : null });
  if (req.method === "POST" && req.url === "/admin/users") {
    if (modo.modo === "colgar") return; // sin respuesta
    if (modo.modo === "http500") { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end('{"code":500,"msg":"fallo simulado"}'); return; }
    if (modo.modo === "lento") await new Promise((r) => setTimeout(r, modo.ms || 1000));
  }
  const r = await fetch(DESTINO + req.url, { method: req.method, headers: { apikey: req.headers.apikey || "", authorization: req.headers.authorization || "", "content-type": "application/json" }, body: ["GET", "HEAD"].includes(req.method) ? undefined : cuerpo });
  res.statusCode = r.status;
  res.setHeader("Content-Type", "application/json");
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PUERTO, "127.0.0.1", () => console.log(`proxy GoTrue en ${PUERTO} -> ${DESTINO}`));
