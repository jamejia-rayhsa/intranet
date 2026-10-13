jest.mock("../../../portal/backend/services/notificador.service", () => ({
  configurado: jest.fn(),
  notificar: jest.fn().mockResolvedValue({ exito: true }),
}));

const Notificador = require("../../../portal/backend/services/notificador.service");
const Servicio = require("../services/notificacion.service");

const ticket = { id: 9, titulo: "Impresora", nivel_atencion: "medio", categoria: "Hardware" };

describe("notificacion.service (tickets)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = "https://intranet.test";
  });

  it("usa n8n cuando está configurado y pide también Teams al resolver", async () => {
    Notificador.configurado.mockReturnValue(true);
    await Servicio.notificarCambioEstado(ticket, "ana@rayhsa.com.mx", "en_progreso", "resuelto");
    const arg = Notificador.notificar.mock.calls[0][0];
    expect(arg).toMatchObject({ canal: "ambos", correo: "ana@rayhsa.com.mx", origen: "tickets", referencia: 9 });
    expect(arg.cuerpo).toContain("https://intranet.test/tickets/lista?ticket=9");
  });

  it("otros cambios de estado van solo por correo", async () => {
    Notificador.configurado.mockReturnValue(true);
    await Servicio.notificarCambioEstado(ticket, "ana@rayhsa.com.mx", "abierto", "en_progreso");
    expect(Notificador.notificar.mock.calls[0][0].canal).toBe("email");
  });

  it("sin n8n cae al comportamiento anterior (SMTP no configurado)", async () => {
    Notificador.configurado.mockReturnValue(false);
    delete process.env.SMTP_HOST;
    const antes = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const r = await Servicio.notificarAsignacionTecnico(ticket, "tec@rayhsa.com.mx");
    process.env.NODE_ENV = antes;
    expect(Notificador.notificar).not.toHaveBeenCalled();
    expect(r).toMatchObject({ exito: false, mensaje: "SMTP no configurado" });
  });
});
