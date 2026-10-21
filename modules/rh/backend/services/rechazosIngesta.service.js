// Auditoría ACOTADA de los accesos rechazados a la ingesta (llave ausente, mala, revocada, IP no permitida).
// Sin usuario ni sesión, así que no usa la tabla `auditoria`. Para no llenar la tabla:
//  - una fila por (hora, IP, motivo) con un contador (la BD tiene UNIQUE y suma);
//  - cada clave escribe a lo más una vez por minuto (los intentos intermedios se acumulan en memoria y se
//    vuelcan con un temporizador, así el último intento no se pierde);
//  - tope de claves NUEVAS por hora (las demás se descartan y se cuentan);
//  - poda de filas de más de 30 días, como mucho cada 6 h.
// Nunca bloquea la petición: todo es "dispara y olvida" y los errores solo se escriben en el log sin datos
// de la petición.
const LlaveIngesta = require("../models/llaveIngesta.model");

const HORA_MS = 3600000;

function crearRegistradorRechazos({
  escribir = (fila) => LlaveIngesta.registrarRechazo(fila),
  podar = (dias) => LlaveIngesta.podarRechazos(dias),
  ahora = () => Date.now(),
  maxClavesPorHora = 200,
  pausaMs = 60000,
  retencionDias = 30,
  programar = (fn, ms) => setTimeout(fn, ms),
} = {}) {
  let horaActual = null;
  let claves = new Map();
  let ultimaPoda = 0;
  let descartados = 0;

  function volcar(clave, entrada) {
    if (entrada.temporizador) {
      clearTimeout(entrada.temporizador);
      entrada.temporizador = null;
    }
    if (entrada.pendientes === 0) return;
    const intentos = entrada.pendientes;
    entrada.pendientes = 0;
    entrada.ultimo = ahora();
    Promise.resolve()
      .then(() => escribir({ ...entrada.datos, intentos }))
      .catch((error) => console.error("[Ingesta] No se pudo registrar el rechazo:", error.message));
  }

  function registrar({ ip, motivo, prefijo = null, llaveId = null }) {
    const t = ahora();
    const hora = Math.floor(t / HORA_MS) * HORA_MS;
    if (hora !== horaActual) {
      for (const [clave, entrada] of claves) volcar(clave, entrada); // lo acumulado pertenece a la hora anterior
      horaActual = hora;
      claves = new Map();
      descartados = 0;
    }
    const ipTexto = (ip || "desconocida").slice(0, 45);
    const clave = `${ipTexto}|${motivo}`;
    let entrada = claves.get(clave);
    if (!entrada) {
      if (claves.size >= maxClavesPorHora) {
        descartados += 1;
        if (descartados === 1) console.warn("[Ingesta] Tope de rechazos por hora alcanzado: se descartan los nuevos");
        return;
      }
      entrada = { pendientes: 0, ultimo: 0, temporizador: null, datos: null };
      claves.set(clave, entrada);
    }
    entrada.datos = { hora: new Date(hora), ip: ipTexto, motivo, prefijo, llaveId };
    entrada.pendientes += 1;
    if (t - entrada.ultimo >= pausaMs) {
      volcar(clave, entrada);
    } else if (!entrada.temporizador) {
      const restante = Math.max(0, entrada.ultimo + pausaMs - t);
      entrada.temporizador = programar(() => volcar(clave, entrada), restante);
      if (entrada.temporizador && typeof entrada.temporizador.unref === "function") entrada.temporizador.unref();
    }

    if (t - ultimaPoda >= 6 * HORA_MS) {
      ultimaPoda = t;
      Promise.resolve()
        .then(() => podar(retencionDias))
        .catch((error) => console.error("[Ingesta] No se pudo podar los rechazos:", error.message));
    }
  }

  return { registrar, _estado: () => ({ claves: claves.size, descartados }) };
}

const registradorPorDefecto = crearRegistradorRechazos();

module.exports = { crearRegistradorRechazos, registrarRechazo: registradorPorDefecto.registrar };
