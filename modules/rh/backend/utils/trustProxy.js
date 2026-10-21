// Configuración segura de `trust proxy` de Express a partir de la variable de entorno TRUST_PROXY.
// Sin variable (o vacía): false -> req.ip es la dirección del socket y X-Forwarded-For se ignora.
// Valores admitidos:
//   - un entero 1..10: número de proxies de confianza delante del backend (Express toma la IP de esa posición
//     contando desde la derecha de X-Forwarded-For);
//   - una lista separada por comas de IP o CIDR de los proxies (p. ej. la subred de la red Docker de nginx).
// NO se admiten "true", "all", "*" ni los alias loopback/linklocal/uniquelocal: confiar en todo (o en toda la
// red privada, donde vive también la interfaz de BioTime) permitiría que el cliente falsee su IP con una
// cabecera X-Forwarded-For y evadiría la lista de IP permitidas de las llaves.
const { analizarEntrada } = require("./ipPermitida");

/** Devuelve {valor} (false | entero | lista) o {error}. */
function interpretarTrustProxy(crudo) {
  if (crudo === undefined || crudo === null) return { valor: false };
  const texto = String(crudo).trim();
  if (texto === "" || texto.toLowerCase() === "false" || texto === "0") return { valor: false };
  if (/^\d+$/.test(texto)) {
    const saltos = Number(texto);
    if (saltos >= 1 && saltos <= 10) return { valor: saltos };
    return { error: "TRUST_PROXY: el número de proxies debe estar entre 1 y 10" };
  }
  const entradas = texto.split(",").map((e) => e.trim());
  const lista = [];
  for (const entrada of entradas) {
    const analizada = analizarEntrada(entrada);
    // aquí /0 sigue prohibido: confiar en 0.0.0.0/0 es confiar en todo
    if (!analizada) {
      return { error: "TRUST_PROXY: usa un número de proxies o una lista de IP/CIDR (no true, all ni uniquelocal)" };
    }
    lista.push(analizada.texto);
  }
  return { valor: lista };
}

/** Para app.js: el valor a pasar a app.set("trust proxy", ...); ante un valor inválido avisa y devuelve false. */
function leerTrustProxy(crudo, aviso = console.warn) {
  const { valor, error } = interpretarTrustProxy(crudo);
  if (error) {
    aviso(`${error}. Se ignora y no se confía en ningún proxy.`);
    return false;
  }
  return valor;
}

module.exports = { interpretarTrustProxy, leerTrustProxy };
