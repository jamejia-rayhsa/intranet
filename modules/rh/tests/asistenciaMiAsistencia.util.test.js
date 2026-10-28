// Lógica pura de «Mi asistencia» y «Mi equipo»: redacción en lenguaje claro, estados vacíos, quincenas, equipo y menú.
const path = require("path");
const { cargarUtilEsm } = require("./cargarUtilEsm");

const U = cargarUtilEsm("asistenciaMiAsistencia.js");
const R = cargarUtilEsm("asistenciaResultados.js");
const F = cargarUtilEsm("asistenciaFechas.js");
const M = cargarUtilEsm("menuAcceso.js", path.join(__dirname, "../../portal/frontend/utils"));

const hora = F.horaLocal;
// 2026-10-05 en México es UTC-6: 08:14 local = 14:14Z
const ts = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `2026-10-05T${String(h + 6).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
};
const marca = (hhmm, rol) => ({ marca_ts: ts(hhmm), rol, terminal_alias: "A" });
const DIA = {
  fecha: "2026-10-05", estatus: "puntual", minutos_retardo: 0, minutos_salida_anticipada: 0, turno_nombre: "Rayhsa",
  entrada_programada: "08:00", salida_programada: "17:00", cruza_medianoche: false, tolerancia_retardo_min: 10, tolerancia_salida_min: 3,
  umbral_falta_min: 30, ventana_entrada_despues_min: 150, descanso_min: 60, detalle: { banderas: [], comida: { desde: "13:00", hasta: "16:00", marcas: 0 } },
};
const redactar = (dia, marcas = [], cruces = {}, persona = "yo") => U.redactarDia({ dia: { ...DIA, ...dia }, marcas, cruces, hora, persona });

describe("horaLocal", () => {
  it("convierte a la hora de México con Intl y no depende de la zona del navegador", () => {
    expect(F.horaLocal("2026-10-05T14:14:00.000Z")).toBe("08:14");
    expect(F.horaLocal("2026-10-06T05:59:59.000Z")).toBe("23:59");
    expect(F.horaLocal(null)).toBe("—");
    expect(F.horaLocal("2026-10-05T14:14:00")).toBe("—"); // sin zona: no se interpreta
  });
});

describe("fechas legibles", () => {
  it("el mensaje del inicio del análisis nombra el día completo", () => {
    expect(U.fechaLegible("2026-09-01")).toBe("1 de septiembre de 2026");
    expect(U.mensajeAnalisisDesde("2026-09-01")).toBe("El análisis de asistencia empieza el 1 de septiembre de 2026, así que los días anteriores no se califican.");
    expect(U.fechaLegible("2026-13-01")).toBe("");
    expect(U.fechaLegible("x")).toBe("");
  });
  it("nombre del día sin desfase de zona", () => {
    expect(U.nombreDelDia("2026-10-05")).toBe("lunes");
    expect(U.nombreDelDia("2026-10-04")).toBe("domingo");
  });
});

describe("avisos del periodo", () => {
  it("abierta avisa que puede cambiar y cerrada que es definitiva", () => {
    expect(U.avisoDelPeriodo("abierto")).toEqual({ tono: "info", texto: "Quincena abierta: tus resultados pueden cambiar." });
    expect(U.avisoDelPeriodo("cerrado")).toEqual({ tono: "ok", texto: "Quincena cerrada: resultado definitivo." });
    expect(U.avisoDelPeriodo("abierto", { equipo: true }).texto).toMatch(/de tu equipo/);
    expect(U.avisoDelPeriodo(undefined).tono).toBe("info");
  });
});

describe("estado de la cuenta", () => {
  const ctx = (empleado, extra = {}) => ({ vinculado: true, empleado: { tiene_nomina: true, nomina_compartida: false, turno: { nombre: "R" }, ...empleado }, ...extra });
  it("sin empleado vinculado bloquea con el mensaje pedido", () => {
    for (const c of [null, { vinculado: false, empleado: null }]) {
      expect(U.estadoDeCuenta(c)).toEqual({ bloquea: true, tipo: "sin_vinculo", mensaje: "Tu cuenta no está vinculada a un empleado. Avisa a RH para que la vinculen y puedas ver tu asistencia." });
    }
  });
  it("sin nómina bloquea y dice qué hacer", () => {
    const e = U.estadoDeCuenta(ctx({ tiene_nomina: false }));
    expect(e.bloquea).toBe(true);
    expect(e.mensaje).toBe("Tu registro aún no tiene número de nómina, así que tus marcas no se pueden relacionar: avisa a RH.");
  });
  it("nómina compartida bloquea; sin turno avisa pero no bloquea; todo en orden = null", () => {
    expect(U.estadoDeCuenta(ctx({ nomina_compartida: true }))).toMatchObject({ bloquea: true, tipo: "nomina_compartida" });
    expect(U.estadoDeCuenta(ctx({ turno: null }))).toMatchObject({ bloquea: false, tipo: "sin_turno" });
    expect(U.estadoDeCuenta(ctx({}))).toBeNull();
  });
  it("es jefe se lee del servidor sin suposiciones", () => {
    expect(U.esJefe({ es_jefe: true })).toBe(true);
    expect(U.esJefe({ es_jefe: "true" })).toBe(true); // truthy del JSON del servidor
    expect(U.esJefe({})).toBe(false);
    expect(U.esJefe(null)).toBe(false);
  });
});

describe("quincenas", () => {
  const p = (i, f, estado = "cerrado", id = i) => ({ id, fecha_inicio: i, fecha_fin: f, estado });
  const lista = [p("2026-11-01", "2026-11-15", "abierto"), p("2026-10-16", "2026-10-31", "abierto"), p("2026-10-01", "2026-10-15"), p("2026-09-16", "2026-09-30"), p("2026-09-01", "2026-09-15"), p("2026-08-16", "2026-08-31")];
  it("muestra desde el inicio del análisis hasta la actual, de la más nueva a la más vieja (sin futuras ni anteriores)", () => {
    const v = U.quincenasVisibles(lista, "2026-09-01", "2026-10-28");
    expect(v.map((q) => q.fecha_inicio)).toEqual(["2026-10-16", "2026-10-01", "2026-09-16", "2026-09-01"]);
  });
  it("una quincena que contiene el inicio del análisis a mitad se conserva", () => {
    expect(U.quincenasVisibles(lista, "2026-09-10", "2026-10-28").map((q) => q.fecha_inicio)).toContain("2026-09-01");
  });
  it("si la actual aún no existe en el servidor se agrega la del contexto", () => {
    const v = U.quincenasVisibles([p("2026-10-01", "2026-10-15")], "2026-09-01", "2026-10-28", { id: null, fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31", estado: "abierto" });
    expect(v[0]).toEqual({ id: null, fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31", estado: "abierto" });
    // y no se duplica si ya estaba
    expect(U.quincenasVisibles(lista, "2026-09-01", "2026-10-28", { fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31" }).filter((q) => q.fecha_inicio === "2026-10-16")).toHaveLength(1);
  });
  it("entradas inválidas no rompen", () => {
    expect(U.quincenasVisibles(null, "2026-09-01", "2026-10-28")).toEqual([]);
    expect(U.quincenasVisibles([null, { fecha_inicio: "x" }], "2026-09-01", "2026-10-28")).toEqual([]);
  });
  it("por omisión la actual; si no, la más reciente", () => {
    const v = U.quincenasVisibles(lista, "2026-09-01", "2026-10-28");
    expect(U.quincenaPorOmision(v, "2026-10-28").fecha_inicio).toBe("2026-10-16");
    expect(U.quincenaPorOmision(v, "2026-12-01").fecha_inicio).toBe("2026-10-16");
    expect(U.quincenaPorOmision([], "2026-10-28")).toBeNull();
  });
  it("el texto del selector dice abierta/cerrada y marca la actual (fechas AAAA-MM-DD)", () => {
    expect(U.textoQuincena(p("2026-10-16", "2026-10-31", "abierto"), "2026-10-28")).toBe("2026-10-16 a 2026-10-31 · abierta (actual)");
    expect(U.textoQuincena(p("2026-10-01", "2026-10-15"), "2026-10-28")).toBe("2026-10-01 a 2026-10-15 · cerrada");
  });
});

describe("contarDias y tarjetas", () => {
  it("cuenta por estatus y alimenta el % de puntualidad del resumen", () => {
    const dias = [
      { estatus: "puntual", primera_marca: "x" }, { estatus: "puntual", primera_marca: "x" }, { estatus: "retardo", minutos_retardo: 14, primera_marca: "x" },
      { estatus: "falta" }, { estatus: "descanso" }, { estatus: "justificada", minutos_retardo: 5, primera_marca: "x" }, { estatus: "raro" }, null,
    ];
    const c = U.contarDias(dias);
    expect(c).toMatchObject({ puntual: 2, retardo: 1, falta: 1, descanso: 1, justificada: 1, dias: 7, minutos_retardo: 19, dias_con_marcas: 4 });
    expect(R.diasEvaluados(c)).toBe(5);
    expect(R.porcentajePuntualidad(c)).toBe(40);
    expect(U.contarDias(null).dias).toBe(0);
  });
});

describe("redactarDia — explicaciones en lenguaje de persona", () => {
  it("puntual: horas de entrada y salida y por qué cuenta como puntual", () => {
    const t = redactar({ estatus: "puntual", detalle: { ...DIA.detalle, minutos_tarde: 0 } }, [marca("07:58", "entrada"), marca("17:02", "salida")]);
    expect(t.frase).toBe("Llegaste a las 07:58 y saliste a las 17:02. Todo está dentro del horario y de la tolerancia, por eso cuenta como puntual.");
    expect(t.horario).toBe("Tu horario ese día: 08:00 a 17:00 (turno Rayhsa).");
  });
  it("retardo: horario, hora real, minutos tarde, tolerancia y minutos de retardo", () => {
    const t = redactar({ estatus: "retardo", minutos_retardo: 14, detalle: { ...DIA.detalle, minutos_tarde: 14 } }, [marca("08:14", "entrada"), marca("17:00", "salida")]);
    expect(t.frase).toBe("Tu horario de entrada es a las 08:00 y llegaste a las 08:14 (14 minutos tarde). La tolerancia es de 10 minutos, por eso cuenta como retardo de 14 minutos.");
  });
  it("retardo con un solo minuto usa el singular", () => {
    const t = redactar({ estatus: "retardo", minutos_retardo: 1, tolerancia_retardo_min: 0, detalle: { ...DIA.detalle, minutos_tarde: 1 } }, [marca("08:01", "entrada")]);
    expect(t.frase).toMatch(/\(1 minuto tarde\)\. La tolerancia es de 0 minutos, por eso cuenta como retardo de 1 minuto\./);
  });
  it("retardo y además salida anticipada lo dice en una nota aparte", () => {
    const t = redactar({ estatus: "retardo", minutos_retardo: 12, minutos_salida_anticipada: 20, detalle: { ...DIA.detalle, minutos_tarde: 12 } }, [marca("08:12", "entrada"), marca("16:40", "salida")]);
    expect(t.explicaciones).toEqual(["Además saliste 20 minutos antes de la hora de salida (17:00)."]);
  });
  it("falta sin ninguna marca: «No hay marca de entrada»", () => {
    const t = redactar({ estatus: "falta" }, []);
    expect(t.frase).toBe("No hay marca de entrada ni ninguna otra marca este día, por eso cuenta como falta.");
  });
  it("falta con marcas pero sin entrada válida: dice hasta qué hora y la primera marca", () => {
    const t = redactar({ estatus: "falta" }, [marca("14:10", "otra")]);
    expect(t.frase).toBe("No hay marca de entrada hasta las 10:30, por eso cuenta como falta.");
    expect(t.explicaciones[0]).toMatch(/primera marca del día fue a las 14:10/);
  });
  it("falta por llegar después del umbral", () => {
    const t = redactar({ estatus: "falta", detalle: { ...DIA.detalle, minutos_tarde: 45 } }, [marca("08:45", "entrada")]);
    expect(t.frase).toMatch(/Pasados 30 minutos de retraso ya no cuenta como retardo sino como falta\./);
  });
  it("incompleta con última marca en la comida: el texto pedido", () => {
    const t = redactar({ estatus: "incompleta", detalle: { ...DIA.detalle, banderas: ["ultima_marca_en_comida"] } }, [marca("08:02", "entrada"), marca("14:10", "comida")]);
    expect(t.frase).toBe("Tu última marca fue a las 14:10, dentro del horario de comida; si saliste a comer y no regresaste a checar, o te retiraste temprano, RH puede revisarlo.");
  });
  it("incompleta sin salida y con marcas sueltas", () => {
    expect(redactar({ estatus: "incompleta" }, [marca("08:02", "entrada")]).frase).toMatch(/Hay marca de entrada \(08:02\) pero no hay marca de salida/);
    expect(redactar({ estatus: "incompleta", detalle: { ...DIA.detalle, banderas: ["marca_intermedia_sin_salida"] } }, [marca("08:02", "entrada"), marca("10:00", "otra")]).frase).toMatch(/marcas sueltas/);
  });
  it("salida anticipada con los minutos y la tolerancia de salida", () => {
    const t = redactar({ estatus: "salida_anticipada", minutos_salida_anticipada: 40, detalle: { ...DIA.detalle, minutos_antes_salida: 40 } }, [marca("08:00", "entrada"), marca("16:20", "salida")]);
    expect(t.frase).toBe("Saliste a las 16:20, 40 minutos antes de la hora de salida (17:00). La tolerancia de salida es de 3 minutos, por eso cuenta como salida anticipada.");
  });
  it("comida de 2 marcas: duración y turno; con exceso lo marca solo informativo", () => {
    const base = { ...DIA.detalle, minutos_comida: 55 };
    const a = redactar({ estatus: "puntual", detalle: base }, [marca("08:00", "entrada"), marca("13:05", "comida"), marca("14:00", "comida"), marca("17:00", "salida")]);
    expect(a.comida).toBe("Tu comida duró 55 minutos (de 13:05 a 14:00). Tu turno marca 60 minutos de comida.");
    const b = redactar({ estatus: "puntual", detalle: { ...base, minutos_comida: 65, exceso_comida_min: 5 } }, [marca("13:00", "comida"), marca("14:05", "comida")]);
    expect(b.comida).toBe("Tu comida duró 65 minutos (de 13:00 a 14:05). Son 5 minutos más de los 60 que marca tu turno; es solo informativo y no cambia el resultado.");
  });
  it("comida de 4 marcas: las lista y mide de la primera a la última", () => {
    const t = redactar({ estatus: "puntual", detalle: { ...DIA.detalle, minutos_comida: 80 } }, [marca("13:00", "comida"), marca("13:30", "comida"), marca("14:00", "comida"), marca("14:20", "comida")]);
    expect(t.comida).toBe("Tu comida duró 80 minutos (marcas a las 13:00, 13:30, 14:00, 14:20, de la primera a la última). Tu turno marca 60 minutos de comida.");
  });
  it("una sola marca de comida: no se puede saber cuánto duró", () => {
    expect(redactar({ estatus: "puntual" }, [marca("13:10", "comida")]).comida).toMatch(/una sola marca de comida \(13:10\): no se puede saber cuánto duró/);
  });
  it("vacaciones, permiso, festivo y descanso explican el cruce", () => {
    expect(redactar({ estatus: "vacaciones" }, [], { vacaciones: { fecha_inicial: "2026-10-05", fecha_final: "2026-10-09" } }).frase).toBe("Tienes vacaciones aprobadas del 2026-10-05 al 2026-10-09, por eso este día no se califica.");
    expect(redactar({ estatus: "permiso" }, [], { permiso: { tipo: "salud", fecha_inicio: "2026-10-05", fecha_fin: "2026-10-05" } }).frase).toMatch(/permiso aprobado \(salud\)/);
    expect(redactar({ estatus: "festivo" }, [], { festivo: { nombre: "Día de la Independencia" } }).frase).toMatch(/\(Día de la Independencia\)/);
    expect(redactar({ estatus: "descanso" }).frase).toBe("Es tu día de descanso según tu turno, por eso no se califica.");
  });
  it("sin turno y pendiente", () => {
    expect(redactar({ estatus: "sin_turno" }).frase).toMatch(/No tienes un turno asignado este día/);
    const p = redactar({ estatus: "pendiente", detalle: { ...DIA.detalle, calculo_provisional: "retardo" } }, [marca("08:14", "entrada")]);
    expect(p.frase).toBe("El día aún no termina, por eso el resultado es provisional.");
    expect(p.explicaciones).toEqual(["Tu primera marca fue a las 08:14.", "Con lo registrado hasta ahora contaría como retardo, pero puede cambiar."]);
  });
  it("justificada: el motivo se muestra, quien justificó es «RH» para el empleado y el nombre solo si el servidor lo entregó", () => {
    const dia = { estatus: "justificada", detalle: { ...DIA.detalle, calculo_original: { estatus: "retardo", minutos_retardo: 14 } } };
    const t = redactar(dia, [], { justificacion: { motivo: "Cita médica", creado_por_nombre: null } });
    expect(t.justificacion).toEqual({ motivo: "Cita médica", quien: "RH" });
    expect(t.original).toBe("Sin la justificación habría contado como retardo de 14 minutos.");
    expect(redactar(dia, [], { justificacion: { motivo: "Cita médica", creado_por_nombre: "Ana Pérez" } }).justificacion.quien).toBe("Ana Pérez");
    expect(redactar(dia, [], {}).justificacion).toBeNull();
  });
  it("persona 'equipo' usa tercera persona", () => {
    const t = redactar({ estatus: "retardo", minutos_retardo: 14, detalle: { ...DIA.detalle, minutos_tarde: 14 } }, [marca("08:14", "entrada")], {}, "equipo");
    expect(t.frase).toMatch(/^Su horario de entrada es a las 08:00 y llegó a las 08:14/);
    const i = redactar({ estatus: "incompleta", detalle: { ...DIA.detalle, banderas: ["ultima_marca_en_comida"] } }, [marca("14:10", "comida")], {}, "equipo");
    expect(i.frase).toBe("Su última marca fue a las 14:10, dentro del horario de comida; si salió a comer y no regresó a checar, o se retiró temprano, RH puede revisarlo.");
    expect(redactar({ estatus: "descanso" }, [], {}, "equipo").frase).toMatch(/su día de descanso según su turno/);
  });
  it("las banderas técnicas no se muestran tal cual: solo las que la persona puede entender", () => {
    const t = redactar({ estatus: "puntual", detalle: { ...DIA.detalle, banderas: ["marcas_duplicadas", "nomina_duplicada", "turno_inactivo", "dia_pendiente", "bandera_rara"] } });
    expect(t.revisar).toEqual(["Algunas marcas estaban a menos de un minuto una de otra: cuentan como una sola checada."]);
  });
  it("las marcas salen en hora local con su rol; el instante UTC queda para el cursor", () => {
    const t = redactar({ estatus: "puntual" }, [marca("08:02", "entrada"), marca("13:05", "comida"), marca("08:02", "duplicada"), marca("11:00", "otra")]);
    expect(t.marcas.map((m) => [m.hora, m.etiqueta])).toEqual([
      ["08:02", "Entrada"], ["13:05", "Comida"], ["08:02", "Repetida (a menos de un minuto de otra)"], ["11:00", "Marca que no se usó para calificar"],
    ]);
    expect(t.marcas[0].instante).toBe("2026-10-05T14:02:00.000Z");
  });
  it("siempre ofrece contactar a RH y no revienta con datos vacíos", () => {
    expect(redactar({ estatus: "puntual" }).ayuda).toMatch(/avisa a RH/);
    const t = U.redactarDia({ dia: null, hora });
    expect(t.frase).toBe("Este día no tiene un resultado calculado.");
    expect(t.marcas).toEqual([]);
  });
  it("no contiene vocabulario técnico", () => {
    const todos = [
      redactar({ estatus: "retardo", minutos_retardo: 14, detalle: { ...DIA.detalle, minutos_tarde: 14, banderas: ["marcas_duplicadas"] } }, [marca("08:14", "entrada"), marca("13:05", "comida"), marca("14:00", "comida")]),
      redactar({ estatus: "incompleta", detalle: { ...DIA.detalle, banderas: ["ultima_marca_en_comida"] } }, [marca("14:10", "comida")]),
      redactar({ estatus: "falta" }, []),
    ];
    for (const t of todos) {
      const texto = [t.frase, ...t.explicaciones, t.horario, t.comida, ...t.revisar].join(" ");
      expect(texto).not.toMatch(/bandera|snapshot|motor|detalle|calculo_|ultima_marca_en_comida|_min\b|null|undefined|NaN/i);
    }
  });
});

describe("mensajeSinResultado", () => {
  const ctx = { vinculado: true, empleado: { tiene_nomina: true, nomina_compartida: false, turno: {} } };
  const base = { hoy: "2026-10-28", analisisDesde: "2026-09-01", contexto: ctx };
  it("fecha anterior al análisis", () => {
    expect(U.mensajeSinResultado({ ...base, fecha: "2026-08-31" })).toMatch(/^El análisis de asistencia empieza el 1 de septiembre de 2026/);
  });
  it("día futuro, hoy y día sin cálculo", () => {
    expect(U.mensajeSinResultado({ ...base, fecha: "2026-10-30" })).toMatch(/todavía no llega/);
    expect(U.mensajeSinResultado({ ...base, fecha: "2026-10-28" })).toMatch(/Hoy todavía no tiene resultado/);
    expect(U.mensajeSinResultado({ ...base, fecha: "2026-10-10" })).toMatch(/avisa a RH/);
  });
  it("sin nómina, sin vínculo y la versión del jefe", () => {
    expect(U.mensajeSinResultado({ ...base, fecha: "2026-10-10", contexto: { vinculado: true, empleado: { tiene_nomina: false } } })).toMatch(/aún no tiene número de nómina/);
    expect(U.mensajeSinResultado({ ...base, fecha: "2026-10-10", contexto: { vinculado: false } })).toMatch(/no está vinculada a un empleado/);
    expect(U.mensajeSinResultado({ ...base, fecha: "2026-10-10", persona: "equipo", tieneNomina: false })).toMatch(/Esta persona no tiene número de nómina/);
    // un jefe sin nómina propia ve la explicación de SU equipo, no la suya
    expect(U.mensajeSinResultado({ ...base, fecha: "2026-10-10", persona: "equipo", contexto: { vinculado: false } })).toMatch(/Este día no tiene un resultado calculado/);
  });
});

describe("Mi equipo: estado de hoy", () => {
  const ahoraMin = 9 * 60;
  const f = (o) => ({ tiene_nomina: true, marcas_hoy: 0, entrada_programada: "08:00", salida_programada: "17:00", ...o });
  const estado = (o, min = ahoraMin) => U.estadoHoyEquipo(f(o), { hora, ahoraMin: min });
  it("pendiente con primera marca: «Ya checó a las 08:03»", () => {
    const e = estado({ dia_estatus: "pendiente", marcas_hoy: 1, primera_marca: ts("08:03") });
    expect(e).toMatchObject({ clave: "ya_checo", etiqueta: "Ya checó", texto: "Ya checó a las 08:03." });
  });
  it("con varias marcas agrega la última", () => {
    expect(estado({ dia_estatus: "pendiente", marcas_hoy: 3, primera_marca: ts("08:03"), ultima_marca: ts("13:05") }).texto).toBe("Ya checó a las 08:03; su última marca fue a las 13:05.");
  });
  it("sin marca y dentro del horario: «Aún no checa»", () => {
    expect(estado({ dia_estatus: "pendiente" })).toMatchObject({ clave: "aun_no_checa", texto: "Aún no checa. Su entrada es a las 08:00." });
  });
  it("sin marca y ya pasó su hora de salida: no dice «aún no checa»", () => {
    expect(estado({ dia_estatus: "pendiente" }, 17 * 60 + 5).clave).toBe("sin_marca_hoy");
  });
  it("vacaciones, permiso, festivo y descanso", () => {
    expect(estado({ dia_estatus: "vacaciones" }).texto).toBe("De vacaciones.");
    expect(estado({ dia_estatus: "permiso" }).clave).toBe("permiso");
    expect(estado({ dia_estatus: "festivo" }).clave).toBe("festivo");
    expect(estado({ dia_estatus: "descanso" }).clave).toBe("descanso");
  });
  it("falta y retardo ya definidos", () => {
    expect(estado({ dia_estatus: "falta" }).texto).toBe("Falta: no hay marca de entrada.");
    expect(estado({ dia_estatus: "retardo", minutos_retardo: 14, primera_marca: ts("08:14") }).texto).toBe("Retardo de 14 minutos (entró a las 08:14).");
    expect(estado({ dia_estatus: "incompleta", ultima_marca_en_comida: true, ultima_marca: ts("14:10") }).texto).toMatch(/su última marca fue a las 14:10, dentro de la comida/);
    expect(estado({ dia_estatus: "puntual", primera_marca: ts("07:58") }).texto).toBe("Puntual: entró a las 07:58.");
  });
  it("sin nómina: «Sin nómina: no se analiza» aunque haya marcas", () => {
    const e = estado({ tiene_nomina: false, dia_estatus: "pendiente", marcas_hoy: 2, primera_marca: ts("08:00") });
    expect(e.clave).toBe("sin_nomina");
    expect(e.texto).toMatch(/^Sin nómina: no se analiza/);
  });
  it("sin fila de hoy: con marcas dice cuándo checó, sin marcas avisa que aún no hay resultado", () => {
    expect(estado({ dia_estatus: null, marcas_hoy: 1, primera_hoy: ts("08:20") }).texto).toMatch(/^Ya checó a las 08:20\. Su resultado aún no se calcula/);
    expect(estado({ dia_estatus: null }).clave).toBe("sin_resultado");
    expect(U.estadoHoyEquipo(null, { hora }).clave).toBe("sin_nomina");
  });
  it("los íconos y tonos son los mismos de ESTATUS (no se desalinean)", () => {
    for (const [clave, info] of Object.entries(R.ESTATUS)) {
      expect(U.VISUAL_HOY[clave]).toEqual({ tono: info.tono, icono: info.icono });
    }
  });
  it("resumen del panel Hoy", () => {
    const e = (clave) => ({ clave });
    expect(U.resumenHoy([e("ya_checo"), e("ya_checo"), e("aun_no_checa"), e("vacaciones"), e("sin_nomina")])).toBe("5 personas: 2 ya checaron, 1 aún no checa, 1 no trabaja hoy, 1 sin nómina.");
    expect(U.resumenHoy([])).toBe("No hay personas en tu equipo.");
    expect(U.resumenHoy([e("puntual")])).toBe("1 persona: 1 ya checó.");
  });
});

describe("Mi equipo: tabla y atajos", () => {
  const equipo = [
    { empleado_id: 1, nombre: "Ana", apellido_paterno: "Soto", numero_nomina: "100", tiene_nomina: true, estatus: "activo", dia_estatus: "pendiente", marcas_hoy: 1, primera_marca: ts("08:03") },
    { empleado_id: 2, nombre: "Luis", apellido_paterno: "Ñandú", numero_nomina: "200", tiene_nomina: true, estatus: "activo", dia_estatus: "pendiente" },
    { empleado_id: 3, nombre: "Sin", apellido_paterno: "Nómina", numero_nomina: null, tiene_nomina: false, estatus: "activo" },
  ];
  const resumen = [
    { empleado_id: 1, nombre: "Ana", puntual: 8, retardo: 3, falta: 1, dias_con_marcas: 12, incompleta: 0 },
    { empleado_id: 2, nombre: "Luis", puntual: 0, falta: 5, retardo: 0, incompleta: 2, dias_con_marcas: 0 },
    { empleado_id: 9, nombre: "Beto", apellido_paterno: "Baja", puntual: 4, dias_con_marcas: 4 }, // dado de baja dentro del rango
  ];
  const filas = U.combinarEquipo(equipo, resumen, { hora, ahoraMin: 9 * 60 });
  it("une la lista del día con el resumen: sin nómina aparece con ceros y la bandera; los de baja se agregan", () => {
    expect(filas.map((x) => x.empleado_id)).toEqual([1, 2, 3, 9]);
    expect(filas[2]).toMatchObject({ sin_nomina: true, puntual: 0, falta: 0 });
    expect(filas[3]).toMatchObject({ de_baja: true, hoy: null, puntual: 4 });
    expect(filas[0].hoy.texto).toBe("Ya checó a las 08:03.");
    expect(U.combinarEquipo(null, null)).toEqual([]);
  });
  it("atajos: más faltas, más retardos, incompletas y sin ninguna marca", () => {
    expect(U.filtrarEquipo(filas, { atajo: "mas_faltas" }).map((x) => x.empleado_id)).toEqual([2, 1]);
    expect(U.filtrarEquipo(filas, { atajo: "mas_retardos" }).map((x) => x.empleado_id)).toEqual([1]);
    expect(U.filtrarEquipo(filas, { atajo: "incompletas" }).map((x) => x.empleado_id)).toEqual([2]);
    expect(U.filtrarEquipo(filas, { atajo: "sin_marcas" }).map((x) => x.empleado_id)).toEqual([2]); // quien no tiene nómina no entra
  });
  it("busca por nombre o nómina sin acentos ni mayúsculas y ordena por nombre", () => {
    expect(U.filtrarEquipo(filas, { texto: "nandu" }).map((x) => x.empleado_id)).toEqual([2]);
    expect(U.filtrarEquipo(filas, { texto: "100" }).map((x) => x.empleado_id)).toEqual([1]);
    expect(U.filtrarEquipo(filas, {}).map((x) => x.empleado_id)).toEqual([1, 9, 2, 3]);
  });
  it("textos de la tabla", () => {
    expect(U.incidenciasDeFila({ falta: 2, retardo: 1 })).toBe("2 faltas, 1 retardo");
    expect(U.incidenciasDeFila({})).toBe("Sin incidencias");
    expect(U.textoEquipoFiltrado(1, 3)).toBe("1 de 3 personas con el filtro aplicado.");
    expect(U.textoEquipoFiltrado(3, 3)).toBe("3 personas en tu equipo.");
    expect(U.textoEquipoFiltrado(0, 0)).toBe("No hay personas en tu equipo.");
  });
});

describe("menú según el contexto del servidor", () => {
  it("sin contexto (cargando, error o sin permiso) la entrada NO se muestra; sin requisito siempre", () => {
    expect(M.visibleSegunContexto(undefined, null)).toBe(true);
    expect(M.visibleSegunContexto("empleado", null)).toBe(false);
    expect(M.visibleSegunContexto("jefe", undefined)).toBe(false);
  });
  it("«Mi asistencia» exige empleado vinculado y «Mi equipo» ser jefe", () => {
    expect(M.visibleSegunContexto("empleado", { vinculado: true })).toBe(true);
    expect(M.visibleSegunContexto("empleado", { vinculado: false, es_jefe: false })).toBe(false);
    expect(M.visibleSegunContexto("jefe", { vinculado: true, es_jefe: false })).toBe(false);
    expect(M.visibleSegunContexto("jefe", { vinculado: true, es_jefe: true })).toBe(true);
    expect(M.visibleSegunContexto("otro", { vinculado: true, es_jefe: true })).toBe(false);
  });
  it("combinado con el permiso: requiere Asistencia:consulta o edicion en modo estricto", () => {
    const requiere = [["Asistencia", "consulta"], ["Asistencia", "edicion"]];
    const ver = (permisos, usuario = { rol_nombre: "x" }) => M.tieneAccesoMenu({ usuario, permisos, modulo: "rh", opcion: "Asistencia", requiere });
    expect(ver([{ modulo: "rh", opcion: "Asistencia", tipo: "consulta" }])).toBe(true);
    expect(ver([{ modulo: "rh", opcion: "Asistencia", tipo: "edicion" }])).toBe(true);
    expect(ver([{ modulo: "rh", opcion: "Turnos", tipo: "edicion" }])).toBe(false);
    expect(ver([])).toBe(false); // modo estricto: lista vacía no abre nada
    expect(ver([{ modulo: "tickets", opcion: "Asistencia", tipo: "consulta" }])).toBe(false);
    expect(ver([], { rol_nombre: "super_admin" })).toBe(true);
  });
});
