// Lógica pura de las pantallas de Resultados, Periodos y Parámetros de Asistencia.
const { cargarUtilEsm } = require("./cargarUtilEsm");

const R = cargarUtilEsm("asistenciaResultados.js");
const P = cargarUtilEsm("asistenciaPeriodos.js");
const Q = cargarUtilEsm("asistenciaParametros.js");
const A = cargarUtilEsm("asistenciaPermisos.js");
const M = cargarUtilEsm("menuAcceso.js", require("path").join(__dirname, "../../portal/frontend/utils"));

const fila = (o) => ({ empleado_id: 1, nombre: "Ana", apellido_paterno: "Pérez", apellido_materno: "", numero_nomina: "100", dias_con_marcas: 5, puntual: 0, retardo: 0, falta: 0, salida_anticipada: 0, incompleta: 0, justificada: 0, minutos_retardo: 0, faltas_con_marcas: 0, incompletas_comida: 0, ...o });

describe("totales y puntualidad", () => {
  it("suma los conteos y calcula el % solo sobre días laborables evaluados", () => {
    const t = R.totalesDeResumen([fila({ puntual: 8, retardo: 1, falta: 1, descanso: 4, festivo: 1, vacaciones: 2, pendiente: 3 }), fila({ empleado_id: 2, puntual: 10 })]);
    expect(t.puntual).toBe(18);
    expect(t.empleados).toBe(2);
    expect(R.diasEvaluados(t)).toBe(20);
    expect(R.porcentajePuntualidad(t)).toBe(90);
    expect(R.textoPorcentaje(90)).toBe("90 %");
    expect(R.textoPorcentaje(66.7)).toBe("66,7 %");
  });
  it("sin días evaluados no hay porcentaje (no divide entre cero)", () => {
    expect(R.porcentajePuntualidad({ puntual: 0, descanso: 10 })).toBeNull();
    expect(R.textoPorcentaje(null)).toBe("—");
    expect(R.totalesDeResumen(null).empleados).toBe(0);
  });
  it("la fórmula visible dice qué cuenta", () => {
    expect(R.FORMULA_PUNTUALIDAD).toMatch(/puntuales ÷ días laborables evaluados/);
  });
});

describe("filtros y atajos de revisión", () => {
  const filas = [
    fila({ empleado_id: 1, nombre: "Zoé", apellido_paterno: "Ñandú", numero_nomina: "0007", falta: 2, faltas_con_marcas: 0, dias_con_marcas: 0, puntual: 3 }),
    fila({ empleado_id: 2, nombre: "Ana", falta: 5, faltas_con_marcas: 2, puntual: 5, minutos_retardo: 30, retardo: 2 }),
    fila({ empleado_id: 3, nombre: "Beto", incompleta: 3, incompletas_comida: 3, puntual: 7 }),
    fila({ empleado_id: 4, nombre: "Carla", dias_con_marcas: 0, descanso: 8 }),
  ];
  const ids = (r) => r.map((f) => f.empleado_id);
  it("busca por nombre sin acentos ni mayúsculas y por nómina", () => {
    expect(ids(R.filtrarYOrdenar(filas, { texto: "NANDU" }))).toEqual([1]);
    expect(ids(R.filtrarYOrdenar(filas, { texto: "0007" }))).toEqual([1]);
    expect(ids(R.filtrarYOrdenar(filas, { texto: "zzz" }))).toEqual([]);
  });
  it("«Más faltas» filtra y ordena de más a menos", () => {
    expect(ids(R.filtrarYOrdenar(filas, { atajo: "mas_faltas" }))).toEqual([2, 1]);
  });
  it("«Faltas con marcas», «Incompletas por comida» y «Sin ninguna marca»", () => {
    expect(ids(R.filtrarYOrdenar(filas, { atajo: "faltas_con_marcas" }))).toEqual([2]);
    expect(ids(R.filtrarYOrdenar(filas, { atajo: "incompletas_comida" }))).toEqual([3]);
    // Carla no tiene días evaluados (solo descansos): no es «sin marcas»; Zoé sí no tiene marcas y tiene días evaluados
    expect(ids(R.filtrarYOrdenar(filas, { atajo: "sin_marcas" }))).toEqual([1]);
  });
  it("filtra por estatus y ordena por minutos de retardo o menor puntualidad", () => {
    expect(ids(R.filtrarYOrdenar(filas, { estatus: "retardo" }))).toEqual([2]);
    expect(ids(R.filtrarYOrdenar(filas, { orden: "minutos_retardo" }))[0]).toBe(2);
    expect(ids(R.filtrarYOrdenar(filas, { orden: "puntualidad" }))[0]).toBe(2); // 5/12 < 3/5? 41,7 % < 100 %
  });
  it("no muta la lista original y tolera entradas inválidas", () => {
    const copia = filas.slice();
    R.filtrarYOrdenar(filas, { orden: "faltas" });
    expect(filas).toEqual(copia);
    expect(R.filtrarYOrdenar(null)).toEqual([]);
  });
  it("texto de la región viva solo depende del resultado", () => {
    expect(R.textoFiltrados(3, 3)).toBe("3 empleados.");
    expect(R.textoFiltrados(1, 1)).toBe("1 empleado.");
    expect(R.textoFiltrados(2, 7)).toBe("2 de 7 empleados con los filtros aplicados.");
    expect(R.textoFiltrados(0, 0)).toMatch(/No hay empleados/);
  });
  it("pagina y acota la página", () => {
    const lista = Array.from({ length: 60 }, (_, i) => i);
    expect(R.paginar(lista, 3, 25).filas).toHaveLength(10);
    expect(R.paginar(lista, 99, 25).pagina).toBe(3);
    expect(R.paginar([], 1, 25)).toEqual({ filas: [], pagina: 1, paginasTotales: 1 });
  });
});

describe("rango y quincena", () => {
  it("valida el rango libre (92 días)", () => {
    expect(R.validarRangoLibre("2026-09-01", "2026-09-15")).toBe("");
    expect(R.validarRangoLibre("2026-01-01", "2026-04-02")).toBe(""); // exactamente 92 días
  });
  it("rechaza más de 92 días, fin anterior y fechas inventadas", () => {
    expect(R.validarRangoLibre("2026-01-01", "2026-04-03")).toMatch(/92/); // 93 días
    expect(R.validarRangoLibre("2026-01-01", "2026-04-01")).toBe("");
    expect(R.validarRangoLibre("2026-09-10", "2026-09-01")).toMatch(/anterior/);
    expect(R.validarRangoLibre("2026-02-30", "2026-03-01")).toMatch(/Indica/);
    expect(R.validarRangoLibre("", "")).toMatch(/Indica/);
  });
  it("elige la quincena de hoy o la más reciente", () => {
    const ps = [{ id: 3, fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31" }, { id: 2, fecha_inicio: "2026-10-01", fecha_fin: "2026-10-15" }];
    expect(R.periodoPorOmision(ps, "2026-10-23").id).toBe(3);
    expect(R.periodoPorOmision(ps, "2026-11-20").id).toBe(3);
    expect(R.periodoPorOmision(ps, "2026-08-01").id).toBe(3); // ninguna empezó: la primera de la lista
    expect(R.periodoPorOmision([], "2026-10-23")).toBeNull();
  });
});

describe("cuadrícula", () => {
  it("rellena lunes-domingo: 16-31 oct 2026 empieza en viernes", () => {
    const { celdas } = R.construirCuadricula("2026-10-16", "2026-10-31", [{ fecha: "2026-10-16", estatus: "puntual" }]);
    expect(celdas.length % 7).toBe(0);
    expect(celdas.filter((c) => c.vacia).length).toBe(4 + 1); // empieza en viernes y termina en sábado
    expect(celdas[4].fecha).toBe("2026-10-16");
    expect(celdas[4].dia.estatus).toBe("puntual");
    expect(celdas[5].finDeSemana).toBe(true); // sábado 17
    expect(celdas[11].dia).toBeNull();
  });
  it("rangos inválidos o enormes no construyen nada", () => {
    expect(R.construirCuadricula("2026-10-31", "2026-10-16", []).celdas).toEqual([]);
    expect(R.construirCuadricula("2026-01-01", "2026-12-31", []).celdas).toEqual([]);
  });
  it("etiqueta accesible con estatus y minutos", () => {
    const { celdas } = R.construirCuadricula("2026-10-05", "2026-10-05", [{ fecha: "2026-10-05", estatus: "retardo", minutos_retardo: 12 }]);
    expect(R.etiquetaCelda(celdas[0])).toBe("lunes 2026-10-05: Retardo. 12 min de retardo");
    const sin = R.construirCuadricula("2026-10-06", "2026-10-06", []).celdas[1];
    expect(R.etiquetaCelda(sin)).toBe("martes 2026-10-06: sin cálculo");
  });
  it("las flechas se mueven y saltan celdas vacías, sin salirse", () => {
    const { celdas } = R.construirCuadricula("2026-10-16", "2026-10-31", []);
    const primera = celdas.findIndex((c) => !c.vacia); // 4
    expect(R.celdaSiguiente(celdas, primera, "ArrowRight", 7)).toBe(primera + 1);
    expect(R.celdaSiguiente(celdas, primera, "ArrowLeft", 7)).toBe(primera); // a la izquierda solo hay vacías
    expect(R.celdaSiguiente(celdas, primera, "ArrowDown", 7)).toBe(primera + 7);
    expect(R.celdaSiguiente(celdas, primera, "ArrowUp", 7)).toBe(primera);
    expect(R.celdaSiguiente(celdas, primera, "Home", 7)).toBe(primera);
    expect(R.celdaSiguiente(celdas, primera, "End", 7)).toBe(6);
    const ultima = celdas.length - 1 - celdas.slice().reverse().findIndex((c) => !c.vacia);
    expect(R.celdaSiguiente(celdas, ultima, "ArrowRight", 7)).toBe(ultima);
    expect(R.celdaSiguiente(celdas, primera, "x", 7)).toBe(primera);
  });
  it("apilada (1 columna) arriba/abajo avanzan de día en día", () => {
    const { celdas } = R.construirCuadricula("2026-10-16", "2026-10-31", []);
    const p = celdas.findIndex((c) => !c.vacia);
    expect(R.celdaSiguiente(celdas, p, "ArrowDown", 1)).toBe(p + 1);
    expect(R.celdaSiguiente(celdas, p + 1, "ArrowUp", 1)).toBe(p);
  });
  it("cada estatus tiene ícono, texto y tono (nunca solo color)", () => {
    for (const k of Object.keys(R.ESTATUS)) {
      expect(R.ESTATUS[k].icono).toBeTruthy();
      expect(R.ESTATUS[k].texto).toBeTruthy();
      expect(["ok", "aviso", "error", "info", "neutro"]).toContain(R.ESTATUS[k].tono);
    }
    expect(R.infoEstatus("inventado").texto).toBe("inventado");
  });
});

describe("detalle de un día", () => {
  const dia = { fecha: "2026-10-05", estatus: "puntual", marcas_usadas: ["1", "4"], detalle: { comida: { desde: "13:00", hasta: "16:00", marcas: 2 }, banderas: ["exceso_comida", "marcas_duplicadas"], explicaciones: ["Entrada y salida dentro de la tolerancia", "Otra nota"] } };
  it("explica las banderas en español y no inventa las desconocidas", () => {
    const b = R.banderasDelDia(dia);
    expect(b.map((x) => x.clave)).toEqual(["exceso_comida", "marcas_duplicadas"]);
    expect(b[0].texto).toMatch(/comida duró más/);
    expect(R.explicarBandera("ultima_marca_en_comida")).toMatch(/dentro de la comida/);
    expect(R.explicarBandera("nueva_cosa")).toMatch(/técnica: nueva_cosa/);
    for (const k of ["marca_intermedia_sin_salida", "exceso_comida", "ultima_marca_en_comida"]) expect(R.BANDERAS[k]).toBeTruthy();
    expect(R.banderasDelDia(null)).toEqual([]);
  });
  it("la regla es «Estatus: primera explicación» y el resto", () => {
    const r = R.reglaDelDia({ estatus: "falta", detalle: { explicaciones: ["Sin marcas en el día: no hay marca de entrada hasta las 08:30"] } });
    expect(r.titulo).toBe("Falta: Sin marcas en el día: no hay marca de entrada hasta las 08:30");
    expect(R.reglaDelDia(dia).otras).toEqual(["Otra nota"]);
    expect(R.reglaDelDia({ estatus: "falta" }).titulo).toBe("Falta");
  });
  it("el turno usado trae horario, tolerancias, ventanas y comida", () => {
    const f = R.filasDelTurno({
      turno_nombre: "Rayhsa", origen_turno: "departamento", entrada_programada: "08:00", salida_programada: "18:00", cruza_medianoche: false,
      tolerancia_retardo_min: 10, umbral_falta_min: 30, tolerancia_salida_min: 3, ventana_entrada_despues_min: 150, ventana_salida_despues_min: 359,
      descanso_min: 60, detalle: { comida: { desde: "13:00", hasta: "16:00" } },
    });
    const m = Object.fromEntries(f.map((x) => [x.etiqueta, x.valor]));
    expect(m.Turno).toBe("Rayhsa (del departamento)");
    expect(m.Horario).toBe("08:00 a 18:00");
    expect(m["Entrada válida"]).toMatch(/hasta 10:30/);
    expect(m["Tolerancia de retardo"]).toBe("10 min");
    expect(m.Comida).toBe("60 min; ventana 13:00-16:00");
    expect(R.filasDelTurno({})).toEqual([]);
  });
  it("justificar/anular solo en periodo abierto, con permiso y estatus justificable", () => {
    const ok = (o) => R.accionesDelDia({ dia: { estatus: "falta" }, cruces: {}, periodoEstado: "abierto", puedeEscribir: true, ...o });
    expect(ok({}).justificar).toBe(true);
    expect(ok({ periodoEstado: "cerrado" })).toMatchObject({ justificar: false, anular: false });
    expect(ok({ periodoEstado: "cerrado" }).motivoNo).toMatch(/reabrirla en Periodos/);
    expect(ok({ puedeEscribir: false }).justificar).toBe(false);
    expect(ok({ dia: { estatus: "puntual" } }).justificar).toBe(false);
    expect(ok({ dia: { estatus: "justificada" }, cruces: { justificacion: { id: 9 } } })).toMatchObject({ anular: true, justificar: false });
    expect(ok({ dia: { estatus: "justificada" }, cruces: {} }).anular).toBe(false);
    for (const e of ["retardo", "salida_anticipada", "incompleta"]) expect(ok({ dia: { estatus: e } }).justificar).toBe(true);
    for (const e of ["festivo", "descanso", "pendiente", "vacaciones", "permiso"]) expect(ok({ dia: { estatus: e } }).justificar).toBe(false);
  });
  it("el motivo de la justificación es obligatorio (5 a 500)", () => {
    expect(R.validarMotivoJustificacion("")).toMatch(/obligatorio/);
    expect(R.validarMotivoJustificacion("  abc ")).toMatch(/obligatorio/);
    expect(R.validarMotivoJustificacion("Cita médica")).toBe("");
    expect(R.validarMotivoJustificacion("x".repeat(501))).toMatch(/500/);
    expect(R.validarMotivoJustificacion("a\u0000bcdef")).toMatch(/no válidos/);
  });
});

describe("exportación a CSV", () => {
  it("resumen: BOM, CRLF, nombres y fórmulas neutralizadas", () => {
    const csv = R.construirCsvResumen([fila({ nombre: "=HYPERLINK(\"x\")", numero_nomina: "+5", puntual: 4, falta: 1, departamento: "A,B" })]);
    expect(csv.texto.charCodeAt(0)).toBe(0xfeff);
    expect(csv.texto).toContain("\r\n");
    expect(csv.texto).toContain("'=HYPERLINK");
    expect(csv.texto).toContain("'+5");
    expect(csv.texto).toContain('"A,B"');
    expect(csv.texto).toContain("80 %");
    expect(csv.filas).toBe(1);
  });
  it("detalle: horas locales inyectadas, regla y banderas; respeta el tope", () => {
    const dias = Array.from({ length: 5 }, (_, i) => ({ fecha: `2026-10-0${i + 1}`, nombre: "Ana", numero_nomina: "1", estatus: "falta", primera_marca: "2026-10-01T14:00:00Z", detalle: { explicaciones: ["Sin marca"], banderas: ["marca_unica"] } }));
    const csv = R.construirCsvDetalle(dias, (iso) => `L(${iso})`, 3);
    expect(csv.filas).toBe(3);
    expect(csv.truncado).toBe(true);
    expect(csv.texto).toContain("L(2026-10-01T14:00:00Z)");
    expect(csv.texto).toContain("Falta: Sin marca");
    expect(csv.texto).toContain("marca_unica");
    expect(R.construirCsvDetalle([], () => "").filas).toBe(0);
  });
  it("neutraliza tabulador y retorno, y escapa comillas y saltos", () => {
    expect(R.neutralizarFormula("\t=X")).toBe("'\t=X");
    expect(R.neutralizarFormula("  =HYPERLINK(1)")).toBe("'  =HYPERLINK(1)");
    expect(R.neutralizarFormula("-5")).toBe("'-5");
    expect(R.neutralizarFormula("Ana -1")).toBe("Ana -1");
    expect(R.celdaCsv('a"b')).toBe('"a""b"');
    expect(R.celdaCsv("a\nb")).toBe('"a\nb"');
    expect(R.celdaCsv(null)).toBe("");
  });
  it("nombres de archivo y páginas restantes", () => {
    expect(R.nombreArchivoResumen("2026-10-01", "2026-10-15")).toBe("asistencia_resumen_2026-10-01_a_2026-10-15.csv");
    expect(R.nombreArchivoDetalle("a", "b")).toBe("asistencia_detalle_a_a_b.csv");
    expect(R.paginasRestantes(500, 500)).toBe(0);
    expect(R.paginasRestantes(1100, 500)).toBe(2);
    expect(R.paginasRestantes(1e9, 500)).toBe(29);
    expect(R.paginasRestantes(NaN, 500)).toBe(0);
  });
});

describe("periodos", () => {
  const abierta = { id: 1, estado: "abierto", fecha_inicio: "2026-10-01", fecha_fin: "2026-10-15", dias_pendientes: 3, ajustes_pendientes: 2 };
  it("solo se cierra una quincena abierta y ya terminada", () => {
    expect(P.estadoCerrar(abierta, "2026-10-16").puede).toBe(true);
    expect(P.estadoCerrar(abierta, "2026-10-15")).toMatchObject({ puede: false });
    expect(P.estadoCerrar(abierta, "2026-10-15").motivo).toMatch(/aún no termina/);
    expect(P.estadoCerrar({ ...abierta, estado: "cerrado" }, "2026-12-01").puede).toBe(false);
    expect(P.estadoCerrar(null, "2026-12-01").puede).toBe(false);
  });
  it("el resumen de cierre usa contadores frescos y los días pendientes BLOQUEAN el cierre", () => {
    const c = { dias_pendientes: 3, ajustes_pendientes: 2, sin_identificador: 8 };
    expect(P.resumenCierre(c)).toMatchObject({ pendientes: 3, ajustes: 2, sinIdentificador: 8, bloqueado: true, hayRiesgo: true });
    expect(P.resumenCierre(c).motivoBloqueo).toMatch(/3 días pendientes.*no se puede cerrar/);
    expect(P.resumenCierre({ dias_pendientes: 1, ajustes_pendientes: 0, sin_identificador: 0 }).motivoBloqueo).toMatch(/1 día pendiente/);
    expect(P.resumenCierre({ dias_pendientes: 0, ajustes_pendientes: 0, sin_identificador: 0 })).toMatchObject({ bloqueado: false, hayRiesgo: false, motivoBloqueo: "" });
    expect(P.resumenCierre({ dias_pendientes: 0, ajustes_pendientes: 1, sin_identificador: 0 })).toMatchObject({ bloqueado: false, hayRiesgo: true });
    expect(P.resumenCierre(null)).toMatchObject({ sinIdentificador: null, bloqueado: false });
  });
  it("los esperados enviados son los contadores mostrados y el 409 «datos cambiaron» se reconoce", () => {
    expect(P.esperadosDeCierre({ dias_pendientes: 0, ajustes_pendientes: 2, sin_identificador: 8 })).toEqual({ ajustes_pendientes: 2, sin_identificador: 8 });
    const e = Object.assign(new Error("Los datos cambiaron desde que abriste la confirmación: revisa de nuevo"), { status: 409 });
    expect(P.esDatosCambiaron(e)).toBe(true);
    expect(P.esConflictoOcupado(e)).toBe(false);
    expect(P.esDatosCambiaron(Object.assign(new Error("otro"), { status: 409 }))).toBe(false);
    expect(P.mensajeAccionPeriodo(e, "x")).toMatch(/Se actualizaron los números/);
  });
  it("reabrir exige motivo de al menos 10 caracteres", () => {
    expect(P.validarMotivoReapertura("corto")).toMatch(/mínimo 10/);
    expect(P.validarMotivoReapertura("         x ")).toMatch(/mínimo 10/);
    expect(P.validarMotivoReapertura("Faltaron vacaciones por capturar")).toBe("");
    expect(P.validarMotivoReapertura("x".repeat(501))).toMatch(/500/);
  });
  it("reconoce el 409 de «recálculo en curso» como aviso amable", () => {
    const e409 = Object.assign(new Error("Hay un recálculo en curso; reintenta en unos segundos"), { status: 409 });
    expect(P.esConflictoOcupado(e409)).toBe(true);
    expect(P.mensajeAccionPeriodo(e409, "x")).toBe(P.MENSAJE_OCUPADO);
    const otro409 = Object.assign(new Error("El periodo ya está cerrado"), { status: 409 });
    expect(P.esConflictoOcupado(otro409)).toBe(false);
    expect(P.mensajeAccionPeriodo(otro409, "x")).toBe("El periodo ya está cerrado");
    expect(P.mensajeAccionPeriodo(Object.assign(new Error("x"), { status: 403 }), "d")).toMatch(/permiso/);
    expect(P.mensajeAccionPeriodo(null, "d")).toBe("d");
  });
  it("valida el recálculo y avisa de las quincenas cerradas", () => {
    expect(P.validarRecalculo({ desde: "2026-10-01", hasta: "2026-10-15" })).toBe("");
    expect(P.validarRecalculo({ desde: "2026-10-15", hasta: "2026-10-01" })).toMatch(/anterior/);
    expect(P.validarRecalculo({ desde: "2026-01-01", hasta: "2026-04-03" })).toMatch(/92/);
    expect(P.validarRecalculo({ desde: "", hasta: "" })).toMatch(/Indica/);
    const ps = [{ estado: "cerrado", fecha_inicio: "2026-09-01", fecha_fin: "2026-09-15" }, { estado: "abierto", fecha_inicio: "2026-10-01", fecha_fin: "2026-10-15" }];
    expect(P.avisoRecalculo("2026-09-01", "2026-09-15", ps)).toMatchObject({ sinAbiertas: true });
    expect(P.avisoRecalculo("2026-09-01", "2026-10-15", ps)).toMatchObject({ abiertos: 1, cerrados: 1, sinAbiertas: false });
    expect(P.avisoRecalculo("2026-10-01", "2026-10-15", ps).texto).toBe("");
    expect(P.avisoRecalculo("2027-01-01", "2027-01-02", ps).sinAbiertas).toBe(false);
  });
  it("textos de cierre, resultado de recálculo, ejecuciones y ajustes", () => {
    expect(P.textoCierre(abierta)).toBe("Abierta");
    expect(P.textoCierre({ estado: "cerrado", tipo_cierre: "auto", cerrado_en: "x" }, () => "2026-11-03 00:05")).toBe("Cierre automático · 2026-11-03 00:05");
    expect(P.textoCierre({ estado: "cerrado", tipo_cierre: "manual" })).toBe("Cierre manual");
    expect(P.textoResultadoRecalculo({ dias_evaluados: 1, dias_modificados: 0, dias_omitidos_cerrados: 4 })).toMatch(/1 día evaluado, 0 modificados, 4 omitidos/);
    expect(P.textoErrorEjecucion("tiempo_excedido")).toMatch(/tiempo máximo/);
    expect(P.textoErrorEjecucion("57014")).toBe("Error del motor (57014)");
    expect(P.textoErrorEjecucion(null)).toBe("");
    expect(P.validarNotaAjuste("x".repeat(501))).toMatch(/500/);
    expect(P.validarNotaAjuste("")).toBe("");
    expect(P.AVISO_CIERRE_AUTOMATICO).toBe("El cierre automático rige desde la quincena 16-31 oct; las anteriores se cierran a mano.");
  });
});

describe("parámetros", () => {
  const base = { comida_desde: "13:00", comida_hasta: "16:00", dias_cierre: "3", cierre_automatico_desde: "2026-10-16", margen_dia_completo_min: "120", analisis_desde: "2026-09-01", ventana_seguridad_dias: "7", barrido_completo_horas: "24" };
  const def = (c) => Q.PARAMETROS.find((p) => p.clave === c);
  it("cubre los 8 parámetros editables con ayuda", () => {
    expect(Q.PARAMETROS.map((p) => p.clave).sort()).toEqual(Object.keys(base).sort());
    for (const p of Q.PARAMETROS) expect(p.ayuda.length).toBeGreaterThan(20);
    expect(Q.validarTodo(base)).toEqual({});
  });
  it("valida horas, fechas y rangos de enteros", () => {
    expect(Q.validarValor(def("comida_desde"), "25:00")).toMatch(/HH:MM/);
    expect(Q.validarValor(def("comida_desde"), "9:00")).toMatch(/HH:MM/);
    expect(Q.validarValor(def("analisis_desde"), "2026-02-30")).toMatch(/fecha válida/);
    expect(Q.validarValor(def("analisis_desde"), "2019-12-31")).toMatch(/entre/);
    expect(Q.validarValor(def("dias_cierre"), "31")).toMatch(/entre 0 y 30/);
    expect(Q.validarValor(def("dias_cierre"), "-1")).toMatch(/entero/);
    expect(Q.validarValor(def("dias_cierre"), "1e2")).toMatch(/entero/);
    expect(Q.validarValor(def("dias_cierre"), "3.5")).toMatch(/entero/);
    expect(Q.validarValor(def("barrido_completo_horas"), "0")).toMatch(/entre 1 y 168/);
    expect(Q.validarValor(def("margen_dia_completo_min"), "721")).toMatch(/entre 0 y 720/);
    expect(Q.validarValor(def("ventana_seguridad_dias"), "")).toMatch(/obligatorio/);
    expect(Q.validarValor(def("dias_cierre"), "0")).toBe("");
  });
  it("la comida exige desde < hasta", () => {
    expect(Q.validarTodo({ ...base, comida_desde: "16:00" }).comida_hasta).toMatch(/posterior/);
    expect(Q.validarTodo({ ...base, comida_desde: "17:00", comida_hasta: "16:00" }).comida_hasta).toMatch(/posterior/);
    expect(Q.validarTodo({ ...base, comida_desde: "12:30", comida_hasta: "16:00" })).toEqual({});
  });
  it("detecta solo lo que cambió y normaliza números", () => {
    expect(Q.cambiosDe(base, base)).toEqual({});
    expect(Q.cambiosDe(base, { ...base, dias_cierre: "03" })).toEqual({});
    expect(Q.cambiosDe(base, { ...base, dias_cierre: "5", comida_desde: "12:00" })).toEqual({ dias_cierre: 5, comida_desde: "12:00" });
  });
  it("texto de impacto de la comida y confirmación reforzada de analisis_desde", () => {
    expect(Q.textosDeImpacto({ comida_desde: "12:00", comida_hasta: "15:00" })).toEqual([Q.TEXTO_IMPACTO_COMIDA]);
    expect(Q.TEXTO_IMPACTO_COMIDA).toBe("Cambiar la ventana de comida recalcula SOLO las quincenas abiertas; las cerradas conservan el valor con el que se calcularon.");
    expect(Q.requiereConfirmacionReforzada({ analisis_desde: "2026-10-01" })).toBe(true);
    expect(Q.requiereConfirmacionReforzada({ dias_cierre: 4 })).toBe(true);
    expect(Q.requiereConfirmacionReforzada({ cierre_automatico_desde: "2026-11-01" })).toBe(true);
    expect(Q.requiereConfirmacionReforzada({ comida_hasta: "15:00", margen_dia_completo_min: 5 })).toBe(false);
    expect(Q.textosDeImpacto({ analisis_desde: "x" })[0]).toMatch(/Analizar desde/);
    expect(Q.textosDeImpacto({ dias_cierre: 1, margen_dia_completo_min: 1, ventana_seguridad_dias: 1 })).toHaveLength(3);
    expect(Q.textosDeImpacto({ dias_cierre: 1 })[0]).toMatch(/CUÁNDO se congelan/);
    expect(Q.fraseCorrecta(" cambiar ")).toBe(true);
    expect(Q.fraseCorrecta("cambia")).toBe(false);
    expect(Q.fraseCorrecta(null)).toBe(false);
  });
  it("valores iniciales a texto", () => {
    expect(Q.valoresIniciales([{ clave: "dias_cierre", valor: 3 }])).toEqual({ dias_cierre: "3" });
    expect(Q.valoresIniciales(null)).toEqual({});
  });
});

describe("acceso a la gestión", () => {
  it("lee con Asistencia:edicion o Empleados:edicion; escribe solo con Asistencia:edicion", () => {
    expect(A.accesoGestionAsistencia(undefined, "edicion").cargando).toBe(true);
    expect(A.accesoGestionAsistencia("edicion", null)).toEqual({ cargando: false, puedeLeer: true, puedeEscribir: true });
    expect(A.accesoGestionAsistencia("consulta", "edicion")).toEqual({ cargando: false, puedeLeer: true, puedeEscribir: false });
    expect(A.accesoGestionAsistencia("consulta", "consulta")).toEqual({ cargando: false, puedeLeer: false, puedeEscribir: false });
    expect(A.accesoGestionAsistencia(null, null).puedeLeer).toBe(false);
  });
});

describe("quincenas que el cierre automático congelaría con valores nuevos", () => {
  const periodos = [
    { id: 4, estado: "abierto", fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31" },
    { id: 3, estado: "abierto", fecha_inicio: "2026-10-01", fecha_fin: "2026-10-15" },
    { id: 2, estado: "abierto", fecha_inicio: "2026-09-16", fecha_fin: "2026-09-30" },
    { id: 1, estado: "cerrado", fecha_inicio: "2026-09-01", fecha_fin: "2026-09-15" },
    { id: 5, estado: "abierto", no_cerrar_automatico: true, fecha_inicio: "2026-08-16", fecha_fin: "2026-08-31" },
  ];
  const ids = (r) => r.map((p) => p.id);
  it("misma regla del motor: abierta, no reabierta, fin >= cierre_automatico_desde y fin + dias_cierre <= hoy", () => {
    expect(ids(Q.quincenasQueSeCerrarian(periodos, "2026-10-23", { dias_cierre: 3, cierre_automatico_desde: "2026-10-16" }))).toEqual([]);
    expect(ids(Q.quincenasQueSeCerrarian(periodos, "2026-10-23", { dias_cierre: 3, cierre_automatico_desde: "2026-09-01" }))).toEqual([3, 2]);
    expect(ids(Q.quincenasQueSeCerrarian(periodos, "2026-10-23", { dias_cierre: 0, cierre_automatico_desde: "2026-09-01" }))).toEqual([3, 2]);
    expect(ids(Q.quincenasQueSeCerrarian(periodos, "2026-11-03", { dias_cierre: 3, cierre_automatico_desde: "2026-10-16" }))).toEqual([4]);
    expect(Q.quincenasQueSeCerrarian(null, "2026-11-03", { dias_cierre: 3, cierre_automatico_desde: "2026-10-16" })).toEqual([]);
  });
  it("el texto de impacto nombra las quincenas que se cerrarían por el cambio", () => {
    const originales = { dias_cierre: "3", cierre_automatico_desde: "2026-10-16" };
    const t = Q.textosDeImpacto({ cierre_automatico_desde: "2026-09-01" }, { periodos, hoy: "2026-10-23", originales });
    expect(t[0]).toMatch(/se cerrarían solas: 2026-10-01 a 2026-10-15, 2026-09-16 a 2026-09-30/);
    const t2 = Q.textosDeImpacto({ dias_cierre: 5 }, { periodos, hoy: "2026-10-23", originales });
    expect(t2[0]).toMatch(/no se cerraría ninguna quincena abierta adicional/);
  });
});

describe("cuadrícula apilada y CSV truncado", () => {
  it("en una columna Inicio/Fin llevan al primer y último día", () => {
    const { celdas } = R.construirCuadricula("2026-10-16", "2026-10-31", []);
    const primera = celdas.findIndex((c) => !c.vacia);
    const ultima = celdas.length - 1 - celdas.slice().reverse().findIndex((c) => !c.vacia);
    expect(R.celdaSiguiente(celdas, primera + 3, "End", 1)).toBe(ultima);
    expect(R.celdaSiguiente(celdas, ultima, "Home", 1)).toBe(primera);
  });
  it("el CSV truncado lo dice en su última fila (por tope o por datos incompletos)", () => {
    const dias = [1, 2, 3].map((i) => ({ fecha: `2026-10-0${i}`, nombre: "Ana", numero_nomina: "1", estatus: "falta", detalle: {} }));
    const porTope = R.construirCsvDetalle(dias, () => "", 2);
    expect(porTope.truncado).toBe(true);
    expect(porTope.texto.trim().split("\r\n").pop()).toBe("Se truncó a 2 filas: el archivo está incompleto");
    const incompleto = R.construirCsvDetalle(dias, () => "", 100, true);
    expect(incompleto.truncado).toBe(true);
    expect(incompleto.filas).toBe(3);
    expect(incompleto.texto).toContain("Se truncó a 3 filas");
    expect(R.construirCsvDetalle(dias, () => "", 100).texto).not.toContain("truncó");
    expect(R.construirCsvResumen([{ nombre: "A", numero_nomina: "1" }], 100, true).texto).toContain("Se truncó a 1 filas");
    expect(R.TOPE_FILAS_EXPORTACION).toBe(15000);
  });
  it("el CSV conserva nombre y nómina, sin_turno es una categoría y la columna es el estado de la quincena", () => {
    expect(R.ORDEN_TARJETAS).toContain("sin_turno");
    const t = R.totalesDeResumen([{ sin_turno: 4, puntual: 1 }]);
    expect(t.sin_turno).toBe(4);
    expect(R.COLUMNAS_RESUMEN.map((c) => c.clave)).toEqual(expect.arrayContaining(["nombre", "nomina", "sin_turno"]));
    expect(R.COLUMNAS_DETALLE.find((c) => c.clave === "periodo").titulo).toBe("Estado de la quincena");
    expect(R.ATAJOS.find((a) => a.id === "faltas_con_marcas").ayuda).toMatch(/marca suelta o salida sin entrada/);
  });
});

describe("menú: entradas con `requiere`", () => {
  const REQ = [["Asistencia", "edicion"], ["Empleados", "edicion"]];
  const ver = (permisos, usuario = { rol_nombre: "x" }) => M.tieneAccesoMenu({ usuario, permisos, modulo: "rh", opcion: "Asistencia", estricto: true, requiere: REQ });
  const p = (opcion, tipo) => ({ modulo: "rh", opcion, tipo });
  it("rh_empleado (Asistencia:consulta) y portal_admin no las ven; rh_admin, Empleados:edicion y super_admin sí", () => {
    expect(ver([p("Asistencia", "consulta"), p("Vacaciones", "consulta")])).toBe(false);
    expect(ver([])).toBe(false);
    expect(ver([p("Asistencia", "edicion")])).toBe(true);
    expect(ver([p("Asistencia", "consulta"), p("Empleados", "edicion")])).toBe(true);
    expect(ver([], { rol_nombre: "super_admin" })).toBe(true);
    expect(ver([{ modulo: "tickets", opcion: "Asistencia", tipo: "edicion" }])).toBe(false);
  });
  it("sin `requiere` mantiene el comportamiento anterior (estricto y lista vacía)", () => {
    const base = { usuario: {}, modulo: "rh", opcion: "Turnos" };
    expect(M.tieneAccesoMenu({ ...base, permisos: [] })).toBe(true);
    expect(M.tieneAccesoMenu({ ...base, permisos: [], estricto: true })).toBe(false);
    expect(M.tieneAccesoMenu({ ...base, permisos: [p("Turnos", "consulta")], estricto: true })).toBe(true);
    expect(M.tieneAccesoMenu({ ...base, permisos: [p("Marcas", "consulta")] })).toBe(false);
    expect(M.tieneAccesoMenu({ ...base, opcion: null, permisos: [p("X", "consulta")] })).toBe(true);
  });
});
