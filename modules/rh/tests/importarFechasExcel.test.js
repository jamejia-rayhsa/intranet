// Fechas de celdas de Excel: se leen como serial EXACTO (cellDates:false + hojaAMatriz) y NO pasan por objetos Date con la
// zona horaria local (con Date, fechas de 1939-1950 se desplazaban un día en México por el horario histórico).
// Los utils son ESM: se concatenan sus fuentes sin export/import (mismo cargador que importarEmpleados.util.test.js).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dir = path.join(__dirname, "../../portal/frontend/utils");
const fuente = ["importarFechas.js", "importarFilas.js", "hojaAMatriz.js"]
  .map((n) => fs.readFileSync(path.join(dir, n), "utf8").replace(/^import\s.*$/gm, "").replace(/^export\s+/gm, ""))
  .join("\n");
const nombres = [...fuente.matchAll(/^(?:const|let|(?:async\s+)?function)\s+(\w+)/gm)].map((m) => m[1]);
const U = new Function("XLSX", `${fuente}\nreturn { ${nombres.join(", ")} };`)(require("xlsx"));

const COL = [
  { clave: "nombre", etiqueta: "Nombre", requerido: true },
  { clave: "apellido_paterno", etiqueta: "Apellido Paterno", requerido: true },
  { clave: "fecha_nacimiento", etiqueta: "Fecha Nacimiento", tipo: "fecha" },
  { clave: "calle", etiqueta: "Calle" },
  { clave: "clabe", etiqueta: "CLABE" },
];

// Programa que corre en un proceso hijo con TZ fijo: escribe un .xlsx con celdas numéricas con formato de fecha, lo lee como
// lo hace el importador y compara con el día calendario esperado.
const PROGRAMA = `
${fuente}
const XLSX = require(${JSON.stringify(require.resolve("xlsx"))});
const serialDe = (y, m, d) => { const t = Date.UTC(y, m - 1, d); return Math.round((t - Date.UTC(1899, 11, y === 1900 && m <= 2 ? 31 : 30)) / 86400000); };
const casos = [];
const agregar = (y, m, d) => casos.push([y, m, d]);
for (let t = Date.UTC(1939, 0, 1); t <= Date.UTC(1950, 11, 31); t += 86400000) { const x = new Date(t); agregar(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); }
for (let y = 1900; y <= 1927; y++) { agregar(y, 1, 1); agregar(y, 6, 15); agregar(y, 12, 31); if (y % 4 === 0 && y !== 1900) agregar(y, 2, 29); }
agregar(1900, 1, 1); agregar(1900, 2, 28); agregar(1900, 3, 1); agregar(2000, 2, 29); agregar(2024, 2, 29); agregar(2100, 12, 31);
const filas = [["Nombre", "Apellido Paterno", "Fecha Nacimiento", "Calle"]];
casos.forEach(([y, m, d]) => filas.push(["N", "A", null, ""]));
const ws = XLSX.utils.aoa_to_sheet(filas);
casos.forEach(([y, m, d], i) => { ws["C" + (i + 2)] = { t: "n", v: serialDe(y, m, d), z: "dd/mm/yyyy" }; });
const buf = XLSX.write({ SheetNames: ["H"], Sheets: { H: ws } }, { type: "buffer", bookType: "xlsx", cellStyles: true });
const wb = XLSX.read(buf, { type: "buffer", cellDates: false, cellNF: true, raw: true });
const matriz = hojaAMatriz(XLSX, wb.Sheets.H);
const r = leerMatriz(matriz, [{clave:'nombre',etiqueta:'Nombre',requerido:true},{clave:'apellido_paterno',etiqueta:'Apellido Paterno',requerido:true},{clave:'fecha_nacimiento',etiqueta:'Fecha Nacimiento',tipo:'fecha'},{clave:'calle',etiqueta:'Calle'}]);
const mal = [];
r.filas.forEach((f, i) => { const [y, m, d] = casos[i]; const esp = y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); if (f.fecha_nacimiento !== esp || f.__errores.length) mal.push([esp, f.fecha_nacimiento, f.__errores]); });
// Contraste: con Date local (cellDates:true) estas zonas SÍ se desplazan
const wbD = XLSX.read(buf, { type: "buffer", cellDates: true, cellNF: true, raw: true });
const conDate = XLSX.utils.sheet_to_json(wbD.Sheets.H, { header: 1, raw: true, blankrows: true });
let desplazadasConDate = 0;
conDate.slice(1).forEach((fila, i) => { const [y, m, d] = casos[i]; const v = fila[2]; if (v instanceof Date && (v.getFullYear() !== y || v.getMonth() + 1 !== m || v.getDate() !== d)) desplazadasConDate++; });
console.log(JSON.stringify({ total: casos.length, mal: mal.slice(0, 5), nMal: mal.length, desplazadasConDate }));
`;

function enZona(zona) {
  return JSON.parse(execFileSync(process.execPath, ["-e", PROGRAMA], { env: { ...process.env, TZ: zona }, encoding: "utf8", maxBuffer: 1 << 26 }));
}

describe("fechas de Excel como serial exacto (sin Date local)", () => {
  it.each(["America/Mexico_City", "UTC", "Pacific/Auckland"])("TZ=%s: 1939-1950 día por día, 1900-1927, 29-feb y bordes salen exactos", (zona) => {
    const r = enZona(zona);
    expect(r.total).toBeGreaterThan(4400);
    expect(r.mal).toEqual([]);
    expect(r.nMal).toBe(0);
  });

  it("contraste: con objetos Date (cellDates:true) alguna zona SÍ desplaza fechas históricas (por eso ya no se usa)", () => {
    const desplazadas = ["America/Mexico_City", "UTC", "Pacific/Auckland"].map((z) => enZona(z).desplazadasConDate);
    expect(desplazadas.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("serial 60 (29-feb-1900 inexistente) y fuera de rango se rechazan; un número SIN formato de fecha de 4 dígitos es 'fecha incompleta'", () => {
    expect(U.normalizarFecha({ serialExcel: 60 }).error).toMatch(/29 de febrero de 1900/);
    expect(U.normalizarFecha({ serialExcel: 0 }).error).toMatch(/fuera de rango/);
    expect(U.normalizarFecha({ serialExcel: 1 })).toEqual({ valor: "1900-01-01" });
    expect(U.normalizarFecha({ serialExcel: 45305.9 })).toEqual({ valor: "2024-01-14" });
    expect(U.normalizarFecha(1990).error).toMatch(/incompleta/); // celda numérica sin formato de fecha: un año suelto
    expect(U.normalizarFecha("45305")).toEqual({ valor: "2024-01-14" }); // texto: sin cambios
    expect(U.normalizarFecha("31/01/1990")).toEqual({ valor: "1990-01-31" });
  });

  it("hojaAMatriz: solo las celdas NUMÉRICAS con formato de fecha son {serialExcel}; texto, números y vacíos quedan como estaban", () => {
    const XLSX = require("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["Nombre", "Apellido Paterno", "Fecha Nacimiento", "Calle"], ["Ana", "P", 0, 123]]);
    ws.C2 = { t: "n", v: 14611, z: "yyyy-mm-dd" };
    ws.D3 = { t: "s", v: "texto" };
    ws["!ref"] = "A1:E3";
    const m = U.hojaAMatriz(XLSX, ws);
    expect(m[1][2]).toEqual({ serialExcel: 14611 });
    expect(m[1][3]).toBe(123);
    expect(m[2]).toEqual(["", "", "", "texto", ""]);
    expect(U.hojaAMatriz(XLSX, undefined)).toEqual([]);
    expect(U.leerMatriz(m, COL).filas[0].fecha_nacimiento).toBe("1940-01-01");
  });

  it("una celda con formato de fecha en una columna que NO es de fecha se convierte a AAAA-MM-DD (no a un número)", () => {
    const m = [["Nombre", "Apellido Paterno", "Calle"], ["Ana", "P", { serialExcel: 45305 }]];
    expect(U.leerMatriz(m, COL).filas[0].calle).toBe("2024-01-14");
  });

  it("F-IE-4: número de 16+ dígitos en una columna que no es de fecha se marca en _precision (la CLABE pegada como número)", () => {
    const m = [["Nombre", "Apellido Paterno", "CLABE", "Calle"], ["Ana", "P", 123456789012345680, 99999999999999], ["Beto", "Q", "012345678901234567", 1e15]];
    const f = U.leerMatriz(m, COL).filas;
    expect(f[0]._precision).toEqual(["clabe"]);
    expect(f[1]._precision).toEqual(["calle"]);
    expect(U.leerMatriz([["Nombre", "Apellido Paterno", "Calle"], ["Ana", "P", 99999999999999]], COL).filas[0]._precision).toBeUndefined();
    expect(U.separarFilas(f, COL).enviar[0]._precision).toEqual(["clabe"]); // sale hacia el servidor
  });

  it("R-1: libro con sistema de fechas 1904: el serial se convierte con la época correcta (1462 -> 1908-01-02); el libro normal no cambia", () => {
    const XLSX = require("xlsx");
    const construir = (date1904) => {
      const ws = XLSX.utils.aoa_to_sheet([["Nombre", "Apellido Paterno", "Fecha Nacimiento"], ["Ana", "P", null], ["Beto", "Q", null]]);
      ws.C2 = { t: "n", v: 1462, z: "dd/mm/yyyy" };
      ws.C3 = { t: "n", v: 0, z: "dd/mm/yyyy" };
      const wb = { SheetNames: ["H"], Sheets: { H: ws } };
      if (date1904) wb.Workbook = { WBProps: { date1904: true } };
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
      const leido = XLSX.read(buf, { type: "buffer", cellDates: false, cellNF: true, raw: true });
      return { leido, filas: U.leerMatriz(U.hojaAMatriz(XLSX, leido.Sheets.H, U.libroEs1904(leido)), COL).filas };
    };
    const l1904 = construir(true);
    expect(U.libroEs1904(l1904.leido)).toBe(true);
    expect(l1904.filas.map((f) => f.fecha_nacimiento)).toEqual(["1908-01-02", "1904-01-01"]);
    const l1900 = construir(false);
    expect(U.libroEs1904(l1900.leido)).toBe(false);
    expect(l1900.filas[0].fecha_nacimiento).toBe("1904-01-01"); // el mismo serial 1462 en el sistema 1900 (y 0 no es fecha válida)
    expect(l1900.filas[1].__errores[0]).toMatch(/fuera de rango/);
    expect(U.libroEs1904(undefined)).toBe(false);
    expect(U.libroEs1904({ Workbook: { WBProps: {} } })).toBe(false);
    expect(U.libroEs1904({ Workbook: { WBProps: { date1904: "1" } } })).toBe(true);
  });

  it("R-7: serial desbordado o NaN = 'fuera de rango', nunca 'NaN-NaN-NaN'", () => {
    for (const n of [1e15, 1e20, 2958466, Number.MAX_SAFE_INTEGER]) {
      const r = U.normalizarFecha({ serialExcel: n });
      expect(r.valor).toBe("");
      expect(r.error).toMatch(/fuera de rango/);
    }
    expect(U.normalizarFecha({ serialExcel: NaN }).error).toBeTruthy();
    expect(U.normalizarFecha({ serialExcel: 2958465 }).error).toMatch(/entre 1900 y 2100/); // 9999: fuera del rango 1900-2100
    expect(U.normalizarFecha(1e15).valor).toBe("");
    expect(U.fechaDeSerialExcel(1e20).valor).not.toMatch(/NaN/);
  });
});
