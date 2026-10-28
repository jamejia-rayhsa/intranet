// Lógica pura de "Importar usuarios": validación de filas, repetidos del archivo y resolución del empleado. Datos ficticios.
const U = require("../utils/importarUsuarios");

const cruda = (extra = {}) => ({ _fila: 2, correo: "ana.prueba@rayhsa.com.mx", nombre: "Ana", apellido: "Prueba Ejemplo", numero_nomina: "90001", ...extra });
const emp = (id, extra = {}) => ({ id, nombre: "Ana", apellido_paterno: "Prueba", apellido_materno: "Ejemplo", estatus: "activo", usuario_id: null, ...extra });

describe("validarCorreoCorporativo", () => {
  it("acepta @rayhsa.com.mx y lo pasa a minúsculas", () => {
    expect(U.validarCorreoCorporativo("  Ana.Prueba@RAYHSA.com.mx ")).toEqual({ correo: "ana.prueba@rayhsa.com.mx" });
  });
  it.each([
    ["otro dominio", "ana@gmail.com"],
    ["subdominio", "ana@x.rayhsa.com.mx"],
    ["dominio que solo termina igual", "ana@norayhsa.com.mx"],
    ["dos arrobas", "a@b@rayhsa.com.mx"],
    ["sin parte local", "@rayhsa.com.mx"],
    ["con espacio interno", "an a@rayhsa.com.mx"],
    ["con comillas", '"ana"@rayhsa.com.mx'],
    ["sin arroba", "anarayhsa.com.mx"],
  ])("rechaza %s", (_n, correo) => {
    expect(U.validarCorreoCorporativo(correo).error).toBeTruthy();
  });
  it("el mensaje de dominio nombra el dominio permitido", () => {
    expect(U.validarCorreoCorporativo("ana@gmail.com").error).toContain("@rayhsa.com.mx");
  });
  it("vacío, no texto y NUL", () => {
    expect(U.validarCorreoCorporativo("").error).toMatch(/Falta/);
    expect(U.validarCorreoCorporativo({}).error).toMatch(/no válido/);
    expect(U.validarCorreoCorporativo("a\u0000@rayhsa.com.mx").error).toMatch(/no permitidos/);
  });
  it("rechaza más de 255 caracteres", () => {
    expect(U.validarCorreoCorporativo(`${"a".repeat(250)}@rayhsa.com.mx`).error).toBeTruthy();
  });
});

describe("prepararFilaUsuario", () => {
  it("fila válida con nómina", () => {
    expect(U.prepararFilaUsuario(cruda()).fila).toEqual({ fila: 2, correo: "ana.prueba@rayhsa.com.mx", nombre: "Ana", apellido: "Prueba Ejemplo", numero_nomina: "90001", curp: "" });
  });
  it("fila válida con CURP (mayúsculas y sin espacios)", () => {
    const r = U.prepararFilaUsuario(cruda({ numero_nomina: "", curp: " xxxx 000101 hdfxxx 00 " }));
    expect(r.fila.curp).toBe("XXXX000101HDFXXX00");
  });
  it("la nómina 101.0 de Excel queda 101 y un número se vuelve texto", () => {
    expect(U.prepararFilaUsuario(cruda({ numero_nomina: "101.0" })).fila.numero_nomina).toBe("101");
    expect(U.prepararFilaUsuario(cruda({ numero_nomina: 90002 })).fila.numero_nomina).toBe("90002");
  });
  it("sin nómina ni CURP: error de identificador", () => {
    expect(U.prepararFilaUsuario(cruda({ numero_nomina: "" })).error).toMatch(/número de nómina o CURP/);
  });
  it("CURP inválida NO se degrada a vacía (aunque haya nómina)", () => {
    expect(U.prepararFilaUsuario(cruda({ curp: "CORTA" })).error).toMatch(/CURP inválida/);
  });
  it("nómina con espacios o símbolos es error", () => {
    expect(U.prepararFilaUsuario(cruda({ numero_nomina: "900 01" })).error).toMatch(/espacios/);
    expect(U.prepararFilaUsuario(cruda({ numero_nomina: "9000/1" })).error).toMatch(/inválido/);
  });
  it("celda numérica de 16+ dígitos (precisión perdida) es error en CURP y nómina", () => {
    expect(U.prepararFilaUsuario(cruda({ _precision: ["numero_nomina"] })).error).toMatch(/Texto/);
    expect(U.prepararFilaUsuario(cruda({ numero_nomina: "", curp: "XXXX000101HDFXXX00", _precision: ["curp"] })).error).toMatch(/CURP/);
  });
  it("nombre y apellido obligatorios y con tope de 100", () => {
    expect(U.prepararFilaUsuario(cruda({ nombre: "" })).error).toMatch(/nombre/);
    expect(U.prepararFilaUsuario(cruda({ apellido: " " })).error).toMatch(/apellido/);
    expect(U.prepararFilaUsuario(cruda({ nombre: "x".repeat(101) })).error).toMatch(/100/);
  });
  it("no objetos y valores no válidos", () => {
    expect(U.prepararFilaUsuario(null).error).toBeTruthy();
    expect(U.prepararFilaUsuario([]).error).toBeTruthy();
    expect(U.prepararFilaUsuario(cruda({ nombre: { a: 1 } })).error).toMatch(/no válido/);
    expect(U.prepararFilaUsuario(cruda({ numero_nomina: true })).error).toMatch(/no válido/);
  });
  it("ignora cualquier columna de rol que se cuele: el rol nunca sale de la fila", () => {
    const r = U.prepararFilaUsuario(cruda({ rol: "super_admin", rol_id: 1 }));
    expect(r.fila).not.toHaveProperty("rol");
    expect(r.fila).not.toHaveProperty("rol_id");
    expect(U.ROL_IMPORTADO).toBe("rh_empleado");
  });
});

describe("prepararFilasUsuarios", () => {
  it("400 de la petición: vacío, no arreglo y más de 200", () => {
    expect(U.prepararFilasUsuarios([]).error).toMatch(/No se recibieron/);
    expect(U.prepararFilasUsuarios("x").error).toMatch(/No se recibieron/);
    const r = U.prepararFilasUsuarios(Array.from({ length: 201 }, (_, i) => cruda({ _fila: i + 2 })));
    expect(r.error).toMatch(/Máximo 200/);
    expect(U.MAX_FILAS_IMPORTAR_USUARIOS).toBe(200);
  });
  it("acepta exactamente 200", () => {
    const filas = Array.from({ length: 200 }, (_, i) => cruda({ _fila: i + 2, correo: `u${i}@rayhsa.com.mx`, numero_nomina: String(100 + i) }));
    const r = U.prepararFilasUsuarios(filas);
    expect(r.filas).toHaveLength(200);
    expect(r.filas.every((f) => f.fila)).toBe(true);
  });
  it("correo repetido (sin distinguir mayúsculas), CURP y nómina repetidas: la primera se conserva y la siguiente cita la fila", () => {
    const r = U.prepararFilasUsuarios([
      cruda({ _fila: 2 }),
      cruda({ _fila: 3, correo: "ANA.PRUEBA@rayhsa.com.mx", numero_nomina: "1" }),
      cruda({ _fila: 4, correo: "otra@rayhsa.com.mx", numero_nomina: "90001" }),
      cruda({ _fila: 5, correo: "luis@rayhsa.com.mx", numero_nomina: "", curp: "XXXX000101HDFXXX00" }),
      cruda({ _fila: 6, correo: "luis2@rayhsa.com.mx", numero_nomina: "", curp: "XXXX000101HDFXXX00" }),
    ]).filas;
    expect(r[0].fila).toBeTruthy();
    expect(r[1].error).toMatch(/el correo ya aparece en la fila 2/);
    expect(r[2].error).toMatch(/número de nómina ya aparece en la fila 2/);
    expect(r[3].fila).toBeTruthy();
    expect(r[4].error).toMatch(/la CURP ya aparece en la fila 5/);
  });
  it("la nómina con y sin ceros a la izquierda cuenta como repetida", () => {
    const r = U.prepararFilasUsuarios([cruda({ _fila: 2, numero_nomina: "0123" }), cruda({ _fila: 3, correo: "b@rayhsa.com.mx", numero_nomina: "123" })]).filas;
    expect(r[1].error).toMatch(/nómina/);
  });
  it("una fila inválida conserva su número y no bloquea a las demás", () => {
    const r = U.prepararFilasUsuarios([cruda({ _fila: 7, correo: "x@gmail.com" }), cruda({ _fila: 8, correo: "b@rayhsa.com.mx", numero_nomina: "2" })]).filas;
    expect(r[0]).toMatchObject({ numero: 7, error: expect.stringMatching(/dominio/) });
    expect(r[1].fila.fila).toBe(8);
  });
  it("una fila con error conserva lo escrito (correo y nombre recortados) para mostrarlo de vuelta; los objetos no se vuelcan", () => {
    const r = U.prepararFilasUsuarios([cruda({ correo: " x@gmail.com ", nombre: "Ana", apellido: "Pérez" }), cruda({ correo: { a: 1 }, nombre: { b: 2 }, apellido: "Z" })]).filas;
    expect(r[0].visible).toEqual({ correo: "x@gmail.com", nombre: "Ana Pérez" });
    expect(r[1].visible).toEqual({ correo: "", nombre: "Z" });
  });
  it("sin _fila usa la posición + 2 (fila 1 = encabezado)", () => {
    const r = U.prepararFilasUsuarios([{ correo: "x@gmail.com", nombre: "A", apellido: "B", numero_nomina: "1" }]).filas;
    expect(r[0].numero).toBe(2);
  });
});

describe("resolverEmpleado", () => {
  const fila = (extra = {}) => ({ correo: "ana@rayhsa.com.mx", nombre: "Ana", apellido: "Prueba Ejemplo", numero_nomina: "90001", curp: "", ...extra });
  it("nómina única, activo y sin cuenta: resuelve", () => {
    const r = U.resolverEmpleado(fila(), [], [emp(1)]);
    expect(r.empleado.id).toBe(1);
    expect(r.avisos).toEqual([]);
  });
  it("nómina ambigua es error y no elige", () => {
    const r = U.resolverEmpleado(fila(), [], [emp(1), emp(2)]);
    expect(r.error).toMatch(/ambiguo.*2 empleados.*CURP/);
    expect(r.empleado).toBeUndefined();
  });
  it("sin empleado por nómina o por CURP", () => {
    expect(U.resolverEmpleado(fila(), [], []).error).toMatch(/nómina/);
    expect(U.resolverEmpleado(fila({ numero_nomina: "", curp: "XXXX000101HDFXXX00" }), [], []).error).toMatch(/CURP/);
  });
  it("CURP repetida en varios empleados es error", () => {
    expect(U.resolverEmpleado(fila({ numero_nomina: "", curp: "X" }), [emp(1), emp(2)], []).error).toMatch(/varios empleados/);
  });
  it("CURP y nómina deben apuntar al mismo empleado", () => {
    expect(U.resolverEmpleado(fila({ curp: "X" }), [emp(1)], [emp(2)]).error).toMatch(/distintos/);
    expect(U.resolverEmpleado(fila({ curp: "X" }), [emp(1)], [emp(1)]).empleado.id).toBe(1);
  });
  it("con CURP única la nómina ambigua que la incluye no estorba", () => {
    expect(U.resolverEmpleado(fila({ curp: "X" }), [emp(1)], [emp(1), emp(2)]).empleado.id).toBe(1);
  });
  it("empleado no activo (baja o suspendido) es error", () => {
    expect(U.resolverEmpleado(fila(), [], [emp(1, { estatus: "baja" })]).error).toMatch(/no está activo \(estatus: baja\)/);
    expect(U.resolverEmpleado(fila(), [], [emp(1, { estatus: "suspendido" })]).error).toMatch(/no está activo/);
  });
  it("empleado que ya tiene cuenta es error y no se pisa", () => {
    expect(U.resolverEmpleado(fila(), [], [emp(1, { usuario_id: 9 })]).error).toMatch(/ya tiene una cuenta/);
  });
  it("nombre distinto: se acepta con aviso (no bloquea)", () => {
    const r = U.resolverEmpleado(fila({ nombre: "Beto", apellido: "Otro" }), [], [emp(1)]);
    expect(r.empleado.id).toBe(1);
    expect(r.avisos[0]).toMatch(/no coincide/);
  });
});

describe("nombreCompatible", () => {
  it("acentos y mayúsculas no importan, y el apellido puede traer el materno", () => {
    expect(U.nombreCompatible({ nombre: "ANA", apellido: "prueba ejemplo" }, emp(1))).toBe(true);
    expect(U.nombreCompatible({ nombre: "Ana", apellido: "Otro" }, emp(1))).toBe(false);
  });
  it("la ñ no se confunde con la n", () => {
    expect(U.nombreCompatible({ nombre: "Ana", apellido: "Pena" }, emp(1, { apellido_paterno: "Peña" }))).toBe(false);
  });
});
