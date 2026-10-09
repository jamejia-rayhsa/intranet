// Cliente minimo de Supabase Storage (API v1) con la service role key.
// Usa fetch nativo (Node >= 18). Nunca incluye claves en los mensajes de error.
const crypto = require("crypto");
const path = require("path");

const TIMEOUT_MS = 10000;
const TIMEOUT_SUBIDA_MS = 30000;
const MB = 1024 * 1024;

const BUCKETS = {
  TICKETS: "tickets-adjuntos",
  EXPEDIENTES: "rh-expedientes",
  RECIBOS: "rh-recibos",
  NOTICIAS: "noticias",
};

// Debe coincidir con los filtros multer de cada modulo.
const CONFIG_BUCKETS = [
  {
    id: BUCKETS.TICKETS,
    public: false,
    file_size_limit: 10 * MB,
    allowed_mime_types: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ],
  },
  {
    id: BUCKETS.EXPEDIENTES,
    public: false,
    file_size_limit: 10 * MB,
    allowed_mime_types: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  {
    id: BUCKETS.RECIBOS,
    public: false,
    file_size_limit: 5 * MB,
    allowed_mime_types: ["application/pdf"],
  },
  {
    id: BUCKETS.NOTICIAS,
    public: true,
    file_size_limit: 5 * MB,
    allowed_mime_types: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  },
];

function baseUrl() {
  return (process.env.SUPABASE_STORAGE_URL || "http://supabase-storage:5000").replace(/\/+$/, "");
}

function claveServicio() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) {
    const e = new Error("SUPABASE_SERVICE_ROLE_KEY no configurada");
    e.status = 500;
    throw e;
  }
  return clave;
}

function codificarClave(clave) {
  return String(clave).split("/").map(encodeURIComponent).join("/");
}

async function solicitar(metodo, ruta, { cuerpo, cabeceras = {}, timeout = TIMEOUT_MS, tolerar = [] } = {}) {
  const clave = claveServicio();
  const headers = { Authorization: `Bearer ${clave}`, apikey: clave, ...cabeceras };
  let body = cuerpo;
  if (cuerpo !== undefined && !Buffer.isBuffer(cuerpo) && typeof cuerpo === "object") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(cuerpo);
  }

  let resp;
  try {
    resp = await fetch(`${baseUrl()}${ruta}`, {
      method: metodo,
      headers,
      body,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    const e = new Error(
      err && err.name === "TimeoutError"
        ? "Tiempo de espera agotado al contactar Supabase Storage"
        : "No se pudo contactar Supabase Storage",
    );
    e.status = 503;
    throw e;
  }

  let datos = null;
  if (metodo !== "HEAD") {
    const texto = await resp.text();
    if (texto) {
      try {
        datos = JSON.parse(texto);
      } catch {
        datos = texto;
      }
    }
  }

  if (!resp.ok && !tolerar.includes(resp.status)) {
    const detalle =
      (datos && typeof datos === "object" && (datos.message || datos.error || datos.msg)) ||
      `HTTP ${resp.status}`;
    const e = new Error(`Supabase Storage: ${detalle}`);
    e.status = resp.status;
    throw e;
  }
  return { status: resp.status, ok: resp.ok, datos };
}

const Storage = {
  BUCKETS,

  async subir(bucket, clave, buffer, contentType) {
    await solicitar("POST", `/object/${encodeURIComponent(bucket)}/${codificarClave(clave)}`, {
      cuerpo: buffer,
      cabeceras: {
        "Content-Type": contentType || "application/octet-stream",
        "x-upsert": "false",
      },
      timeout: TIMEOUT_SUBIDA_MS,
    });
    return { clave };
  },

  async urlFirmada(bucket, clave, { segundos = 300, descargar } = {}) {
    const { datos } = await solicitar(
      "POST",
      `/object/sign/${encodeURIComponent(bucket)}/${codificarClave(clave)}`,
      { cuerpo: { expiresIn: segundos } },
    );
    const firmada = datos && (datos.signedURL || datos.signedUrl);
    if (!firmada) {
      const e = new Error("Supabase Storage: respuesta sin URL firmada");
      e.status = 502;
      throw e;
    }
    let url = `/storage/v1${firmada.startsWith("/") ? "" : "/"}${firmada}`;
    if (descargar) url += `${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(descargar)}`;
    return url;
  },

  urlPublica(bucket, clave) {
    return `/storage/v1/object/public/${encodeURIComponent(bucket)}/${codificarClave(clave)}`;
  },

  async eliminar(bucket, clave) {
    await solicitar("DELETE", `/object/${encodeURIComponent(bucket)}/${codificarClave(clave)}`, {
      tolerar: [404],
    });
  },

  async existe(bucket, clave) {
    const r = await solicitar(
      "HEAD",
      `/object/info/${encodeURIComponent(bucket)}/${codificarClave(clave)}`,
      { tolerar: [400, 404] },
    );
    return r.ok;
  },

  async asegurarBuckets() {
    const resumen = { creados: [], existentes: [] };
    for (const cfg of CONFIG_BUCKETS) {
      try {
        await solicitar("POST", "/bucket", { cuerpo: { name: cfg.id, ...cfg } });
        resumen.creados.push(cfg.id);
      } catch (err) {
        const yaExiste = err.status === 409 || /already exists|duplicate/i.test(err.message || "");
        if (!yaExiste) throw err;
        resumen.existentes.push(cfg.id);
        try {
          const { datos } = await solicitar("GET", `/bucket/${encodeURIComponent(cfg.id)}`);
          if (datos && typeof datos === "object" && datos.public !== cfg.public) {
            console.warn(`Storage: el bucket ${cfg.id} existe con public=${datos.public} (esperado ${cfg.public})`);
          }
        } catch {
          // informativo: ignorar
        }
      }
    }
    return resumen;
  },

  claveSegura(nombreOriginal) {
    const original = String(nombreOriginal || "archivo");
    const ext = path
      .extname(original)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const base =
      path
        .basename(original, path.extname(original))
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9_-]/g, "_") || "archivo";
    const aleatorio = crypto.randomBytes(4).toString("hex");
    return `${Date.now()}_${aleatorio}_${base}${ext ? "." + ext : ""}`;
  },
};

module.exports = Storage;
