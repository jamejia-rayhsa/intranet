// Pruebas del autocompletar contra MBA3 al crear/editar un convenio (Fase 2): si viene un
// *_codigo, se intenta resolver el nombre real; si MBA3 falla, el convenio se guarda igual (con
// el nombre capturado a mano o el código) y se agrega una advertencia — nunca bloquea ni 500/502.
jest.mock("../models/convenio.model");
jest.mock("../models/autorizador.model");
jest.mock("../../../portal/backend/models/usuario.model");
jest.mock("../services/mba3Catalogo.service");
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(null),
}));

const Convenio = require("../models/convenio.model");
const Mba3Catalogo = require("../services/mba3Catalogo.service");
const Controlador = require("../controllers/convenio.controller");

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

const PRODUCTO_VALIDO = { producto_descripcion: "Producto A", cantidad_periodica: 10, periodo: "mensual" };
const CABECERA_BASE = { vendedor_nombre: "Vendedor", fecha_inicio: "2026-10-01" };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("resolverSnapshots al crear", () => {
  it("resuelve cliente_nombre desde MBA3 cuando se manda cliente_codigo", async () => {
    Mba3Catalogo.resolverCliente.mockResolvedValue({ datos: { nombre: "Cliente Real" } });
    Mba3Catalogo.extraerNombreCliente.mockReturnValue("Cliente Real");
    const creado = { id: 1, estatus: "pendiente_autorizacion", productos: [PRODUCTO_VALIDO] };
    Convenio.crear.mockResolvedValue(creado);

    const req = {
      body: { ...CABECERA_BASE, cliente_codigo: "C1", productos: [PRODUCTO_VALIDO] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);

    expect(Convenio.crear).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_codigo: "C1", cliente_nombre: "Cliente Real" }),
      [PRODUCTO_VALIDO],
      1,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    // Sin advertencias cuando MBA3 resuelve bien.
    expect(res.json.mock.calls[0][0].advertencias).toBeUndefined();
  });

  it("si MBA3 falla, guarda el convenio con el nombre capturado a mano y agrega advertencia (no 500)", async () => {
    Mba3Catalogo.resolverCliente.mockRejectedValue(new Error("MBA3_LECTURA_USUARIO no configurado"));
    const creado = { id: 2, estatus: "pendiente_autorizacion", productos: [PRODUCTO_VALIDO] };
    Convenio.crear.mockResolvedValue(creado);

    const req = {
      body: { ...CABECERA_BASE, cliente_codigo: "C1", cliente_nombre: "Nombre a mano", productos: [PRODUCTO_VALIDO] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);

    expect(Convenio.crear).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_nombre: "Nombre a mano" }), // no lo pisa con nada
      [PRODUCTO_VALIDO],
      1,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const cuerpo = res.json.mock.calls[0][0];
    expect(cuerpo.advertencias).toEqual([
      expect.stringContaining("No se pudo verificar el cliente"),
    ]);
  });

  it("si MBA3 falla y el usuario no capturó cliente_nombre, usa el código solo (no bloquea con 400)", async () => {
    Mba3Catalogo.resolverCliente.mockRejectedValue(new Error("sin red"));
    const creado = { id: 3, estatus: "pendiente_autorizacion", productos: [PRODUCTO_VALIDO] };
    Convenio.crear.mockResolvedValue(creado);

    const req = {
      body: { ...CABECERA_BASE, cliente_codigo: "C9", productos: [PRODUCTO_VALIDO] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);

    expect(Convenio.crear).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_nombre: "C9" }),
      [PRODUCTO_VALIDO],
      1,
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("sin cliente_codigo, nunca llama a MBA3 (captura manual pura sigue funcionando igual que la Fase 1)", async () => {
    const creado = { id: 4, estatus: "pendiente_autorizacion", productos: [PRODUCTO_VALIDO] };
    Convenio.crear.mockResolvedValue(creado);

    const req = {
      body: { ...CABECERA_BASE, cliente_nombre: "Cliente a mano", productos: [PRODUCTO_VALIDO] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);

    expect(Mba3Catalogo.resolverCliente).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].advertencias).toBeUndefined();
  });

  // R-F2-3 (revisión post Fase 2): cliente, vendedor y cada línea de producto se resuelven en
  // paralelo. Simula MBA3 "colgado" (cada resolución tarda LATENCIA_MS) con 3 líneas de producto:
  // en serie tardaría ~5×LATENCIA_MS (cliente+vendedor+3 productos); en paralelo debe acercarse a
  // 1×LATENCIA_MS.
  it("resuelve cliente+vendedor+3 líneas de producto EN PARALELO, no en serie (medición de tiempo)", async () => {
    const LATENCIA_MS = 100;
    const demora = (valor) => new Promise((resolve) => setTimeout(() => resolve(valor), LATENCIA_MS));

    Mba3Catalogo.resolverCliente.mockImplementation(() => demora({ datos: { nombre: "Cliente Real" } }));
    Mba3Catalogo.resolverVendedor.mockImplementation(() => demora({ datos: { nombre: "Vendedor Real" } }));
    Mba3Catalogo.resolverProducto.mockImplementation(() => demora({ datos: { descripcion: "Producto Real" } }));
    Mba3Catalogo.extraerNombreCliente.mockReturnValue("Cliente Real");
    Mba3Catalogo.extraerNombreVendedor.mockReturnValue("Vendedor Real");
    Mba3Catalogo.extraerDescripcionProducto.mockReturnValue("Producto Real");

    const creado = { id: 6, estatus: "pendiente_autorizacion", productos: [] };
    Convenio.crear.mockResolvedValue(creado);

    const productos = [
      { producto_codigo: "P1", cantidad_periodica: 10, periodo: "mensual" },
      { producto_codigo: "P2", cantidad_periodica: 10, periodo: "mensual" },
      { producto_codigo: "P3", cantidad_periodica: 10, periodo: "mensual" },
    ];
    const req = {
      body: { ...CABECERA_BASE, cliente_codigo: "C1", productos },
      user: { usuario_id: 1 },
    };
    const res = crearRes();

    const inicio = Date.now();
    await Controlador.crear(req, res);
    const duracion = Date.now() - inicio;

    expect(res.status).toHaveBeenCalledWith(201);
    // En serie habrían sido ~5 × LATENCIA_MS (cliente+vendedor+3 productos ≈ 500 ms); en paralelo
    // debe acercarse a 1 × LATENCIA_MS. Margen generoso (3×) para no ser intermitente por CI lento,
    // pero muy por debajo de lo que daría la suma serial.
    expect(duracion).toBeLessThan(LATENCIA_MS * 3);
  });

  it("resuelve producto_descripcion por línea cuando se manda producto_codigo", async () => {
    Mba3Catalogo.resolverProducto.mockResolvedValue({ datos: { descripcion: "Tornillo 1/2" } });
    Mba3Catalogo.extraerDescripcionProducto.mockReturnValue("Tornillo 1/2");
    const creado = { id: 5, estatus: "pendiente_autorizacion", productos: [] };
    Convenio.crear.mockResolvedValue(creado);

    const producto = { producto_codigo: "P1", cantidad_periodica: 10, periodo: "mensual" };
    const req = {
      body: { ...CABECERA_BASE, cliente_nombre: "Cliente", productos: [producto] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);

    expect(Convenio.crear).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ producto_codigo: "P1", producto_descripcion: "Tornillo 1/2" })],
      1,
    );
  });
});
