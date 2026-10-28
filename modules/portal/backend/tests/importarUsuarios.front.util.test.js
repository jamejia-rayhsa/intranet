// Utils puros del frontend de "Importar usuarios" (se evalúa el fuente real con esbuild) y estructura de las pantallas.
const fs = require("fs");
const path = require("path");
const { cargarUtilEsm } = require("../../../rh/tests/cargarUtilEsm");

const frontend = path.join(__dirname, "../../frontend");
const U = cargarUtilEsm("importarUsuarios.js", path.join(frontend, "utils"));
const leer = (...p) => fs.readFileSync(path.join(frontend, ...p), "utf8");

describe("topes del archivo (200 filas y 1 MB)", () => {
  it("los valores son los de la decisión y se los pasa el diálogo a ImportadorArchivo, que valida antes de la vista previa", () => {
    expect(U.MAX_FILAS_USUARIOS).toBe(200);
    expect(U.MAX_BYTES_ARCHIVO_USUARIOS).toBe(1048576);
    expect(U.validarLimitesArchivo).toBeUndefined(); // sin copias muertas de la regla: ImportadorArchivo es la única
  });
});

describe("plantilla", () => {
  it("columnas: correo, nombre, apellido y el identificador (nómina o CURP); SIN columna de rol", () => {
    expect(U.COLUMNAS_USUARIOS.map((c) => c.clave)).toEqual(["correo", "nombre", "apellido", "numero_nomina", "curp"]);
    expect(U.COLUMNAS_USUARIOS.some((c) => /rol/i.test(c.clave) || /rol/i.test(c.etiqueta))).toBe(false);
    expect(U.COLUMNAS_USUARIOS.filter((c) => c.requerido).map((c) => c.clave)).toEqual(["correo", "nombre", "apellido"]);
  });
  it("los ejemplos son ficticios y del dominio permitido", () => {
    expect(U.FILAS_EJEMPLO_USUARIOS.length).toBeGreaterThan(0);
    for (const f of U.FILAS_EJEMPLO_USUARIOS) {
      expect(f.correo.endsWith(U.DOMINIO_USUARIOS)).toBe(true);
      expect(Boolean(f.numero_nomina) || Boolean(f.curp)).toBe(true);
    }
    expect(U.DOMINIO_USUARIOS).toBe("@rayhsa.com.mx");
  });
  it("el aviso dice el rol, el alcance del vínculo y el dominio", () => {
    for (const palabra of ["rh_empleado", "Microsoft", "sin contraseña", "asistencia", "expediente", "recibos de nómina", "@rayhsa.com.mx", "se omite"]) {
      expect(U.AVISO_IMPORTACION_USUARIOS).toContain(palabra);
    }
  });
});

describe("puedeImportarUsuarios", () => {
  it("solo super_admin", () => {
    expect(U.puedeImportarUsuarios({ rol_nombre: "super_admin" })).toBe(true);
    // forma real de GET /auth/perfil
    expect(U.puedeImportarUsuarios({ roles: ["super_admin"] })).toBe(true);
    expect(U.puedeImportarUsuarios({ roles: ["portal_admin"] })).toBe(false);
    expect(U.puedeImportarUsuarios({ roles: "super_admin" })).toBe(false);
    expect(U.puedeImportarUsuarios({ roles: [] })).toBe(false);
    for (const rol of ["portal_admin", "rh_admin", "rh_empleado", null, undefined]) expect(U.puedeImportarUsuarios({ rol_nombre: rol })).toBe(false);
    expect(U.puedeImportarUsuarios(null)).toBe(false);
    expect(U.puedeImportarUsuarios(undefined)).toBe(false);
  });
});

describe("resumirVerificacion y textos de la vista previa", () => {
  const filas = [{ estado: "crear" }, { estado: "crear" }, { estado: "omitir" }, { estado: "error" }, { estado: "otra-cosa" }, null];
  it("cuenta por estado y lo desconocido cuenta como error (falla cerrada)", () => {
    expect(U.resumirVerificacion(filas)).toEqual({ total: 6, crear: 2, omitir: 1, error: 3 });
    expect(U.resumirVerificacion(undefined)).toEqual({ total: 0, crear: 0, omitir: 0, error: 0 });
  });
  it("texto del botón de aplicar", () => {
    expect(U.textoBotonAplicar({ crear: 0 })).toBe("No hay cuentas por crear");
    expect(U.textoBotonAplicar({ crear: 1 })).toBe("Crear 1 cuenta");
    expect(U.textoBotonAplicar({ crear: 5 })).toBe("Crear 5 cuentas");
    expect(U.textoBotonAplicar(null)).toBe("No hay cuentas por crear");
  });
  it("detalle: motivo, empleado que se vinculará y avisos", () => {
    expect(U.detalleFilaVerificacion({ estado: "error", motivo: "Dominio" })).toBe("Dominio");
    expect(U.detalleFilaVerificacion({ estado: "crear", motivo: "", empleado: { nombre: "Ana P" }, avisos: ["Nombre distinto"] })).toBe("Se vinculará con Ana P · Aviso: Nombre distinto");
    expect(U.detalleFilaVerificacion({ estado: "crear", motivo: "" })).toBe("");
  });
  it("etiquetas de resultado propias de la importación de cuentas", () => {
    expect(U.ETIQUETAS_RESULTADO_USUARIOS.insertados).toBe("Cuentas creadas");
    expect(U.ETIQUETAS_ESTADO_USUARIOS).toEqual({ crear: "Se creará", omitir: "Se omitirá", error: "Error" });
  });
});

describe("filasParaServidor", () => {
  it("envía solo las columnas del archivo (sin __errores ni campos de más) y conserva _fila y _precision", () => {
    const r = U.filasParaServidor([{ _fila: 3, __errores: ["x"], correo: "a@rayhsa.com.mx", nombre: "A", apellido: "B", numero_nomina: "", curp: "X", rol: "super_admin", _precision: ["curp"] }]);
    expect(r).toEqual([{ _fila: 3, correo: "a@rayhsa.com.mx", nombre: "A", apellido: "B", curp: "X", _precision: ["curp"] }]);
  });
  it("no envía una columna de rol aunque venga en la fila", () => {
    expect(JSON.stringify(U.filasParaServidor([{ _fila: 2, correo: "a@rayhsa.com.mx", nombre: "A", apellido: "B", rol: "super_admin", rol_id: 1 }]))).not.toMatch(/rol/);
  });
  it("entrada no válida da lista vacía", () => {
    expect(U.filasParaServidor(undefined)).toEqual([]);
  });
  it("adjunta la huella de la vista previa por número de fila (y solo si existe)", () => {
    const huellas = new Map([[2, "123.abc"]]);
    const r = U.filasParaServidor([{ _fila: 2, correo: "a@rayhsa.com.mx", nombre: "A", apellido: "B" }, { _fila: 3, correo: "b@rayhsa.com.mx", nombre: "A", apellido: "B" }], huellas);
    expect(r[0]._huella).toBe("123.abc");
    expect(r[1]).not.toHaveProperty("_huella");
  });
  it("huellasDeVerificacion lee solo las huellas de texto de la respuesta del servidor", () => {
    const m = U.huellasDeVerificacion({ filas: [{ fila: 2, huella: "1.a" }, { fila: 3 }, { fila: 4, huella: 5 }, null] });
    expect([...m.entries()]).toEqual([[2, "1.a"]]);
    expect(U.huellasDeVerificacion(undefined).size).toBe(0);
  });
});

describe("estructura de las pantallas", () => {
  const pagina = leer("pages", "PortalAdminUsuarios.jsx");
  const dialogo = leer("components", "ImportarUsuariosDialogo.jsx");
  const importador = leer("components", "ImportadorArchivo.jsx");

  it("el botón 'Importar usuarios' solo existe condicionado a super_admin y abre el diálogo", () => {
    expect(pagina).toMatch(/puedeImportarUsuarios\(usuarioActual\)/);
    expect(pagina).toMatch(/\{puedeImportar && \(\s*<button type="button" onClick=\{\(\) => setMostrarImportador\(true\)\}>\s*Importar usuarios\s*<\/button>/);
    expect(pagina).toMatch(/mostrarImportador && puedeImportar/);
  });
  it("el diálogo usa ImportadorArchivo con vista previa del servidor y aplica con confirmar:true (sin modo actualizar)", () => {
    expect(dialogo).toMatch(/<ImportadorArchivo/);
    expect(dialogo).toMatch(/\/usuarios\/importar\/vista-previa/);
    expect(dialogo).toMatch(/confirmar: true/);
    expect(dialogo).toMatch(/verificar=\{verificar\}/);
    expect(dialogo).not.toMatch(/permiteActualizar/);
    expect(dialogo).toMatch(/maxFilas=\{MAX_FILAS_USUARIOS\}/);
    expect(dialogo).toMatch(/maxBytesArchivo=\{MAX_BYTES_ARCHIVO_USUARIOS\}/);
  });
  it("sin vista previa del servidor no existe el botón de aplicar (hay un solo botón a la vez)", () => {
    expect(importador).toMatch(/verificar && !verificacion \?/);
    expect(importador).toMatch(/Verificar filas \(no se crea nada\)/);
    expect(importador).toMatch(/verificar\.puedeAplicar\(verificacion\)/);
  });
  it("el diálogo guarda las huellas de la vista previa y las envía al aplicar", () => {
    expect(dialogo).toMatch(/huellas\.current = huellasDeVerificacion\(resp\.datos\)/);
    expect(dialogo).toMatch(/filasParaServidor\(filas, huellas\.current\)/);
  });
  it("el color fuerte de los encabezados es opt-in: la variante global de ImportadorArchivo no cambia", () => {
    expect(importador).toMatch(/etiquetaCol: \{\s*fontSize: '0\.75rem', fontWeight: 600, color: 'var\(--color-texto-claro\)'/);
    expect(importador).toMatch(/etiquetaColFuerte/);
  });
  it("la acción de la página no ofrece contraseña para cuentas ms365 al editar (el servidor además la rechaza)", () => {
    expect(pagina).toMatch(/editando\.auth_tipo === "local"/);
  });
});
