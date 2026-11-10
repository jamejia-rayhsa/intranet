// Pruebas de los endpoints de búsqueda en catálogos MBA3 (GET /comercial/mba3/*), usados por el
// formulario de Convenios antes de guardar. Mba3Catalogo mockeado por completo.
jest.mock("../services/mba3Catalogo.service");

const Mba3Catalogo = require("../services/mba3Catalogo.service");
const { ErrorMba3NoConfigurado } = require("../services/mba3Lectura.service");
const Controlador = require("../controllers/mba3.controller");

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ControladorMba3.ficha", () => {
  it("400 sin codigo", async () => {
    const res = crearRes();
    await Controlador.ficha({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("200 con los datos resueltos", async () => {
    Mba3Catalogo.resolverCliente.mockResolvedValue({ datos: { codigo: "C1", nombre: "Cliente Uno" } });
    const res = crearRes();
    await Controlador.ficha({ query: { codigo: "C1" } }, res);
    expect(res.json).toHaveBeenCalledWith({ exito: true, datos: { codigo: "C1", nombre: "Cliente Uno" } });
  });

  it("502 si MBA3 falla por una razón distinta a no-configurado", async () => {
    Mba3Catalogo.resolverCliente.mockRejectedValue(new Error("timeout"));
    const res = crearRes();
    await Controlador.ficha({ query: { codigo: "C1" } }, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("503 si MBA3 lectura no está configurado en este entorno (sin exponer un 500 genérico)", async () => {
    Mba3Catalogo.resolverCliente.mockRejectedValue(new ErrorMba3NoConfigurado());
    const res = crearRes();
    await Controlador.ficha({ query: { codigo: "C1" } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("propaga la advertencia si la caché devolvió un dato vencido", async () => {
    Mba3Catalogo.resolverCliente.mockResolvedValue({
      datos: { codigo: "C1" },
      advertencia: "MBA3 no respondió; usando el último dato conocido",
    });
    const res = crearRes();
    await Controlador.ficha({ query: { codigo: "C1" } }, res);
    expect(res.json).toHaveBeenCalledWith({
      exito: true,
      datos: { codigo: "C1" },
      advertencias: ["MBA3 no respondió; usando el último dato conocido"],
    });
  });
});

describe("ControladorMba3.clientesPorVendedor", () => {
  it("400 sin vendedor", async () => {
    const res = crearRes();
    await Controlador.clientesPorVendedor({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("200 con la lista", async () => {
    Mba3Catalogo.buscarClientesPorVendedor.mockResolvedValue({ datos: [{ codigo: "C1" }] });
    const res = crearRes();
    await Controlador.clientesPorVendedor({ query: { vendedor: "V1" } }, res);
    expect(Mba3Catalogo.buscarClientesPorVendedor).toHaveBeenCalledWith("V1");
    expect(res.json).toHaveBeenCalledWith({ exito: true, datos: [{ codigo: "C1" }] });
  });
});

describe("ControladorMba3.vendedores", () => {
  it("filtra por codigo si se manda, sin volver a llamar a MBA3 (el filtro es en memoria)", async () => {
    Mba3Catalogo.buscarVendedores.mockResolvedValue({ datos: [{ codigo: "V1" }, { codigo: "V2" }] });
    const res = crearRes();
    await Controlador.vendedores({ query: { codigo: "v1" } }, res);
    expect(res.json).toHaveBeenCalledWith({ exito: true, datos: [{ codigo: "V1" }] });
  });
});

describe("ControladorMba3.productos", () => {
  it("400 sin codigo ni nombre (MBA3 no tiene 'listar todos los productos')", async () => {
    const res = crearRes();
    await Controlador.productos({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("con codigo: busca por código exacto", async () => {
    Mba3Catalogo.buscarProductos.mockResolvedValue({ datos: { codigo: "P1", descripcion: "Tornillo" } });
    const res = crearRes();
    await Controlador.productos({ query: { codigo: "P1" } }, res);
    expect(Mba3Catalogo.buscarProductos).toHaveBeenCalledWith("P1");
    expect(Mba3Catalogo.buscarProductosPorNombre).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ exito: true, datos: { codigo: "P1", descripcion: "Tornillo" } });
  });

  it("con nombre (y sin codigo): busca por nombre", async () => {
    Mba3Catalogo.buscarProductosPorNombre.mockResolvedValue({ datos: [{ codigo: "P1" }, { codigo: "P2" }] });
    const res = crearRes();
    await Controlador.productos({ query: { nombre: "tornillo" } }, res);
    expect(Mba3Catalogo.buscarProductosPorNombre).toHaveBeenCalledWith("tornillo");
    expect(Mba3Catalogo.buscarProductos).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ exito: true, datos: [{ codigo: "P1" }, { codigo: "P2" }] });
  });

  it("con codigo y nombre a la vez: codigo gana", async () => {
    Mba3Catalogo.buscarProductos.mockResolvedValue({ datos: { codigo: "P1" } });
    const res = crearRes();
    await Controlador.productos({ query: { codigo: "P1", nombre: "tornillo" } }, res);
    expect(Mba3Catalogo.buscarProductos).toHaveBeenCalledWith("P1");
    expect(Mba3Catalogo.buscarProductosPorNombre).not.toHaveBeenCalled();
  });
});

describe("ControladorMba3.existenciasVentas", () => {
  it("400 sin codigo", async () => {
    const res = crearRes();
    await Controlador.existenciasVentas({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("200 con los datos", async () => {
    Mba3Catalogo.resolverExistenciasVentas.mockResolvedValue({ datos: [{ existencia: 10 }] });
    const res = crearRes();
    await Controlador.existenciasVentas({ query: { codigo: "P1" } }, res);
    expect(res.json).toHaveBeenCalledWith({ exito: true, datos: [{ existencia: 10 }] });
  });
});
