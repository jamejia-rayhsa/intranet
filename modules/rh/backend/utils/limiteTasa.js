// Límite de tasa en memoria (ventana deslizante), sin dependencias. Es por proceso: con una sola réplica del
// backend (la situación actual) es exacto; con varias réplicas cada una limitaría por separado.
function crearLimitador({ maximo = 60, ventanaMs = 60000, ahora = () => Date.now(), maxClaves = 1000 } = {}) {
  const registros = new Map(); // clave -> marcas de tiempo (ms) dentro de la ventana, ascendentes

  function depurar(t) {
    for (const [clave, marcas] of registros) {
      if (marcas.length === 0 || marcas[marcas.length - 1] <= t - ventanaMs) registros.delete(clave);
    }
  }

  return {
    /** Cuenta una petición de `clave`. { permitido: true } o { permitido: false, reintentarEnSeg }. */
    intentar(clave) {
      const t = ahora();
      if (registros.size >= maxClaves && !registros.has(clave)) depurar(t);
      const marcas = (registros.get(clave) || []).filter((m) => m > t - ventanaMs);
      if (marcas.length >= maximo) {
        registros.set(clave, marcas);
        return { permitido: false, reintentarEnSeg: Math.max(1, Math.ceil((marcas[0] + ventanaMs - t) / 1000)) };
      }
      marcas.push(t);
      registros.set(clave, marcas);
      return { permitido: true };
    },
    reiniciar() {
      registros.clear();
    },
  };
}

module.exports = { crearLimitador };
