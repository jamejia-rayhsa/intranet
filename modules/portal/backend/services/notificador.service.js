// Envío de correo y mensajes directos de Teams a través del webhook de n8n (event-proxy, WF-10).
// Sin N8N_NOTIFICAR_URL el servicio queda desactivado y quien lo llama usa su respaldo (SMTP).
const TIMEOUT_MS = 5000;

function configurado() {
  return Boolean(process.env.N8N_NOTIFICAR_URL && process.env.N8N_NOTIFICAR_SECRETO);
}

function aHtml(texto) {
  const esc = String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Enlaces simples a clic; el resto conserva los saltos de línea
  return esc
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>");
}

/**
 * Pide a n8n que notifique. Nunca lanza: devuelve { exito, mensaje } para que un fallo de
 * notificación no rompa la operación de negocio que la disparó.
 * canal: "email" | "teams_dm" | "ambos".
 */
async function notificar({ canal = "email", correo, asunto, cuerpo, origen, referencia }) {
  if (!configurado()) return { exito: false, omitido: true, mensaje: "n8n no configurado" };
  if (!correo) return { exito: false, mensaje: "Sin destinatario" };

  try {
    const respuesta = await fetch(process.env.N8N_NOTIFICAR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Intranet-Secret": process.env.N8N_NOTIFICAR_SECRETO,
      },
      body: JSON.stringify({
        canal,
        destinatario: { correo },
        asunto,
        cuerpo_texto: cuerpo,
        cuerpo_html: aHtml(cuerpo),
        origen,
        referencia: referencia != null ? String(referencia) : undefined,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!respuesta.ok) {
      console.error(`Notificador n8n respondió ${respuesta.status}`);
      return { exito: false, mensaje: `n8n respondió ${respuesta.status}` };
    }
    return { exito: true, mensaje: "Notificación enviada a n8n" };
  } catch (error) {
    console.error("Notificador n8n no disponible:", error.message);
    return { exito: false, mensaje: error.message };
  }
}

module.exports = { notificar, configurado, aHtml };
