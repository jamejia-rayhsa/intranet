const path = require("path");
const {
  TABLAS, parsearArgs, inferirMime, planificarTabla, migrarFila, ejecutar, hayProblemas,
} = require("../../../../scripts/migrar-archivos-storage");

const cfgTickets = TABLAS.find((t) => t.tabla === "ticket_adjuntos");
const cfgNoticias = TABLAS.find((t) => t.tabla === "noticia_imagenes");
const UP = "/data/uploads";

function crearStorage(extra = {}) {
  return {
    BUCKETS: { TICKETS: "tickets-adjuntos", EXPEDIENTES: "rh-expedientes", RECIBOS: "rh-recibos", NOTICIAS: "noticias" },
    asegurarBuckets: jest.fn().mockResolvedValue(),
    subir: jest.fn().mockResolvedValue({}),
    eliminar: jest.fn().mockResolvedValue(),
    claveSegura: jest.fn((n) => `u_${n}`),
    ...extra,
  };
}
// archivos: nombres existentes en disco
function crearFs(archivos, enCarpeta = archivos) {
  return {
    promises: {
      stat: jest.fn(async (p) => {
        if (!archivos.includes(path.basename(p))) throw Object.assign(new Error("x"), { code: "ENOENT" });
        return { isFile: () => true };
      }),
      readFile: jest.fn().mockResolvedValue(Buffer.from("contenido")),
      readdir: jest.fn().mockResolvedValue(enCarpeta.map((name) => ({ name, isFile: () => true }))),
    },
  };
}
const fila = (o = {}) => ({
  id: 1, ticket_id: 7, ruta_archivo: "/uploads/tickets/a.pdf", nombre_archivo: "Informe.pdf", tipo_archivo: "application/pdf", ...o,
});
const crearPool = (filas = [], rowCount = 1) => ({
  query: jest.fn(async (sql) => {
    if (/COUNT/.test(sql)) return { rows: [{ n: 2 }] };
    if (/^UPDATE/.test(sql)) return { rowCount, rows: [] };
    return { rows: filas.map((f) => ({ ...f })) };
  }),
});

describe("migrar-archivos-storage", () => {
  it("parsearArgs valida opciones", () => {
    expect(parsearArgs(["--dry-run", "--limit=5", "--tabla=recibos_nomina"])).toEqual({ dryRun: true, limit: 5, tabla: "recibos_nomina" });
    expect(() => parsearArgs(["--tabla=otra"])).toThrow();
    expect(() => parsearArgs(["--limit=0"])).toThrow();
    expect(() => parsearArgs(["--x"])).toThrow();
  });

  it("inferirMime usa tipo_archivo o la extension", () => {
    expect(inferirMime(fila({ tipo_archivo: "image/png" }), cfgTickets)).toBe("image/png");
    expect(inferirMime({ ruta_archivo: "/uploads/noticias/a.JPG" }, cfgNoticias)).toBe("image/jpeg");
    expect(inferirMime({ ruta_archivo: "/uploads/noticias/a.zzz" }, cfgNoticias)).toBe("application/octet-stream");
  });

  it("planificarTabla clasifica, cuenta ya migrados y huerfanos", async () => {
    const pool = crearPool([fila(), fila({ id: 2, ruta_archivo: "/uploads/tickets/falta.pdf" })]);
    const fs = crearFs(["a.pdf", "suelto.pdf"]);
    const plan = await planificarTabla(cfgTickets, { pool, uploadsDir: UP, fs });
    expect(plan.yaMigrados).toBe(2);
    expect(plan.pendientes.map((p) => p.existe)).toEqual([true, false]);
    expect(plan.huerfanos).toBe(1);
    expect(pool.query.mock.calls.some(([s]) => /LIKE '\/uploads\/%'/.test(s))).toBe(true);
  });

  it("planificarTabla tolera carpeta inexistente", async () => {
    const fs = crearFs([]);
    fs.promises.readdir.mockRejectedValue(Object.assign(new Error("x"), { code: "ENOENT" }));
    const plan = await planificarTabla(cfgTickets, { pool: crearPool([]), uploadsDir: UP, fs });
    expect(plan.huerfanos).toBe(0);
  });

  it("migrarFila sube y actualiza con guarda de ruta vieja", async () => {
    const pool = crearPool();
    const storage = crearStorage();
    const f = fila();
    const r = await migrarFila({ fila: f, ruta: path.join(UP, "tickets", "a.pdf"), existe: true }, cfgTickets, {
      pool, storage, uploadsDir: UP, fs: crearFs(["a.pdf"]),
    });
    expect(r).toEqual({ estado: "migrado", clave: "7/u_Informe.pdf" });
    expect(storage.subir).toHaveBeenCalledWith("tickets-adjuntos", "7/u_Informe.pdf", expect.any(Buffer), "application/pdf");
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE id = \$2 AND ruta_archivo = \$3/);
    expect(params).toEqual(["7/u_Informe.pdf", 1, "/uploads/tickets/a.pdf"]);
  });

  it("noticias: sin prefijo de carpeta", async () => {
    const storage = crearStorage();
    const f = { id: 3, ruta_archivo: "/uploads/noticias/n.png", nombre_archivo: null };
    const r = await migrarFila({ fila: f, ruta: path.join(UP, "noticias", "n.png"), existe: true }, cfgNoticias, {
      pool: crearPool(), storage, uploadsDir: UP, fs: crearFs(["n.png"]),
    });
    expect(r.clave).toBe("u_n.png");
    expect(storage.subir).toHaveBeenCalledWith("noticias", "u_n.png", expect.any(Buffer), "image/png");
  });

  it("dry-run no sube ni escribe", async () => {
    const pool = crearPool();
    const storage = crearStorage();
    const r = await migrarFila({ fila: fila(), ruta: path.join(UP, "tickets", "a.pdf"), existe: true }, cfgTickets, {
      pool, storage, uploadsDir: UP, dryRun: true, fs: crearFs(["a.pdf"]),
    });
    expect(r.estado).toBe("dry-run");
    expect(storage.subir).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("archivo faltante no toca la fila ni sube", async () => {
    const pool = crearPool();
    const storage = crearStorage();
    const r = await migrarFila({ fila: fila(), ruta: path.join(UP, "tickets", "a.pdf"), existe: false }, cfgTickets, {
      pool, storage, uploadsDir: UP, fs: crearFs([]),
    });
    expect(r.estado).toBe("faltante");
    expect(storage.subir).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("subida fallida no actualiza la fila", async () => {
    const pool = crearPool();
    const storage = crearStorage({ subir: jest.fn().mockRejectedValue(new Error("503")) });
    const r = await migrarFila({ fila: fila(), ruta: path.join(UP, "tickets", "a.pdf"), existe: true }, cfgTickets, {
      pool, storage, uploadsDir: UP, fs: crearFs(["a.pdf"]),
    });
    expect(r.estado).toBe("error");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("UPDATE con rowCount 0 (carrera) = ya-migrado y limpia el objeto sobrante", async () => {
    const storage = crearStorage();
    const r = await migrarFila({ fila: fila(), ruta: path.join(UP, "tickets", "a.pdf"), existe: true }, cfgTickets, {
      pool: crearPool([], 0), storage, uploadsDir: UP, fs: crearFs(["a.pdf"]),
    });
    expect(r.estado).toBe("ya-migrado");
    expect(storage.eliminar).toHaveBeenCalledWith("tickets-adjuntos", "7/u_Informe.pdf");
  });

  it("ruta con traversal se trata como faltante", async () => {
    const storage = crearStorage();
    const r = await migrarFila(
      { fila: fila({ ruta_archivo: "/uploads/tickets/../../etc/passwd" }), ruta: null },
      cfgTickets, { pool: crearPool(), storage, uploadsDir: UP, fs: crearFs([]) },
    );
    expect(r.estado).toBe("faltante");
  });

  it("ejecutar: idempotente (sin pendientes no sube nada) y resume", async () => {
    const storage = crearStorage();
    const log = jest.fn();
    const resumen = await ejecutar({ dryRun: false, limit: null, tabla: "ticket_adjuntos" }, {
      pool: crearPool([]), storage, uploadsDir: UP, fs: crearFs([]), log,
    });
    expect(storage.asegurarBuckets).toHaveBeenCalled();
    expect(storage.subir).not.toHaveBeenCalled();
    expect(resumen.ticket_adjuntos).toMatchObject({ migrados: 0, yaMigrados: 2, faltantes: 0, errores: 0 });
    expect(hayProblemas(resumen)).toBe(false);
  });

  it("ejecutar: faltantes o errores => hayProblemas; dry-run no asegura buckets", async () => {
    const storage = crearStorage();
    const resumen = await ejecutar({ dryRun: true, limit: null, tabla: "ticket_adjuntos" }, {
      pool: crearPool([fila()]), storage, uploadsDir: UP, fs: crearFs([]), log: jest.fn(),
    });
    expect(storage.asegurarBuckets).not.toHaveBeenCalled();
    expect(resumen.ticket_adjuntos.faltantes).toBe(1);
    expect(hayProblemas(resumen)).toBe(true);
  });
});
