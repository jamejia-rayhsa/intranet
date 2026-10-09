jest.mock("../backend/models/empleado.model", () => ({ crear: jest.fn() }));
jest.mock("../backend/models/ubicacion.model", () => ({ siguienteFolio: jest.fn() }));
jest.mock("../../portal/backend/models/usuario.model", () => ({
  buscarPorCorreo: jest.fn(),
  crear: jest.fn(),
  actualizar: jest.fn(),
  eliminar: jest.fn(),
}));
jest.mock("../../portal/backend/services/supabaseAdmin.service", () => ({
  crearUsuario: jest.fn(),
  eliminarUsuario: jest.fn(),
}));
jest.mock("../backend/config/database", () => ({
  grupo: { connect: jest.fn(), query: jest.fn() },
}));
jest.mock("../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(),
}));

const Empleado = require("../backend/models/empleado.model");
const Usuario = require("../../portal/backend/models/usuario.model");
const SupabaseAdmin = require("../../portal/backend/services/supabaseAdmin.service");
const controlador = require("../backend/controllers/empleado.controller");

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const base = { nombre: "Juan", apellido_paterno: "Pérez" };
const conUsuario = {
  ...base,
  crear_usuario: true,
  correo: "Juan@Rayhsa.com",
  contraseña: "Secreta123",
};

describe("empleado.controller.crear", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    require("../../auditoria/backend/services/auditoria.service").registrarAccion.mockResolvedValue();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe("validaciones", () => {
    it("rechaza un empleado sin nombre", async () => {
      const res = mockRes();
      await controlador.crear({ body: { apellido_paterno: "Pérez" } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(Empleado.crear).not.toHaveBeenCalled();
    });

    it("rechaza un empleado sin apellido paterno", async () => {
      const res = mockRes();
      await controlador.crear({ body: { nombre: "Juan" } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(Empleado.crear).not.toHaveBeenCalled();
    });
  });

  describe("alta con usuario", () => {
    it("crea en GoTrue con la contraseña, guarda auth_uid y no escribe hash", async () => {
      Usuario.buscarPorCorreo.mockResolvedValue(undefined);
      SupabaseAdmin.crearUsuario.mockResolvedValue({ id: "uid-1" });
      Usuario.crear.mockResolvedValue({ id: 5 });
      Empleado.crear.mockResolvedValue({ id: 9 });
      const res = mockRes();
      await controlador.crear({ body: conUsuario }, res);
      expect(SupabaseAdmin.crearUsuario).toHaveBeenCalledWith(
        expect.objectContaining({ correo: "juan@rayhsa.com", password: "Secreta123" }),
      );
      const datos = Usuario.crear.mock.calls[0][0];
      expect(datos.auth_uid).toBe("uid-1");
      expect(datos).not.toHaveProperty("hash_password");
      expect(Usuario.actualizar).toHaveBeenCalledWith(5, { requiere_cambio_password: true });
      expect(Empleado.crear.mock.calls[0][0].usuario_id).toBe(5);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0]).not.toHaveProperty("contraseña_temporal");
    });

    it("sin contraseña genera una temporal de 12+ caracteres y la devuelve", async () => {
      Usuario.buscarPorCorreo.mockResolvedValue(undefined);
      SupabaseAdmin.crearUsuario.mockResolvedValue({ id: "uid-1" });
      Usuario.crear.mockResolvedValue({ id: 5 });
      Empleado.crear.mockResolvedValue({ id: 9 });
      const res = mockRes();
      await controlador.crear({ body: { ...conUsuario, contraseña: undefined } }, res);
      const temporal = res.json.mock.calls[0][0].contraseña_temporal;
      expect(temporal).toMatch(/^[A-Za-z0-9]{12,}$/);
      expect(SupabaseAdmin.crearUsuario.mock.calls[0][0].password).toBe(temporal);
    });

    it("si GoTrue falla no inserta usuario ni empleado", async () => {
      Usuario.buscarPorCorreo.mockResolvedValue(undefined);
      SupabaseAdmin.crearUsuario.mockRejectedValue(new Error("gotrue caido"));
      const res = mockRes();
      await controlador.crear({ body: conUsuario }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(Usuario.crear).not.toHaveBeenCalled();
      expect(Empleado.crear).not.toHaveBeenCalled();
      expect(SupabaseAdmin.eliminarUsuario).not.toHaveBeenCalled();
    });

    it("si falla el INSERT local elimina el usuario de GoTrue", async () => {
      Usuario.buscarPorCorreo.mockResolvedValue(undefined);
      SupabaseAdmin.crearUsuario.mockResolvedValue({ id: "uid-1" });
      Usuario.crear.mockRejectedValue(new Error("fallo insert"));
      const res = mockRes();
      await controlador.crear({ body: conUsuario }, res);
      expect(SupabaseAdmin.eliminarUsuario).toHaveBeenCalledWith("uid-1");
      expect(Usuario.eliminar).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("si falla la creación del empleado elimina usuario local y de GoTrue", async () => {
      Usuario.buscarPorCorreo.mockResolvedValue(undefined);
      SupabaseAdmin.crearUsuario.mockResolvedValue({ id: "uid-1" });
      Usuario.crear.mockResolvedValue({ id: 5 });
      Empleado.crear.mockRejectedValue(new Error("fallo empleado"));
      const res = mockRes();
      await controlador.crear({ body: conUsuario }, res);
      expect(Usuario.eliminar).toHaveBeenCalledWith(5);
      expect(SupabaseAdmin.eliminarUsuario).toHaveBeenCalledWith("uid-1");
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toBe("fallo empleado");
    });

    it("correo ya existente: 400 sin tocar GoTrue", async () => {
      Usuario.buscarPorCorreo.mockResolvedValue({ id: 1 });
      const res = mockRes();
      await controlador.crear({ body: conUsuario }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(SupabaseAdmin.crearUsuario).not.toHaveBeenCalled();
    });
  });
});
