// Pruebas de la lógica pura del calendario del frontend (modules/rh/frontend/utils/calendarioLaboral.js).
// El archivo es ESM y Jest corre sin transpilar: se carga el código fuente quitando `export`.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ruta = path.join(__dirname, "../frontend/utils/calendarioLaboral.js");
const fuente = fs.readFileSync(ruta, "utf8");

// El util es ESM plano y Jest corre sin transpilar: se evalúa el fuente sin `export`.
// Se rechazan las formas que este cargador no sabe tratar, con un error claro.
if (/^\s*import\s/m.test(fuente)) throw new Error("calendarioLaboral.js no debe tener imports (el test lo evalúa como script)");
if (/^export\s+default\b/m.test(fuente)) throw new Error("calendarioLaboral.js no admite `export default` (el test no lo carga)");
const nombres = [
  ...fuente.matchAll(/^export\s+(?:async\s+)?(?:const|let|function\*?|class)\s+(\w+)/gm),
].map((m) => m[1]);
for (const bloque of fuente.matchAll(/^export\s*\{([^}]*)\}/gm)) {
  throw new Error(`calendarioLaboral.js no admite \`export { ${bloque[1].trim()} }\`: usa export en la declaración`);
}
const totalExports = (fuente.match(/^export\s/gm) || []).length;
if (totalExports !== nombres.length) {
  throw new Error(`Hay ${totalExports} exports pero el cargador reconoció ${nombres.length}: ajusta el cargador del test`);
}
const U = new Function(`${fuente.replace(/^export\s+/gm, "")}\nreturn { ${nombres.join(", ")} };`)();

const EXPORTS_ESPERADOS = [
  "esSuperAdmin", "puedeEditarCalendario", "filtrarVisibles", "accionClicDia", "resolverListado",
  "mensajeErrorRed", "etiquetaDia", "fechaHoy", "construirCuadricula", "destinoTecla",
];

const fechasDe = (semanas) => semanas.flat().map((c) => c.fecha);

describe("calendarioLaboral (frontend) - fechas como texto", () => {
  it("parsea fechas reales y rechaza las inexistentes", () => {
    expect(U.parsearFecha("2026-10-15")).toEqual({ anio: 2026, mes: 10, dia: 15 });
    expect(U.parsearFecha("2026-02-30")).toBeNull();
    expect(U.parsearFecha("2027-02-29")).toBeNull();
    expect(U.parsearFecha("2026-1-5")).toBeNull();
    expect(U.parsearFecha(null)).toBeNull();
  });

  it("calcula el día de la semana con lunes = 0 sin depender de la zona horaria", () => {
    expect(U.indiceDiaSemana("2026-10-12")).toBe(0); // lunes
    expect(U.indiceDiaSemana("2026-10-18")).toBe(6); // domingo
    expect(U.esFinDeSemana("2026-10-17")).toBe(true);
    expect(U.esFinDeSemana("2026-10-16")).toBe(false);
  });

  it("suma días cruzando mes y año", () => {
    expect(U.sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(U.sumarDias("2027-01-01", -1)).toBe("2026-12-31");
    expect(U.sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(U.sumarDias("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("detecta años bisiestos y días del mes", () => {
    expect(U.esBisiesto(2028)).toBe(true);
    expect(U.esBisiesto(2100)).toBe(false);
    expect(U.esBisiesto(2000)).toBe(true);
    expect(U.diasEnMes(2028, 2)).toBe(29);
    expect(U.diasEnMes(2027, 2)).toBe(28);
    expect(U.diasEnMes(2026, 12)).toBe(31);
  });

  it("el cargador expone las funciones esperadas", () => {
    for (const nombre of EXPORTS_ESPERADOS) expect(typeof U[nombre]).toBe("function");
  });

  // Jest aísla `process.env`: cambiar TZ aquí no afecta a Date. Se evalúa fechaHoy en un proceso
  // hijo con la TZ fijada, así la prueba discrimina fechaHoy local de un toISOString (UTC).
  const fechaHoyEnZona = (zona, iso) => {
    const programa =
      `const U = new Function(${JSON.stringify(`${fuente.replace(/^export\s+/gm, "")}\nreturn { fechaHoy };`)})();` +
      `process.stdout.write(U.fechaHoy(new Date(${JSON.stringify(iso)})));`;
    return execFileSync(process.execPath, ["-e", programa], { env: { ...process.env, TZ: zona }, encoding: "utf8" });
  };

  it.each([
    // [zona, instante UTC, día local esperado]
    ["Pacific/Auckland", "2026-12-31T12:30:00Z", "2027-01-01"], // UTC+13: ya es año nuevo
    ["America/Los_Angeles", "2027-01-01T03:30:00Z", "2026-12-31"], // UTC-8: 19:30 del día anterior
    ["America/Mexico_City", "2027-01-01T03:30:00Z", "2026-12-31"],
    ["UTC", "2027-01-01T03:30:00Z", "2027-01-01"],
  ])("fechaHoy con TZ=%s es el día local, no el de UTC (%s -> %s)", (zona, iso, esperado) => {
    expect(fechaHoyEnZona(zona, iso)).toBe(esperado);
  });

  it("fechaHoy usa los getters locales de la fecha construida con componentes locales", () => {
    expect(U.fechaHoy(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
    expect(U.fechaHoy(new Date(2027, 0, 1, 0, 1))).toBe("2027-01-01");
  });

  it("da fechas legibles sin desfase", () => {
    expect(U.fechaLegible("2026-01-01")).toBe("1 de enero de 2026");
    expect(U.fechaConDiaSemana("2026-10-15")).toBe("jueves 15 de octubre de 2026");
  });
});

describe("calendarioLaboral (frontend) - navegación de meses", () => {
  it("cambia de año al avanzar desde diciembre y retroceder desde enero", () => {
    expect(U.mesSiguiente(2026, 12)).toEqual({ anio: 2027, mes: 1 });
    expect(U.mesAnterior(2026, 1)).toEqual({ anio: 2025, mes: 12 });
    expect(U.mesSiguiente(2026, 3)).toEqual({ anio: 2026, mes: 4 });
    expect(U.mesAnterior(2026, 3)).toEqual({ anio: 2026, mes: 2 });
  });

  it("incluye el año en el selector aunque quede fuera del rango habitual", () => {
    const anios = U.aniosSelector(2040, 2026);
    expect(anios).toContain(2040);
    expect(anios).toContain(2023);
    expect(U.aniosSelector(2026, 2026)).toEqual([2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031]);
  });

  it("traduce las teclas de navegación de la cuadrícula", () => {
    expect(U.destinoTecla("2026-10-15", "ArrowRight")).toBe("2026-10-16");
    expect(U.destinoTecla("2026-10-01", "ArrowLeft")).toBe("2026-09-30");
    expect(U.destinoTecla("2026-10-15", "ArrowDown")).toBe("2026-10-22");
    expect(U.destinoTecla("2026-10-15", "ArrowUp")).toBe("2026-10-08");
    expect(U.destinoTecla("2026-10-15", "Home")).toBe("2026-10-12");
    expect(U.destinoTecla("2026-10-15", "End")).toBe("2026-10-18");
    expect(U.destinoTecla("2026-10-31", "PageDown")).toBe("2026-11-30");
    expect(U.destinoTecla("2026-03-31", "PageUp")).toBe("2026-02-28");
    expect(U.destinoTecla("2026-12-15", "PageDown")).toBe("2027-01-15");
    expect(U.destinoTecla("2026-10-15", "a")).toBeNull();
  });
});

describe("calendarioLaboral (frontend) - cuadrícula del mes", () => {
  it("construye semanas completas de lunes a domingo", () => {
    const semanas = U.construirCuadricula(2026, 10); // 1 oct 2026 = jueves
    expect(semanas.every((s) => s.length === 7)).toBe(true);
    expect(semanas[0][0].fecha).toBe("2026-09-28");
    expect(semanas[0][0].delMes).toBe(false);
    expect(semanas[0][3]).toMatchObject({ fecha: "2026-10-01", dia: 1, delMes: true });
    expect(semanas[semanas.length - 1][6].fecha).toBe("2026-11-01");
    expect(semanas.flat().filter((c) => c.delMes)).toHaveLength(31);
  });

  it("un mes que empieza en domingo ocupa la última columna de la primera semana", () => {
    const semanas = U.construirCuadricula(2026, 2); // 1 feb 2026 = domingo
    expect(semanas[0].slice(0, 6).every((c) => !c.delMes)).toBe(true);
    expect(semanas[0][6]).toMatchObject({ fecha: "2026-02-01", delMes: true, finDeSemana: true });
    expect(semanas[0][0].fecha).toBe("2026-01-26");
    expect(semanas).toHaveLength(5);
  });

  it("un mes que empieza en lunes y tiene 28 días son exactamente 4 semanas", () => {
    const semanas = U.construirCuadricula(2027, 2); // 1 feb 2027 = lunes, 28 días
    expect(semanas).toHaveLength(4);
    expect(semanas[0][0].fecha).toBe("2027-02-01");
    expect(semanas[3][6].fecha).toBe("2027-02-28");
  });

  it("febrero bisiesto incluye el 29 y febrero común no", () => {
    const bisiesto = fechasDe(U.construirCuadricula(2028, 2));
    expect(bisiesto).toContain("2028-02-29");
    expect(U.construirCuadricula(2028, 2).flat().filter((c) => c.delMes)).toHaveLength(29);
    const comun = U.construirCuadricula(2027, 2).flat().filter((c) => c.delMes);
    expect(comun).toHaveLength(28);
    expect(fechasDe(U.construirCuadricula(2027, 2))).not.toContain("2027-02-29");
  });

  it("diciembre desborda hacia enero del año siguiente y enero hacia diciembre del anterior", () => {
    const dic = U.construirCuadricula(2026, 12);
    expect(dic[dic.length - 1][6].fecha).toBe("2027-01-03");
    const ene = U.construirCuadricula(2027, 1); // 1 ene 2027 = viernes
    expect(ene[0][0].fecha).toBe("2026-12-28");
  });

  it("marca sábado y domingo como fin de semana", () => {
    const semana = U.construirCuadricula(2026, 10)[1];
    expect(semana.map((c) => c.finDeSemana)).toEqual([false, false, false, false, false, true, true]);
  });

  it("el rango pedido a la API cubre toda la cuadrícula", () => {
    expect(U.rangoCuadricula(2026, 10)).toEqual({ desde: "2026-09-28", hasta: "2026-11-01" });
    expect(U.rangoCuadricula(2026, 12)).toEqual({ desde: "2026-11-30", hasta: "2027-01-03" });
  });
});

describe("calendarioLaboral (frontend) - agrupación", () => {
  const items = [
    { id: 3, fecha: "2026-12-25", tipo: "evento", nombre: "Posada", activo: true },
    { id: 1, fecha: "2026-12-25", tipo: "oficial", nombre: "Navidad", activo: true },
    { id: 2, fecha: "2026-12-24", tipo: "otorgado", nombre: "Nochebuena", activo: false },
    { id: 4, fecha: "2027-01-01", tipo: "oficial", nombre: "Año Nuevo", activo: true },
  ];

  it("agrupa por fecha y ordena oficial, otorgado, evento", () => {
    const mapa = U.agruparPorFecha(items);
    expect(Object.keys(mapa)).toEqual(["2026-12-24", "2026-12-25", "2027-01-01"]);
    expect(mapa["2026-12-25"].map((i) => i.nombre)).toEqual(["Navidad", "Posada"]);
  });

  it("puede omitir los inactivos y no muta la entrada", () => {
    const copia = JSON.stringify(items);
    const mapa = U.agruparPorFecha(items, { soloActivos: true });
    expect(mapa["2026-12-24"]).toBeUndefined();
    expect(JSON.stringify(items)).toBe(copia);
  });

  it("filtra los elementos del mes sin cruzar el año", () => {
    expect(U.itemsDelMes(items, 2026, 12).map((i) => i.id)).toEqual([2, 1, 3]);
    expect(U.itemsDelMes(items, 2026, 12, { soloActivos: true }).map((i) => i.id)).toEqual([1, 3]);
    expect(U.itemsDelMes(items, 2027, 1).map((i) => i.id)).toEqual([4]);
    expect(U.itemsDelMes(items, 2026, 11)).toEqual([]);
  });

  it("maneja entradas vacías o desconocidas", () => {
    expect(U.agruparPorFecha(undefined)).toEqual({});
    expect(U.infoTipo("otro").etiqueta).toBe("otro");
    expect(U.TIPOS_CALENDARIO.map((t) => t.valor)).toEqual(["oficial", "otorgado", "evento"]);
  });

  it("los tipos coinciden con los del backend", () => {
    const modelo = fs.readFileSync(path.join(__dirname, "../backend/models/calendarioLaboral.model.js"), "utf8");
    const backend = modelo.match(/TIPOS_CALENDARIO = \[(.*?)\]/)[1].replace(/["\s]/g, "").split(",");
    expect(U.TIPOS_CALENDARIO.map((t) => t.valor)).toEqual(backend);
  });
});

describe("calendarioLaboral (frontend) - permisos y estado de la pantalla", () => {
  const PERM_EDICION = [{ modulo: "rh", opcion: "Calendario", tipo: "edicion" }];
  const PERM_CONSULTA = [{ modulo: "rh", opcion: "Calendario", tipo: "consulta" }];

  it("super_admin se detecta por roles (arreglo de nombres del perfil), no por rol_nombre", () => {
    expect(U.esSuperAdmin({ roles: ["super_admin"] })).toBe(true);
    expect(U.esSuperAdmin({ roles: ["rh_admin", "super_admin"] })).toBe(true);
    expect(U.esSuperAdmin({ roles: ["rh_admin"] })).toBe(false);
    expect(U.esSuperAdmin({ rol_nombre: "super_admin" })).toBe(false); // campo que /auth/perfil no devuelve
    expect(U.esSuperAdmin(null)).toBe(false);
    expect(U.esSuperAdmin({})).toBe(false);
  });

  it("puede editar: super_admin sin filas de permiso, o permiso rh/Calendario de edición", () => {
    expect(U.puedeEditarCalendario({ roles: ["super_admin"] }, null)).toBe(true);
    expect(U.puedeEditarCalendario({ roles: ["rh_admin"] }, PERM_EDICION)).toBe(true);
    expect(U.puedeEditarCalendario({ roles: ["rh_admin"] }, [{ modulo: "RH", opcion: "Calendario", tipo: "edicion" }])).toBe(true);
  });

  it("solo lectura: consulta, otra opción u otro módulo, permisos sin cargar o inválidos", () => {
    const u = { roles: ["rh_empleado"] };
    expect(U.puedeEditarCalendario(u, PERM_CONSULTA)).toBe(false);
    expect(U.puedeEditarCalendario(u, [{ modulo: "rh", opcion: "Vacaciones", tipo: "edicion" }])).toBe(false);
    expect(U.puedeEditarCalendario(u, [{ modulo: "tickets", opcion: "Calendario", tipo: "edicion" }])).toBe(false);
    expect(U.puedeEditarCalendario(u, null)).toBe(false);
    expect(U.puedeEditarCalendario(u, [])).toBe(false);
    expect(U.puedeEditarCalendario(u, { exito: false })).toBe(false);
    expect(U.puedeEditarCalendario(null, undefined)).toBe(false);
  });

  it("los inactivos solo los ven los editores", () => {
    const items = [{ id: 1, activo: true }, { id: 2, activo: false }, { id: 3 }];
    expect(U.filtrarVisibles(items, false).map((i) => i.id)).toEqual([1, 3]);
    expect(U.filtrarVisibles(items, true).map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it("el clic en un día: sin permiso nada; vacío abre el alta; con 1 o más fechas, el panel", () => {
    const una = [{ id: 1 }];
    expect(U.accionClicDia([], false)).toBe("ninguna");
    expect(U.accionClicDia(una, false)).toBe("ninguna");
    expect(U.accionClicDia([], true)).toBe("alta");
    expect(U.accionClicDia(una, true)).toBe("panel"); // permite "Agregar otra en esta fecha"
    expect(U.accionClicDia([{ id: 1 }, { id: 2 }], true)).toBe("panel");
  });

  it("el listado con exito=false o sin datos es un error, no un calendario vacío", () => {
    expect(U.resolverListado({ exito: true, datos: [{ id: 1 }] })).toEqual({ items: [{ id: 1 }], error: "" });
    expect(U.resolverListado({ exito: true, datos: [] })).toEqual({ items: [], error: "" });
    expect(U.resolverListado({ exito: false, mensaje: "Sin acceso" })).toEqual({ items: [], error: "Sin acceso" });
    expect(U.resolverListado({ exito: false }).error).toBe(U.MENSAJE_ERROR_LISTADO);
    expect(U.resolverListado(undefined).error).toBe(U.MENSAJE_ERROR_LISTADO);
    expect(U.resolverListado({ exito: true }).items).toEqual([]);
    expect(U.resolverListado({ exito: true }).error).not.toBe("");
  });

  it("errores de red o de JSON se traducen; los del backend (409/404) pasan tal cual", () => {
    const html = new SyntaxError("Unexpected token '<', \"<html>\" is not valid JSON");
    expect(U.mensajeErrorRed(html)).not.toMatch(/Unexpected|token|JSON/);
    expect(U.mensajeErrorRed(new TypeError("Failed to fetch"))).toMatch(/conectar/);
    expect(U.mensajeErrorRed(Object.assign(new Error("Ya existe una fecha de ese tipo en el calendario"), { status: 409 })))
      .toBe("Ya existe una fecha de ese tipo en el calendario");
    expect(U.mensajeErrorRed(new Error("Fecha del calendario no encontrada"))).toBe("Fecha del calendario no encontrada");
    expect(U.mensajeErrorRed(null, "x")).toBe("x");
    expect(U.mensajeErrorRed(new Error(""), "x")).toBe("x");
  });

  it("el aria-label del día empieza por el número visible y los nombres de las marcas (WCAG 2.5.3)", () => {
    const items = [
      { tipo: "otorgado", nombre: "Descanso dos", activo: true },
      { tipo: "evento", nombre: "Inventario", activo: false },
    ];
    const etiqueta = U.etiquetaDia("2026-10-20", items);
    expect(etiqueta.startsWith("20 Descanso dos Inventario")).toBe(true);
    expect(etiqueta).toContain("martes 20 de octubre de 2026");
    expect(etiqueta).toContain("Descanso otorgado: Descanso dos");
    expect(etiqueta).toContain("Inventario (inactivo)");
    expect(U.etiquetaDia("2026-10-05", [])).toBe("5 lunes 5 de octubre de 2026");
  });
});
