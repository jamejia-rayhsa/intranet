// Pruebas de la capa de caché de catálogos MBA3: evita una segunda llamada en vivo dentro del
// TTL, y cae al último dato conocido (aunque esté vencido) si MBA3 falla en vez de romper el
// flujo. Mockea el modelo de caché (BD) y el cliente HTTP de MBA3 por completo.
jest.mock("../models/cacheMba3.model");
jest.mock("../services/mba3Lectura.service");

const CacheMba3 = require("../models/cacheMba3.model");
const Mba3Lectura = require("../services/mba3Lectura.service");
const Mba3Catalogo = require("../services/mba3Catalogo.service");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("resolverCliente (caché + TTL)", () => {
  it("sin caché previa, consulta MBA3 y la guarda", async () => {
    CacheMba3.obtener.mockResolvedValue(null);
    Mba3Lectura.obtenerFichaCliente.mockResolvedValue({ codigo: "C1", nombre: "Cliente Uno" });

    const { datos, deCache } = await Mba3Catalogo.resolverCliente("C1");

    expect(datos).toEqual({ codigo: "C1", nombre: "Cliente Uno" });
    expect(deCache).toBe(false);
    expect(Mba3Lectura.obtenerFichaCliente).toHaveBeenCalledWith("C1");
    expect(CacheMba3.guardar).toHaveBeenCalledWith("cliente", "C1", { codigo: "C1", nombre: "Cliente Uno" });
  });

  it("con caché vigente (dentro del TTL), NO llama a MBA3 de nuevo", async () => {
    CacheMba3.obtener.mockResolvedValue({
      datos: { codigo: "C1", nombre: "Cliente Uno" },
      consultado_en: new Date(Date.now() - 60 * 1000), // hace 1 minuto, TTL de cliente es 15 min
    });

    const { datos, deCache } = await Mba3Catalogo.resolverCliente("C1");

    expect(datos).toEqual({ codigo: "C1", nombre: "Cliente Uno" });
    expect(deCache).toBe(true);
    expect(Mba3Lectura.obtenerFichaCliente).not.toHaveBeenCalled();
  });

  it("con caché vencida (fuera del TTL), vuelve a consultar MBA3", async () => {
    CacheMba3.obtener.mockResolvedValue({
      datos: { codigo: "C1", nombre: "Viejo" },
      consultado_en: new Date(Date.now() - 20 * 60 * 1000), // hace 20 min, TTL de cliente es 15 min
    });
    Mba3Lectura.obtenerFichaCliente.mockResolvedValue({ codigo: "C1", nombre: "Nuevo" });

    const { datos, deCache } = await Mba3Catalogo.resolverCliente("C1");

    expect(datos).toEqual({ codigo: "C1", nombre: "Nuevo" });
    expect(deCache).toBe(false);
    expect(Mba3Lectura.obtenerFichaCliente).toHaveBeenCalledWith("C1");
  });

  it("si MBA3 falla pero hay algo cacheado (aunque esté vencido), devuelve lo último conocido con advertencia", async () => {
    CacheMba3.obtener.mockResolvedValue({
      datos: { codigo: "C1", nombre: "Viejo" },
      consultado_en: new Date(Date.now() - 20 * 60 * 1000),
    });
    Mba3Lectura.obtenerFichaCliente.mockRejectedValue(new Error("MBA3 no configurado"));

    const { datos, deCache, advertencia } = await Mba3Catalogo.resolverCliente("C1");

    expect(datos).toEqual({ codigo: "C1", nombre: "Viejo" });
    expect(deCache).toBe(true);
    expect(advertencia).toMatch(/MBA3 no respondió/);
  });

  it("si MBA3 falla y no hay nada cacheado, propaga el error (el llamador decide el fallback)", async () => {
    CacheMba3.obtener.mockResolvedValue(null);
    Mba3Lectura.obtenerFichaCliente.mockRejectedValue(new Error("MBA3 no configurado"));

    await expect(Mba3Catalogo.resolverCliente("C1")).rejects.toThrow("MBA3 no configurado");
    expect(CacheMba3.guardar).not.toHaveBeenCalled();
  });

  it("un fallo leyendo la caché (BD caída) no impide intentar la consulta en vivo", async () => {
    CacheMba3.obtener.mockRejectedValue(new Error("BD caída"));
    Mba3Lectura.obtenerFichaCliente.mockResolvedValue({ codigo: "C1", nombre: "Cliente Uno" });

    const { datos } = await Mba3Catalogo.resolverCliente("C1");
    expect(datos).toEqual({ codigo: "C1", nombre: "Cliente Uno" });
  });
});

// R-F2-4 (revisión post Fase 2): el catálogo completo ('*listado') ya no comparte clave de caché
// con la resolución de un código real que sea literalmente "*".
describe("colisión de caché con código '*' (R-F2-4)", () => {
  // 2026-11-10: MBA3 no tiene "listar todos los productos" (a diferencia de vendedores) — se
  // confirmó contra la API real que ese endpoint no existe. `buscarProductos` ya no tiene una
  // rama de "catálogo completo"; en su lugar, la búsqueda por nombre (`buscarProductosPorNombre`)
  // es la que necesita su propio tipo de caché para no colisionar con `resolverProducto`.
  it("resolverProducto('*') y buscarProductosPorNombre (por nombre) usan tipos de caché distintos", async () => {
    CacheMba3.obtener.mockResolvedValue(null);
    Mba3Lectura.obtenerProducto.mockResolvedValue({ codigo: "*", descripcion: "Producto con código asterisco" });
    Mba3Lectura.buscarProductosPorNombre.mockResolvedValue({ data: [{ codigo: "P1" }, { codigo: "P2" }], advertencias: [] });

    await Mba3Catalogo.resolverProducto("*");
    await Mba3Catalogo.buscarProductosPorNombre("tornillo");

    const tiposGuardados = CacheMba3.guardar.mock.calls.map((llamada) => llamada[0]);
    expect(tiposGuardados).toContain("producto");
    expect(tiposGuardados).toContain("producto_nombre");
    expect(tiposGuardados[0]).not.toBe(tiposGuardados[1]); // nunca la misma clave (tipo,codigo)
  });

  it("buscarProductosPorNombre no se envenena con un producto de código '*' cacheado bajo 'producto'", async () => {
    // Simula que YA existe un producto real con código "*" cacheado bajo tipo 'producto'.
    CacheMba3.obtener.mockImplementation(async (tipo) => {
      if (tipo === "producto") {
        return { datos: { codigo: "*", descripcion: "Producto con código asterisco" }, consultado_en: new Date() };
      }
      return null; // 'producto_nombre' nunca se cacheó todavía
    });
    Mba3Lectura.buscarProductosPorNombre.mockResolvedValue({ data: [{ codigo: "P1" }, { codigo: "P2" }], advertencias: [] });

    const { datos } = await Mba3Catalogo.buscarProductosPorNombre("tornillo");
    // Antes de la corrección, un tipo de caché compartido habría devuelto el objeto único "*".
    expect(Array.isArray(datos)).toBe(true);
    expect(datos).toEqual([{ codigo: "P1" }, { codigo: "P2" }]);
    expect(Mba3Lectura.buscarProductosPorNombre).toHaveBeenCalled(); // sí consultó, no usó la caché ajena
  });

  it("resolverVendedor('*') y buscarVendedores (catálogo completo) usan tipos de caché distintos", async () => {
    CacheMba3.obtener.mockResolvedValue(null);
    Mba3Lectura.obtenerVendedor.mockResolvedValue({ codigo: "*", nombre: "Vendedor con código asterisco" });
    Mba3Lectura.listarVendedores.mockResolvedValue({ data: [{ codigo: "V1" }], advertencias: [] });

    await Mba3Catalogo.resolverVendedor("*");
    await Mba3Catalogo.buscarVendedores();

    const tiposGuardados = CacheMba3.guardar.mock.calls.map((llamada) => llamada[0]);
    expect(tiposGuardados).toContain("vendedor");
    expect(tiposGuardados).toContain("vendedor_listado");
  });
});

describe("extracción de nombre/descripción (suposición sin verificar)", () => {
  it("extraerNombreCliente prueba varios nombres de campo en orden", () => {
    expect(Mba3Catalogo.extraerNombreCliente({ nombre: "A" })).toBe("A");
    expect(Mba3Catalogo.extraerNombreCliente({ cliente_nombre: "B" })).toBe("B");
    expect(Mba3Catalogo.extraerNombreCliente({ razon_social: "C" })).toBe("C");
    expect(Mba3Catalogo.extraerNombreCliente({ otro_campo: "D" })).toBeNull();
    expect(Mba3Catalogo.extraerNombreCliente(null)).toBeNull();
  });

  it("extraerDescripcionProducto prueba varios nombres de campo en orden", () => {
    expect(Mba3Catalogo.extraerDescripcionProducto({ descripcion: "Tornillo" })).toBe("Tornillo");
    expect(Mba3Catalogo.extraerDescripcionProducto({ producto_descripcion: "Tuerca" })).toBe("Tuerca");
    expect(Mba3Catalogo.extraerDescripcionProducto({})).toBeNull();
  });
});
