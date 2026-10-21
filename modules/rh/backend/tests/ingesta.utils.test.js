const { normalizarIp, analizarEntrada, validarListaIps, ipPermitida, MAX_IPS } = require("../utils/ipPermitida");
const { interpretarTrustProxy, leerTrustProxy } = require("../utils/trustProxy");
const { generarLlave, analizarLlave, hashLlave, hashesIguales, LONGITUD_LLAVE } = require("../utils/llaveIngesta");
const { crearLimitador } = require("../utils/limiteTasa");

describe("ipPermitida - normalizarIp", () => {
  it.each([
    ["203.0.113.3", "203.0.113.3"],
    ["::ffff:203.0.113.3", "203.0.113.3"],
    ["::FFFF:203.0.113.3", "203.0.113.3"],
    ["  203.0.113.3 ", "203.0.113.3"],
    ["2001:DB8::1", "2001:db8::1"],
    ["::1", "::1"],
    ["fe80::1%eth0", "fe80::1"], // la zona no es parte de la dirección
  ])("%p -> %p", (entrada, esperado) => {
    expect(normalizarIp(entrada)).toBe(esperado);
  });
  it.each([[undefined], [null], [5], [""], ["no-ip"], ["192.0.2"], ["300.1.1.1"], ["203.0.113.3/24"]])("%p no es una IP", (entrada) => {
    expect(normalizarIp(entrada)).toBeNull();
  });
});

describe("ipPermitida - validarListaIps", () => {
  it("acepta IPv4, IPv6 y CIDR, normaliza y quita repetidos", () => {
    expect(validarListaIps(["203.0.113.3", " 203.0.113.3 ", "192.168.0.0/16", "2001:DB8::/32", "::ffff:198.51.100.9", "::1"])).toEqual({
      lista: ["203.0.113.3", "192.168.0.0/16", "2001:db8::/32", "198.51.100.9", "::1"],
    });
  });
  it("la lista vacía es válida (sin restricción)", () => {
    expect(validarListaIps([])).toEqual({ lista: [] });
  });
  it.each([
    ["no es lista", "203.0.113.3"],
    ["objeto", { a: 1 }],
    ["null", null],
    ["undefined", undefined],
    ["entrada no texto", [5]],
    ["entrada vacía", [""]],
    ["texto cualquiera", ["cualquiera"]],
    ["IPv4 inválida", ["256.1.1.1"]],
    ["IPv4 incompleta", ["192.0.2"]],
    ["prefijo fuera de rango IPv4", ["192.0.2.0/33"]],
    ["prefijo fuera de rango IPv6", ["2001:db8::/129"]],
    ["prefijo /0 (para eso está la lista vacía)", ["0.0.0.0/0"]],
    ["prefijo /0 IPv6", ["::/0"]],
    ["prefijo no numérico", ["192.0.2.0/a"]],
    ["prefijo negativo", ["192.0.2.0/-1"]],
    ["dos barras", ["192.0.0.0/8/8"]],
    ["con zona IPv6", ["fe80::1%eth0"]],
    ["rango con guion", ["192.0.2.1-192.0.2.9"]],
    ["comodín", ["192.0.2.*"]],
    ["demasiado larga", ["1".repeat(80)]],
  ])("rechaza: %s", (_nombre, valor) => {
    expect(validarListaIps(valor).error).toMatch(/ips_permitidas/);
  });
  it(`admite como máximo ${MAX_IPS} entradas`, () => {
    const ok = Array.from({ length: MAX_IPS }, (_, i) => `192.0.2.${i + 1}`);
    expect(validarListaIps(ok).lista).toHaveLength(MAX_IPS);
    expect(validarListaIps([...ok, "198.51.100.1"]).error).toMatch(/máximo/);
  });
});

describe("ipPermitida - comprobación", () => {
  it("lista vacía o ausente: cualquiera", () => {
    expect(ipPermitida("203.0.113.9", [])).toBe(true);
    expect(ipPermitida("203.0.113.9", undefined)).toBe(true);
    expect(ipPermitida("203.0.113.9", null)).toBe(true);
  });
  it("IP exacta y CIDR (IPv4 e IPv6)", () => {
    const lista = ["203.0.113.3", "192.168.0.0/16", "2001:db8::/32", "::1"];
    expect(ipPermitida("203.0.113.3", lista)).toBe(true);
    expect(ipPermitida("203.0.113.4", lista)).toBe(false);
    expect(ipPermitida("192.168.77.1", lista)).toBe(true);
    expect(ipPermitida("192.169.0.1", lista)).toBe(false);
    expect(ipPermitida("2001:db8:ffff::5", lista)).toBe(true);
    expect(ipPermitida("2001:db9::1", lista)).toBe(false);
    expect(ipPermitida("::1", lista)).toBe(true);
  });
  it("una IPv4 mapeada en IPv6 (lo que reporta Node) cuenta como la IPv4", () => {
    expect(ipPermitida("::ffff:203.0.113.3", ["203.0.113.3"])).toBe(true);
    expect(ipPermitida("::ffff:203.0.113.9", ["203.0.113.3"])).toBe(false);
    expect(ipPermitida("::ffff:192.168.5.5", ["192.168.0.0/16"])).toBe(true);
  });
  it("con lista, una IP ilegible o ausente NO está permitida", () => {
    expect(ipPermitida(undefined, ["203.0.113.3"])).toBe(false);
    expect(ipPermitida("basura", ["203.0.113.3"])).toBe(false);
    expect(ipPermitida("", ["203.0.113.3"])).toBe(false);
  });
  it("una entrada corrupta en la lista nunca autoriza (y no rompe las demás)", () => {
    expect(ipPermitida("203.0.113.3", ["basura", "0.0.0.0/0"])).toBe(false);
    expect(ipPermitida("203.0.113.3", ["basura", "203.0.113.3"])).toBe(true);
  });
  it("una IPv4 no coincide con una regla IPv6 ni al revés", () => {
    expect(ipPermitida("203.0.113.3", ["2001:db8::/32"])).toBe(false);
    expect(ipPermitida("2001:db8::1", ["192.0.0.0/8"])).toBe(false);
  });
  it("analizarEntrada devuelve familia y prefijo", () => {
    expect(analizarEntrada("192.0.0.0/8")).toMatchObject({ familia: 4, prefijo: 8, texto: "192.0.0.0/8" });
    expect(analizarEntrada("2001:db8::1")).toMatchObject({ familia: 6, prefijo: null });
    expect(analizarEntrada("x")).toBeNull();
  });
});

describe("trustProxy - TRUST_PROXY seguro", () => {
  it.each([[undefined], [null], [""], ["  "], ["false"], ["FALSE"], ["0"]])("%p -> ningún proxy (false)", (crudo) => {
    expect(interpretarTrustProxy(crudo)).toEqual({ valor: false });
  });
  it.each([
    ["1", 1],
    ["2", 2],
    [" 10 ", 10],
  ])("número de proxies %p -> %p", (crudo, esperado) => {
    expect(interpretarTrustProxy(crudo)).toEqual({ valor: esperado });
  });
  it("lista de IP y CIDR de los proxies", () => {
    expect(interpretarTrustProxy("172.18.0.0/16, 192.0.2.5")).toEqual({ valor: ["172.18.0.0/16", "192.0.2.5"] });
  });
  it.each([
    ["true"],
    ["TRUE"],
    ["all"],
    ["*"],
    ["loopback"],
    ["uniquelocal"],
    ["linklocal"],
    ["loopback, uniquelocal"],
    ["0.0.0.0/0"],
    ["::/0"],
    ["11"],
    ["-1"],
    ["1.5"],
    ["192.0.2.5, basura"],
  ])("%p se rechaza (confiar en todo o en la red privada permitiría falsear la IP)", (crudo) => {
    expect(interpretarTrustProxy(crudo).error).toMatch(/TRUST_PROXY/);
  });
  it("leerTrustProxy avisa y devuelve false ante un valor inválido; devuelve el valor si es válido", () => {
    const aviso = jest.fn();
    expect(leerTrustProxy("true", aviso)).toBe(false);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls[0][0]).toMatch(/TRUST_PROXY.*no se confía en ningún proxy/);
    expect(leerTrustProxy("2", aviso)).toBe(2);
    expect(leerTrustProxy(undefined, aviso)).toBe(false);
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});

describe("llaveIngesta - formato, hash y comparación", () => {
  it("genera llaves de 32 bytes aleatorios con prefijo reconocible y únicas", () => {
    const a = generarLlave();
    const b = generarLlave();
    expect(a.llave).toMatch(/^rhk_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/);
    expect(a.llave).toHaveLength(LONGITUD_LLAVE);
    expect(a.prefijo).toBe(a.llave.slice(0, 12));
    expect(Buffer.from(a.llave.slice(13), "base64url")).toHaveLength(32);
    expect(a.llave).not.toBe(b.llave);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashLlave(a.llave));
    expect(a.hash).not.toContain(a.llave.slice(13));
  });
  it("el hash es SHA-256 de la llave completa (valor conocido)", () => {
    expect(hashLlave("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("analizarLlave exige el formato exacto y devuelve el prefijo", () => {
    const { llave, prefijo } = generarLlave();
    expect(analizarLlave(llave)).toEqual({ prefijo });
    for (const mala of [undefined, null, 5, "", llave.slice(1), `${llave}x`, llave.replace("rhk_", "rhx_"), llave.toUpperCase(), ` ${llave}`]) {
      expect(analizarLlave(mala)).toBeNull();
    }
  });
  it("hashesIguales usa crypto.timingSafeEqual (tiempo constante) cuando las longitudes coinciden", () => {
    const crypto = require("crypto");
    const espia = jest.spyOn(crypto, "timingSafeEqual");
    const h = hashLlave("x");
    hashesIguales(h, hashLlave("y"));
    hashesIguales(h, "corto");
    expect(espia).toHaveBeenCalledTimes(1);
    espia.mockRestore();
  });
  it("hashesIguales compara en tiempo constante y no lanza con longitudes distintas ni tipos raros", () => {
    const h = hashLlave("x");
    expect(hashesIguales(h, h)).toBe(true);
    expect(hashesIguales(h, hashLlave("y"))).toBe(false);
    expect(hashesIguales(h, h.slice(1))).toBe(false);
    expect(hashesIguales(h, undefined)).toBe(false);
    expect(hashesIguales(null, h)).toBe(false);
  });
});

describe("limiteTasa - ventana deslizante", () => {
  const reloj = (inicio = 1_000_000) => {
    let t = inicio;
    return { ahora: () => t, avanzar: (ms) => (t += ms) };
  };

  it("permite el máximo y bloquea el siguiente con el tiempo de espera", () => {
    const r = reloj();
    const lim = crearLimitador({ maximo: 3, ventanaMs: 60000, ahora: r.ahora });
    for (let i = 0; i < 3; i += 1) expect(lim.intentar("k").permitido).toBe(true);
    r.avanzar(10_000);
    expect(lim.intentar("k")).toEqual({ permitido: false, reintentarEnSeg: 50 });
  });
  it("las claves son independientes", () => {
    const lim = crearLimitador({ maximo: 1, ahora: reloj().ahora });
    expect(lim.intentar("a").permitido).toBe(true);
    expect(lim.intentar("b").permitido).toBe(true);
    expect(lim.intentar("a").permitido).toBe(false);
  });
  it("las peticiones se liberan una a una al salir de la ventana", () => {
    const r = reloj();
    const lim = crearLimitador({ maximo: 2, ventanaMs: 60000, ahora: r.ahora });
    lim.intentar("k");
    r.avanzar(30_000);
    lim.intentar("k");
    expect(lim.intentar("k").permitido).toBe(false);
    r.avanzar(30_001); // sale la primera
    expect(lim.intentar("k").permitido).toBe(true);
    expect(lim.intentar("k").permitido).toBe(false);
  });
  it("Retry-After nunca es menor que 1 s", () => {
    const r = reloj();
    const lim = crearLimitador({ maximo: 1, ventanaMs: 1000, ahora: r.ahora });
    lim.intentar("k");
    r.avanzar(999);
    expect(lim.intentar("k").reintentarEnSeg).toBe(1);
  });
  it("una petición rechazada no consume cupo (no se alarga el bloqueo)", () => {
    const r = reloj();
    const lim = crearLimitador({ maximo: 1, ventanaMs: 60000, ahora: r.ahora });
    lim.intentar("k");
    for (let i = 0; i < 10; i += 1) {
      r.avanzar(1000);
      lim.intentar("k");
    }
    r.avanzar(50_001);
    expect(lim.intentar("k").permitido).toBe(true);
  });
  it("limita el número de claves en memoria depurando las vencidas", () => {
    const r = reloj();
    const lim = crearLimitador({ maximo: 1, ventanaMs: 1000, ahora: r.ahora, maxClaves: 3 });
    ["a", "b", "c"].forEach((k) => lim.intentar(k));
    r.avanzar(5000);
    expect(lim.intentar("d").permitido).toBe(true);
    expect(lim.intentar("a").permitido).toBe(true);
  });
});
