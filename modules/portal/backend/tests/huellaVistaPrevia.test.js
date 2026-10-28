// Huella de vista previa: firma por usuario y por fila, con caducidad.
const H = require("../utils/huellaVistaPrevia");

const fila = (extra = {}) => ({ fila: 2, correo: "a@rayhsa.com.mx", nombre: "Ana", apellido: "Prueba", numero_nomina: "1", curp: "", ...extra });

describe("huellaVistaPrevia", () => {
  it("una huella recién creada es válida para la misma fila y el mismo usuario", () => {
    expect(H.huellaValida(2, fila(), H.crearHuella(2, fila()))).toBe(true);
  });
  it("cambia con cualquier dato de la fila, con el usuario y con el número de fila", () => {
    const h = H.crearHuella(2, fila());
    for (const cambio of [{ correo: "b@rayhsa.com.mx" }, { nombre: "Otra" }, { apellido: "X" }, { numero_nomina: "2" }, { curp: "XEJE000101HDFXXX00" }, { fila: 3 }]) {
      expect(H.huellaValida(2, fila(cambio), h)).toBe(false);
    }
    expect(H.huellaValida(3, fila(), h)).toBe(false);
  });
  it("vence a los 30 minutos y no acepta caducidades inventadas muy lejanas", () => {
    const t0 = 1_700_000_000_000;
    const h = H.crearHuella(2, fila(), t0);
    expect(H.huellaValida(2, fila(), h, t0 + H.VIGENCIA_MS - 1)).toBe(true);
    expect(H.huellaValida(2, fila(), h, t0 + H.VIGENCIA_MS + 1)).toBe(false);
    const [, firma] = h.split(".");
    expect(H.huellaValida(2, fila(), `${t0 + 10 * H.VIGENCIA_MS}.${firma}`, t0)).toBe(false);
  });
  it("rechaza lo que no es una huella", () => {
    for (const x of [undefined, null, "", "abc", 5, {}, "1.2.3", `${Date.now() + 1000}.zz`, "x".repeat(500)]) expect(H.huellaValida(2, fila(), x)).toBe(false);
  });
  it("con otro secreto la huella ya no vale (no se puede fabricar sin el secreto del servidor)", () => {
    const original = process.env.SUPABASE_JWT_SECRET;
    process.env.SUPABASE_JWT_SECRET = "secreto-a";
    const h = H.crearHuella(2, fila());
    process.env.SUPABASE_JWT_SECRET = "secreto-b";
    expect(H.huellaValida(2, fila(), h)).toBe(false);
    if (original === undefined) delete process.env.SUPABASE_JWT_SECRET; else process.env.SUPABASE_JWT_SECRET = original;
  });
});
