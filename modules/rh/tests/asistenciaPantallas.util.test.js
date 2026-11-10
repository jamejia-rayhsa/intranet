// Lógica pura de las pantallas de administración de Asistencia (modules/rh/frontend/utils/asistencia*.js).
const { cargarUtilEsm } = require("./cargarUtilEsm");

const F = cargarUtilEsm("asistenciaFechas.js");
const T = cargarUtilEsm("asistenciaTurnos.js");
const M = cargarUtilEsm("asistenciaMarcas.js");
const L = cargarUtilEsm("asistenciaLlaves.js");

describe("asistenciaFechas - hora local de México", () => {
  it("convierte un instante UTC a la hora local de México (UTC-6 sin horario de verano)", () => {
    expect(F.formatoLocal("2026-10-01T14:03:12Z")).toBe("2026-10-01 08:03:12");
    expect(F.formatoLocal("2026-07-15T14:03:12.000Z")).toBe("2026-07-15 08:03:12");
  });

  it("cruza el cambio de día: 03:30Z es la tarde-noche del día anterior en México", () => {
    expect(F.formatoLocal("2026-01-01T03:30:00Z")).toBe("2025-12-31 21:30:00");
    expect(F.formatoLocal("2026-01-01T05:59:59Z")).toBe("2025-12-31 23:59:59");
    expect(F.formatoLocal("2026-01-01T06:00:00Z")).toBe("2026-01-01 00:00:00");
  });

  it("acepta desfases explícitos y rechaza texto sin zona (evita interpretarlo en la zona del navegador)", () => {
    expect(F.formatoLocal("2026-10-01T08:00:00-06:00")).toBe("2026-10-01 08:00:00");
    expect(F.formatoLocal("2026-10-01T08:00:00")).toBe("—");
    expect(F.formatoLocal("2026-10-01")).toBe("—");
    expect(F.formatoLocal(null)).toBe("—");
    expect(F.formatoLocal("basura")).toBe("—");
  });

  it("el título UTC es el instante exacto", () => {
    expect(F.instanteUtc("2026-10-01T08:00:00-06:00")).toBe("2026-10-01T14:00:00Z");
    expect(F.instanteUtc(undefined)).toBe("");
  });

  it("la fecha de hoy en México no depende de la zona del proceso", () => {
    expect(F.fechaMexicoHoy(new Date("2026-10-23T05:59:00Z"))).toBe("2026-10-22");
    expect(F.fechaMexicoHoy(new Date("2026-10-23T06:00:00Z"))).toBe("2026-10-23");
  });
});

describe("asistenciaFechas - fechas como texto", () => {
  it("valida fechas reales", () => {
    expect(F.esFechaReal("2028-02-29")).toBe(true);
    expect(F.esFechaReal("2027-02-29")).toBe(false);
    expect(F.esFechaReal("2026-13-01")).toBe(false);
    expect(F.esFechaReal("2026-1-1")).toBe(false);
    expect(F.esFechaReal(20261001)).toBe(false);
  });

  it("suma días sin desfase en cambios de mes y de año", () => {
    expect(F.sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(F.sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(F.sumarDias("2026-10-23", -6)).toBe("2026-10-17");
    expect(F.sumarDias("basura", 1)).toBe("");
  });

  it("cuenta los días del rango incluyendo ambos extremos", () => {
    expect(F.diasDelRango("2026-10-01", "2026-10-01")).toBe(1);
    expect(F.diasDelRango("2026-07-01", "2026-10-01")).toBe(93);
    expect(F.diasDelRango("2025-12-31", "2026-01-01")).toBe(2);
    expect(F.diasDelRango("x", "2026-01-01")).toBeNaN();
  });

  it("el rango tiene tope de 93 días y exige orden", () => {
    expect(F.validarRango("2026-07-01", "2026-10-01")).toBe("");
    expect(F.validarRango("2026-07-01", "2026-10-02")).toMatch(/93 días/);
    expect(F.validarRango("2026-10-02", "2026-10-01")).toMatch(/anterior/);
    expect(F.validarRango("", "2026-10-01")).toMatch(/fecha inicial/);
    expect(F.validarRango("2026-02-30", "2026-03-01")).toMatch(/fecha inicial/);
  });

  it("el fin de día de México es 23:59:59 local expresado en UTC", () => {
    expect(F.finDeDiaMexicoISO("2026-10-31")).toBe("2026-11-01T05:59:59.000Z");
    expect(F.finDeDiaMexicoISO("2026-12-31")).toBe("2027-01-01T05:59:59.000Z");
    expect(F.formatoLocal(F.finDeDiaMexicoISO("2026-02-28"))).toBe("2026-02-28 23:59:59");
    expect(F.finDeDiaMexicoISO("2026-02-30")).toBe("");
  });
});

describe("asistenciaFechas - antigüedad y retraso de la última comunicación", () => {
  // México = UTC-6 todo el año. 15:00Z = 09:00 local
  const ev = (ahora, ultima) => F.evaluarRetraso({ ahora, ultimaComunicacion: ultima });

  it("textos de antigüedad", () => {
    expect(F.textoAntiguedad(0)).toBe("hace menos de 1 min");
    expect(F.textoAntiguedad(12)).toBe("hace 12 min");
    expect(F.textoAntiguedad(60)).toBe("hace 1 h");
    expect(F.textoAntiguedad(125)).toBe("hace 2 h 5 min");
    expect(F.textoAntiguedad(1440)).toBe("hace 1 día");
    expect(F.textoAntiguedad(3000)).toBe("hace 2 días");
    expect(F.textoAntiguedad(-5)).toBe("hace menos de 1 min");
    expect(F.textoAntiguedad(NaN)).toBe("—");
  });

  it("dentro del horario: 44 y 45 min no avisan, 46 min sí", () => {
    expect(ev("2026-10-23T15:44:00Z", "2026-10-23T15:00:00Z").estado).toBe("ok");
    expect(ev("2026-10-23T15:45:00Z", "2026-10-23T15:00:00Z").estado).toBe("ok");
    const r = ev("2026-10-23T15:46:00Z", "2026-10-23T15:00:00Z");
    expect(r.estado).toBe("retraso");
    expect(r.texto).toMatch(/Posible retraso: la última comunicación/);
  });

  it("bordes del horario 07:00-20:00 (ambos incluidos): 06:59 fuera, 07:00 dentro, 20:00 dentro, 20:01 fuera", () => {
    const ultima = "2026-10-22T20:00:00Z"; // ayer 14:00 local
    expect(ev("2026-10-23T12:59:00Z", ultima).estado).toBe("fuera_de_horario"); // 06:59
    expect(ev("2026-10-23T13:00:00Z", ultima).estado).toBe("ok"); // 07:00: la espera cuenta desde la apertura (0 min)
    expect(ev("2026-10-24T02:00:00Z", "2026-10-24T01:00:00Z").estado).toBe("retraso"); // 20:00 local, 60 min sin comunicación
    expect(ev("2026-10-24T02:01:00Z", "2026-10-24T01:00:00Z").estado).toBe("fuera_de_horario"); // 20:01
  });

  it("al abrir la ventana la espera cuenta desde las 07:00, no desde la tarde anterior", () => {
    expect(ev("2026-10-23T13:30:00Z", "2026-10-22T23:00:00Z").estado).toBe("ok"); // 07:30
    expect(ev("2026-10-23T13:46:00Z", "2026-10-22T23:00:00Z").estado).toBe("retraso"); // 07:46: 46 min sin comunicación
  });

  it("rige TODOS los días: sábado y domingo también avisan (la interfaz sincroniza todos los días)", () => {
    // 2026-10-24 es sábado y 2026-10-25 domingo
    expect(ev("2026-10-24T17:00:00Z", "2026-10-24T15:00:00Z").estado).toBe("retraso"); // sáb 11:00, 120 min
    expect(ev("2026-10-25T17:00:00Z", "2026-10-25T15:00:00Z").estado).toBe("retraso"); // dom 11:00
    expect(ev("2026-10-24T17:00:00Z", "2026-10-24T16:30:00Z").estado).toBe("ok"); // sáb, 30 min
    expect(ev("2026-10-25T08:00:00Z", "2026-10-24T15:00:00Z").estado).toBe("fuera_de_horario"); // dom 02:00
  });

  it("el texto para lectores de pantalla depende solo del estado, no del tiempo transcurrido", () => {
    const a = ev("2026-10-23T15:10:00Z", "2026-10-23T15:00:00Z");
    const b = ev("2026-10-23T15:11:00Z", "2026-10-23T15:00:00Z");
    expect(a.texto).not.toBe(b.texto); // el visual sí cambia
    expect(F.mensajeEstadoRetraso(a.estado)).toBe(F.mensajeEstadoRetraso(b.estado));
    const c = ev("2026-10-23T16:30:00Z", "2026-10-23T15:00:00Z");
    expect(F.mensajeEstadoRetraso(c.estado)).not.toBe(F.mensajeEstadoRetraso(a.estado));
    expect(F.mensajeEstadoRetraso("raro")).toBe(F.mensajeEstadoRetraso("sin_datos"));
    expect(F.mensajeEstadoRetraso("retraso")).not.toMatch(/\d+ min\b(?! )|hace/);
  });

  it("sin datos", () => {
    expect(ev("2026-10-23T15:00:00Z", null).estado).toBe("sin_datos");
    expect(ev(null, "2026-10-23T15:00:00Z").estado).toBe("sin_datos");
    expect(ev("2026-10-23T15:00:00", "2026-10-23T15:00:00Z").estado).toBe("sin_datos");
  });
});

describe("asistenciaTurnos - formulario y validación", () => {
  const valido = () => {
    const f = T.formularioVacio();
    f.nombre = "Turno ficticio";
    return f;
  };

  it("el formulario nuevo trae los valores por omisión del servidor y L-V laborable", () => {
    const f = T.formularioVacio();
    expect(f).toMatchObject({ tolerancia_retardo_min: "10", umbral_falta_min: "30", tolerancia_salida_min: "0", ventana_entrada_antes_min: "60", ventana_entrada_despues_min: "150", ventana_salida_antes_min: "5", ventana_salida_despues_min: "359", descanso_min: "0", activo: true });
    expect(f.dias.map((d) => d.laborable)).toEqual([true, true, true, true, true, false, false]);
    expect(f.dias.map((d) => d.dia_semana)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("detecta cambios del formulario respecto al inicial", () => {
    const a = T.formularioVacio();
    const b = T.formularioVacio();
    expect(T.hayCambios(a, b)).toBe(false);
    b.dias[0].hora_entrada = "09:00";
    expect(T.hayCambios(a, b)).toBe(true);
    b.dias[0].hora_entrada = "08:00";
    expect(T.hayCambios(a, b)).toBe(false);
  });

  it("un formulario válido no tiene errores", () => {
    expect(T.validarFormularioTurno(valido())).toEqual({ errores: {}, lista: [] });
  });

  it("nombre obligatorio, sin controles y con tope", () => {
    const f = valido();
    f.nombre = "   ";
    expect(T.validarFormularioTurno(f).errores.nombre).toMatch(/obligatorio/);
    f.nombre = "a\u0000b";
    expect(T.validarFormularioTurno(f).errores.nombre).toMatch(/no válidos/);
    f.nombre = "a".repeat(101);
    expect(T.validarFormularioTurno(f).errores.nombre).toMatch(/100/);
  });

  it("minutos: entero de 0 a 720", () => {
    for (const malo of ["", "-1", "721", "1.5", "abc", "1e2"]) {
      const f = valido();
      f.tolerancia_retardo_min = malo;
      expect(T.validarFormularioTurno(f).errores.tolerancia_retardo_min).toMatch(/0 a 720/);
    }
    const f = valido();
    f.ventana_entrada_despues_min = "720";
    expect(T.validarFormularioTurno(f).errores).toEqual({});
  });

  it("el umbral de falta no puede ser menor que la tolerancia de retardo", () => {
    const f = valido();
    f.tolerancia_retardo_min = "20";
    f.umbral_falta_min = "19";
    expect(T.validarFormularioTurno(f).errores.umbral_falta_min).toMatch(/menor/);
    f.umbral_falta_min = "20";
    expect(T.validarFormularioTurno(f).errores).toEqual({});
  });

  it("exige un día laborable y horas válidas distintas", () => {
    let f = valido();
    f.dias.forEach((d) => { d.laborable = false; });
    expect(T.validarFormularioTurno(f).errores.dias).toMatch(/al menos un día/);
    f = valido();
    f.dias[0].hora_entrada = "25:00";
    expect(T.validarFormularioTurno(f).errores.dia_1).toMatch(/Lunes/);
    f = valido();
    f.dias[1].hora_salida = "08:00";
    expect(T.validarFormularioTurno(f).errores.dia_2).toMatch(/iguales/);
    f = valido();
    f.dias[2].hora_entrada = "";
    expect(T.validarFormularioTurno(f).errores.dia_3).toMatch(/Miércoles/);
  });

  it("un día no laborable no se valida aunque tenga horas escritas", () => {
    const f = valido();
    f.dias[5].hora_entrada = "basura";
    expect(T.validarFormularioTurno(f).errores).toEqual({});
  });

  it("el descanso exige inicio y debe caer dentro de la jornada", () => {
    let f = valido();
    f.descanso_min = "30";
    expect(T.validarFormularioTurno(f).errores.descanso_inicio).toMatch(/obligatorio/);
    f.descanso_inicio = "07:00";
    expect(T.validarFormularioTurno(f).errores.dia_1).toMatch(/descanso/);
    f.descanso_inicio = "16:45"; // 16:45 + 30 > 17:00
    expect(T.validarFormularioTurno(f).errores.dia_1).toMatch(/descanso/);
    f.descanso_inicio = "16:30"; // termina exactamente a la salida
    expect(T.validarFormularioTurno(f).errores).toEqual({});
    f = valido();
    f.descanso_inicio = "99:99";
    expect(T.validarFormularioTurno(f).errores.descanso_inicio).toMatch(/HH:MM/);
  });

  it("turno nocturno: el descanso de madrugada cuenta del día siguiente", () => {
    const f = valido();
    f.dias.forEach((d) => { d.hora_entrada = "22:00"; d.hora_salida = "06:00"; });
    f.descanso_min = "30";
    f.descanso_inicio = "02:00";
    expect(T.validarFormularioTurno(f).errores).toEqual({});
    f.descanso_inicio = "21:00"; // antes de entrar y sin ser del día siguiente
    expect(T.validarFormularioTurno(f).errores.dia_1).toMatch(/descanso/);
    f.descanso_inicio = "05:45"; // 05:45 + 30 > 06:00
    expect(T.validarFormularioTurno(f).errores.dia_1).toMatch(/descanso/);
  });

  it("la lista de errores sigue el orden de lectura", () => {
    const f = valido();
    f.nombre = "";
    f.umbral_falta_min = "1";
    f.dias[0].hora_entrada = "";
    expect(T.validarFormularioTurno(f).lista).toEqual([
      "El nombre es obligatorio",
      "El umbral de falta no puede ser menor que la tolerancia de retardo",
      "Lunes: indica la hora de entrada y la de salida (HH:MM)",
    ]);
  });

  it("construye el cuerpo del servidor: números, null y días no laborables sin horas", () => {
    const f = valido();
    f.descripcion = "  ";
    f.dias[6].laborable = false;
    f.dias[5].laborable = true;
    f.dias[5].hora_entrada = "08:00";
    f.dias[5].hora_salida = "13:00";
    const c = T.construirCuerpoTurno(f);
    expect(c).toMatchObject({ nombre: "Turno ficticio", descripcion: null, activo: true, descanso_inicio: null, tolerancia_retardo_min: 10, descanso_min: 0 });
    expect(c.dias).toHaveLength(7);
    expect(c.dias[6]).toEqual({ dia_semana: 7, laborable: false });
    expect(c.dias[5]).toEqual({ dia_semana: 6, laborable: true, hora_entrada: "08:00", hora_salida: "13:00" });
    expect(Object.values(c).filter((v) => typeof v === "string" && /^\d+$/.test(v))).toEqual([]);
  });

  it("ida y vuelta: turno del servidor -> formulario -> cuerpo conserva los datos", () => {
    const turno = {
      nombre: "Rayhsa", descripcion: "x", activo: false, tolerancia_retardo_min: 5, umbral_falta_min: 20, tolerancia_salida_min: 3,
      ventana_entrada_antes_min: 30, ventana_entrada_despues_min: 120, ventana_salida_antes_min: 10, ventana_salida_despues_min: 300,
      descanso_inicio: "13:00", descanso_min: 60,
      dias: [
        { dia_semana: 1, laborable: true, hora_entrada: "08:00", hora_salida: "17:00" },
        { dia_semana: 2, laborable: false, hora_entrada: null, hora_salida: null },
      ],
    };
    const f = T.formularioDesdeTurno(turno);
    expect(f.activo).toBe(false);
    expect(f.dias).toHaveLength(7);
    expect(f.dias[0].laborable).toBe(true);
    expect(f.dias[1].laborable).toBe(false);
    expect(f.dias[6].laborable).toBe(false); // días que el servidor no trae
    expect(T.validarFormularioTurno(f).errores).toEqual({});
    const c = T.construirCuerpoTurno(f);
    expect(c).toMatchObject({ tolerancia_retardo_min: 5, umbral_falta_min: 20, tolerancia_salida_min: 3, descanso_min: 60, descanso_inicio: "13:00", activo: false });
  });
});

describe("asistenciaTurnos - resúmenes", () => {
  const dia = (n, e, s) => ({ dia_semana: n, laborable: Boolean(e), hora_entrada: e || null, hora_salida: s || null });

  it("agrupa días consecutivos con el mismo horario", () => {
    const dias = [dia(1, "08:00", "17:00"), dia(2, "08:00", "17:00"), dia(3, "08:00", "17:00"), dia(4, "08:00", "17:00"), dia(5, "08:00", "17:00"), dia(6, "08:00", "13:00"), dia(7)];
    expect(T.resumirHorario(dias)).toBe("Lun a Vie 08:00-17:00; Sáb 08:00-13:00");
  });

  it("dos días seguidos se unen con 'y' y los separados no se agrupan", () => {
    expect(T.resumirHorario([dia(1, "09:00", "18:00"), dia(2, "09:00", "18:00")])).toBe("Lun y Mar 09:00-18:00");
    expect(T.resumirHorario([dia(1, "09:00", "18:00"), dia(3, "09:00", "18:00")])).toBe("Lun 09:00-18:00; Mié 09:00-18:00");
  });

  it("marca el turno que cruza la medianoche y respeta el orden aunque lleguen desordenados", () => {
    expect(T.resumirHorario([dia(3, "22:00", "06:00"), dia(1, "22:00", "06:00"), dia(2, "22:00", "06:00")])).toBe("Lun a Mié 22:00-06:00 (+1 día)");
  });

  it("sin días laborables o sin detalle", () => {
    expect(T.resumirHorario([dia(1)])).toBe("Sin días laborables");
    expect(T.resumirHorario(undefined)).toBe("Sin días laborables");
  });

  it("resume tolerancias y uso con singular y plural", () => {
    expect(T.resumirTolerancias({ tolerancia_retardo_min: 10, umbral_falta_min: 30, tolerancia_salida_min: 0 })).toBe("Retardo +10 min · Falta +30 min · Salida 0 min");
    expect(T.resumirUso({ departamentos: 1, empleados_efectivos: 1 })).toBe("1 departamento, 1 empleado");
    expect(T.resumirUso({ departamentos: 0, empleados_efectivos: 12 })).toBe("0 departamentos, 12 empleados");
    expect(T.resumirUso(undefined)).toBe("—");
  });
});

describe("asistenciaMarcas - CSV seguro", () => {
  it("neutraliza = + - @ al inicio (y tabulador/retorno) con una comilla", () => {
    for (const peligroso of ["=1+1", "+52 55", "-3", "@SUMA(A1)", "\tcmd", "\rcmd"]) {
      expect(M.neutralizarFormula(peligroso)).toBe(`'${peligroso}`);
    }
    expect(M.neutralizarFormula("normal=1")).toBe("normal=1");
    expect(M.neutralizarFormula("2026-10-01")).toBe("2026-10-01");
    expect(M.neutralizarFormula(null)).toBe("");
    expect(M.neutralizarFormula(0)).toBe("0");
  });

  it("escapa comas, comillas y saltos de línea (RFC 4180)", () => {
    expect(M.escaparCeldaCsv('a,b')).toBe('"a,b"');
    expect(M.escaparCeldaCsv('di "hola"')).toBe('"di ""hola"""');
    expect(M.escaparCeldaCsv("a\nb")).toBe('"a\nb"');
    expect(M.escaparCeldaCsv("=HYPERLINK(\"x\",\"y\")")).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });

  it("construye el CSV con BOM, CRLF, encabezado y celdas neutralizadas", () => {
    const filas = [
      { fecha_local: "2026-10-01", hora_local: "08:03:12", instante_utc: "2026-10-01T14:03:12Z", codigo_empleado: "1001", vinculada: "=Sí, tal vez", estado_marca: "0", tipo_verificacion: "1", terminal_alias: "Entrada", terminal_sn: "SN-FICT-1", id_externo: "5001" },
    ];
    const r = M.construirCsv(filas);
    expect(r.texto.charCodeAt(0)).toBe(0xfeff);
    const lineas = r.texto.slice(1).split("\r\n");
    expect(lineas[0].split(",")[0]).toBe("Fecha (hora de México)");
    expect(lineas[1]).toBe("2026-10-01,08:03:12,2026-10-01T14:03:12Z,1001,\"'=Sí, tal vez\",0,1,Entrada,SN-FICT-1,5001");
    expect(lineas[2]).toBe("");
    expect(r).toMatchObject({ filas: 1, truncado: false });
  });

  it("respeta el tope de filas e informa que truncó", () => {
    const filas = Array.from({ length: 12 }, (_, i) => ({ codigo_empleado: String(i) }));
    const r = M.construirCsv(filas, 10);
    expect(r).toMatchObject({ filas: 10, truncado: true });
    expect(r.texto.trim().split("\r\n")).toHaveLength(11);
    expect(M.construirCsv(filas, 12).truncado).toBe(false);
    expect(M.TOPE_FILAS_CSV).toBe(5000);
  });

  it("sin filas devuelve solo el encabezado", () => {
    const r = M.construirCsv([]);
    expect(r.filas).toBe(0);
    expect(r.texto.slice(1).trim().split("\r\n")).toHaveLength(1);
  });

  it("convierte una marca del servidor en fila, con hora local y UTC, y vacía lo que no hay", () => {
    const conv = (iso) => (iso === "malo" ? null : { fecha: F.partesLocales(iso).fecha, hora: F.partesLocales(iso).hora, utc: F.instanteUtc(iso) });
    const fila = M.filaParaCsv({ marca_ts: "2026-01-01T03:30:00Z", codigo_empleado: "7", empleado_id: null, empleado_nombre: "", estado_marca: "0", tipo_verificacion: "15", terminal_alias: "A", terminal_sn: "S", id_externo: "9" }, conv);
    expect(fila).toMatchObject({ fecha_local: "2025-12-31", hora_local: "21:30:00", instante_utc: "2026-01-01T03:30:00Z", vinculada: "No" });
    expect(M.filaParaCsv({ marca_ts: "malo", codigo_empleado: "7" }, conv)).toMatchObject({ fecha_local: "", instante_utc: "" });
  });

  it("el CSV no lleva nombres de empleado (solo código y si está vinculada)", () => {
    const conv = () => ({ fecha: "f", hora: "h", utc: "u" });
    const fila = M.filaParaCsv({ marca_ts: "x", codigo_empleado: "1001", empleado_id: 7, empleado_nombre: "Nombre Secreto" }, conv);
    expect(JSON.stringify(fila)).not.toContain("Secreto");
    expect(fila).toMatchObject({ codigo_empleado: "1001", vinculada: "Sí" });
    expect(M.COLUMNAS_CSV.map((c) => c.clave)).not.toContain("empleado_nombre");
    expect(M.construirCsv([fila]).texto).not.toContain("Secreto");
  });

  it("nombre de archivo con el rango", () => {
    expect(M.nombreArchivoCsv("2026-10-01", "2026-10-07")).toBe("marcas_2026-10-01_a_2026-10-07.csv");
  });
});

describe("asistenciaMarcas - parámetros y textos", () => {
  it("omite filtros vacíos y recorta espacios", () => {
    const q = new URLSearchParams(M.parametrosMarcas({ desde: "2026-10-01", hasta: "2026-10-07", buscar: "  Ana ", codigo: "", terminal: "", vinculadas: "todas" }, { pagina: 2, limite: 50 }));
    expect(Object.fromEntries(q)).toEqual({ desde: "2026-10-01", hasta: "2026-10-07", pagina: "2", limite: "50", buscar: "Ana" });
  });

  it("la exportación por clave pide orden=id y antes_id (sin depender del OFFSET)", () => {
    const q = (o) => Object.fromEntries(new URLSearchParams(M.parametrosMarcas({ desde: "a", hasta: "b" }, o)));
    expect(q({ porClave: true, limite: 500, contar: false })).toMatchObject({ orden: "id", contar: "false", limite: "500" });
    expect(q({ porClave: true }).antes_id).toBeUndefined();
    expect(q({ porClave: true, antesId: "9001" })).toMatchObject({ orden: "id", antes_id: "9001" });
    expect(q({}).orden).toBeUndefined();
    expect(q({ antesId: "9001" }).antes_id).toBeUndefined();
  });

  it("recolectarPorClave no repite ni omite filas aunque entren marcas nuevas entre páginas", async () => {
    let tabla = Array.from({ length: 25 }, (_, i) => ({ id: 25 - i })); // ids 25..1 (descendente)
    const llamadas = [];
    const pedir = async (antesId) => {
      llamadas.push(antesId);
      const lote = tabla.filter((m) => antesId === null || m.id < Number(antesId)).slice(0, 10);
      // llegan 7 marcas nuevas (ids mayores) justo después de la primera página
      if (llamadas.length === 1) tabla = [...Array.from({ length: 7 }, (_, i) => ({ id: 32 - i })), ...tabla];
      return lote;
    };
    const filas = await M.recolectarPorClave(pedir, { limite: 10, tope: 100, maxPaginas: 12 });
    const ids = filas.map((m) => m.id);
    expect(ids).toEqual(Array.from({ length: 25 }, (_, i) => 25 - i));
    expect(new Set(ids).size).toBe(ids.length);
    expect(llamadas).toEqual([null, 16, 6]);
  });

  it("recolectarPorClave respeta el tope (+1 para saber que hubo más) y el máximo de páginas", async () => {
    let n = 0;
    const siempreLleno = async () => Array.from({ length: 10 }, () => ({ id: 1e6 - n++ }));
    const filas = await M.recolectarPorClave(siempreLleno, { limite: 10, tope: 25, maxPaginas: 12 });
    expect(filas.length).toBe(30);
    expect((await M.recolectarPorClave(siempreLleno, { limite: 10, tope: 1e9, maxPaginas: 3 })).length).toBe(30);
  });

  it("incluye vinculadas solo si es si/no y contar=false cuando se pide", () => {
    const q = new URLSearchParams(M.parametrosMarcas({ desde: "a", hasta: "b", vinculadas: "no", terminal: "T 1" }, { contar: false }));
    expect(q.get("vinculadas")).toBe("no");
    expect(q.get("contar")).toBe("false");
    expect(q.get("terminal")).toBe("T 1");
    expect(new URLSearchParams(M.parametrosMarcas({ desde: "a", hasta: "b", vinculadas: "raro" })).has("vinculadas")).toBe(false);
  });

  it("rango de paginación y resultado de la re-vinculación", () => {
    expect(M.textoRango(1, 50, 50, 120)).toBe("1-50 de 120");
    expect(M.textoRango(3, 50, 20, 120)).toBe("101-120 de 120");
    expect(M.textoRango(1, 50, 0, 0)).toBe("0 resultados");
    expect(M.textoRango(2, 50, 10, null)).toBe("51-60");
    expect(M.textoResultadoRevincular({ vinculadas: 1, pendientes: 1 })).toBe("Se vincularon 1 marca; 1 sigue sin empleado.");
    expect(M.textoResultadoRevincular({ vinculadas: 5, pendientes: 0 })).toBe("Se vincularon 5 marcas; 0 siguen sin empleado.");
    expect(M.etiquetaVinculo({ empleado_id: 3 })).toBe("Vinculada");
    expect(M.etiquetaVinculo({ empleado_id: null })).toBe("Sin empleado");
  });
});

describe("asistenciaLlaves", () => {
  it("el formato de llave mide 56 caracteres", () => {
    const llave = `rhk_0123abcd_${"A".repeat(43)}`;
    expect(llave).toHaveLength(L.LONGITUD_LLAVE);
    expect(L.FORMATO_LLAVE.test(llave)).toBe(true);
    expect(L.FORMATO_LLAVE.test("rhk_xyz")).toBe(false);
  });

  it("la URL de ejemplo no contiene una IP real", () => {
    expect(L.URL_INGESTA_TEXTO).toBe("http://<ip-interna-del-servidor>:4010/api/asistencia/ingesta/marcas");
    expect(L.URL_INGESTA_TEXTO).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(L.ENCABEZADO_LLAVE).toBe("X-Api-Key");
  });

  it("parsea IPs separadas por coma, espacio o línea, sin repetidos", () => {
    expect(L.parsearIps("192.0.2.1, 192.0.2.2\n192.0.2.1;198.51.100.0/24  ")).toEqual(["192.0.2.1", "192.0.2.2", "198.51.100.0/24"]);
    expect(L.parsearIps("")).toEqual([]);
    expect(L.parsearIps(null)).toEqual([]);
  });

  it("revisa IPs antes de enviar (el servidor vuelve a validar)", () => {
    expect(L.revisarIps(["192.0.2.1", "2001:db8::/32"])).toBe("");
    expect(L.revisarIps(["hola"])).toMatch(/"hola"/);
    expect(L.revisarIps(["1.2.3.4/abc"])).toMatch(/CIDR/);
    expect(L.revisarIps(Array.from({ length: 21 }, (_, i) => `192.0.2.${i}`))).toMatch(/20/);
  });

  it("el alta exige nombre e IP salvo que se confirme dejarlas vacías", () => {
    expect(L.validarAltaLlave({ nombre: "", ips: ["192.0.2.1"], vencimiento: "", permitirSinIps: false }).nombre).toBeDefined();
    expect(L.validarAltaLlave({ nombre: "BioTime", ips: [], vencimiento: "", permitirSinIps: false }).ips).toMatch(/al menos una IP/);
    expect(L.validarAltaLlave({ nombre: "BioTime", ips: [], vencimiento: "", permitirSinIps: true })).toEqual({});
    expect(L.validarAltaLlave({ nombre: "BioTime", ips: ["192.0.2.1"], vencimiento: "2026-31-45x", permitirSinIps: false }).vencimiento).toBeDefined();
    expect(L.validarAltaLlave({ nombre: "BioTime", ips: ["192.0.2.1"], vencimiento: "2026-12-31", permitirSinIps: false })).toEqual({});
  });

  it("editar IP a lista vacía exige confirmar el riesgo", () => {
    expect(L.validarEdicionIps([], false)).toMatch(/cualquier IP/);
    expect(L.validarEdicionIps([], true)).toBe("");
    expect(L.validarEdicionIps(["192.0.2.1"], false)).toBe("");
    expect(L.validarEdicionIps(["hola"], true)).toMatch(/"hola"/);
  });

  it("respuesta perdida de crear/rotar: solo los errores sin respuesta del servidor", () => {
    expect(L.esErrorSinRespuesta(Object.assign(new Error("red"), {}))).toBe(true);
    expect(L.esErrorSinRespuesta(Object.assign(new Error("x"), { status: 502 }))).toBe(true);
    expect(L.esErrorSinRespuesta(Object.assign(new Error("x"), { status: 400 }))).toBe(false);
    expect(L.esErrorSinRespuesta(Object.assign(new Error("x"), { status: 409 }))).toBe(false);
    expect(L.esErrorSinRespuesta(null)).toBe(false);
    expect(L.MENSAJE_RESPUESTA_PERDIDA).toContain("Si no ves la llave, revoca la creada y crea otra");
  });

  it("qué acciones permite cada estado, igual que el servidor", () => {
    const activa = { estado: "activa", estado_efectivo: "activa", vigente_hasta: null };
    const rotada = { estado: "activa", estado_efectivo: "activa", vigente_hasta: "2026-10-24T00:00:00Z" };
    const vencida = { estado: "activa", estado_efectivo: "vencida", vigente_hasta: "2026-10-01T00:00:00Z" };
    const revocada = { estado: "revocada", estado_efectivo: "revocada", vigente_hasta: null };
    expect([L.puedeRotar(activa), L.puedeRotar(rotada), L.puedeRotar(vencida), L.puedeRotar(revocada)]).toEqual([true, false, false, false]);
    expect([L.puedeRevocar(activa), L.puedeRevocar(rotada), L.puedeRevocar(vencida), L.puedeRevocar(revocada)]).toEqual([true, true, true, false]);
    expect([L.puedeEditarIps(activa), L.puedeEditarIps(revocada)]).toEqual([true, false]);
    expect(L.estaEnSolape(rotada)).toBe(true);
    expect(L.estaEnSolape(activa)).toBe(false);
    expect(L.etiquetaEstadoLlave(vencida)).toBe("Vencida");
    expect(L.textoIps({ ips_permitidas: [] })).toBe("Sin restricción");
    expect(L.textoIps({ ips_permitidas: ["192.0.2.1", "192.0.2.2"] })).toBe("192.0.2.1, 192.0.2.2");
  });
});

describe("asistenciaAsignaciones", () => {
  const A = cargarUtilEsm("asistenciaAsignaciones.js");
  const HOY = "2026-10-23";

  it("el aviso permanente conserva el texto acordado", () => {
    expect(A.AVISO_ASIGNACIONES).toContain("El turno de un empleado es el individual vigente; si no tiene, el de su departamento.");
    expect(A.AVISO_ASIGNACIONES).toContain("reclasifica los días anteriores de esa quincena");
    expect(A.AVISO_ASIGNACIONES).toContain("asigna un turno individual con vigencia al hacer el traslado");
  });

  it("clasifica vigencias contra hoy, incluyendo los extremos", () => {
    const c = (desde, hasta) => A.clasificarVigencia({ vigente_desde: desde, vigente_hasta: hasta }, HOY);
    expect(c("2026-09-01", null)).toBe("vigente");
    expect(c("2026-10-23", null)).toBe("vigente"); // empieza hoy
    expect(c("2026-09-01", "2026-10-23")).toBe("vigente"); // termina hoy
    expect(c("2026-09-01", "2026-10-22")).toBe("cerrada");
    expect(c("2026-10-24", null)).toBe("futura");
    expect(c("2026-10-24", "2026-12-31")).toBe("futura");
  });

  it("textos de vigencia y estado", () => {
    expect(A.textoVigencia({ vigente_desde: "2026-09-01", vigente_hasta: null })).toBe("2026-09-01 en adelante (abierta)");
    expect(A.textoVigencia({ vigente_desde: "2026-09-01", vigente_hasta: "2026-10-15" })).toBe("2026-09-01 a 2026-10-15");
    expect(A.etiquetaEstadoVigencia("futura")).toBe("Futura");
  });

  it("solo se pueden terminar la abierta o la que termina hoy o después", () => {
    expect(A.puedeTerminar({ vigente_desde: "2026-01-01", vigente_hasta: null }, HOY)).toBe(true);
    expect(A.puedeTerminar({ vigente_desde: "2026-01-01", vigente_hasta: "2026-10-23" }, HOY)).toBe(true);
    expect(A.puedeTerminar({ vigente_desde: "2026-01-01", vigente_hasta: "2026-10-22" }, HOY)).toBe(false);
  });

  it("agrupa por padre y ordena la más reciente primero; encuentra la vigente", () => {
    const filas = [
      { id: 1, departamento_id: 5, vigente_desde: "2026-01-01", vigente_hasta: "2026-08-31" },
      { id: 2, departamento_id: 5, vigente_desde: "2026-09-01", vigente_hasta: null },
      { id: 3, departamento_id: 6, vigente_desde: "2026-02-01", vigente_hasta: null },
    ];
    const g = A.agruparPorPadre(filas, "departamento_id");
    expect(g.get(5).map((x) => x.id)).toEqual([2, 1]);
    expect(g.get(6)).toHaveLength(1);
    expect(A.vigenteHoy(g.get(5), HOY).id).toBe(2);
    expect(A.vigenteHoy([filas[0]], HOY)).toBeNull();
    expect(A.vigenteHoy(undefined, HOY)).toBeNull();
  });

  it("valida el alta", () => {
    expect(A.validarAlta({ turno_id: "3", vigente_desde: "2026-10-23", vigente_hasta: "" }).errores).toEqual({});
    expect(A.validarAlta({ turno_id: "", vigente_desde: "", vigente_hasta: "" }).errores).toMatchObject({ turno_id: expect.any(String), vigente_desde: expect.any(String) });
    expect(A.validarAlta({ turno_id: "3", vigente_desde: "2026-10-23", vigente_hasta: "2026-10-22" }).errores.vigente_hasta).toMatch(/anterior/);
    expect(A.validarAlta({ turno_id: "3", vigente_desde: "2026-02-30", vigente_hasta: "" }).errores.vigente_desde).toBeDefined();
    expect(A.validarAlta({ turno_id: "3", vigente_desde: "2026-10-23", vigente_hasta: "2026-10-23" }).errores).toEqual({});
  });

  it("terminar solo acorta y no puede ser anterior al inicio", () => {
    const abierta = { vigente_desde: "2026-09-01", vigente_hasta: null };
    const cerrada = { vigente_desde: "2026-09-01", vigente_hasta: "2026-12-31" };
    expect(A.validarTerminar(abierta, "2026-10-23")).toBe("");
    expect(A.validarTerminar(abierta, "2026-09-01")).toBe("");
    expect(A.validarTerminar(abierta, "2026-08-31")).toMatch(/anterior al inicio/);
    expect(A.validarTerminar(cerrada, "2026-12-30")).toBe("");
    expect(A.validarTerminar(cerrada, "2026-12-31")).toMatch(/solo se puede acortar/);
    expect(A.validarTerminar(cerrada, "2027-01-15")).toMatch(/solo se puede acortar/);
    expect(A.validarTerminar(abierta, "")).toMatch(/válida/);
  });

  it("terminar con fecha pasada avisa desde qué día cambia el turno efectivo (no bloquea)", () => {
    const aviso = A.avisoTerminarPasado("2026-10-15", HOY);
    expect(aviso).toContain("desde el 2026-10-16");
    expect(aviso).toContain("se recalcularán si su quincena sigue abierta");
    expect(aviso).toContain("las quincenas cerradas no cambian");
    expect(A.avisoTerminarPasado("2026-10-31", "2026-11-05")).toContain("desde el 2026-11-01"); // cruce de mes
    expect(A.avisoTerminarPasado("2026-12-31", "2027-01-05")).toContain("desde el 2027-01-01"); // cruce de año
    expect(A.avisoTerminarPasado(HOY, HOY)).toBe("");
    expect(A.avisoTerminarPasado("2026-10-30", HOY)).toBe("");
    expect(A.avisoTerminarPasado("", HOY)).toBe("");
    expect(A.validarTerminar({ vigente_desde: "2026-09-01", vigente_hasta: null }, "2026-10-15")).toBe(""); // sigue permitido
  });

  it("etiqueta el origen del turno efectivo", () => {
    expect(A.etiquetaOrigen("empleado")).toBe("Individual");
    expect(A.etiquetaOrigen("departamento")).toBe("Del departamento");
    expect(A.etiquetaOrigen(null)).toBe("Sin turno");
  });
});

describe("asistenciaPermisos", () => {
  const P = cargarUtilEsm("asistenciaPermisos.js");
  const permisos = [
    { modulo: "rh", opcion: "Turnos", tipo: "consulta" },
    { modulo: "rh", opcion: "Turnos", tipo: "edicion" },
    { modulo: "rh", opcion: "Asistencia", tipo: "consulta" },
    { modulo: "tickets", opcion: "Ingesta", tipo: "edicion" },
  ];
  it("super_admin siempre edita", () => {
    expect(P.nivelDePermiso({ rol_nombre: "super_admin" }, [], "Turnos")).toBe("edicion");
    expect(P.nivelDePermiso({ roles: ["super_admin"] }, [], "Ingesta")).toBe("edicion");
  });
  it("toma el nivel más alto de la opción y solo del módulo rh", () => {
    expect(P.nivelDePermiso({ rol_nombre: "rh_admin" }, permisos, "Turnos")).toBe("edicion");
    expect(P.nivelDePermiso({ rol_nombre: "rh_admin" }, permisos, "Asistencia")).toBe("consulta");
    expect(P.nivelDePermiso({ rol_nombre: "rh_admin" }, permisos, "Ingesta")).toBeNull();
    expect(P.nivelDePermiso({ rol_nombre: "portal_admin" }, undefined, "Turnos")).toBeNull();
    expect(P.nivelDePermiso(null, null, "Turnos")).toBeNull();
  });
});

describe("asistenciaSync", () => {
  const S = cargarUtilEsm("asistenciaSync.js");
  it("formatea enteros y porcentajes con la configuración de México", () => {
    expect(S.formatoEntero(250000)).toBe("250,000");
    expect(S.formatoEntero("12")).toBe("12");
    expect(S.formatoEntero(null)).toBe("0");
    expect(S.formatoEntero("x")).toBe("—");
    expect(S.porcentaje(7, 250000)).toBe("0 %");
    expect(S.porcentaje(1, 3)).toBe("33.33 %");
    expect(S.porcentaje(5, 0)).toBe("—");
    expect(S.porcentaje(0, 10)).toBe("0 %");
  });
  it("estatus de lote y total estimado", () => {
    expect(S.infoEstatusLote("ok").texto).toBe("Correcto");
    expect(S.infoEstatusLote("error").clase).toBe("asi__badge--error");
    expect(S.infoEstatusLote("raro").texto).toBe("raro");
    expect(S.textoTotalMarcas(250000, true)).toBe("≈ 250,000");
    expect(S.textoTotalMarcas(321, false)).toBe("321");
    expect(S.INTERVALO_REFRESCO_MS).toBe(60000);
  });
});
