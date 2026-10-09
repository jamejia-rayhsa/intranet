const request = require("supertest");
const express = require("express");

jest.mock("../config/database", () => ({ grupo: { query: jest.fn() } }));
jest.mock("../../../portal/backend/middleware/auth.middleware", () => ({
  authenticateJWT: (req, res, next) => next(),
}));
jest.mock("../../../portal/backend/middleware/permisos.middleware", () => ({
  verificarPermiso: () => (req, res, next) => next(),
}));
jest.mock("../../../auditoria/backend/services/auditoria.service", () => ({
  registrarAccion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock(
  "../../../portal/backend/services/storage.service",
  () => ({
    BUCKETS: { EXPEDIENTES: "rh-expedientes", RECIBOS: "rh-recibos" },
    subir: jest.fn().mockResolvedValue({}),
    urlFirmada: jest.fn(),
    eliminar: jest.fn(),
    claveSegura: jest.fn((n) => `seguro_${n}`),
  }),
  { virtual: true },
);
jest.mock("../models/expedienteDocumento.model");
jest.mock("../models/reciboNomina.model");

const storage = require("../../../portal/backend/services/storage.service");
const Documento = require("../models/expedienteDocumento.model");
const Recibo = require("../models/reciboNomina.model");

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { usuario_id: 1, rol_nombre: "rh" };
  next();
});
app.use("/api/expediente", require("../routes/expediente.routes"));
app.use("/api/recibos", require("../routes/recibos.routes"));

afterEach(() => jest.clearAllMocks());

describe("expediente", () => {
  it("sube a Storage con prefijo de empleado y guarda la clave", async () => {
    Documento.crear.mockResolvedValue({ id: 9 });
    const r = await request(app)
      .post("/api/expediente/7")
      .field("tipo_documento", "curp")
      .attach("archivo", Buffer.from("%PDF"), {
        filename: "a.pdf",
        contentType: "application/pdf",
      });
    expect(r.status).toBe(201);
    expect(storage.subir).toHaveBeenCalledWith(
      "rh-expedientes",
      "7/seguro_a.pdf",
      expect.any(Buffer),
      "application/pdf",
    );
    expect(Documento.crear).toHaveBeenCalledWith(
      expect.objectContaining({ ruta_archivo: "7/seguro_a.pdf" }),
    );
  });

  it("si el INSERT falla elimina el objeto subido y devuelve el error original", async () => {
    Documento.crear.mockRejectedValue(new Error("fallo insert"));
    const r = await request(app)
      .post("/api/expediente/7")
      .attach("archivo", Buffer.from("%PDF"), {
        filename: "a.pdf",
        contentType: "application/pdf",
      });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("fallo insert");
    expect(storage.eliminar).toHaveBeenCalledWith("rh-expedientes", "7/seguro_a.pdf");
  });

  it("si INSERT y eliminar fallan responde el error original", async () => {
    Documento.crear.mockRejectedValue(new Error("fallo insert"));
    storage.eliminar.mockRejectedValue(new Error("fallo storage"));
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const r = await request(app)
      .post("/api/expediente/7")
      .attach("archivo", Buffer.from("%PDF"), {
        filename: "a.pdf",
        contentType: "application/pdf",
      });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("fallo insert");
  });

  it("rechaza tipo no válido", async () => {
    const r = await request(app)
      .post("/api/expediente/7")
      .attach("archivo", Buffer.from("x"), {
        filename: "a.exe",
        contentType: "application/x-msdownload",
      });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(storage.subir).not.toHaveBeenCalled();
  });

  it("eliminar continúa si Storage falla", async () => {
    Documento.obtenerPorId.mockResolvedValue({ id: 3, ruta_archivo: "7/x.pdf" });
    storage.eliminar.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const r = await request(app).delete("/api/expediente/3");
    expect(r.status).toBe(200);
    expect(Documento.eliminar).toHaveBeenCalledWith("3");
  });

  it("/url devuelve URL firmada", async () => {
    Documento.obtenerPorId.mockResolvedValue({
      id: 3,
      ruta_archivo: "7/x.pdf",
      nombre_archivo: "x.pdf",
    });
    storage.urlFirmada.mockResolvedValue("/storage/v1/object/sign/t?token=a");
    const r = await request(app).get("/api/expediente/3/url");
    expect(r.status).toBe(200);
    expect(r.body.datos).toEqual({
      url: "/storage/v1/object/sign/t?token=a",
      nombre_archivo: "x.pdf",
      expira_en: 300,
    });
    expect(storage.urlFirmada).toHaveBeenCalledWith("rh-expedientes", "7/x.pdf", {
      segundos: 300,
      descargar: "x.pdf",
    });
  });

  it("/url de documento inexistente es 404; fila legada es 409", async () => {
    Documento.obtenerPorId.mockResolvedValueOnce(undefined);
    expect((await request(app).get("/api/expediente/1/url")).status).toBe(404);
    Documento.obtenerPorId.mockResolvedValueOnce({
      id: 1,
      ruta_archivo: "/uploads/expedientes/a.pdf",
    });
    const r = await request(app).get("/api/expediente/1/url");
    expect(r.status).toBe(409);
    expect(storage.urlFirmada).not.toHaveBeenCalled();
  });
});

describe("recibos", () => {
  it("sube a Storage con prefijo de empleado", async () => {
    Recibo.crear.mockResolvedValue({ id: 5 });
    const r = await request(app)
      .post("/api/recibos")
      .field("empleado_id", "7")
      .field("periodo", "2026-01")
      .attach("archivo", Buffer.from("%PDF"), {
        filename: "r.pdf",
        contentType: "application/pdf",
      });
    expect(r.status).toBe(201);
    expect(storage.subir.mock.calls[0].slice(0, 2)).toEqual([
      "rh-recibos",
      "7/seguro_r.pdf",
    ]);
    expect(Recibo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ ruta_archivo: "7/seguro_r.pdf" }),
    );
  });

  it("recibo: si el INSERT falla limpia el objeto, incluso si eliminar falla", async () => {
    Recibo.crear.mockRejectedValue(new Error("fallo insert"));
    storage.eliminar.mockRejectedValue(new Error("fallo storage"));
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const r = await request(app)
      .post("/api/recibos")
      .field("empleado_id", "7")
      .field("periodo", "2026-01")
      .attach("archivo", Buffer.from("%PDF"), {
        filename: "r.pdf",
        contentType: "application/pdf",
      });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("fallo insert");
    expect(storage.eliminar).toHaveBeenCalledWith("rh-recibos", "7/seguro_r.pdf");
  });

  it("rechaza empleado_id con path traversal", async () => {
    const r = await request(app)
      .post("/api/recibos")
      .field("empleado_id", "../x")
      .field("periodo", "2026-01")
      .attach("archivo", Buffer.from("%PDF"), {
        filename: "r.pdf",
        contentType: "application/pdf",
      });
    expect(r.status).toBe(400);
    expect(storage.subir).not.toHaveBeenCalled();
  });

  it("eliminar continúa si Storage falla", async () => {
    Recibo.obtenerPorId.mockResolvedValue({ id: 2, ruta_archivo: "7/r.pdf" });
    storage.eliminar.mockRejectedValue(new Error("boom"));
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const r = await request(app).delete("/api/recibos/2");
    expect(r.status).toBe(200);
    expect(Recibo.eliminar).toHaveBeenCalledWith("2");
  });

  it("/url devuelve URL; legada 409; sin archivo 404", async () => {
    Recibo.obtenerPorId.mockResolvedValueOnce({
      id: 2,
      periodo: "2026-01",
      ruta_archivo: "7/r.pdf",
    });
    storage.urlFirmada.mockResolvedValue("/storage/v1/object/sign/r?token=b");
    const ok = await request(app).get("/api/recibos/2/url");
    expect(ok.status).toBe(200);
    expect(ok.body.datos.url).toContain("token=b");
    Recibo.obtenerPorId.mockResolvedValueOnce({ id: 2, ruta_archivo: "/uploads/recibos/a.pdf" });
    expect((await request(app).get("/api/recibos/2/url")).status).toBe(409);
    Recibo.obtenerPorId.mockResolvedValueOnce({ id: 2, ruta_archivo: null });
    expect((await request(app).get("/api/recibos/2/url")).status).toBe(404);
  });
});
