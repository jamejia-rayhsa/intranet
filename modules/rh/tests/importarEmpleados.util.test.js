// Pruebas de la carga masiva completa del expediente (utils puros del frontend, layout de columnas y paridad con el backend).
// Los archivos del frontend son ESM y Jest corre sin transpilar: se concatenan sus fuentes sin `export` ni `import`.
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const raiz = path.join(__dirname, "../..");
const leer = (...partes) => fs.readFileSync(path.join(raiz, ...partes), "utf8");
const sinModulos = (fuente) => fuente.replace(/^import\s[\s\S]*?from\s+'[^']+';?\s*$/gm, "").replace(/^export\s+/gm, "");
const nombresExportados = (fuente) => [...fuente.matchAll(/^export\s+(?:const|let|function)\s+(\w+)/gm)].map((m) => m[1]);

const fuentes = [
  ["portal/frontend/utils/importarFechas.js"],
  ["portal/frontend/utils/importarFilas.js"],
  ["rh/frontend/constants/catalogos.js"],
  ["rh/frontend/constants/importacionEmpleados.js"],
  ["rh/frontend/constants/importacionDepartamentos.js"],
].map(([r]) => leer(...r.split("/")));
const CODIGO = fuentes.map(sinModulos).join("\n");
const NOMBRES = fuentes.flatMap(nombresExportados);
const U = new Function(`${CODIGO}\nreturn { ${NOMBRES.join(", ")} };`)();

const backend = require("../backend/utils/importarEmpleados");
const catBack = require("../backend/utils/catalogosEmpleado");

const COL = U.COLUMNAS_EMPLEADOS;

describe("layout de columnas del expediente", () => {
  it("conserva las 17 columnas anteriores con la misma clave y etiqueta", () => {
    const antiguas = {
      nombre: "Nombre", apellido_paterno: "Apellido Paterno", apellido_materno: "Apellido Materno", curp: "CURP", rfc: "RFC",
      nss: "NSS", numero_nomina: "Número de Nómina", genero: "Género", estado_civil: "Estado Civil", escolaridad: "Escolaridad",
      tipo_contrato: "Tipo Contrato", fecha_nacimiento: "Fecha Nacimiento", fecha_ingreso: "Fecha Ingreso", puesto: "Puesto",
      departamento: "Departamento", correo_personal: "Correo Personal", celular_personal: "Celular Personal",
    };
    for (const [clave, etiqueta] of Object.entries(antiguas)) {
      expect(COL.find((c) => c.clave === clave)).toMatchObject({ etiqueta });
    }
  });

  it("marca como fecha todas las columnas de fecha y solo nombre y apellido paterno como requeridas", () => {
    expect(COL.filter((c) => c.tipo === "fecha").map((c) => c.clave).sort()).toEqual(
      ["fecha_baja", "fecha_imss", "fecha_ingreso", "fecha_nacimiento", "fecha_renovacion"]
    );
    expect(COL.filter((c) => c.requerido).map((c) => c.clave)).toEqual(["nombre", "apellido_paterno"]);
  });

  it("las claves del frontend son exactamente las que valida el backend (sin repetir)", () => {
    const front = COL.map((c) => c.clave);
    expect(new Set(front).size).toBe(front.length);
    const back = [...backend.CAMPOS_EMPLEADO.map((c) => c[0]), ...backend.CAMPOS_REFERENCIA.map((c) => c[0]), "jefe_curp"];
    expect([...front].sort()).toEqual([...back].sort());
    // Las fechas coinciden en ambos lados.
    expect([...backend.CAMPOS_FECHA].sort()).toEqual(COL.filter((c) => c.tipo === "fecha").map((c) => c.clave).sort());
  });

  it("cubre todos los campos editables del modelo del empleado (CAMPOS_PERMITIDOS) salvo ids", () => {
    const fuente = leer("rh", "backend", "models", "empleado.model.js");
    const lista = /const CAMPOS_PERMITIDOS = \[([\s\S]*?)\];/.exec(fuente)[1];
    const permitidos = [...lista.matchAll(/"(\w+)"/g)].map((m) => m[1]).filter((c) => !c.endsWith("_id"));
    const claves = COL.map((c) => c.clave);
    for (const campo of permitidos) expect(claves).toContain(campo);
    for (const extra of ["ubicacion", "jefe_nomina", "jefe_curp", "estatus", "fecha_baja", "motivo_baja"]) expect(claves).toContain(extra);
  });

  it("los catálogos del backend son idénticos a los del formulario (catalogos.js)", () => {
    expect(catBack.ESTADOS_MEXICO).toEqual(U.ESTADOS_MEXICO);
    expect(catBack.BANCOS_MEXICO).toEqual(U.BANCOS_MEXICO);
    expect(catBack.GENEROS).toEqual(U.GENEROS);
    expect(catBack.ESTADOS_CIVILES).toEqual(U.ESTADOS_CIVILES);
    expect(catBack.NIVELES_ESCOLARIDAD).toEqual(U.NIVELES_ESCOLARIDAD);
    expect(catBack.TIPOS_CONTRATO).toEqual(U.TIPOS_CONTRATO);
    expect(catBack.ESTATUS_EMPLEADO).toEqual(U.ESTATUS_IMPORTACION);
  });

  it("los ejemplos son válidos para el backend, sin advertencias y con el jefe apuntando a la primera fila", () => {
    for (const ej of U.FILAS_EJEMPLO_EMPLEADOS) {
      const r = backend.prepararFilaEmpleado({ ...ej, _fila: 2 });
      expect(r.error).toBeUndefined();
      expect(r.advertencias).toEqual([]);
    }
    expect(U.FILAS_EJEMPLO_EMPLEADOS[1].jefe_nomina).toBe(U.FILAS_EJEMPLO_EMPLEADOS[0].numero_nomina);
  });
});

describe("normalizarEncabezado y reconocimiento de columnas", () => {
  it("quita acentos, mayúsculas, espacios y puntuación", () => {
    expect(U.normalizarEncabezado(" No. Nómina ")).toBe("nonomina");
    expect(U.normalizarEncabezado("C.P.")).toBe("cp");
    expect(U.normalizarEncabezado(null)).toBe("");
  });

  it.each([
    ["Numero de Nomina", "numero_nomina"], ["No. Nómina", "numero_nomina"], ["Fecha de Nacimiento", "fecha_nacimiento"],
    ["Fecha nac.", "fecha_nacimiento"], ["Telefono celular", "celular_personal"], ["C.P.", "codigo_postal"],
    ["Estado de nacimiento", "estado_nacimiento"], ["JEFE (CURP)", "jefe_curp"], ["jefe (número de nómina)", "jefe_nomina"],
    ["ESTADO CIVIL", "estado_civil"], ["numero_nomina", "numero_nomina"], ["Ubicacion", "ubicacion"],
  ])("el encabezado %p se reconoce como %p", (encabezado, clave) => {
    const r = U.leerMatriz([["Nombre", "Apellido Paterno", encabezado], ["Ana", "P", "x"]], COL);
    expect(r.encabezados.reconocidas.map((c) => c.clave)).toContain(clave);
  });

  it("informa columnas ignoradas (incluida una repetida) y las requeridas que faltan", () => {
    const r = U.leerMatriz([["Nombre", "Color favorito", "CURP", "curp", "Horas"], ["Ana", "azul", "X", "Y", "8"]], COL);
    expect(r.encabezados.ignoradas).toEqual(["Color favorito", "curp (repetida)", "Horas"]);
    expect(r.encabezados.faltantes).toEqual(["Apellido Paterno"]);
    expect(r.filas[0].curp).toBe("X");
    expect(r.filas[0].color_favorito).toBeUndefined();
  });

  it("un archivo antiguo de 17 columnas se lee completo, sin ignoradas ni faltantes", () => {
    const antiguo = ["Nombre", "Apellido Paterno", "Apellido Materno", "CURP", "RFC", "NSS", "Número de Nómina", "Género", "Estado Civil",
      "Escolaridad", "Tipo Contrato", "Fecha Nacimiento", "Fecha Ingreso", "Puesto", "Departamento", "Correo Personal", "Celular Personal"];
    const r = U.leerMatriz([antiguo, ["Ana", "Prueba", ...Array(15).fill("")]], COL);
    expect(r.encabezados.reconocidas).toHaveLength(17);
    expect(r.encabezados.ignoradas).toEqual([]);
    expect(r.encabezados.faltantes).toEqual([]);
  });

  it("normaliza fechas de todas las columnas de fecha (IMSS, renovación, baja)", () => {
    const m = [["Nombre", "Apellido Paterno", "Fecha de alta IMSS", "Fecha de renovación", "Fecha de baja"],
      ["Ana", "P", new Date(2024, 0, 15), "31/12/2025", "2026-02-30"]];
    const f = U.leerMatriz(m, COL).filas[0];
    expect(f.fecha_imss).toBe("2024-01-15");
    expect(f.fecha_renovacion).toBe("2025-12-31");
    expect(f.__errores).toHaveLength(1);
    expect(f.__errores[0]).toMatch(/^Fecha de baja inválida/);
  });
});

describe("lectura de CSV (UTF-8, Windows-1252, separadores)", () => {
  const texto = "Nombre;Apellido Paterno;Género;Fecha Nacimiento\nJosé;Muñoz Peña;Femenino;31/01/1990\n";
  const utf8 = Buffer.from(texto, "utf8");
  const win1252 = Buffer.from(texto, "latin1"); // para estos caracteres latin1 == windows-1252

  it("UTF-8 con y sin BOM", () => {
    expect(U.decodificarTextoCsv(utf8)).toEqual({ texto, codificacion: "utf-8" });
    expect(U.decodificarTextoCsv(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8]))).toEqual({ texto, codificacion: "utf-8" });
  });

  it("si no es UTF-8 válido cae a Windows-1252 y conserva los acentos", () => {
    const r = U.decodificarTextoCsv(win1252);
    expect(r.codificacion).toBe("windows-1252");
    expect(r.texto).toBe(texto);
    const euro = U.decodificarTextoCsv(Buffer.from([0x80, 0x20, 0xe9])); // € é en Windows-1252
    expect(euro.texto).toBe("€ é");
  });

  it.each([[";"], [","]])("separador %p: el CSV decodificado se lee con acentos y fechas", (sep) => {
    const csv = texto.replace(/;/g, sep).replace("Muñoz Peña", sep === "," ? '"Muñoz Peña"' : "Muñoz Peña");
    const wb = XLSX.read(U.decodificarTextoCsv(Buffer.from(csv, "latin1")).texto, { type: "string", raw: true });
    const matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true, blankrows: true });
    const r = U.leerMatriz(matriz, COL);
    expect(r.filas[0]).toMatchObject({ nombre: "José", apellido_paterno: "Muñoz Peña", genero: "Femenino", fecha_nacimiento: "1990-01-31" });
  });

  it("conserva los ceros a la izquierda de un CSV (texto, no número)", () => {
    const csv = "Nombre,Apellido Paterno,NSS,Código postal\nAna,P,01234567890,06000\n";
    const wb = XLSX.read(U.decodificarTextoCsv(Buffer.from(csv)).texto, { type: "string", raw: true });
    const matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true, blankrows: true });
    expect(U.leerMatriz(matriz, COL).filas[0]).toMatchObject({ nss: "01234567890", codigo_postal: "06000" });
  });
});

describe("resultados: actualizados, advertencias y jefes", () => {
  it("suma actualizados, sin cambios, advertencias, detalle y pares de jefes; respeta los topes", () => {
    let acc = U.resultadoVacio();
    acc = U.sumarResultados(acc, {
      insertados: 1, actualizados: 2, sin_cambios: 3, actualizados_detalle: [{ fila: 2, nombre: "A", campos: 4 }],
      advertencias: [{ fila: 2, campo: "curp", valor_recibido: null, motivo: "formato inválido" }], advertencias_omitidas: 1,
      jefes_pendientes: [{ empleado_id: 1, fila: 2, jefe_nomina: "N1", jefe_curp: "" }],
      sin_catalogo: { ubicaciones: [{ nombre: "Planta", filas: 2 }] },
    });
    acc = U.sumarResultados(acc, { actualizados: 1, jefes_pendientes: [{ empleado_id: 2, fila: 3, jefe_nomina: "", jefe_curp: "C" }] });
    expect(acc).toMatchObject({ insertados: 1, actualizados: 3, sin_cambios: 3, advertencias_omitidas: 1 });
    expect(acc.jefes_pendientes).toHaveLength(2);
    expect(acc.sin_catalogo.ubicaciones).toEqual([{ nombre: "Planta", filas: 2 }]);
    const muchas = Array.from({ length: 2500 }, (_, i) => ({ fila: i, campo: "x", motivo: "m" }));
    const tope = U.sumarResultados(U.resultadoVacio(), { advertencias: muchas });
    expect(tope.advertencias).toHaveLength(U.MAX_ADVERTENCIAS);
    expect(tope.advertencias_omitidas).toBe(500);
  });

  it("sumarJefes acumula los conteos de varias peticiones", () => {
    let j = U.sumarJefes(null, { asignados: 3, no_encontrados: 1, ciclos: 2 });
    j = U.sumarJefes(j, { asignados: 2, sin_cambios: 1, conflictos: 1 });
    expect(j).toEqual({ asignados: 5, sin_cambios: 1, pendientes: 0, no_encontrados: 1, ciclos: 2, conflictos: 1 });
  });

  it("el CSV incluye advertencias (con etiqueta del campo) y actualizados (solo el número de campos)", () => {
    const csv = U.construirCsvResultado([], [], null, {
      advertencias: [{ fila: 4, nombre: "Ana P", campo: "curp", valor_recibido: null, motivo: "formato inválido" },
        { fila: 5, nombre: "Beto", campo: "codigo_postal", valor_recibido: "ABC", motivo: "código postal inválido" }],
      actualizados_detalle: [{ fila: 6, nombre: "Carla", campos: 1 }, { fila: 7, nombre: "Dora", campos: 12 }],
      etiquetas: { curp: "CURP", codigo_postal: "Código postal" },
    }).slice(1).trim().split("\r\n");
    expect(csv).toContain('"Advertencia","4","Ana P","CURP","","formato inválido"');
    expect(csv).toContain('"Advertencia","5","Beto","Código postal","ABC","código postal inválido"');
    expect(csv).toContain('"Actualizado","6","Carla","","","1 campo modificado"');
    expect(csv).toContain('"Actualizado","7","Dora","","","12 campos modificados"');
  });
});

describe("hojas de la plantilla", () => {
  const catalogos = {
    puestos: [{ nombre: "Analista" }, { nombre: "Auxiliar" }], departamentos: [{ nombre: "Sistemas" }], ubicaciones: [{ nombre: "Matriz" }, { nombre: "Planta" }, { nombre: "Bodega" }],
  };
  const hojas = U.hojasPlantillaEmpleados(catalogos);

  it("trae las 3 hojas, encabezados en el orden del expediente y 2 filas de ejemplo", () => {
    expect(Object.keys(hojas)).toEqual(["Empleados", "Instrucciones", "Catálogos"]);
    expect(hojas.Empleados).toHaveLength(3);
    expect(hojas.Empleados[0]).toEqual(COL.map((c) => c.etiqueta));
    expect(hojas.Empleados[1]).toHaveLength(COL.length);
    expect(hojas.Empleados[1][0]).toBe("Ana");
  });

  it("los encabezados de la plantilla se leen de vuelta sin ignoradas ni faltantes", () => {
    const r = U.leerMatriz(hojas.Empleados, COL);
    expect(r.encabezados.reconocidas).toHaveLength(COL.length);
    expect(r.encabezados.ignoradas).toEqual([]);
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0].__errores).toEqual([]);
  });

  it("las instrucciones cubren obligatorios, fechas, ceros, modo actualizar y jefes", () => {
    const t = hojas.Instrucciones.map((f) => f[0]).join("\n");
    for (const palabra of ["Obligatorio", "AAAA-MM-DD", "Ceros a la izquierda", "Actualizarlos con los datos del archivo", "Jefe (número de nómina)", "Jefe (CURP)", "no borra"]) {
      expect(t.toLowerCase()).toContain(palabra.toLowerCase().replace("no borra", "nunca borra"));
    }
  });

  it("el catálogo trae puestos, departamentos, ubicaciones y los valores permitidos", () => {
    const [enc, ...filas] = hojas["Catálogos"];
    expect(enc).toEqual(["Puestos", "Departamentos", "Ubicaciones", "Género", "Estado Civil", "Escolaridad", "Tipo Contrato", "Estatus", "Estados", "Bancos"]);
    const columna = (i) => filas.map((f) => f[i]).filter(Boolean);
    expect(columna(0)).toEqual(["Analista", "Auxiliar"]);
    expect(columna(2)).toEqual(["Matriz", "Planta", "Bodega"]);
    expect(columna(7)).toEqual(["activo", "baja", "suspendido"]);
    expect(columna(8)).toHaveLength(32);
    expect(columna(9)).toHaveLength(23);
  });

  it("empleados actuales en el mismo formato: jefe por nómina (o CURP), fechas AAAA-MM-DD", () => {
    const h = U.hojaEmpleadosActuales([
      { id: 1, nombre: "Ana", apellido_paterno: "P", numero_nomina: "N1", fecha_ingreso: "2024-01-15T06:00:00.000Z", jefe_inmediato_id: null },
      { id: 2, nombre: "Beto", apellido_paterno: "Q", numero_nomina: "N2", jefe_inmediato_id: 1 },
      { id: 3, nombre: "Carla", apellido_paterno: "R", curp: null, jefe_inmediato_id: 4 },
      { id: 4, nombre: "Dora", apellido_paterno: "S", curp: "SADO900101MDFRRR01", jefe_inmediato_id: null },
    ]).Empleados;
    const idx = (clave) => COL.findIndex((c) => c.clave === clave);
    expect(h[1][idx("fecha_ingreso")]).toBe("2024-01-15");
    expect(h[2][idx("jefe_nomina")]).toBe("N1");
    expect(h[3][idx("jefe_curp")]).toBe("SADO900101MDFRRR01");
    expect(h[3][idx("jefe_nomina")]).toBe("");
    expect(h[1][idx("curp")]).toBe("");
  });
});

describe("lotes: sin celdas vacías y tope de bytes", () => {
  it("separarFilas no envía las celdas vacías (el backend trata la clave ausente como vacía)", () => {
    const filas = U.leerMatriz([["Nombre", "Apellido Paterno", "CURP", "Calle"], ["Ana", "P", "", "Calle 1"]], COL).filas;
    const { enviar } = U.separarFilas(filas, COL);
    expect(enviar).toEqual([{ _fila: 2, nombre: "Ana", apellido_paterno: "P", calle: "Calle 1" }]);
  });

  it("dividirEnLotes parte por 100 filas y también por bytes (filas muy pesadas no producen un 413)", () => {
    const pesadas = Array.from({ length: 30 }, (_, i) => ({ _fila: i, calle: "x".repeat(10000) }));
    const lotes = U.dividirEnLotes(pesadas);
    expect(lotes.length).toBeGreaterThan(3);
    for (const l of lotes) expect(Buffer.byteLength(JSON.stringify(l))).toBeLessThan(U.MAX_BYTES_LOTE + 10100);
    expect(lotes.flat()).toHaveLength(30);
    expect(U.dividirEnLotes(Array.from({ length: 250 }, (_, i) => ({ _fila: i }))).map((l) => l.length)).toEqual([100, 100, 50]);
    expect(U.dividirEnLotes([], 100)).toEqual([]);
  });

  it("una fila de 40+ columnas llenas de ~1 kb: 100 filas caben en el parser global de 100 kb", () => {
    const fila = (i) => ({ _fila: i, ...Object.fromEntries(COL.map((c) => [c.clave, c.tipo === "fecha" ? "2024-01-15" : "valor de prueba ficticio"])) });
    const lote = U.dividirEnLotes(Array.from({ length: 100 }, (_, i) => fila(i)))[0];
    expect(Buffer.byteLength(JSON.stringify({ filas: lote, modo: "actualizar" }))).toBeLessThan(100 * 1024);
  });
});

describe("layout de departamentos", () => {
  const D = U.COLUMNAS_DEPARTAMENTOS;

  it("conserva nombre (obligatorio), descripción y área y suma cupo, turno y vigencia (fecha)", () => {
    expect(D.map((c) => c.clave)).toEqual(["nombre", "area", "descripcion", "cupo_vacaciones", "turno", "turno_vigente_desde"]);
    expect(D.filter((c) => c.requerido).map((c) => c.clave)).toEqual(["nombre"]);
    expect(D.find((c) => c.clave === "turno_vigente_desde").tipo).toBe("fecha");
  });

  it("reconoce alias y normaliza la fecha de vigencia", () => {
    const r = U.leerMatriz([["Departamento", "Cupo", "Turno asignado", "Vigente desde", "Otra"], ["Ventas", 3, "Rayhsa", "01/11/2026", "x"]], D);
    expect(r.encabezados.ignoradas).toEqual(["Otra"]);
    expect(r.filas[0]).toMatchObject({ nombre: "Ventas", cupo_vacaciones: "3", turno: "Rayhsa", turno_vigente_desde: "2026-11-01" });
  });

  it("resumenHorario agrupa días consecutivos con el mismo horario", () => {
    const dia = (n, e, s) => ({ dia_semana: n, laborable: !!e, hora_entrada: e || null, hora_salida: s || null });
    const t = { dias: [dia(1, "08:00", "17:00"), dia(2, "08:00", "17:00"), dia(3, "08:00", "17:00"), dia(4, "08:00", "17:00"), dia(5, "08:00", "17:00"), dia(6, "08:00", "13:00"), dia(7)] };
    expect(U.resumenHorario(t)).toBe("Lun-Vie 08:00-17:00; Sáb 08:00-13:00");
    expect(U.resumenHorario({ dias: [dia(1, "08:00", "17:00"), dia(3, "08:00", "17:00")] })).toBe("Lun 08:00-17:00; Mié 08:00-17:00");
    expect(U.resumenHorario({ dias: [] })).toBe("Sin días laborables");
    expect(U.resumenHorario(null)).toBe("Sin días laborables");
  });

  it("la plantilla trae Departamentos (2 ejemplos), Instrucciones y Catálogos con solo los turnos ACTIVOS y las áreas", () => {
    const h = U.hojasPlantillaDepartamentos({
      turnos: [{ nombre: "Rayhsa", activo: true, dias: [{ dia_semana: 1, laborable: true, hora_entrada: "08:00", hora_salida: "17:00" }] }, { nombre: "Viejo", activo: false }],
      areas: [{ nombre: "Administración" }, { nombre: "Operaciones" }],
    });
    expect(Object.keys(h)).toEqual(["Departamentos", "Instrucciones", "Catálogos"]);
    expect(h.Departamentos[0]).toEqual(D.map((c) => c.etiqueta));
    expect(h.Departamentos).toHaveLength(3);
    expect(h["Catálogos"]).toEqual([["Turnos activos", "Horario", "Áreas"], ["Rayhsa", "Lun 08:00-17:00", "Administración"], ["", "", "Operaciones"]]);
    expect(h.Instrucciones.map((f) => f[0]).join("\n")).toMatch(/NUNCA borra/);
    const leida = U.leerMatriz(h.Departamentos, D);
    expect(leida.encabezados.ignoradas).toEqual([]);
    expect(leida.filas).toHaveLength(2);
    expect(leida.filas[0].__errores).toEqual([]);
  });

  it("las claves del layout coinciden con las que valida el backend", () => {
    const { prepararFilaDepartamento } = require("../backend/utils/importarDepartamentos");
    const fila = Object.fromEntries(D.map((c) => [c.clave, c.tipo === "fecha" ? "2026-11-01" : "1"]));
    const r = prepararFilaDepartamento({ ...fila, nombre: "A", cupo_vacaciones: "2", turno: "T", area: "X" });
    expect(r.fila).toMatchObject({ nombre: "A", cupo: 2, turno: "T", area: "X", turno_desde: "2026-11-01" });
    expect(r.advertencias).toEqual([]);
  });
});
