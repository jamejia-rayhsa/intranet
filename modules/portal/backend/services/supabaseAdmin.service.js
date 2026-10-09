// Cliente REST minimo de GoTrue (Supabase Auth) con la service role key.
// Usa fetch nativo (Node >= 18). Nunca incluye claves en los mensajes de error.

const TIMEOUT_MS = 10000;

function baseUrl() {
  return (process.env.SUPABASE_AUTH_URL || "http://supabase-auth:9999").replace(/\/+$/, "");
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

async function solicitar(metodo, ruta, { cuerpo, conClave = true } = {}) {
  const clave = claveServicio();
  const cabeceras = { "Content-Type": "application/json", apikey: clave };
  if (conClave) cabeceras.Authorization = `Bearer ${clave}`;

  let resp;
  try {
    resp = await fetch(`${baseUrl()}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const e = new Error(
      err && err.name === "TimeoutError"
        ? "Tiempo de espera agotado al contactar Supabase Auth"
        : "No se pudo contactar Supabase Auth",
    );
    e.status = 503;
    throw e;
  }

  let datos = null;
  const texto = await resp.text();
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = null;
    }
  }

  if (!resp.ok) {
    const detalle =
      (datos && (datos.msg || datos.error_description || datos.message || datos.error)) ||
      `HTTP ${resp.status}`;
    const e = new Error(`Supabase Auth: ${detalle}`);
    e.status = resp.status;
    throw e;
  }
  return datos;
}

const SupabaseAdmin = {
  async crearUsuario({ correo, password, passwordHash, metadata }) {
    const cuerpo = { email: correo, email_confirm: true };
    if (passwordHash) cuerpo.password_hash = passwordHash;
    else if (password) cuerpo.password = password;
    if (metadata) cuerpo.user_metadata = metadata;
    const datos = await solicitar("POST", "/admin/users", { cuerpo });
    return { id: datos.id };
  },

  async actualizarPassword(authUid, password) {
    await solicitar("PUT", `/admin/users/${encodeURIComponent(authUid)}`, {
      cuerpo: { password },
    });
  },

  async eliminarUsuario(authUid) {
    await solicitar("DELETE", `/admin/users/${encodeURIComponent(authUid)}`);
  },

  async buscarPorCorreo(correo) {
    const objetivo = String(correo).toLowerCase();
    const porPagina = 1000;
    for (let pagina = 1; pagina <= 50; pagina++) {
      const datos = await solicitar("GET", `/admin/users?page=${pagina}&per_page=${porPagina}`);
      const usuarios = (datos && datos.users) || [];
      const hallado = usuarios.find((u) => (u.email || "").toLowerCase() === objetivo);
      if (hallado) return { id: hallado.id, email: hallado.email };
      if (usuarios.length < porPagina) break;
    }
    return null;
  },

  async iniciarSesion(correo, password) {
    return solicitar("POST", "/token?grant_type=password", {
      cuerpo: { email: correo, password },
      conClave: false,
    });
  },
};

module.exports = SupabaseAdmin;
