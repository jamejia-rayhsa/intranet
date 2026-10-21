const {
  esFechaValida,
  esHoraValida,
  esIdValido,
  validarDias,
  validarTurno,
  validarAsignacion,
  tieneControl,
  validarDescansoEnJornada,
} = require("../utils/turnoValidacion");

const dia = (n, extra = {}) => ({ dia_semana: n, laborable: true, hora_entrada: "08:00", hora_salida: "17:00", ...extra });

describe("Validación de turnos - fechas, horas e ids", () => {
  it.each([
    ["2026-10-21", true],
    ["2024-02-29", true],
    ["2026-02-30", false],
    ["2027-02-29", false],
    ["2026-1-1", false],
    ["26-01-01", false],
    ["2026-10-21T00:00:00Z", false],
    ["", false],
    [null, false],
    [20261021, false],
    [["2026-10-21"], false],
    ["1899-12-31", false],
  ])("esFechaValida(%j) = %s", (valor, esperado) => {
    expect(esFechaValida(valor)).toBe(esperado);
  });

  it.each([
    ["00:00", true],
    ["08:05", true],
    ["23:59", true],
    ["24:00", false],
    ["8:00", false],
    ["08:60", false],
    ["08:00:00", false],
    ["0800", false],
    [800, false],
    [null, false],
  ])("esHoraValida(%j) = %s", (valor, esperado) => {
    expect(esHoraValida(valor)).toBe(esperado);
  });

  it.each([
    ["1", true],
    [7, true],
    ["2147483647", true],
    ["2147483648", false],
    ["0", false],
    ["-1", false],
    ["1.5", false],
    ["abc", false],
    [["9"], false],
    [{}, false],
    [null, false],
  ])("esIdValido(%j) = %s", (valor, esperado) => {
    expect(esIdValido(valor)).toBe(esperado);
  });
});

describe("Validación de turnos - detalle por día", () => {
  it("completa los días que faltan como no laborables (siempre 7 filas, lunes a domingo)", () => {
    const { dias, error } = validarDias([dia(1), dia(3)]);
    expect(error).toBeUndefined();
    expect(dias.map((d) => d.dia_semana)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(dias.filter((d) => d.laborable).map((d) => d.dia_semana)).toEqual([1, 3]);
    expect(dias[1]).toEqual({ dia_semana: 2, laborable: false, hora_entrada: null, hora_salida: null, cruza_medianoche: false });
  });

  it("deriva cruza_medianoche de las horas (salida anterior a la entrada)", () => {
    const { dias } = validarDias([dia(1, { hora_entrada: "22:00", hora_salida: "06:00" }), dia(2)]);
    expect(dias[0].cruza_medianoche).toBe(true);
    expect(dias[1].cruza_medianoche).toBe(false);
  });

  it("acepta cruza_medianoche explícito si coincide con las horas", () => {
    expect(validarDias([dia(1, { hora_entrada: "22:00", hora_salida: "06:00", cruza_medianoche: true })]).error).toBeUndefined();
    expect(validarDias([dia(1, { cruza_medianoche: false })]).error).toBeUndefined();
  });

  it.each([
    ["sin lista", undefined],
    ["lista vacía", []],
    ["más de 7 días", Array.from({ length: 8 }, (_, i) => dia((i % 7) + 1))],
    ["día no objeto", ["lunes"]],
    ["día 0", [dia(0)]],
    ["día 8", [dia(8)]],
    ["día como texto", [dia("1")]],
    ["día repetido", [dia(1), dia(1)]],
    ["laborable no booleano", [dia(1, { laborable: "si" })]],
    ["hora sin formato", [dia(1, { hora_entrada: "8:00" })]],
    ["hora 24:00", [dia(1, { hora_salida: "24:00" })]],
    ["laborable sin horas", [dia(1, { hora_entrada: null, hora_salida: null })]],
    ["entrada igual a la salida", [dia(1, { hora_entrada: "08:00", hora_salida: "08:00" })]],
    ["cruza inconsistente (true sin cruzar)", [dia(1, { cruza_medianoche: true })]],
    ["cruza inconsistente (false cruzando)", [dia(1, { hora_entrada: "22:00", hora_salida: "06:00", cruza_medianoche: false })]],
    ["descanso con horas", [dia(1), { dia_semana: 2, laborable: false, hora_entrada: "08:00" }]],
    ["descanso que cruza", [dia(1), { dia_semana: 2, laborable: false, cruza_medianoche: true }]],
    ["ningún día laborable", [{ dia_semana: 1, laborable: false }]],
  ])("rechaza: %s", (_nombre, dias) => {
    expect(validarDias(dias).error).toEqual(expect.any(String));
  });
});

describe("Validación de turnos - cuerpo", () => {
  const base = { nombre: "  Matutino ", dias: [dia(1)] };

  it("alta mínima: recorta el nombre y no impone valores por omisión (los pone la BD)", () => {
    const { datos, error } = validarTurno(base);
    expect(error).toBeUndefined();
    expect(datos.nombre).toBe("Matutino");
    expect(datos.tolerancia_retardo_min).toBeUndefined();
    expect(datos.dias).toHaveLength(7);
  });

  it("acepta minutos como número o texto de dígitos y los normaliza", () => {
    const { datos } = validarTurno({ ...base, tolerancia_retardo_min: "15", umbral_falta_min: 45, tolerancia_salida_min: 0 });
    expect(datos).toMatchObject({ tolerancia_retardo_min: 15, umbral_falta_min: 45, tolerancia_salida_min: 0 });
  });

  it.each([
    ["sin nombre", { dias: [dia(1)] }],
    ["nombre en blanco", { nombre: "   ", dias: [dia(1)] }],
    ["nombre largo", { nombre: "x".repeat(101), dias: [dia(1)] }],
    ["nombre no texto", { nombre: 5, dias: [dia(1)] }],
    ["sin días", { nombre: "A" }],
    ["descripción no texto", { ...base, descripcion: 7 }],
    ["descripción larga", { ...base, descripcion: "x".repeat(1001) }],
    ["activo no booleano", { ...base, activo: "true" }],
    ["tolerancia negativa", { ...base, tolerancia_retardo_min: -1 }],
    ["tolerancia decimal", { ...base, tolerancia_retardo_min: 1.5 }],
    ["tolerancia texto no numérico", { ...base, tolerancia_retardo_min: "10m" }],
    ["tolerancia mayor a 720", { ...base, tolerancia_retardo_min: 721, umbral_falta_min: 721 }],
    ["tolerancia arreglo", { ...base, tolerancia_salida_min: [5] }],
    ["umbral menor que la tolerancia", { ...base, tolerancia_retardo_min: 20, umbral_falta_min: 10 }],
    ["ventana mayor a 720", { ...base, ventana_salida_despues_min: 721 }],
    ["ventana texto", { ...base, ventana_entrada_antes_min: "60m" }],
    ["descanso con duración y sin inicio", { ...base, descanso_min: 60 }],
    ["descanso con inicio mal formado", { ...base, descanso_inicio: "25:00", descanso_min: 60 }],
    ["umbral menor que la tolerancia por omisión", { ...base, umbral_falta_min: 5 }],
  ])("alta: rechaza %s", (_n, cuerpo) => {
    expect(validarTurno(cuerpo).error).toEqual(expect.any(String));
  });

  it("cuerpo que no es objeto se trata como vacío (400, nunca excepción)", () => {
    expect(validarTurno(null).error).toBeDefined();
    expect(validarTurno([1]).error).toBeDefined();
    expect(validarTurno("x", { parcial: true }).error).toBeDefined();
  });

  it("acepta ventanas y descanso completos; editar el descanso respeta el inicio actual", () => {
    const { datos } = validarTurno({ ...base, ventana_entrada_antes_min: 60, descanso_inicio: "13:00", descanso_min: "60" });
    expect(datos).toMatchObject({ ventana_entrada_antes_min: 60, descanso_inicio: "13:00", descanso_min: 60 });
    const actual = { tolerancia_retardo_min: 10, umbral_falta_min: 30, descanso_inicio: "13:00", descanso_min: 60 };
    expect(validarTurno({ descanso_min: 30 }, { parcial: true, base: actual }).datos).toEqual({ descanso_min: 30 });
    expect(validarTurno({ descanso_inicio: null }, { parcial: true, base: actual }).error).toMatch(/descanso_inicio/);
    expect(validarTurno({ descanso_inicio: null, descanso_min: 0 }, { parcial: true, base: actual }).error).toBeUndefined();
  });

  it("edición: solo valida lo presente y exige al menos un campo", () => {
    expect(validarTurno({}, { parcial: true }).error).toBe("No hay campos para actualizar");
    expect(validarTurno({ activo: false }, { parcial: true }).datos).toEqual({ activo: false });
    expect(validarTurno({ nombre: "" }, { parcial: true }).error).toBeDefined();
  });

  it("edición: compara el umbral contra los valores actuales del turno", () => {
    const actual = { tolerancia_retardo_min: 10, umbral_falta_min: 30 };
    expect(validarTurno({ tolerancia_retardo_min: 40 }, { parcial: true, base: actual }).error).toMatch(/umbral/);
    expect(validarTurno({ umbral_falta_min: 5 }, { parcial: true, base: actual }).error).toMatch(/umbral/);
    expect(validarTurno({ tolerancia_retardo_min: 20 }, { parcial: true, base: actual }).datos).toEqual({
      tolerancia_retardo_min: 20,
    });
  });
});

describe("Validación de asignaciones", () => {
  const ok = { departamento_id: "3", turno_id: 5, vigente_desde: "2026-11-01" };

  it("normaliza ids y deja vigente_hasta en null si no viene (vigencia abierta)", () => {
    expect(validarAsignacion(ok, "departamento_id").datos).toEqual({
      departamento_id: 3,
      turno_id: 5,
      vigente_desde: "2026-11-01",
      vigente_hasta: null,
    });
  });

  it("acepta vigente_hasta igual a vigente_desde (un solo día)", () => {
    expect(validarAsignacion({ ...ok, vigente_hasta: "2026-11-01" }, "departamento_id").datos.vigente_hasta).toBe("2026-11-01");
  });

  it.each([
    ["sin destino", { ...ok, departamento_id: undefined }],
    ["destino arreglo", { ...ok, departamento_id: ["3"] }],
    ["destino 0", { ...ok, departamento_id: 0 }],
    ["turno inválido", { ...ok, turno_id: "x" }],
    ["sin vigente_desde", { ...ok, vigente_desde: undefined }],
    ["vigente_desde inexistente", { ...ok, vigente_desde: "2026-02-30" }],
    ["vigente_desde con hora", { ...ok, vigente_desde: "2026-11-01T00:00:00Z" }],
    ["vigente_hasta inexistente", { ...ok, vigente_hasta: "2027-02-29" }],
    ["vigente_hasta anterior", { ...ok, vigente_hasta: "2026-10-31" }],
    ["vigente_hasta numérico", { ...ok, vigente_hasta: 20261201 }],
  ])("rechaza: %s", (_n, cuerpo) => {
    expect(validarAsignacion(cuerpo, "departamento_id").error).toEqual(expect.any(String));
  });

  it("usa la columna indicada (empleado_id)", () => {
    expect(validarAsignacion({ ...ok, empleado_id: 9 }, "empleado_id").datos.empleado_id).toBe(9);
    expect(validarAsignacion(ok, "empleado_id").error).toMatch(/empleado_id/);
  });
});

describe("Validación de turnos - caracteres de control (NUL daría 500 en Postgres)", () => {
  const base = { nombre: "Matutino", dias: [dia(1)] };

  it.each([
    ["NUL", "a\u0000b"],
    ["campana", "a\u0007b"],
    ["escape", "a\u001bb"],
    ["DEL", "a\u007fb"],
    ["C1", "a\u0085b"],
    ["salto de línea en el nombre", "a\nb"],
    ["tabulador en el nombre", "a\tb"],
  ])("nombre con %s -> error", (_n, nombre) => {
    expect(validarTurno({ ...base, nombre }).error).toMatch(/nombre.*no válidos/i);
    expect(validarTurno({ nombre }, { parcial: true }).error).toMatch(/nombre.*no válidos/i);
  });

  it.each([
    ["NUL", "a\u0000b"],
    ["NUL al final", "texto\u0000"],
    ["campana", "a\u0007b"],
    ["escape", "a\u001bb"],
    ["DEL", "a\u007fb"],
  ])("descripción con %s -> error (alta y edición)", (_n, descripcion) => {
    expect(validarTurno({ ...base, descripcion }).error).toMatch(/descripci.n.*no v.lidos/i);
    expect(validarTurno({ descripcion }, { parcial: true }).error).toMatch(/descripci.n.*no v.lidos/i);
  });

  it("la descripción admite saltos de línea y tabuladores; el nombre acepta acentos y símbolos", () => {
    const { datos, error } = validarTurno({ ...base, nombre: "Logística ñ-1 (noche)", descripcion: "L-V\n08:00\t18:00\r\n" });
    expect(error).toBeUndefined();
    expect(datos.descripcion).toBe("L-V\n08:00\t18:00");
  });

  it("tieneControl distingue una línea de varias", () => {
    expect(tieneControl("a\nb")).toBe(true);
    expect(tieneControl("a\nb", true)).toBe(false);
    expect(tieneControl("a\u0000b", true)).toBe(true);
  });
});

describe("Validación de turnos - descanso dentro de la jornada", () => {
  const diaCorto = dia(1, { hora_entrada: "08:00", hora_salida: "12:00" });

  it("acepta el descanso contenido y justo en los bordes", () => {
    expect(validarTurno({ nombre: "A", dias: [dia(1)], descanso_inicio: "13:00", descanso_min: 60 }).error).toBeUndefined();
    expect(validarTurno({ nombre: "A", dias: [dia(1)], descanso_inicio: "08:00", descanso_min: 540 }).error).toBeUndefined();
  });

  it.each([
    ["inicia antes de la entrada", "07:30", 30],
    ["termina después de la salida", "16:30", 60],
    ["inicia después de la salida", "18:00", 30],
    ["excede la salida por un solo minuto", "08:00", 541],
  ])("rechaza el descanso que %s", (_n, inicio, minutos) => {
    expect(validarTurno({ nombre: "A", dias: [dia(1)], descanso_inicio: inicio, descanso_min: minutos }).error).toMatch(
      /dentro de la jornada/,
    );
  });

  it("rechaza si UN día laborable es más corto que el descanso", () => {
    const r = validarTurno({ nombre: "A", dias: [dia(1), diaCorto.dia_semana ? { ...diaCorto, dia_semana: 6 } : diaCorto], descanso_inicio: "13:00", descanso_min: 60 });
    expect(r.error).toMatch(/día 6/);
  });

  it("sin duración (descanso_min 0) no se valida la hora", () => {
    expect(validarTurno({ nombre: "A", dias: [diaCorto], descanso_inicio: "13:00", descanso_min: 0 }).error).toBeUndefined();
  });

  it("turno nocturno: el descanso de madrugada cuenta del día siguiente", () => {
    const noche = dia(1, { hora_entrada: "22:00", hora_salida: "06:00" });
    expect(validarDescansoEnJornada("02:00", 60, [{ ...noche, laborable: true, cruza_medianoche: true }])).toBeNull();
    expect(validarDescansoEnJornada("23:30", 60, [{ ...noche, laborable: true, cruza_medianoche: true }])).toBeNull();
    expect(validarDescansoEnJornada("05:30", 60, [{ ...noche, laborable: true, cruza_medianoche: true }])).toMatch(/dentro/);
    expect(validarDescansoEnJornada("12:00", 60, [{ ...noche, laborable: true, cruza_medianoche: true }])).toMatch(/dentro/);
  });

  it("edición: usa los días actuales (base) cuando solo cambia el descanso, y los nuevos si vienen", () => {
    const actual = {
      tolerancia_retardo_min: 10,
      umbral_falta_min: 30,
      descanso_inicio: "13:00",
      descanso_min: 60,
      dias: [{ dia_semana: 1, laborable: true, hora_entrada: "08:00", hora_salida: "12:00", cruza_medianoche: false }],
    };
    expect(validarTurno({ descanso_min: 30 }, { parcial: true, base: actual }).error).toMatch(/dentro de la jornada/);
    const ok = validarTurno({ descanso_inicio: "10:00" }, { parcial: true, base: actual });
    expect(ok.error).toBeUndefined();
    expect(validarTurno({ dias: [dia(1)] }, { parcial: true, base: actual }).error).toBeUndefined();
  });
});
