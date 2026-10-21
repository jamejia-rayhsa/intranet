// Listas de IP permitidas de las llaves de ingesta: validación de formato (IPv4, IPv6 y CIDR),
// normalización y comprobación. Funciones puras, sin dependencias (usa net.BlockList de Node).
const net = require("net");

const MAX_IPS = 20;
const MAX_LONGITUD_ENTRADA = 49; // holgura sobre la mayor entrada válida (IPv6 de 39 caracteres + "/128")

/** IP del cliente normalizada: sin identificador de zona, minúsculas y IPv4 "mapeada" (::ffff:a.b.c.d) como IPv4. */
function normalizarIp(valor) {
  if (typeof valor !== "string") return null;
  let ip = valor.trim().toLowerCase().split("%")[0]; // el identificador de zona (fe80::1%eth0) no es parte de la dirección
  if (ip.startsWith("::ffff:") && net.isIPv4(ip.slice(7))) ip = ip.slice(7);
  return net.isIP(ip) ? ip : null;
}

/** Una entrada ("192.0.2.3", "192.0.2.0/24", "2001:db8::/32") -> {texto, direccion, prefijo, familia} o null. */
function analizarEntrada(entrada) {
  if (typeof entrada !== "string") return null;
  const texto = entrada.trim().toLowerCase();
  if (!texto || texto.length > MAX_LONGITUD_ENTRADA) return null;
  const partes = texto.split("/");
  if (partes.length > 2) return null;
  const direccion = normalizarIp(partes[0]);
  if (!direccion || texto.includes("%")) return null;
  const familia = net.isIPv4(direccion) ? 4 : 6;
  if (partes.length === 1) return { texto: direccion, direccion, prefijo: null, familia };
  if (!/^\d{1,3}$/.test(partes[1])) return null;
  const prefijo = Number(partes[1]);
  const maximo = familia === 4 ? 32 : 128;
  // /0 equivale a "cualquier IP": para eso está la lista vacía
  if (prefijo < 1 || prefijo > maximo) return null;
  return { texto: `${direccion}/${prefijo}`, direccion, prefijo, familia };
}

/**
 * Valida la lista que envía el administrador. Devuelve {lista} (normalizada, sin repetidos) o {error}.
 * Lista vacía = sin restricción de IP.
 */
function validarListaIps(valor) {
  if (!Array.isArray(valor)) return { error: "ips_permitidas debe ser una lista de direcciones IP o CIDR" };
  if (valor.length > MAX_IPS) return { error: `ips_permitidas admite como máximo ${MAX_IPS} entradas` };
  const lista = [];
  for (const entrada of valor) {
    const analizada = analizarEntrada(entrada);
    if (!analizada) {
      return { error: "ips_permitidas contiene una entrada que no es una IPv4, IPv6 o CIDR válida (el prefijo /0 no se admite)" };
    }
    if (!lista.includes(analizada.texto)) lista.push(analizada.texto);
  }
  return { lista };
}

/** ¿La IP del cliente está en la lista? Lista vacía = sin restricción. IP ilegible = no permitida. */
function ipPermitida(ip, lista) {
  if (!Array.isArray(lista) || lista.length === 0) return true;
  const cliente = normalizarIp(ip);
  if (!cliente) return false;
  const familiaCliente = net.isIPv4(cliente) ? "ipv4" : "ipv6";
  const bloques = new net.BlockList();
  for (const entrada of lista) {
    const analizada = analizarEntrada(entrada);
    if (!analizada) continue; // una entrada corrupta en BD nunca autoriza
    const familia = analizada.familia === 4 ? "ipv4" : "ipv6";
    if (analizada.prefijo === null) bloques.addAddress(analizada.direccion, familia);
    else bloques.addSubnet(analizada.direccion, analizada.prefijo, familia);
  }
  return bloques.check(cliente, familiaCliente);
}

module.exports = { MAX_IPS, normalizarIp, analizarEntrada, validarListaIps, ipPermitida };
