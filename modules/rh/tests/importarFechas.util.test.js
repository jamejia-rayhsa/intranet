// Pruebas de las utilidades puras del importador de archivos
// (modules/portal/frontend/utils/importarFechas.js e importarFilas.js).
// Los archivos son ESM y Jest corre sin transpilar: se evalúa el fuente sin `export` ni el import interno.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dirUtils = path.join(__dirname, "../../portal/frontend/utils");

function leerFuente(nombre) {
  const fuente = fs.readFileSync(path.join(dirUtils, nombre), "utf8");
  if (/^export\s+default\b/m.test(fuente)) throw new Error(`${nombre} no admite export default`);
  const imports = [...fuente.matchAll(/^import\s.*$/gm)].map((m) => m[0]);
  for (const i of imports) {
    if (!/from '\.\/importarFechas'/.test(i)) throw new Error(`${nombre}: import no soportado por el cargador: ${i}`);
  }
  const nombres = [...fuente.matchAll(/^export\s+(?:const|let|function)\s+(\w+)/gm)].map((m) => m[1]);
  const total = (fuente.match(/^export\s/gm) || []).length;
  if (total !== nombres.length) throw new Error(`${nombre}: ${total} exports pero se reconocieron ${nombres.length}`);
  return { codigo: fuente.replace(/^import\s.*$/gm, "").replace(/^export\s+/gm, ""), nombres };
}

const fechas = leerFuente("importarFechas.js");
const filas = leerFuente("importarFilas.js");
const CODIGO = `${fechas.codigo}\n${filas.codigo}`;
const NOMBRES = [...fechas.nombres, ...filas.nombres];
const U = new Function(`${CODIGO}\nreturn { ${NOMBRES.join(", ")} };`)();

// Evalúa una expresión (con las utilidades en alcance) en un proceso hijo con la zona horaria indicada.
function enZona(zona, cuerpo) {
  const programa = `${CODIGO}\nconst XLSX = require(${JSON.stringify(require.resolve("xlsx"))});\nconsole.log(JSON.stringify((function(){ ${cuerpo} })()));`;
  return JSON.parse(
    execFileSync(process.execPath, ["-e", programa], { env: { ...process.env, TZ: zona }, encoding: "utf8" })
  );
}

const ZONAS = ["America/Mexico_City", "UTC", "Pacific/Auckland"];

describe("normalizarFecha - vacíos", () => {
  it.each([[null], [undefined], [""], ["   "]])("%p es vacío sin error", (v) => {
    expect(U.normalizarFecha(v)).toEqual({ valor: "" });
  });
});

describe("normalizarFecha - serial de Excel", () => {
  it("convierte la parte entera del serial (incluido con hora)", () => {
    expect(U.normalizarFecha(45305)).toEqual({ valor: "2024-01-14" });
    expect(U.normalizarFecha(45305.74958333333)).toEqual({ valor: "2024-01-14" });
    expect(U.normalizarFecha(45305.9999)).toEqual({ valor: "2024-01-14" });
    expect(U.normalizarFecha("45305.74958333333")).toEqual({ valor: "2024-01-14" });
    expect(U.normalizarFecha("45305")).toEqual({ valor: "2024-01-14" });
  });

  it("respeta el sistema 1900: serial 1, 59, 61 y el 29-feb-1900", () => {
    expect(U.normalizarFecha(1)).toEqual({ valor: "1900-01-01" });
    expect(U.normalizarFecha(59)).toEqual({ valor: "1900-02-28" });
    expect(U.normalizarFecha(60).error).toMatch(/29 de febrero de 1900/);
    expect(U.normalizarFecha(61)).toEqual({ valor: "1900-03-01" });
    expect(U.normalizarFecha(25569)).toEqual({ valor: "1970-01-01" });
  });

  it("bisiestos: 29-feb-2024 y 28/29-feb-2100 (2100 no es bisiesto)", () => {
    expect(U.normalizarFecha(45351)).toEqual({ valor: "2024-02-29" });
    expect(U.normalizarFecha(45352)).toEqual({ valor: "2024-03-01" });
    // 2100-02-28 = 73109; 2100-03-01 = 73110 (no hay 29-feb-2100)
    expect(U.normalizarFecha(73109)).toEqual({ valor: "2100-02-28" });
    expect(U.normalizarFecha(73110)).toEqual({ valor: "2100-03-01" });
  });

  it("rechaza 0, negativos, fuera de rango, NaN e infinito", () => {
    expect(U.normalizarFecha(0).error).toBeTruthy();
    expect(U.normalizarFecha(-5).error).toBeTruthy();
    expect(U.normalizarFecha(NaN).error).toBeTruthy();
    expect(U.normalizarFecha(Infinity).error).toBeTruthy();
    expect(U.normalizarFecha(73415)).toEqual({ valor: "2100-12-31" });
    expect(U.normalizarFecha(73416).error).toMatch(/año/); // 2101-01-01
    expect(U.normalizarFecha(2958465).error).toBeTruthy();
    expect(U.normalizarFecha("1234567").error).toBeTruthy(); // 7 dígitos: ni serial ni fecha
  });
});

describe("normalizarFecha - textos", () => {
  it.each([
    ["2024-01-15", "2024-01-15"],
    ["2024/01/15", "2024-01-15"],
    ["15/01/2024", "2024-01-15"],
    ["15-01-2024", "2024-01-15"],
    ["5/1/2024", "2024-01-05"],
    ["05/01/2024", "2024-01-05"], // día primero (México): 5 de enero, no 1 de mayo
    ["  2024-01-15  ", "2024-01-15"],
    ["2024-01-15T00:00:00", "2024-01-15"],
    ["2024-01-15 08:30:00", "2024-01-15"],
    ["29/02/2024", "2024-02-29"],
    ["31/12/2100", "2100-12-31"],
    ["01/01/1900", "1900-01-01"],
  ])("%s -> %s", (entrada, esperado) => {
    expect(U.normalizarFecha(entrada)).toEqual({ valor: esperado });
  });

  it.each([
    ["31/02/2024", /no existe/],
    ["29/02/2023", /no existe/],
    ["29/02/2100", /no existe/],
    ["31/04/2024", /no existe/],
    ["00/01/2024", /no existe/],
    ["15/13/2024", /mes/],
    ["01/13/2024", /mes/],
    ["15/00/2024", /mes/],
    ["01/01/1899", /año/],
    ["01/01/2101", /año/],
    ["2024-13-01", /mes/],
    ["2024-02-30", /no existe/],
    ["15/01/24", /Formato/],
    ["ayer", /Formato/],
    ["15 de enero de 2024", /Formato/],
    ["2024-1-1x", /Formato/],
    ["15.01.2024", /Formato/],
    ["2024/01-15", /Formato/],
  ])("rechaza %s", (entrada, patron) => {
    const r = U.normalizarFecha(entrada);
    expect(r.valor).toBe("");
    expect(r.error).toMatch(patron);
  });

  it("rechaza tipos no soportados", () => {
    expect(U.normalizarFecha({}).error).toBeTruthy();
    expect(U.normalizarFecha(true).error).toBeTruthy();
    expect(U.normalizarFecha(new Date("x")).error).toBeTruthy();
  });
});

describe("normalizarFecha - objeto Date en distintas zonas horarias", () => {
  it.each(ZONAS)("usa la fecha calendario local sin desfase (TZ=%s)", (zona) => {
    const r = enZona(zona, `
      return [
        U_(new Date(2024, 0, 15)),
        U_(new Date(2024, 0, 15, 0, 0, 36)),
        U_(new Date(2024, 0, 15, 12, 0, 0)),
        U_(new Date(2024, 0, 15, 23, 59, 51)),
        U_(new Date(2024, 11, 31)),
        U_(new Date(2024, 1, 29)),
        U_(new Date(1990, 0, 1)),
      ];
      function U_(d) { return normalizarFecha(d).valor; }
    `);
    // 23:59:51 se interpreta como la medianoche (desfase de segundos de SheetJS) del día siguiente
    expect(r).toEqual(["2024-01-15", "2024-01-15", "2024-01-15", "2024-01-16", "2024-12-31", "2024-02-29", "1990-01-01"]);
  });

  it.each(ZONAS)("un .xlsx REAL con fechas de Excel se lee sin desfase (TZ=%s)", (zona) => {
    const r = enZona(zona, `
      const seriales = [32874, 45305, 45305.74958333333, 45351, 45658, 73110];
      const ws = {};
      seriales.forEach((s, i) => { ws['A' + (i + 1)] = { t: 'n', v: s, z: 'dd/mm/yyyy' }; });
      ws['!ref'] = 'A1:A' + seriales.length;
      const buf = XLSX.write({ SheetNames: ['H'], Sheets: { H: ws } }, { type: 'buffer', bookType: 'xlsx' });
      const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
      const matriz = XLSX.utils.sheet_to_json(wb.Sheets.H, { header: 1, defval: '', raw: true, blankrows: true });
      return matriz.map(f => normalizarFecha(f[0]).valor);
    `);
    expect(r).toEqual(["1990-01-01", "2024-01-14", "2024-01-14", "2024-02-29", "2025-01-01", "2100-03-01"]);
  });
});

describe("valorATexto y numeroATexto", () => {
  it("enteros sin decimales ni notación científica", () => {
    expect(U.valorATexto(5512345678)).toBe("5512345678");
    expect(U.valorATexto(12345678901)).toBe("12345678901");
    expect(U.valorATexto(1e21)).toBe("1000000000000000000000");
    expect(U.valorATexto(123456789012345680000)).toBe("123456789012345680000");
    expect(U.valorATexto(0.0000001)).toBe("0.0000001");
    expect(U.valorATexto(12.5)).toBe("12.5");
    expect(U.valorATexto(NaN)).toBe("");
  });

  it("texto se recorta; vacíos y booleanos", () => {
    expect(U.valorATexto("  NOM-001 ")).toBe("NOM-001");
    expect(U.valorATexto(null)).toBe("");
    expect(U.valorATexto(undefined)).toBe("");
    expect(U.valorATexto("00123")).toBe("00123");
    expect(U.valorATexto(true)).toBe("VERDADERO");
  });

  it("un Date en columna que no es de fecha se envía como AAAA-MM-DD", () => {
    expect(U.valorATexto(new Date(2024, 0, 15))).toBe("2024-01-15");
    expect(U.valorATexto(new Date("x"))).toBe("");
  });
});

const COLUMNAS = [
  { clave: "nombre", etiqueta: "Nombre", requerido: true },
  { clave: "apellido_paterno", etiqueta: "Apellido Paterno", requerido: true },
  { clave: "nss", etiqueta: "NSS", requerido: false },
  { clave: "celular_personal", etiqueta: "Celular Personal", requerido: false },
  { clave: "numero_nomina", etiqueta: "Número de Nómina", requerido: false },
  { clave: "fecha_nacimiento", etiqueta: "Fecha Nacimiento", requerido: false, tipo: "fecha" },
  { clave: "fecha_ingreso", etiqueta: "Fecha Ingreso", requerido: false, tipo: "fecha" },
];
const ENC = ["Nombre", "Apellido Paterno", "NSS", "Celular Personal", "Número de Nómina", "Fecha Nacimiento", "Fecha Ingreso"];

describe("filasDesdeMatriz", () => {
  it("numera las filas del archivo (fila 2 = primera de datos), salta las vacías sin perder la numeración", () => {
    const matriz = [
      ENC,
      ["Ana", "Prueba", 12345678901, 5512345678, 1001, new Date(1990, 0, 1), new Date(2024, 0, 15)],
      ["", "", "", "", "", "", ""],
      ["Beto", "Ficticio", "", "", "A-2", "31/02/2020", "texto"],
      ["", "SinNombre", "", "", "", "", ""],
    ];
    const r = U.filasDesdeMatriz(matriz, COLUMNAS);
    expect(r.map((f) => f._fila)).toEqual([2, 4, 5]);
    expect(r[0]).toMatchObject({
      nss: "12345678901", celular_personal: "5512345678", numero_nomina: "1001",
      fecha_nacimiento: "1990-01-01", fecha_ingreso: "2024-01-15", __errores: [],
    });
    expect(r[1].__errores).toHaveLength(2);
    expect(r[1].__errores[0]).toMatch(/^Fecha Nacimiento inválida: La fecha no existe en el calendario \(31\/02\/2020\)/);
    expect(r[1].__errores[1]).toMatch(/^Fecha Ingreso inválida: Formato de fecha no reconocido/);
  });

  it("respeta el número de fila del encabezado si la hoja no empieza en la fila 1", () => {
    const r = U.filasDesdeMatriz([ENC, ["Ana", "P", "", "", "", "", ""]], COLUMNAS, 3);
    expect(r[0]._fila).toBe(4);
  });

  it("mapea encabezados por etiqueta o clave sin importar mayúsculas y reconoce solo columnas conocidas", () => {
    const r = U.filasDesdeMatriz([["NOMBRE", "apellido_paterno", "Otra"], ["Ana", "P", "x"]], COLUMNAS);
    expect(r[0].nombre).toBe("Ana");
    expect(r[0].otra).toBeUndefined();
    expect(r[0].fecha_ingreso).toBe("");
  });

  it("sin datos devuelve []", () => {
    expect(U.filasDesdeMatriz([ENC], COLUMNAS)).toEqual([]);
    expect(U.filasDesdeMatriz([], COLUMNAS)).toEqual([]);
  });
});

describe("validación, omitidas y envío", () => {
  const matriz = [
    ENC,
    ["Ana", "Prueba", "", "", "", "15/01/2024", ""],
    ["", "SinNombre", "", "", "", "", ""],
    ["Beto", "Ficticio", "", "", "", "", "32/01/2024"],
    ["Carla", "Muestra", "", "", "", "", ""],
  ];
  const { enviar, omitidas } = U.separarFilas(U.filasDesdeMatriz(matriz, COLUMNAS), COLUMNAS);

  it("separa las que se envían de las omitidas con fila, nombre y motivo", () => {
    expect(enviar.map((f) => f._fila)).toEqual([2, 5]);
    expect(omitidas).toHaveLength(2);
    expect(omitidas[0]).toEqual({ fila: 3, nombre: "SinNombre", error: "Falta Nombre" });
    expect(omitidas[1].fila).toBe(4);
    expect(omitidas[1].error).toMatch(/Fecha Ingreso inválida/);
  });

  it("lo enviado lleva _fila y no lleva campos internos __", () => {
    expect(enviar[0]._fila).toBe(2);
    expect(enviar[0].fecha_nacimiento).toBe("2024-01-15");
    expect(Object.keys(enviar[0]).some((k) => k.startsWith("__"))).toBe(false);
  });
});

describe("lotes y resultados", () => {
  it("divide 1000 filas en lotes de 100 y suma los resultados", () => {
    const f = Array.from({ length: 1000 }, (_, i) => ({ _fila: i + 2 }));
    const lotes = U.dividirEnLotes(f, U.TAMANO_LOTE);
    expect(lotes).toHaveLength(10);
    expect(lotes.every((l) => l.length === 100)).toBe(true);
    expect(U.dividirEnLotes(f.slice(0, 250)).map((l) => l.length)).toEqual([100, 100, 50]);
    let acc = U.resultadoVacio();
    acc = U.sumarResultados(acc, { insertados: 90, duplicados: 5, errores: [{ fila: 3, error: "a" }], duplicados_detalle: [{ fila: 4, motivo: "m" }] });
    acc = U.sumarResultados(acc, { insertados: 10 });
    acc = U.sumarResultados(acc, undefined);
    expect(acc).toEqual({ insertados: 100, duplicados: 5, errores: [{ fila: 3, error: "a" }], duplicados_detalle: [{ fila: 4, motivo: "m" }] });
  });

  it("lee número y nombre tanto del formato nuevo como del antiguo (fila objeto)", () => {
    expect(U.numeroFilaDeError({ fila: 7, nombre: "X" })).toBe(7);
    expect(U.numeroFilaDeError({ fila: { _fila: 9, nombre: "Ana", apellido_paterno: "P" } })).toBe(9);
    expect(U.nombreDeError({ fila: { nombre: "Ana", apellido_paterno: "P" } })).toBe("Ana P");
    expect(U.numeroFilaDeError({ fila: null })).toBe("");
  });

  it("el CSV de errores lleva BOM UTF-8, escapa comillas y neutraliza fórmulas", () => {
    const csv = U.construirCsvResultado(
      [{ fila: 3, nombre: '=CMD("x")', error: 'Dice "hola", adiós' }, { fila: 5, nombre: "José Ñandú", error: "Falta Nombre" }],
      [{ fila: 8, nombre: "Ana", motivo: "CURP ya existe" }]
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lineas = csv.slice(1).trim().split("\r\n");
    expect(lineas[0]).toBe('"Tipo","Fila","Nombre","Motivo"');
    expect(lineas[1]).toBe('"Error","3","\'=CMD(""x"")","Dice ""hola"", adiós"');
    expect(lineas[2]).toBe('"Error","5","José Ñandú","Falta Nombre"');
    expect(lineas[3]).toBe('"Duplicado","8","Ana","CURP ya existe"');
  });
});

describe("flujo completo con un .xlsx real hasta el cuerpo enviado", () => {
  const XLSX = require("xlsx");

  // Misma lectura que ImportadorArchivo.parsearArchivo
  function leer(buf) {
    const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: true });
    return U.filasDesdeMatriz(matriz, COLUMNAS, XLSX.utils.decode_range(ws["!ref"]).s.r + 1);
  }

  it("fechas como serial numérico (celdas con formato de fecha), teléfonos y NSS como número", () => {
    const aoa = [ENC];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // fila 2: fechas como serial con formato dd/mm/yyyy; fila 3: serial con hora; fila 4: texto DD/MM/AAAA; fila 5 inválida
    XLSX.utils.sheet_add_aoa(ws, [
      ["Ana", "Prueba", 12345678901, 5512345678, 1001, 32874, 45305],
      ["Beto", "Ficticio", "", 5598765432, "", 25569.5, 45305.74958333333],
      ["Carla", "Muestra", "", "", "", "15/01/1985", "01-02-2024"],
      ["Dino", "Falso", "", "", "", "31/02/1990", 45305],
    ], { origin: "A2" });
    for (const celda of ["F2", "G2", "F3", "G3", "G5"]) ws[celda].z = "dd/mm/yyyy";
    ws["!ref"] = "A1:G5";
    const buf = XLSX.write({ SheetNames: ["H"], Sheets: { H: ws } }, { type: "buffer", bookType: "xlsx" });

    const { enviar, omitidas } = U.separarFilas(leer(buf), COLUMNAS);
    expect(enviar).toEqual([
      { _fila: 2, nombre: "Ana", apellido_paterno: "Prueba", nss: "12345678901", celular_personal: "5512345678", numero_nomina: "1001", fecha_nacimiento: "1990-01-01", fecha_ingreso: "2024-01-14" },
      { _fila: 3, nombre: "Beto", apellido_paterno: "Ficticio", nss: "", celular_personal: "5598765432", numero_nomina: "", fecha_nacimiento: "1970-01-01", fecha_ingreso: "2024-01-14" },
      { _fila: 4, nombre: "Carla", apellido_paterno: "Muestra", nss: "", celular_personal: "", numero_nomina: "", fecha_nacimiento: "1985-01-15", fecha_ingreso: "2024-02-01" },
    ]);
    expect(omitidas).toEqual([{ fila: 5, nombre: "Dino Falso", error: "Fecha Nacimiento inválida: La fecha no existe en el calendario (31/02/1990)" }]);
    // El cuerpo que se enviaría al backend:
    const cuerpo = JSON.stringify({ filas: enviar });
    expect(cuerpo).toContain('"fecha_ingreso":"2024-01-14"');
    expect(cuerpo).not.toMatch(/4530[0-9]\./);
    expect(cuerpo).not.toMatch(/e\+/);
  });

  it("celdas con tipo fecha (t:'d') llegan como Date y se normalizan", () => {
    const ws = XLSX.utils.aoa_to_sheet([ENC, ["Ana", "Prueba", "", "", "", new Date(Date.UTC(1990, 0, 1)), new Date(Date.UTC(2024, 0, 15))]], { cellDates: true });
    const buf = XLSX.write({ SheetNames: ["H"], Sheets: { H: ws } }, { type: "buffer", bookType: "xlsx", cellDates: true });
    const r = leer(buf);
    expect(r[0].__errores).toEqual([]);
    expect(r[0].fecha_nacimiento).toMatch(/^(1989-12-31|1990-01-01)$/); // sin zona fija: solo se exige un día válido
  });

  it("un CSV con fechas DD/MM/AAAA no se reinterpreta como mes/día de EE. UU.", () => {
    const csv = "Nombre,Apellido Paterno,Fecha Nacimiento,Fecha Ingreso\nAna,Prueba,05/01/1990,2024-03-04\nBeto,Ficticio,13/02/1991,\n";
    const wb = XLSX.read(Buffer.from(csv, "utf8"), { type: "array", cellDates: true, raw: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: true });
    const r = U.filasDesdeMatriz(matriz, COLUMNAS);
    expect(r[0].fecha_nacimiento).toBe("1990-01-05");
    expect(r[0].fecha_ingreso).toBe("2024-03-04");
    expect(r[1].fecha_nacimiento).toBe("1991-02-13");
    expect(r[1].__errores).toEqual([]);
  });

  it.each(ZONAS)("el mismo archivo da las mismas fechas en TZ=%s", (zona) => {
    const r = enZona(zona, `
      const ws = XLSX.utils.aoa_to_sheet([['Nombre','Apellido Paterno','Fecha Ingreso'], ['Ana','P',32874], ['Beto','F',45351]]);
      ws.C2.z = 'dd/mm/yyyy'; ws.C3.z = 'dd/mm/yyyy';
      const buf = XLSX.write({ SheetNames: ['H'], Sheets: { H: ws } }, { type: 'buffer', bookType: 'xlsx' });
      const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: true });
      const m = XLSX.utils.sheet_to_json(wb.Sheets.H, { header: 1, defval: '', raw: true, blankrows: true });
      return filasDesdeMatriz(m, [{clave:'nombre',etiqueta:'Nombre'},{clave:'apellido_paterno',etiqueta:'Apellido Paterno'},{clave:'fecha_ingreso',etiqueta:'Fecha Ingreso',tipo:'fecha'}]).map(f => [f._fila, f.fecha_ingreso]);
    `);
    expect(r).toEqual([[2, "1990-01-01"], [3, "2024-02-29"]]);
  });
});
