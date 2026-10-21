const {
  esFechaValida,
  esHoraValida,
  esIdValido,
  validarDias,
  validarTurno,
  validarAsignacion,
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
