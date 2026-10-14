jest.mock("../../../portal/backend/services/notificador.service", () => ({
  configurado: jest.fn(),
  notificar: jest.fn().mockResolvedValue({ exito: true }),
}));

const Notificador = require("../../../portal/backend/services/notificador.service");
const Servicio = require("../services/notificacion.service");

describe("notificacion.service (RH)", () => {
  const entorno = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    process.env = { ...entorno };
  });

  it("permiso aprobado va por n8n con correo y Teams", async () => {
    Notificador.configurado.mockReturnValue(true);
    await Servicio.notificarPermisoAprobado("ana@rayhsa.com.mx", "Vacaciones", "2026-11-01", "2026-11-05");
    expect(Notificador.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ canal: "ambos", correo: "ana@rayhsa.com.mx", origen: "rh" }),
    );
  });

  it("permiso rechazado va por correo y Teams, y el aviso al jefe solo por correo", async () => {
    Notificador.configurado.mockReturnValue(true);
    await Servicio.notificarPermisoRechazado("ana@rayhsa.com.mx", "Vacaciones", "sin cupo");
    expect(Notificador.notificar.mock.calls[0][0].canal).toBe("ambos");
    await Servicio.enviarCorreo("jefe@rayhsa.com.mx", "Nuevo permiso", "texto");
    expect(Notificador.notificar.mock.calls[1][0].canal).toBe("email");
  });

  it("sin n8n cae a SMTP (no configurado → se omite sin lanzar)", async () => {
    Notificador.configurado.mockReturnValue(false);
    delete process.env.SMTP_HOST;
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const r = await Servicio.enviarCorreo("ana@rayhsa.com.mx", "a", "b");
    expect(Notificador.notificar).not.toHaveBeenCalled();
    expect(r).toMatchObject({ exito: false, mensaje: "SMTP no configurado" });
  });

  it("en development sigue simulando aunque n8n esté configurado", async () => {
    Notificador.configurado.mockReturnValue(true);
    process.env.NODE_ENV = "development";
    jest.spyOn(console, "log").mockImplementation(() => {});
    const r = await Servicio.enviarCorreo("ana@rayhsa.com.mx", "a", "b");
    expect(Notificador.notificar).not.toHaveBeenCalled();
    expect(r.exito).toBe(true);
  });
});
