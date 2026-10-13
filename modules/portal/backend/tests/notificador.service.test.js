const Notificador = require("../services/notificador.service");

const base = { correo: "ana@rayhsa.com.mx", asunto: "Hola", cuerpo: "Texto <b>x</b>\nhttps://a.test/x", origen: "tickets" };

describe("notificador.service (n8n)", () => {
  const entorno = { ...process.env };
  beforeEach(() => {
    process.env.N8N_NOTIFICAR_URL = "http://n8n:5678/webhook/intranet-notificar";
    process.env.N8N_NOTIFICAR_SECRETO = "secreto-de-prueba";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 202 });
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...entorno };
    jest.restoreAllMocks();
  });

  it("queda desactivado sin URL o sin secreto", async () => {
    delete process.env.N8N_NOTIFICAR_SECRETO;
    expect(Notificador.configurado()).toBe(false);
    const r = await Notificador.notificar(base);
    expect(r).toMatchObject({ exito: false, omitido: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("envía el secreto en cabecera y el cuerpo con HTML escapado", async () => {
    const r = await Notificador.notificar({ ...base, canal: "ambos", referencia: 7 });
    expect(r.exito).toBe(true);
    const [url, opciones] = global.fetch.mock.calls[0];
    expect(url).toBe(process.env.N8N_NOTIFICAR_URL);
    expect(opciones.headers["X-Intranet-Secret"]).toBe("secreto-de-prueba");
    const cuerpo = JSON.parse(opciones.body);
    expect(cuerpo).toMatchObject({ canal: "ambos", destinatario: { correo: "ana@rayhsa.com.mx" }, referencia: "7" });
    expect(cuerpo.cuerpo_html).toContain("&lt;b&gt;x&lt;/b&gt;<br>");
    expect(cuerpo.cuerpo_html).toContain('<a href="https://a.test/x">');
  });

  it("no lanza si n8n responde error, y devuelve exito false", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401 });
    expect(await Notificador.notificar(base)).toMatchObject({ exito: false });
  });

  it("no lanza si n8n está caído o excede el tiempo", async () => {
    global.fetch.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await Notificador.notificar(base)).toMatchObject({ exito: false, mensaje: "ECONNREFUSED" });
  });

  it("rechaza si no hay destinatario", async () => {
    expect(await Notificador.notificar({ ...base, correo: "" })).toMatchObject({ exito: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
