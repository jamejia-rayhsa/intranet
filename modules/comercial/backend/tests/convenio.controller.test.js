// Pruebas del controlador de Convenios: reglas de autorización (nunca lo propio, solo la lista de
// autorizadores activos o super_admin), guardas de estado (editar/autorizar/rechazar/cancelar) y
// validación de líneas de producto. Modelos, permisos y auditoría mockeados (config/database nunca
// se toca aquí: ver la prueba de integración real documentada en code-notes.md).
jest.mock("../models/convenio.model");
jest.mock("../models/autorizador.model");
jest.mock("../../../portal/backend/models/usuario.model");
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(null),
}));

const Convenio = require("../models/convenio.model");
const Autorizador = require("../models/autorizador.model");
const Usuario = require("../../../portal/backend/models/usuario.model");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");
const Controlador = require("../controllers/convenio.controller");

function crearRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

const PRODUCTO_VALIDO = { producto_descripcion: "Producto A", cantidad_periodica: 10, periodo: "mensual" };
const CABECERA_VALIDA = { cliente_nombre: "Cliente", vendedor_nombre: "Vendedor", fecha_inicio: "2026-10-01" };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ControladorConvenio.crear", () => {
  it("rechaza sin cliente_nombre (400) sin llamar al modelo", async () => {
    const req = { body: { ...CABECERA_VALIDA, cliente_nombre: "", productos: [PRODUCTO_VALIDO] }, user: { usuario_id: 1 } };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.crear).not.toHaveBeenCalled();
  });

  it("rechaza sin productos (400)", async () => {
    const req = { body: { ...CABECERA_VALIDA, productos: [] }, user: { usuario_id: 1 } };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ exito: false, mensaje: "Se requiere al menos una línea de producto" });
  });

  it("rechaza periodo fuera de la lista corta (400)", async () => {
    const req = {
      body: { ...CABECERA_VALIDA, productos: [{ ...PRODUCTO_VALIDO, periodo: "anual" }] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].mensaje).toMatch(/periodo debe ser uno de/);
  });

  it("rechaza cantidad_periodica <= 0 (400)", async () => {
    const req = {
      body: { ...CABECERA_VALIDA, productos: [{ ...PRODUCTO_VALIDO, cantidad_periodica: 0 }] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rechaza vigente_hasta anterior a fecha_inicio (400)", async () => {
    const req = {
      body: { ...CABECERA_VALIDA, vigente_hasta: "2026-09-01", productos: [PRODUCTO_VALIDO] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("R-3: rechaza fecha_inicio con formato inválido (400, no 500 de Postgres)", async () => {
    const req = {
      body: { ...CABECERA_VALIDA, fecha_inicio: "31/13/2026", productos: [PRODUCTO_VALIDO] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.crear).not.toHaveBeenCalled();
  });

  it("R-3: rechaza fecha_inicio que no es una fecha real (2026-02-30)", async () => {
    const req = {
      body: { ...CABECERA_VALIDA, fecha_inicio: "2026-02-30", productos: [PRODUCTO_VALIDO] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.crear).not.toHaveBeenCalled();
  });

  it("R-3: rechaza precio_venta no numérico (400, no 500)", async () => {
    const req = {
      body: { ...CABECERA_VALIDA, productos: [{ ...PRODUCTO_VALIDO, precio_venta: "abc" }] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.crear).not.toHaveBeenCalled();
  });

  it("R-3: rechaza factor negativo (400)", async () => {
    const req = {
      body: { ...CABECERA_VALIDA, productos: [{ ...PRODUCTO_VALIDO, factor: -1 }] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.crear).not.toHaveBeenCalled();
  });

  it("R-7: rechaza una línea null sin lanzar TypeError (400, no 500)", async () => {
    const req = {
      body: { ...CABECERA_VALIDA, productos: [null] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.crear).not.toHaveBeenCalled();
  });

  it("acepta montos y empaque en null/vacío (opcionales)", async () => {
    const creado = { id: 6, estatus: "pendiente_autorizacion", productos: [PRODUCTO_VALIDO] };
    Convenio.crear.mockResolvedValue(creado);
    const req = {
      body: { ...CABECERA_VALIDA, productos: [{ ...PRODUCTO_VALIDO, empaque: "", precio_compra: null }] },
      user: { usuario_id: 1 },
    };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("crea el convenio, siempre en pendiente_autorizacion, y audita", async () => {
    const creado = { id: 5, ...CABECERA_VALIDA, estatus: "pendiente_autorizacion", productos: [PRODUCTO_VALIDO] };
    Convenio.crear.mockResolvedValue(creado);
    const req = { body: { ...CABECERA_VALIDA, productos: [PRODUCTO_VALIDO] }, user: { usuario_id: 8 } };
    const res = crearRes();
    await Controlador.crear(req, res);
    expect(Convenio.crear).toHaveBeenCalledWith(CABECERA_VALIDA, [PRODUCTO_VALIDO], 8);
    expect(registrarAccion).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ exito: true, datos: creado });
  });
});

describe("ControladorConvenio.listar", () => {
  it("R-8: estatus fuera de la lista válida -> 400 sin consultar el modelo", async () => {
    const req = { query: { estatus: "algo_invalido" }, user: { usuario_id: 1 } };
    const res = crearRes();
    await Controlador.listar(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.listar).not.toHaveBeenCalled();
  });

  it("R-8: estatus repetido en la query (arreglo) -> 400, no 500", async () => {
    const req = { query: { estatus: ["pendiente_autorizacion", "autorizado"] }, user: { usuario_id: 1 } };
    const res = crearRes();
    await Controlador.listar(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.listar).not.toHaveBeenCalled();
  });

  it("estatus válido sí llega al modelo", async () => {
    Convenio.listar.mockResolvedValue([]);
    const req = { query: { estatus: "autorizado" }, user: { usuario_id: 1 } };
    const res = crearRes();
    await Controlador.listar(req, res);
    expect(Convenio.listar).toHaveBeenCalledWith(expect.objectContaining({ estatus: "autorizado" }));
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("ControladorConvenio.dashboard — Fase 5: KPIs (umbrales humanos: 30 días por vencer, 60 sin movimiento)", () => {
  it("cuenta activos/por_vencer/vencidos/sin_movimientos_recientes según cada caso, sin tocar lo no autorizado", async () => {
    const filas = [
      // No autorizado: no cuenta en ningún KPI (solo en total).
      { id: 1, estatus: "pendiente_autorizacion", vencido: false, dias_para_vencer: 5, dias_sin_movimiento: null },
      // Autorizado + vencido: cuenta vencidos, nunca activos/por_vencer/sin_movimiento (aunque calificaría).
      { id: 2, estatus: "autorizado", vencido: true, dias_para_vencer: -3, dias_sin_movimiento: 100 },
      // Autorizado, no vencido, dentro de la ventana de 30 días -> activos + por_vencer.
      { id: 3, estatus: "autorizado", vencido: false, dias_para_vencer: 10, dias_sin_movimiento: 5 },
      // Autorizado, no vencido, fuera de la ventana -> activos, no por_vencer.
      { id: 4, estatus: "autorizado", vencido: false, dias_para_vencer: 40, dias_sin_movimiento: 5 },
      // Autorizado, abierta (sin vigente_hasta) -> activos, no por_vencer (dias_para_vencer null).
      { id: 5, estatus: "autorizado", vencido: false, dias_para_vencer: null, dias_sin_movimiento: 5 },
      // Autorizado, nunca tuvo movimiento (dias_sin_movimiento null) -> cuenta sin_movimientos_recientes.
      { id: 6, estatus: "autorizado", vencido: false, dias_para_vencer: null, dias_sin_movimiento: null },
      // Autorizado, último movimiento hace exactamente 60 días -> sí cuenta (>=).
      { id: 7, estatus: "autorizado", vencido: false, dias_para_vencer: null, dias_sin_movimiento: 60 },
      // Autorizado, movimiento reciente -> no cuenta.
      { id: 8, estatus: "autorizado", vencido: false, dias_para_vencer: null, dias_sin_movimiento: 10 },
    ];
    Convenio.listarConResumenConsumo.mockResolvedValue(filas);
    const req = {};
    const res = crearRes();
    await Controlador.dashboard(req, res);

    expect(res.json).toHaveBeenCalledWith({
      exito: true,
      datos: {
        kpis: { total: 8, activos: 6, por_vencer: 1, vencidos: 1, sin_movimientos_recientes: 2 },
        convenios: filas,
      },
    });
  });

  it("sin convenios, KPIs en cero (no 500)", async () => {
    Convenio.listarConResumenConsumo.mockResolvedValue([]);
    const req = {};
    const res = crearRes();
    await Controlador.dashboard(req, res);
    expect(res.json).toHaveBeenCalledWith({
      exito: true,
      datos: { kpis: { total: 0, activos: 0, por_vencer: 0, vencidos: 0, sin_movimientos_recientes: 0 }, convenios: [] },
    });
  });

  it("error del modelo -> 500, no se cae el proceso", async () => {
    Convenio.listarConResumenConsumo.mockRejectedValue(new Error("boom"));
    const req = {};
    const res = crearRes();
    await Controlador.dashboard(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("ControladorConvenio.obtener", () => {
  it("R-2: id no numérico -> 400, no 500 de Postgres", async () => {
    const req = { params: { id: "abc" }, user: { usuario_id: 1 } };
    const res = crearRes();
    await Controlador.obtener(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.obtener).not.toHaveBeenCalled();
  });

  it("id numérico sí llega al modelo", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1 });
    const req = { params: { id: "1" }, user: { usuario_id: 1 } };
    const res = crearRes();
    await Controlador.obtener(req, res);
    expect(Convenio.obtener).toHaveBeenCalledWith("1");
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("ControladorConvenio.actualizar", () => {
  const body = { ...CABECERA_VALIDA, productos: [PRODUCTO_VALIDO] };

  it("convenio inexistente -> 404", async () => {
    Convenio.obtener.mockResolvedValue(null);
    Convenio.actualizar.mockResolvedValue({ previo: null, convenio: null });
    const res = crearRes();
    await Controlador.actualizar({ params: { id: "1" }, body, user: { usuario_id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("ya no está pendiente_autorizacion -> 409, sin tocar las líneas", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, creado_por_id: 1, estatus: "autorizado" });
    Convenio.actualizar.mockResolvedValue({ previo: { estatus: "autorizado" }, convenio: undefined });
    const res = crearRes();
    await Controlador.actualizar({ params: { id: "1" }, body, user: { usuario_id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(registrarAccion).not.toHaveBeenCalled();
  });

  it("pendiente_autorizacion -> 200 y audita", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, creado_por_id: 1, estatus: "pendiente_autorizacion" });
    const previo = { estatus: "pendiente_autorizacion", cliente_nombre: "Antes", vendedor_nombre: "V" };
    const convenio = { id: 1, estatus: "pendiente_autorizacion", cliente_nombre: "Cliente", vendedor_nombre: "Vendedor" };
    Convenio.actualizar.mockResolvedValue({ previo, convenio });
    const res = crearRes();
    await Controlador.actualizar({ params: { id: "1" }, body, user: { usuario_id: 1 } }, res);
    expect(res.status).not.toHaveBeenCalled(); // 200 implícito, igual que solicitudCredito.controller.js
    expect(res.json).toHaveBeenCalledWith({ exito: true, datos: convenio });
    expect(registrarAccion).toHaveBeenCalled();
  });

  it("quien NO es el creador ni super_admin no puede editar, aunque tenga permiso de edición -> 403", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, creado_por_id: 8, estatus: "pendiente_autorizacion" });
    const res = crearRes();
    await Controlador.actualizar({ params: { id: "1" }, body, user: { usuario_id: 9, rol_nombre: "comercial_admin" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(Convenio.actualizar).not.toHaveBeenCalled();
  });

  it("super_admin puede editar un convenio ajeno", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, creado_por_id: 8, estatus: "pendiente_autorizacion" });
    const previo = { estatus: "pendiente_autorizacion", cliente_nombre: "Antes", vendedor_nombre: "V" };
    const convenio = { id: 1, estatus: "pendiente_autorizacion", cliente_nombre: "Cliente", vendedor_nombre: "Vendedor" };
    Convenio.actualizar.mockResolvedValue({ previo, convenio });
    const res = crearRes();
    await Controlador.actualizar({ params: { id: "1" }, body, user: { usuario_id: 99, rol_nombre: "super_admin" } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(Convenio.actualizar).toHaveBeenCalled();
  });

  it("id no numérico -> 400 sin tocar el modelo", async () => {
    const res = crearRes();
    await Controlador.actualizar({ params: { id: "abc" }, body, user: { usuario_id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.obtener).not.toHaveBeenCalled();
    expect(Convenio.actualizar).not.toHaveBeenCalled();
  });
});

describe("ControladorConvenio.autorizar — nunca lo propio, solo autorizadores activos o super_admin", () => {
  const CONVENIO_BASE = { id: 1, estatus: "pendiente_autorizacion", creado_por_id: 8 };

  it("convenio inexistente -> 404", async () => {
    Convenio.obtener.mockResolvedValue(null);
    const res = crearRes();
    await Controlador.autorizar({ params: { id: "1" }, user: { usuario_id: 9 } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("R-5: sin autoridad y ya no pendiente -> 403 (la autoridad se revisa antes que el estado)", async () => {
    Convenio.obtener.mockResolvedValue({ ...CONVENIO_BASE, estatus: "autorizado" });
    Autorizador.esActivo.mockResolvedValue(false);
    const res = crearRes();
    await Controlador.autorizar({ params: { id: "1" }, user: { usuario_id: 9, rol_nombre: "comercial_admin" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(Convenio.autorizar).not.toHaveBeenCalled();
  });

  it("con autoridad (super_admin) pero ya no pendiente -> 409", async () => {
    Convenio.obtener.mockResolvedValue({ ...CONVENIO_BASE, estatus: "autorizado" });
    const res = crearRes();
    await Controlador.autorizar({ params: { id: "1" }, user: { usuario_id: 9, rol_nombre: "super_admin" } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(Convenio.autorizar).not.toHaveBeenCalled();
  });

  it("id no numérico -> 400 sin tocar el modelo", async () => {
    const res = crearRes();
    await Controlador.autorizar({ params: { id: "abc" }, user: { usuario_id: 9 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.obtener).not.toHaveBeenCalled();
  });

  it("quien creó el convenio no puede autorizarlo, aunque esté en la lista -> 403", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_BASE);
    const res = crearRes();
    await Controlador.autorizar({ params: { id: "1" }, user: { usuario_id: 8, rol_nombre: "comercial_admin" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ exito: false, mensaje: "No puedes autorizar ni rechazar tu propio convenio" });
    expect(Convenio.autorizar).not.toHaveBeenCalled();
  });

  it("usuario sin estar en la lista ni ser super_admin -> 403", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_BASE);
    Autorizador.esActivo.mockResolvedValue(false);
    const res = crearRes();
    await Controlador.autorizar({ params: { id: "1" }, user: { usuario_id: 99, rol_nombre: "comercial_admin" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ exito: false, mensaje: "No tienes autoridad para autorizar o rechazar convenios" });
  });

  it("super_admin autoriza sin consultar la lista de autorizadores", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_BASE);
    Usuario.buscarPorId.mockResolvedValue({ nombre: "Super", apellido: "Admin" });
    Convenio.autorizar.mockResolvedValue({ ...CONVENIO_BASE, estatus: "autorizado" });
    const res = crearRes();
    await Controlador.autorizar({ params: { id: "1" }, user: { usuario_id: 99, rol_nombre: "super_admin" } }, res);
    expect(Autorizador.esActivo).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(Convenio.autorizar).toHaveBeenCalledWith("1", 99, "Super Admin");
    expect(registrarAccion).toHaveBeenCalled();
  });

  it("autorizador activo autoriza y queda el snapshot de su nombre", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_BASE);
    Autorizador.esActivo.mockResolvedValue(true);
    Usuario.buscarPorId.mockResolvedValue({ nombre: "Autoriza", apellido: "Dor" });
    Convenio.autorizar.mockResolvedValue({ ...CONVENIO_BASE, estatus: "autorizado", autoriza_nombre: "Autoriza Dor" });
    const res = crearRes();
    await Controlador.autorizar({ params: { id: "1" }, user: { usuario_id: 9, rol_nombre: "comercial_admin" } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(Convenio.autorizar).toHaveBeenCalledWith("1", 9, "Autoriza Dor");
  });

  it("carrera: el modelo ya no actualiza (otro ganó la autorización) -> 409", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_BASE);
    Autorizador.esActivo.mockResolvedValue(true);
    Usuario.buscarPorId.mockResolvedValue({ nombre: "Autoriza", apellido: "Dor" });
    Convenio.autorizar.mockResolvedValue(undefined);
    const res = crearRes();
    await Controlador.autorizar({ params: { id: "1" }, user: { usuario_id: 9, rol_nombre: "comercial_admin" } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe("ControladorConvenio.rechazar", () => {
  const CONVENIO_BASE = { id: 1, estatus: "pendiente_autorizacion", creado_por_id: 8 };

  it("id no numérico -> 400 sin tocar el modelo", async () => {
    const res = crearRes();
    await Controlador.rechazar({ params: { id: "abc" }, body: { motivo_rechazo: "x" }, user: { usuario_id: 9 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.obtener).not.toHaveBeenCalled();
  });

  it("sin motivo_rechazo -> 400 sin tocar el convenio", async () => {
    const res = crearRes();
    await Controlador.rechazar({ params: { id: "1" }, body: {}, user: { usuario_id: 9 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.obtener).not.toHaveBeenCalled();
  });

  it("motivo en blanco -> 400", async () => {
    const res = crearRes();
    await Controlador.rechazar({ params: { id: "1" }, body: { motivo_rechazo: "   " }, user: { usuario_id: 9 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("quien creó el convenio no puede rechazarlo -> 403", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_BASE);
    const res = crearRes();
    await Controlador.rechazar(
      { params: { id: "1" }, body: { motivo_rechazo: "No cumple" }, user: { usuario_id: 8, rol_nombre: "comercial_admin" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(Convenio.rechazar).not.toHaveBeenCalled();
  });

  it("autorizador activo rechaza con el motivo guardado", async () => {
    Convenio.obtener.mockResolvedValue(CONVENIO_BASE);
    Autorizador.esActivo.mockResolvedValue(true);
    Usuario.buscarPorId.mockResolvedValue({ nombre: "Autoriza", apellido: "Dor" });
    Convenio.rechazar.mockResolvedValue({ ...CONVENIO_BASE, estatus: "rechazado", motivo_rechazo: "No cumple margen" });
    const res = crearRes();
    await Controlador.rechazar(
      { params: { id: "1" }, body: { motivo_rechazo: "No cumple margen" }, user: { usuario_id: 9, rol_nombre: "comercial_admin" } },
      res,
    );
    expect(Convenio.rechazar).toHaveBeenCalledWith("1", 9, "Autoriza Dor", "No cumple margen");
    expect(res.status).not.toHaveBeenCalled();
    expect(registrarAccion).toHaveBeenCalled();
  });
});

describe("ControladorConvenio.cancelar", () => {
  it("convenio inexistente -> 404", async () => {
    Convenio.obtener.mockResolvedValue(null);
    const res = crearRes();
    await Controlador.cancelar({ params: { id: "1" }, user: { usuario_id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("ya cancelado -> 409 sin llamar al modelo de escritura", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, estatus: "cancelado" });
    const res = crearRes();
    await Controlador.cancelar({ params: { id: "1" }, user: { usuario_id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(Convenio.cancelar).not.toHaveBeenCalled();
  });

  it("cancela un convenio pendiente aunque el usuario no tenga autoridad (sin cambios)", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, creado_por_id: 1, estatus: "pendiente_autorizacion" });
    Convenio.cancelar.mockResolvedValue({ id: 1, estatus: "cancelado" });
    const res = crearRes();
    await Controlador.cancelar({ params: { id: "1" }, user: { usuario_id: 1 } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(Convenio.cancelar).toHaveBeenCalledWith("1", false); // creado_por_id === usuario_id -> sin autoridad
    expect(registrarAccion).toHaveBeenCalled();
  });

  it("cancela un convenio rechazado sin exigir autoridad (sin cambios)", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, creado_por_id: 8, estatus: "rechazado" });
    Convenio.cancelar.mockResolvedValue({ id: 1, estatus: "cancelado" });
    const res = crearRes();
    await Controlador.cancelar({ params: { id: "1" }, user: { usuario_id: 1 } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(registrarAccion).toHaveBeenCalled();
  });

  it("decisión del humano [2026-10-23]: el propio creador NO puede cancelar un convenio YA autorizado -> 403", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, creado_por_id: 1, estatus: "autorizado" });
    const res = crearRes();
    await Controlador.cancelar({ params: { id: "1" }, user: { usuario_id: 1, rol_nombre: "comercial_admin" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(Convenio.cancelar).not.toHaveBeenCalled();
  });

  it("decisión del humano [2026-10-23]: un usuario sin autoridad (ni creador ni en la lista) NO puede cancelar un convenio autorizado -> 403", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, creado_por_id: 8, estatus: "autorizado" });
    Autorizador.esActivo.mockResolvedValue(false);
    const res = crearRes();
    await Controlador.cancelar({ params: { id: "1" }, user: { usuario_id: 1, rol_nombre: "comercial_admin" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(Convenio.cancelar).not.toHaveBeenCalled();
  });

  it("un autorizador activo (que no sea el creador) sí puede cancelar un convenio autorizado", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, creado_por_id: 8, estatus: "autorizado" });
    Autorizador.esActivo.mockResolvedValue(true);
    Convenio.cancelar.mockResolvedValue({ id: 1, estatus: "cancelado" });
    const res = crearRes();
    await Controlador.cancelar({ params: { id: "1" }, user: { usuario_id: 9, rol_nombre: "comercial_admin" } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(Convenio.cancelar).toHaveBeenCalledWith("1", true);
    expect(registrarAccion).toHaveBeenCalled();
  });

  it("super_admin puede cancelar un convenio autorizado sin estar en la lista", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, creado_por_id: 8, estatus: "autorizado" });
    Convenio.cancelar.mockResolvedValue({ id: 1, estatus: "cancelado" });
    const res = crearRes();
    await Controlador.cancelar({ params: { id: "1" }, user: { usuario_id: 99, rol_nombre: "super_admin" } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(Autorizador.esActivo).not.toHaveBeenCalled();
    expect(Convenio.cancelar).toHaveBeenCalledWith("1", true);
  });

  it("carrera: el modelo ya no actualiza -> 409", async () => {
    Convenio.obtener.mockResolvedValue({ id: 1, creado_por_id: 1, estatus: "autorizado" });
    Convenio.cancelar.mockResolvedValue(undefined);
    const res = crearRes();
    await Controlador.cancelar({ params: { id: "1" }, user: { usuario_id: 99, rol_nombre: "super_admin" } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("id no numérico -> 400 sin tocar el modelo", async () => {
    const res = crearRes();
    await Controlador.cancelar({ params: { id: "abc" }, user: { usuario_id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Convenio.obtener).not.toHaveBeenCalled();
  });
});
