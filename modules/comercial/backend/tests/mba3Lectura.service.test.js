// Pruebas del cliente HTTP de lectura de MBA3: login/refresh/relogin ante 401 y paginación
// automática. axios mockeado por completo (sin red real ni credenciales reales en el sandbox).
jest.mock("axios");
const axios = require("axios");
const Mba3Lectura = require("../services/mba3Lectura.service");

function errorConEstado(status, detail) {
  const error = new Error(`HTTP ${status}`);
  error.response = { status, data: detail ? { detail } : undefined };
  return error;
}

function montarClienteMock() {
  const post = jest.fn();
  axios.create.mockReturnValue({ post });
  return post;
}

beforeEach(() => {
  jest.clearAllMocks();
  Mba3Lectura._resetEstadoParaTests();
  delete process.env.MBA3_LECTURA_USUARIO;
  delete process.env.MBA3_LECTURA_PASSWORD;
  delete process.env.MBA3_LECTURA_URL;
  delete process.env.MBA3_LECTURA_CF_ACCESS_CLIENT_ID;
  delete process.env.MBA3_LECTURA_CF_ACCESS_CLIENT_SECRET;
});

describe("login", () => {
  it("lanza ErrorMba3NoConfigurado si faltan usuario/password", async () => {
    const post = montarClienteMock();
    await expect(Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" })).rejects.toThrow(
      Mba3Lectura.ErrorMba3NoConfigurado,
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("hace login antes de la primera llamada y reutiliza el token en la segunda", async () => {
    process.env.MBA3_LECTURA_USUARIO = "svc";
    process.env.MBA3_LECTURA_PASSWORD = "secreto";
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } }) // login
      .mockResolvedValueOnce({ data: { data: [{ codigo: "C1" }], pagination: { total: 1, returned: 1 } } }) // llamada 1
      .mockResolvedValueOnce({ data: { data: [{ codigo: "C2" }], pagination: { total: 1, returned: 1 } } }); // llamada 2

    await Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" });
    await Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C2" });

    expect(post).toHaveBeenCalledTimes(3); // 1 login + 2 llamadas (sin relogin de por medio)
    expect(post.mock.calls[0][0]).toBe("/v1/login");
    expect(post.mock.calls[0][1]).toEqual({ username: "svc", password: "secreto" });
  });
});

describe("401 -> refresh -> reintento", () => {
  beforeEach(() => {
    process.env.MBA3_LECTURA_USUARIO = "svc";
    process.env.MBA3_LECTURA_PASSWORD = "secreto";
  });

  it("si el access_token expira, refresca con refresh_token y reintenta una vez", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } }) // login
      .mockRejectedValueOnce(errorConEstado(401, "token expirado")) // primer intento del endpoint
      .mockResolvedValueOnce({ data: { access_token: "tok2" } }) // refresh
      .mockResolvedValueOnce({ data: { data: [{ codigo: "C1" }], pagination: { total: 1, returned: 1 } } }); // reintento OK

    const datos = await Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" });
    expect(datos.data).toEqual([{ codigo: "C1" }]);
    expect(post).toHaveBeenCalledTimes(4);
    expect(post.mock.calls[2][0]).toBe("/v1/refresh");
    expect(post.mock.calls[2][1]).toEqual({ refresh_token: "ref1" });
  });

  it("si el refresh también falla, hace relogin desde cero antes del único reintento", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } }) // login inicial
      .mockRejectedValueOnce(errorConEstado(401, "token expirado")) // primer intento
      .mockRejectedValueOnce(errorConEstado(401, "refresh inválido")) // refresh falla
      .mockResolvedValueOnce({ data: { access_token: "tok2", refresh_token: "ref2" } }) // relogin
      .mockResolvedValueOnce({ data: { data: [], pagination: { total: 0, returned: 0 } } }); // reintento OK

    const datos = await Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" });
    expect(datos.data).toEqual([]);
    expect(post).toHaveBeenCalledTimes(5);
    expect(post.mock.calls[2][0]).toBe("/v1/refresh");
    expect(post.mock.calls[3][0]).toBe("/v1/login");
  });

  it("si el reintento también da 401, propaga un ErrorMba3 claro (no cuelga en bucle)", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockRejectedValueOnce(errorConEstado(401, "token expirado"))
      .mockResolvedValueOnce({ data: { access_token: "tok2" } }) // refresh OK
      .mockRejectedValueOnce(errorConEstado(401, "sigue sin autorizar")); // reintento también falla

    await expect(Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" })).rejects.toThrow(
      Mba3Lectura.ErrorMba3,
    );
    expect(post).toHaveBeenCalledTimes(4); // sin un tercer intento
  });

  it("un error que no es 401 se traduce a ErrorMba3 sin reintentar", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockRejectedValueOnce(errorConEstado(500, "falla interna de MBA3"));

    await expect(Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" })).rejects.toThrow(
      /falla interna de MBA3/,
    );
    expect(post).toHaveBeenCalledTimes(2); // login + 1 intento, sin refresh/relogin
  });
});

describe("paginación automática", () => {
  beforeEach(() => {
    process.env.MBA3_LECTURA_USUARIO = "svc";
    process.env.MBA3_LECTURA_PASSWORD = "secreto";
  });

  it("sube el offset hasta traer todas las páginas según pagination.total", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } }) // login
      .mockResolvedValueOnce({
        data: { data: [{ codigo: "A" }, { codigo: "B" }], pagination: { total: 3, limit: 2, offset: 0, returned: 2 } },
      })
      .mockResolvedValueOnce({
        data: { data: [{ codigo: "C" }], pagination: { total: 3, limit: 2, offset: 2, returned: 1 } },
      });

    const { data } = await Mba3Lectura.paginarTodo("productos", {}, { porPagina: 2 });
    expect(data).toEqual([{ codigo: "A" }, { codigo: "B" }, { codigo: "C" }]);
    // login + 2 páginas; la 3ra no se pide porque ya se cubrió el total
    expect(post).toHaveBeenCalledTimes(3);
    expect(post.mock.calls[2][2].params).toEqual({ limit: 2, offset: 2 });
  });

  it("se detiene aunque pagination.total nunca baje, con un tope de seguridad de páginas", async () => {
    const post = montarClienteMock();
    post.mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } });
    // Siempre dice que faltan más páginas: el tope de seguridad debe cortar el bucle.
    post.mockImplementation(() =>
      Promise.resolve({ data: { data: [{ codigo: "X" }], pagination: { total: 999999, returned: 1 } } }),
    );

    const { data } = await Mba3Lectura.paginarTodo("productos", {}, { porPagina: 1, topePaginas: 3 });
    expect(data).toHaveLength(3); // 3 páginas, no 999999
  });

  it("se detiene si una página llega vacía aunque total diga que falta más", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({ data: { data: [{ codigo: "A" }], pagination: { total: 5, returned: 1 } } })
      .mockResolvedValueOnce({ data: { data: [], pagination: { total: 5, returned: 0 } } });

    const { data } = await Mba3Lectura.paginarTodo("productos", {}, { porPagina: 1 });
    expect(data).toEqual([{ codigo: "A" }]);
  });
});

describe("ficha de cliente (endpoint confirmado)", () => {
  it("usa el body {codigo} confirmado por el manual y devuelve el registro con código exacto", async () => {
    process.env.MBA3_LECTURA_USUARIO = "svc";
    process.env.MBA3_LECTURA_PASSWORD = "secreto";
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({ data: { data: [{ codigo: "C1", nombre: "Cliente Uno" }], pagination: { total: 1, returned: 1 } } });

    const ficha = await Mba3Lectura.obtenerFichaCliente("C1");
    expect(ficha).toEqual({ codigo: "C1", nombre: "Cliente Uno" });
    expect(post.mock.calls[1][0]).toBe("/v1/api/ficha-cliente");
    expect(post.mock.calls[1][1]).toEqual({ codigo: "C1" });
  });
});

// R-F2-1 (revisión post Fase 2): coincidencia EXACTA de código, nunca "usa el primero que venga".
describe("coincidencia exacta de código (R-F2-1)", () => {
  beforeEach(() => {
    process.env.MBA3_LECTURA_USUARIO = "svc";
    process.env.MBA3_LECTURA_PASSWORD = "secreto";
  });

  it("obtenerFichaCliente: si el primer registro NO coincide exacto pero otro sí, devuelve el que coincide", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({
        data: {
          data: [{ codigo: "C10" }, { codigo: "C1" }, { codigo: "C11" }],
          pagination: { total: 3, returned: 3 },
        },
      });

    const ficha = await Mba3Lectura.obtenerFichaCliente("C1");
    expect(ficha).toEqual({ codigo: "C1" });
  });

  it("obtenerFichaCliente: si NINGÚN registro coincide exacto, devuelve null (no 'usa el primero')", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({
        data: { data: [{ codigo: "C10" }, { codigo: "C11" }], pagination: { total: 2, returned: 2 } },
      });

    const ficha = await Mba3Lectura.obtenerFichaCliente("C1");
    expect(ficha).toBeNull();
  });

  it("obtenerVendedor: subcadena ya no alcanza (buscar '1' no trae '10' ni '11')", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({
        data: { data: [{ codigo: "10" }, { codigo: "11" }], pagination: { total: 2, returned: 2 } },
      });

    const vendedor = await Mba3Lectura.obtenerVendedor("1");
    expect(vendedor).toBeNull();
  });

  it("obtenerVendedor: con coincidencia exacta entre varios, devuelve solo esa", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({
        data: { data: [{ codigo: "10" }, { codigo: "1" }, { codigo: "11" }], pagination: { total: 3, returned: 3 } },
      });

    const vendedor = await Mba3Lectura.obtenerVendedor("1");
    expect(vendedor).toEqual({ codigo: "1" });
  });

  it("obtenerProducto: sin coincidencia exacta devuelve null", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({
        data: { data: [{ codigo: "P10" }], pagination: { total: 1, returned: 1 } },
      });

    const producto = await Mba3Lectura.obtenerProducto("P1");
    expect(producto).toBeNull();
  });

  // Confirmado contra /openapi.json real (2026-11-10): no existe "productos" para listar todo;
  // obtenerProducto usa ficha-producto con body {"Codigo": "..."} (mayúscula).
  it("obtenerProducto: llama a ficha-producto con {Codigo} y encuentra por PRODUCTO (mayúscula)", async () => {
    process.env.MBA3_LECTURA_USUARIO = "svc";
    process.env.MBA3_LECTURA_PASSWORD = "secreto";
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({ data: { data: [{ PRODUCTO: "P1", NOMBRE: "Tornillo" }] } });

    const producto = await Mba3Lectura.obtenerProducto("P1");
    expect(producto).toEqual({ PRODUCTO: "P1", NOMBRE: "Tornillo" });
    expect(post).toHaveBeenNthCalledWith(2, "/v1/api/ficha-producto", { Codigo: "P1" }, expect.anything());
  });

  it("buscarProductosPorNombre: llama a productos-buscar-nombre con {nombre} y pagina", async () => {
    process.env.MBA3_LECTURA_USUARIO = "svc";
    process.env.MBA3_LECTURA_PASSWORD = "secreto";
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({
        data: { data: [{ PRODUCTO: "P1" }, { PRODUCTO: "P2" }], pagination: { total: 2, returned: 2 } },
      });

    const { data } = await Mba3Lectura.buscarProductosPorNombre("tornillo");
    expect(data).toEqual([{ PRODUCTO: "P1" }, { PRODUCTO: "P2" }]);
    // El servidor no envuelve el término en comodines solo: hay que mandar %termino% (confirmado
    // en vivo el 2026-11-10 — sin % siempre da 0 resultados).
    expect(post).toHaveBeenNthCalledWith(2, "/v1/api/productos-buscar-nombre", { nombre: "%tornillo%" }, expect.anything());
  });
});

// R-F2-2 (revisión post Fase 2): single-flight + cooldown de login.
describe("single-flight y cooldown de login (R-F2-2)", () => {
  beforeEach(() => {
    process.env.MBA3_LECTURA_USUARIO = "svc";
    process.env.MBA3_LECTURA_PASSWORD = "secreto";
  });

  it("10+ llamadas concurrentes sin token válido disparan un SOLO login real", async () => {
    const post = montarClienteMock();
    let logins = 0;
    post.mockImplementation((url) => {
      if (url === "/v1/login") {
        logins++;
        return new Promise((resolve) => {
          setTimeout(() => resolve({ data: { access_token: "tok1", refresh_token: "ref1" } }), 15);
        });
      }
      return Promise.resolve({ data: { data: [{ codigo: "X" }], pagination: { total: 1, returned: 1 } } });
    });

    const llamadas = Array.from({ length: 12 }, (_, i) =>
      Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: `C${i}` }),
    );
    await Promise.all(llamadas);

    expect(logins).toBe(1);
  });

  it("tras un fallo real de login, un segundo intento inmediato NO vuelve a pegarle a MBA3 (cooldown)", async () => {
    const post = montarClienteMock();
    post.mockRejectedValueOnce(errorConEstado(401, "credenciales inválidas"));

    await expect(Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" })).rejects.toThrow();

    post.mockClear();
    await expect(Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled(); // en cooldown: ni intenta login otra vez
  });

  it("ErrorMba3NoConfigurado (sin credenciales en el entorno) NO activa cooldown", async () => {
    delete process.env.MBA3_LECTURA_USUARIO;
    delete process.env.MBA3_LECTURA_PASSWORD;
    const post = montarClienteMock();

    await expect(Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" })).rejects.toThrow(
      Mba3Lectura.ErrorMba3NoConfigurado,
    );
    expect(post).not.toHaveBeenCalled();

    // Al configurar las credenciales, el siguiente intento debe poder loguear sin esperar cooldown.
    process.env.MBA3_LECTURA_USUARIO = "svc";
    process.env.MBA3_LECTURA_PASSWORD = "secreto";
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({ data: { data: [{ codigo: "C1" }], pagination: { total: 1, returned: 1 } } });

    const datos = await Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" });
    expect(datos.data).toEqual([{ codigo: "C1" }]);
  });
});

// Service Token de Cloudflare Access (ver blockers.md "Cloudflare Access"): headers que deben ir
// en CADA petición cuando las 2 variables están configuradas, y que NO deben ir (sin romper nada)
// cuando faltan.
describe("headers de Cloudflare Access (Service Token)", () => {
  beforeEach(() => {
    process.env.MBA3_LECTURA_USUARIO = "svc";
    process.env.MBA3_LECTURA_PASSWORD = "secreto";
  });

  it("manda CF-Access-Client-Id/Secret en login, catálogo y logout cuando ambas variables están configuradas", async () => {
    process.env.MBA3_LECTURA_CF_ACCESS_CLIENT_ID = "abc123.access";
    process.env.MBA3_LECTURA_CF_ACCESS_CLIENT_SECRET = "shh-secreto";
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } }) // login
      .mockResolvedValueOnce({ data: { data: [{ codigo: "C1" }], pagination: { total: 1, returned: 1 } } }) // llamada
      .mockResolvedValueOnce({ data: {} }); // logout

    await Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" });
    await Mba3Lectura.logout();

    const headersEsperados = {
      "CF-Access-Client-Id": "abc123.access",
      "CF-Access-Client-Secret": "shh-secreto",
    };
    // login
    expect(post.mock.calls[0][2].headers).toMatchObject(headersEsperados);
    // catálogo (además lleva Authorization)
    expect(post.mock.calls[1][2].headers).toMatchObject(headersEsperados);
    expect(post.mock.calls[1][2].headers.Authorization).toBe("Bearer tok1");
    // logout (además lleva Authorization)
    expect(post.mock.calls[2][2].headers).toMatchObject(headersEsperados);
  });

  it("NO manda los headers de Cloudflare si falta MBA3_LECTURA_CF_ACCESS_CLIENT_SECRET (sigue funcionando igual que antes)", async () => {
    process.env.MBA3_LECTURA_CF_ACCESS_CLIENT_ID = "abc123.access";
    // sin MBA3_LECTURA_CF_ACCESS_CLIENT_SECRET
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({ data: { data: [{ codigo: "C1" }], pagination: { total: 1, returned: 1 } } });

    await Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" });

    expect(post.mock.calls[0][2].headers).not.toHaveProperty("CF-Access-Client-Id");
    expect(post.mock.calls[1][2].headers).not.toHaveProperty("CF-Access-Client-Id");
  });

  it("NO manda los headers de Cloudflare cuando ninguna de las 2 variables está configurada", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({ data: { data: [{ codigo: "C1" }], pagination: { total: 1, returned: 1 } } });

    await Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" });

    expect(post.mock.calls[0][2].headers).toEqual({});
    expect(post.mock.calls[1][2].headers).toEqual({ Authorization: "Bearer tok1" });
  });

  it("avisa por consola si MBA3_LECTURA_URL está configurado pero faltan los 2 valores del Service Token", async () => {
    process.env.MBA3_LECTURA_URL = "https://mba3api.rayhsa.net";
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({ data: { data: [], pagination: { total: 0, returned: 0 } } });
    const avisoSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" });

    expect(avisoSpy).toHaveBeenCalledWith(expect.stringContaining("Cloudflare Access"));
    avisoSpy.mockRestore();
  });

  it("no avisa si MBA3_LECTURA_URL no está configurado (entorno sin intención de hablar con MBA3 real)", async () => {
    const post = montarClienteMock();
    post
      .mockResolvedValueOnce({ data: { access_token: "tok1", refresh_token: "ref1" } })
      .mockResolvedValueOnce({ data: { data: [], pagination: { total: 0, returned: 0 } } });
    const avisoSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await Mba3Lectura.llamarEndpoint("ficha-cliente", { codigo: "C1" });

    expect(avisoSpy).not.toHaveBeenCalled();
    avisoSpy.mockRestore();
  });
});
