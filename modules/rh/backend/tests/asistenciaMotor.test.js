/* eslint-env jest */
// Matriz del motor puro de asistencia (sin BD): reglas de precedencia, límites exactos de minutos, ventanas,
// duplicados, medianoche, días no laborables y justificaciones. Todos los datos son ficticios.
const { evaluarDia, snapshotTurno, depurarMarcas } = require("../services/asistencia/motor");
const { aLocal, minutoRelativo, horaAMinutos, diaIso, hoyMexico } = require("../services/asistencia/tiempo");

// Hora local de México = UTC-6 todo el año (sin horario de verano desde 2022)
const utc = (fecha, hhmmss) => {
  const [h, m, s = "0"] = hhmmss.split(":");
  const base = new Date(`${fecha}T00:00:00Z`).getTime();
  return new Date(base + ((Number(h) + 6) * 3600 + Number(m) * 60 + Number(s)) * 1000);
};
const DIA = "2026-10-20"; // martes
const marca = (id, hhmmss, fecha = DIA) => ({ id, ts: utc(fecha, hhmmss) });
const diasLV = (entrada, salida) =>
  [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    dia_semana: d, laborable: d <= 5, hora_entrada: d <= 5 ? entrada : null, hora_salida: d <= 5 ? salida : null, cruza_medianoche: false,
  }));
const RAYHSA = {
  id: 1, nombre: "Rayhsa", activo: true, tolerancia_retardo_min: 10, umbral_falta_min: 30, tolerancia_salida_min: 3,
  ventana_entrada_antes_min: 60, ventana_entrada_despues_min: 150, ventana_salida_antes_min: 5, ventana_salida_despues_min: 359,
  descanso_inicio: "13:00", descanso_min: 60, dias: diasLV("08:00", "18:00"),
};
const AHORA = new Date("2026-10-22T12:00:00Z"); // el día ya terminó
const PARAMETROS = { analisis_desde: "2026-09-01", margen_dia_completo_min: 120 };
const EMPLEADO = { numero_nomina: "9001", fecha_ingreso: "2020-01-01", fecha_baja: null };

const evaluar = (extra = {}) =>
  evaluarDia({ fecha: DIA, ahora: AHORA, parametros: PARAMETROS, empleado: EMPLEADO, turno: RAYHSA, marcas: [], ...extra });

describe("tiempo: conversión a America/Mexico_City", () => {
  it("convierte UTC a hora local (UTC-6) y calcula el minuto del día", () => {
    expect(aLocal("2026-10-20T14:05:30Z")).toMatchObject({ fecha: "2026-10-20", segundos: 8 * 3600 + 5 * 60 + 30 });
  });

  it("medianoche local: 05:59:59Z es 23:59:59 del día anterior y 06:00:00Z ya es el día siguiente", () => {
    expect(aLocal("2026-10-21T05:59:59Z")).toMatchObject({ fecha: "2026-10-20", segundos: 86399 });
    expect(aLocal("2026-10-21T06:00:00Z")).toMatchObject({ fecha: "2026-10-21", segundos: 0 });
  });

  it("no hay horario de verano: el offset es -6 en enero y en julio de 2026", () => {
    expect(aLocal("2026-01-15T14:00:00Z").segundos).toBe(8 * 3600);
    expect(aLocal("2026-07-15T14:00:00Z").segundos).toBe(8 * 3600);
    expect(aLocal("2027-04-04T14:00:00Z").segundos).toBe(8 * 3600);
  });

  it("la base de zonas sí conoce el horario de verano anterior a 2022 (no se supone un offset fijo)", () => {
    expect(aLocal("2020-07-15T14:00:00Z").segundos).toBe(9 * 3600);
  });

  it("acepta Date, milisegundos e ISO y rechaza lo que no es un instante", () => {
    const iso = "2026-10-20T14:00:00Z";
    expect(aLocal(new Date(iso))).toEqual(aLocal(Date.parse(iso)));
    expect(aLocal(iso).fecha).toBe("2026-10-20");
    expect(() => aLocal("no es fecha")).toThrow();
    expect(() => aLocal(null)).toThrow();
    expect(() => aLocal(NaN)).toThrow();
  });

  it("minutoRelativo cuenta desde la medianoche local de la fecha (negativo antes, > 1440 después)", () => {
    expect(minutoRelativo("2026-10-20T14:00:00Z", DIA)).toBe(480);
    expect(minutoRelativo("2026-10-20T05:30:00Z", DIA)).toBe(-30); // 23:30 del 19
    expect(minutoRelativo("2026-10-21T12:05:00Z", DIA)).toBe(1440 + 6 * 60 + 5);
  });

  it("horaAMinutos y diaIso", () => {
    expect(horaAMinutos("08:00")).toBe(480);
    expect(horaAMinutos("23:59:00")).toBe(1439);
    expect(horaAMinutos("24:00")).toBeNull();
    expect(horaAMinutos("8:00")).toBeNull();
    expect(horaAMinutos(null)).toBeNull();
    expect(diaIso("2026-10-18")).toBe(7); // domingo
    expect(diaIso("2026-10-19")).toBe(1); // lunes
    expect(hoyMexico("2026-10-21T05:00:00Z")).toBe("2026-10-20");
  });
});

describe("motor: puntualidad y límites exactos", () => {
  it("entrada y salida a tiempo = puntual, con minutos en 0", () => {
    const r = evaluar({ marcas: [marca(1, "07:55"), marca(2, "18:02")] });
    expect(r).toMatchObject({ estatus: "puntual", minutos_retardo: 0, minutos_salida_anticipada: 0 });
    expect(r.marcas_usadas).toEqual([1, 2]);
    expect(r.primera_marca).toBe(utc(DIA, "07:55").toISOString());
    expect(r.ultima_marca).toBe(utc(DIA, "18:02").toISOString());
    expect(r.explicaciones.length).toBeGreaterThan(0);
  });

  it.each([
    ["08:00:00", "puntual", 0],
    ["08:10:00", "puntual", 0], // exactamente 10 min = dentro de la tolerancia
    ["08:10:59", "puntual", 0], // los segundos se truncan: sigue siendo el minuto 10
    ["08:11:00", "retardo", 11], // 11 min = retardo
    ["08:20:30", "retardo", 20],
    ["08:30:00", "retardo", 30], // exactamente 30 min = retardo
    ["08:30:59", "retardo", 30],
    ["08:31:00", "falta", 31], // más de 30 min = falta
    ["10:30:00", "falta", 150], // último minuto de la ventana de entrada
  ])("entrada a las %s -> %s (%i min tarde)", (hora, estatus, minutos) => {
    const r = evaluar({ marcas: [marca(1, hora), marca(2, "18:00")] });
    expect(r.estatus).toBe(estatus);
    expect(r.minutos_retardo).toBe(minutos);
    if (estatus === "falta") expect(r.marcas_usadas).toEqual([1, 2].slice(0, 2));
  });

  it.each([
    ["17:57:00", "puntual", 0], // 3 min antes = tolerancia de salida
    ["17:56:59", "salida_anticipada", 4], // minuto 17:56 -> 4 min antes
    ["17:56:00", "salida_anticipada", 4],
    ["17:55:00", "salida_anticipada", 5], // borde de la ventana de salida
    ["18:00:00", "puntual", 0],
    ["23:59:00", "puntual", 0], // borde final de la ventana de salida (18:00 + 359)
  ])("salida a las %s -> %s (%i min antes)", (hora, estatus, minutos) => {
    const r = evaluar({ marcas: [marca(1, "08:00"), marca(2, hora)] });
    expect(r.estatus).toBe(estatus);
    expect(r.minutos_salida_anticipada).toBe(minutos);
    expect(r.minutos_retardo).toBe(0);
  });

  it("retardo y salida anticipada el mismo día = retardo con AMBOS minutos registrados", () => {
    const r = evaluar({ marcas: [marca(1, "08:15"), marca(2, "17:56")] });
    expect(r).toMatchObject({ estatus: "retardo", minutos_retardo: 15, minutos_salida_anticipada: 4 });
    expect(r.explicaciones.join(" ")).toMatch(/Salida 4 min antes/);
  });

  it("salida temprana (17:54, fuera de la antigua ventana) es salida_anticipada con sus minutos", () => {
    const r = evaluar({ marcas: [marca(1, "08:00"), marca(2, "17:54")] });
    expect(r).toMatchObject({ estatus: "salida_anticipada", minutos_salida_anticipada: 6 });
  });

  it.each([
    ["17:50", 10], ["17:30", 30], ["16:01", 119], ["17:56", 4],
  ])("salida a las %s (posterior a comida_hasta 16:00) = salida_anticipada de %i min", (hora, minutos) => {
    const r = evaluar({ marcas: [marca(1, "08:02"), marca(2, hora)] });
    expect(r).toMatchObject({ estatus: "salida_anticipada", minutos_salida_anticipada: minutos });
    expect(r.marcas_usadas).toEqual([1, 2]);
  });

  it("la tolerancia de salida sigue valiendo para una salida temprana: 17:57 es puntual con tolerancia 3", () => {
    expect(evaluar({ marcas: [marca(1, "08:00"), marca(2, "17:57")] }).estatus).toBe("puntual");
    expect(evaluar({ turno: { ...RAYHSA, tolerancia_salida_min: 10 }, marcas: [marca(1, "08:00"), marca(2, "17:50")] }).estatus).toBe("puntual");
    expect(evaluar({ turno: { ...RAYHSA, tolerancia_salida_min: 10 }, marcas: [marca(1, "08:00"), marca(2, "17:49")] }).estatus).toBe("salida_anticipada");
  });

  describe("ventana de comida 13:00-16:00 (decisión del humano)", () => {
    it("08:02 / 14:01 / 15:03 / 18:05: la comida son marcas de comida; puntual con minutos_comida 62", () => {
      const r = evaluar({ marcas: [marca(1, "08:02"), marca(2, "14:01"), marca(3, "15:03"), marca(4, "18:05")] });
      expect(r.estatus).toBe("puntual");
      expect(r.marcas_usadas).toEqual([1, 4]);
      expect(r.detalle).toMatchObject({ minutos_comida: 62, exceso_comida_min: 2 });
      expect(r.banderas).toContain("exceso_comida"); // 62 > 60 min: solo informativo, el estatus no cambia
      expect(r.banderas).not.toContain("marcas_fuera_de_ventana");
    });

    it("08:02 / 13:00 / 14:00 / 17:57 = puntual (60 min de comida no exceden descanso_min 60)", () => {
      const r = evaluar({ marcas: [marca(1, "08:02"), marca(2, "13:00"), marca(3, "14:00"), marca(4, "17:57")] });
      expect(r.estatus).toBe("puntual");
      expect(r.detalle.minutos_comida).toBe(60);
      expect(r.banderas).not.toContain("exceso_comida");
    });

    it("exceso de comida: solo informativo (bandera y minutos de exceso), el estatus no cambia", () => {
      const r = evaluar({ marcas: [marca(1, "08:02"), marca(2, "13:00"), marca(3, "15:30"), marca(4, "18:00")] });
      expect(r).toMatchObject({ estatus: "puntual", minutos_retardo: 0 });
      expect(r.banderas).toContain("exceso_comida");
      expect(r.detalle).toMatchObject({ minutos_comida: 150, exceso_comida_min: 90 });
    });

    it("una sola marca de comida no mide duración", () => {
      const r = evaluar({ marcas: [marca(1, "08:02"), marca(2, "14:10"), marca(3, "18:00")] });
      expect(r.estatus).toBe("puntual");
      expect(r.detalle.minutos_comida).toBeUndefined();
    });

    it("08:02 / 14:10 (última): incompleta con ultima_marca_en_comida (RH decide)", () => {
      const r = evaluar({ marcas: [marca(1, "08:02"), marca(2, "14:10")] });
      expect(r.estatus).toBe("incompleta");
      expect(r.banderas).toContain("ultima_marca_en_comida");
      expect(r.banderas).not.toContain("marca_intermedia_sin_salida");
      expect(r.marcas_usadas).toEqual([1]);
    });

    it("08:02 / 13:00 / 14:00 (última en la comida) = incompleta con la bandera y los minutos de comida", () => {
      const r = evaluar({ marcas: [marca(1, "08:02"), marca(2, "13:00"), marca(3, "14:00")] });
      expect(r.estatus).toBe("incompleta");
      expect(r.banderas).toContain("ultima_marca_en_comida");
      expect(r.detalle.minutos_comida).toBe(60);
    });

    it("FRONTERA: 16:00 exacto (también 16:00:59) pertenece a la ventana (inclusive) -> incompleta; 16:01 ya es salida", () => {
      for (const hora of ["16:00", "16:00:59"]) {
        const r = evaluar({ marcas: [marca(1, "08:02"), marca(2, hora)] });
        expect(r.estatus).toBe("incompleta");
        expect(r.banderas).toContain("ultima_marca_en_comida");
      }
      expect(evaluar({ marcas: [marca(1, "08:02"), marca(2, "16:01")] })).toMatchObject({ estatus: "salida_anticipada", minutos_salida_anticipada: 119 });
      // 12:59 sigue siendo mañana (no es comida) y 13:00 sí lo es
      expect(evaluar({ marcas: [marca(1, "08:02"), marca(2, "12:59")] }).banderas).toContain("marca_intermedia_sin_salida");
      expect(evaluar({ marcas: [marca(1, "08:02"), marca(2, "13:00")] }).banderas).toContain("ultima_marca_en_comida");
    });

    it("marca de la mañana (11:00) sin salida: incompleta con marca_intermedia_sin_salida, no de comida", () => {
      const r = evaluar({ marcas: [marca(1, "08:02"), marca(2, "11:00")] });
      expect(r.estatus).toBe("incompleta");
      expect(r.banderas).toContain("marca_intermedia_sin_salida");
      expect(r.banderas).not.toContain("ultima_marca_en_comida");
    });

    it("la primera marca del día dentro de la comida o después = llegada tardía: falta, nunca entrada", () => {
      for (const hora of ["13:00", "14:30", "16:00"]) {
        const r = evaluar({ marcas: [marca(1, hora)] });
        expect(r.estatus).toBe("falta");
        expect(r.marcas_usadas).toEqual([]);
      }
      expect(evaluar({ marcas: [marca(1, "17:00")] }).estatus).toBe("falta"); // 17:00 sería salida, pero sin entrada
      const r = evaluar({ marcas: [marca(1, "14:00"), marca(2, "18:00")] });
      expect(r.estatus).toBe("falta");
      expect(r.banderas).toContain("salida_sin_entrada");
    });

    it("aunque la ventana de entrada sea enorme, una primera marca de la tarde (>= 13:00) nunca es la entrada", () => {
      const ancha = { ...RAYHSA, ventana_entrada_despues_min: 700 };
      for (const hora of ["13:00", "16:30", "17:00"]) expect(evaluar({ turno: ancha, marcas: [marca(1, hora)] }).estatus).toBe("falta");
      // después de las 16:00 la única marca es una salida sin entrada, no una entrada tardía
      expect(evaluar({ turno: ancha, marcas: [marca(1, "17:00")] }).banderas).toContain("salida_sin_entrada");
    });

    it("la ventana de comida es un parámetro (12:00-14:00): 14:30 deja de ser comida", () => {
      const parametros = { ...PARAMETROS, comida_desde: "12:00", comida_hasta: "14:00" };
      expect(evaluar({ parametros, marcas: [marca(1, "08:02"), marca(2, "14:30")] })).toMatchObject({ estatus: "salida_anticipada", minutos_salida_anticipada: 210 });
      expect(evaluar({ parametros, marcas: [marca(1, "08:02"), marca(2, "13:30")] }).banderas).toContain("ultima_marca_en_comida");
      // una ventana inválida (desde >= hasta) vuelve a 13:00-16:00
      const mala = { ...PARAMETROS, comida_desde: "16:00", comida_hasta: "13:00" };
      expect(evaluar({ parametros: mala, marcas: [marca(1, "08:02"), marca(2, "14:10")] }).banderas).toContain("ultima_marca_en_comida");
    });

    it("la comida no cambia días no laborables: sábado con marcas sigue siendo descanso", () => {
      const r = evaluar({ fecha: "2026-10-17", marcas: [marca(1, "09:00", "2026-10-17"), marca(2, "14:00", "2026-10-17"), marca(3, "15:00", "2026-10-17")] });
      expect(r.estatus).toBe("descanso");
      expect(r.detalle.minutos_comida).toBeUndefined();
    });

    it("con retardo (08:20) la comida tampoco interfiere: retardo y salida anticipada de 30", () => {
      const r = evaluar({ marcas: [marca(1, "08:20"), marca(2, "14:00"), marca(3, "15:00"), marca(4, "17:30")] });
      expect(r).toMatchObject({ estatus: "retardo", minutos_retardo: 20, minutos_salida_anticipada: 30 });
    });

    it("el detalle guarda la ventana de comida usada", () => {
      expect(evaluar({ marcas: [marca(1, "08:02")] }).detalle.comida).toMatchObject({ desde: "13:00", hasta: "16:00" });
    });
  });

  it("una sola marca (o todas antes de la comida) es incompleta, nunca salida anticipada", () => {
    expect(evaluar({ marcas: [marca(1, "08:00")] }).estatus).toBe("incompleta");
    expect(evaluar({ marcas: [marca(1, "08:00"), marca(2, "08:30"), marca(3, "13:10")] }).estatus).toBe("incompleta");
  });

  it("retardo y salida temprana el mismo día conservan ambos minutos", () => {
    expect(evaluar({ marcas: [marca(1, "08:20"), marca(2, "16:30")] })).toMatchObject({ estatus: "retardo", minutos_retardo: 20, minutos_salida_anticipada: 90 });
  });

  it("23:59:59 después de la ventana (00:00) tampoco es salida", () => {
    const r = evaluar({ marcas: [marca(1, "08:00"), { id: 2, ts: utc(DIA, "24:00") }] });
    expect(r.estatus).toBe("incompleta");
  });
});

describe("motor: marcas, ventanas y duplicados", () => {
  it("sin marcas = falta", () => {
    const r = evaluar();
    expect(r).toMatchObject({ estatus: "falta", minutos_retardo: 0, primera_marca: null, ultima_marca: null, marcas_usadas: [] });
  });

  it("una sola marca de entrada = incompleta y bandera marca_unica", () => {
    const r = evaluar({ marcas: [marca(1, "08:00")] });
    expect(r.estatus).toBe("incompleta");
    expect(r.banderas).toContain("marca_unica");
    expect(r.primera_marca).toBe(r.ultima_marca);
  });

  it("una sola marca tarde (08:20) = incompleta con el retardo registrado", () => {
    const r = evaluar({ marcas: [marca(1, "08:20")] });
    expect(r).toMatchObject({ estatus: "incompleta", minutos_retardo: 20 });
  });

  it("una sola marca en la ventana de salida (sin entrada) = falta con bandera salida_sin_entrada", () => {
    const r = evaluar({ marcas: [marca(1, "18:00")] });
    expect(r.estatus).toBe("falta");
    expect(r.banderas).toContain("salida_sin_entrada");
  });

  it.each([
    ["06:59:59", "puntual"], // llegar temprano nunca penaliza (antes la ventana empezaba a las 07:00)
    ["06:50:00", "puntual"],
    ["00:00:00", "puntual"], // primera marca del día local
    ["10:31:00", "falta"], // después de la ventana (10:30)
  ])("marca de entrada a las %s respecto de la ventana de entrada -> %s", (hora, esperado) => {
    const r = evaluar({ marcas: [marca(1, hora), marca(2, "18:00")] });
    expect(r.estatus).toBe(esperado);
  });

  it("la primera marca de la ventana es la entrada y la última de la ventana de salida es la salida", () => {
    const r = evaluar({ marcas: [marca(1, "07:30"), marca(2, "08:05"), marca(3, "13:00"), marca(4, "14:01"), marca(5, "17:58"), marca(6, "18:30")] });
    expect(r.estatus).toBe("puntual");
    expect(r.marcas_usadas).toEqual([1, 6]);
    expect(r.banderas).toContain("marcas_fuera_de_ventana");
  });

  it("el descanso (13:00-14:00) no se checa: marcas de comida no cambian el resultado", () => {
    const sin = evaluar({ marcas: [marca(1, "08:00"), marca(2, "18:00")] });
    const con = evaluar({ marcas: [marca(1, "08:00"), marca(2, "13:02"), marca(3, "14:05"), marca(4, "18:00")] });
    expect(con.estatus).toBe(sin.estatus);
    expect(con.minutos_retardo).toBe(sin.minutos_retardo);
    expect(con.detalle.jornada_neta_min).toBe(540); // 10 h menos 1 h de descanso
  });

  it.each([
    { caso: "a 59 s", a: "08:00:00", b: "08:00:59", cuantas: 1 },
    { caso: "a 60 s exactos", a: "08:00:00", b: "08:01:00", cuantas: 1 },
    { caso: "a 61 s", a: "08:00:00", b: "08:01:01", cuantas: 2 },
  ])("marcas $caso: $cuantas marca(s) distinta(s)", ({ a, b, cuantas }) => {
    const { unicas, duplicadas } = depurarMarcas([{ id: 1, ts: utc(DIA, a) }, { id: 2, ts: utc(DIA, b) }]);
    expect(unicas).toHaveLength(cuantas);
    expect(duplicadas).toBe(2 - cuantas);
  });

  it("dos marcas duplicadas de entrada no se toman como entrada y salida", () => {
    const r = evaluar({ marcas: [marca(1, "07:59:30"), marca(2, "07:59:50")] });
    expect(r.estatus).toBe("incompleta");
    expect(r.banderas).toContain("marcas_duplicadas");
    expect(r.marcas_usadas).toEqual([1]);
  });

  it("duplicado de la salida: se conserva la primera y no cambia el resultado", () => {
    const r = evaluar({ marcas: [marca(1, "08:00"), marca(2, "18:00:00"), marca(3, "18:00:40")] });
    expect(r.estatus).toBe("puntual");
    expect(r.marcas_usadas).toEqual([1, 2]);
  });

  it("llegar temprano (06:50, antes de la ventana de entrada) NO es falta y no lleva salida_sin_entrada", () => {
    const r = evaluar({ marcas: [marca(1, "06:50"), marca(2, "18:00")] });
    expect(r).toMatchObject({ estatus: "puntual", minutos_retardo: 0 });
    expect(r.banderas).not.toContain("salida_sin_entrada");
    expect(r.marcas_usadas).toEqual([1, 2]);
    expect(r.primera_marca).toBe(utc(DIA, "06:50").toISOString());
    expect(evaluar({ marcas: [marca(1, "06:50")] }).estatus).toBe("incompleta");
    expect(evaluar({ marcas: [marca(1, "06:50"), marca(2, "17:56")] })).toMatchObject({ estatus: "salida_anticipada", minutos_salida_anticipada: 4 });
  });

  it("la primera marca del día es la entrada: 06:50 y 08:05 -> la entrada es la de 06:50", () => {
    expect(evaluar({ marcas: [marca(1, "06:50"), marca(2, "08:05"), marca(3, "18:00")] }).marcas_usadas).toEqual([1, 3]);
  });

  it("el orden de llegada de las marcas no importa", () => {
    const a = evaluar({ marcas: [marca(2, "18:00"), marca(1, "08:11")] });
    const b = evaluar({ marcas: [marca(1, "08:11"), marca(2, "18:00")] });
    expect(a).toEqual(b);
    expect(a.estatus).toBe("retardo");
  });

  it("ignora las marcas de otros días lejanos", () => {
    const r = evaluar({ marcas: [marca(1, "08:00", "2026-10-19"), marca(2, "18:00", "2026-10-19"), marca(3, "08:00", "2026-10-21")] });
    expect(r.estatus).toBe("falta");
  });

  it("acepta ts como Date, milisegundos e ISO", () => {
    const r = evaluar({ marcas: [{ id: 1, ts: utc(DIA, "08:00").toISOString() }, { id: 2, ts: utc(DIA, "18:00").getTime() }] });
    expect(r.estatus).toBe("puntual");
  });

  it("una marca con instante inválido lanza (no se califica en silencio)", () => {
    expect(() => evaluar({ marcas: [{ id: 1, ts: "basura" }] })).toThrow();
  });
});

describe("motor: día completo o pendiente", () => {
  const evaluarA = (ahora) => evaluar({ ahora, marcas: [marca(1, "08:00")] });

  it("antes de salida + margen el día queda pendiente y conserva el cálculo provisional", () => {
    const r = evaluarA(utc(DIA, "19:59:59"));
    expect(r.estatus).toBe("pendiente");
    expect(r.detalle.calculo_provisional).toBe("incompleta");
    expect(r.banderas).toContain("dia_pendiente");
  });

  it("a las 20:00 (18:00 + 120 min) ya se califica", () => {
    expect(evaluarA(utc(DIA, "20:00:00")).estatus).toBe("incompleta");
  });

  it("el margen es un parámetro", () => {
    const parametros = { ...PARAMETROS, margen_dia_completo_min: 0 };
    expect(evaluar({ parametros, ahora: utc(DIA, "18:00"), marcas: [marca(1, "08:00")] }).estatus).toBe("incompleta");
    expect(evaluar({ parametros, ahora: utc(DIA, "17:59"), marcas: [marca(1, "08:00")] }).estatus).toBe("pendiente");
  });

  it("un día futuro sin marcas está pendiente, no es falta", () => {
    expect(evaluar({ fecha: "2026-10-27", ahora: AHORA }).estatus).toBe("pendiente");
  });

  it("un día pasado se califica aunque no haya marcas", () => {
    expect(evaluar({ ahora: new Date("2026-10-21T15:00:00Z") }).estatus).toBe("falta");
  });

  it("los festivos, descansos y vacaciones de hoy no esperan al fin del día", () => {
    expect(evaluar({ ahora: utc(DIA, "09:00"), calendario: { id: 1, tipo: "oficial" } }).estatus).toBe("festivo");
  });
});

describe("motor: precedencia de estatus", () => {
  it("antes de analisis_desde = no_aplica", () => {
    expect(evaluar({ fecha: "2026-08-31" }).estatus).toBe("no_aplica");
    expect(evaluar({ fecha: "2026-09-01", ahora: new Date("2026-09-03T00:00:00Z") }).estatus).toBe("falta");
  });

  it("antes de fecha_ingreso y después de fecha_baja = no_aplica; el día de la baja sí aplica", () => {
    const e = { ...EMPLEADO, fecha_ingreso: "2026-10-20", fecha_baja: "2026-10-20" };
    expect(evaluar({ empleado: e }).estatus).toBe("falta");
    expect(evaluar({ empleado: e, fecha: "2026-10-19" }).estatus).toBe("no_aplica");
    expect(evaluar({ empleado: e, fecha: "2026-10-21" }).estatus).toBe("no_aplica");
  });

  it("no_aplica gana a sin_identificador y a sin_turno", () => {
    expect(evaluar({ fecha: "2026-08-31", empleado: { numero_nomina: null }, turno: null }).estatus).toBe("no_aplica");
  });

  it.each([[null], [undefined], [""], ["   "]])("nómina %p = sin_identificador (no se analiza)", (nomina) => {
    const r = evaluar({ empleado: { ...EMPLEADO, numero_nomina: nomina }, marcas: [marca(1, "08:00")] });
    expect(r.estatus).toBe("sin_identificador");
    expect(r.marcas_usadas).toEqual([]);
  });

  it("nómina compartida con otro empleado del mismo periodo = sin_identificador con bandera", () => {
    const r = evaluar({ empleado: { ...EMPLEADO, nomina_duplicada: true } });
    expect(r.estatus).toBe("sin_identificador");
    expect(r.banderas).toContain("nomina_duplicada");
  });

  it("sin turno efectivo = sin_turno (no es falta), aun con marcas", () => {
    const r = evaluar({ turno: null, marcas: [marca(1, "08:00")] });
    expect(r.estatus).toBe("sin_turno");
  });

  it("sin_turno gana a festivo, vacaciones y permiso", () => {
    expect(evaluar({ turno: null, calendario: { id: 1 }, vacaciones: { id: 1 }, permiso: { id: 1 } }).estatus).toBe("sin_turno");
  });

  it.each([["2026-10-17", "sábado"], ["2026-10-18", "domingo"]])("%s (%s) es descanso del turno Rayhsa", (fecha) => {
    expect(evaluar({ fecha }).estatus).toBe("descanso");
  });

  it("descanso trabajado: sigue siendo descanso, con las marcas informadas y bandera", () => {
    const r = evaluar({ fecha: "2026-10-17", marcas: [marca(1, "09:00", "2026-10-17"), marca(2, "13:00", "2026-10-17")] });
    expect(r.estatus).toBe("descanso");
    expect(r.banderas).toContain("trabajo_en_descanso");
    expect(r.primera_marca).toBe(utc("2026-10-17", "09:00").toISOString());
    expect(r.ultima_marca).toBe(utc("2026-10-17", "13:00").toISOString());
    expect(r.minutos_retardo).toBe(0);
  });

  it("descanso gana a festivo y a vacaciones", () => {
    expect(evaluar({ fecha: "2026-10-17", calendario: { id: 1 }, vacaciones: { id: 2 } }).estatus).toBe("descanso");
  });

  it("festivo (oficial u otorgado) no es falta, con o sin marcas, y gana a vacaciones", () => {
    expect(evaluar({ calendario: { id: 3, tipo: "oficial" } }).estatus).toBe("festivo");
    const r = evaluar({ calendario: { id: 3, tipo: "otorgado" }, vacaciones: { id: 4 }, marcas: [marca(1, "08:00"), marca(2, "18:00")] });
    expect(r.estatus).toBe("festivo");
    expect(r.banderas).toContain("trabajo_en_festivo");
  });

  it("vacaciones aprobadas en día hábil = vacaciones, aunque haya marcas (con bandera)", () => {
    expect(evaluar({ vacaciones: { id: 7 } }).estatus).toBe("vacaciones");
    const r = evaluar({ vacaciones: { id: 7 }, marcas: [marca(1, "08:00")] });
    expect(r.estatus).toBe("vacaciones");
    expect(r.banderas).toContain("marcas_en_vacaciones");
  });

  it("vacaciones no cubren un sábado laborable del turno (no es día hábil): se califica normal", () => {
    const sabado = { ...RAYHSA, dias: RAYHSA.dias.map((d) => (d.dia_semana === 6 ? { ...d, laborable: true, hora_entrada: "08:00", hora_salida: "14:00" } : d)) };
    const r = evaluar({ fecha: "2026-10-17", turno: sabado, vacaciones: { id: 7 }, ahora: new Date("2026-10-18T12:00:00Z") });
    expect(r.estatus).toBe("falta");
  });

  it("permiso aprobado = permiso (sin falta), y vacaciones gana a permiso", () => {
    expect(evaluar({ permiso: { id: 9 } }).estatus).toBe("permiso");
    expect(evaluar({ permiso: { id: 9 }, vacaciones: { id: 7 } }).estatus).toBe("vacaciones");
  });

  it("actividad de empresa y evento no cambian el día (el motor solo recibe oficial/otorgado)", () => {
    expect(evaluar({ calendario: null }).estatus).toBe("falta");
  });
});

describe("motor: justificación de RH", () => {
  const incidencia = { id: 5 };

  it.each([
    ["falta", {}, "falta"],
    ["retardo", { marcas: [marca(1, "08:15"), marca(2, "18:00")] }, "retardo"],
    ["salida_anticipada", { marcas: [marca(1, "08:00"), marca(2, "17:55")] }, "salida_anticipada"],
    ["incompleta", { marcas: [marca(1, "08:00")] }, "incompleta"],
  ])("justifica %s y conserva el cálculo original", (_n, extra, original) => {
    const r = evaluar({ ...extra, incidencia });
    expect(r.estatus).toBe("justificada");
    expect(r.detalle.calculo_original.estatus).toBe(original);
    expect(r.explicaciones[0]).toMatch(/Justificada por RH/);
  });

  it("conserva los minutos originales del retardo en el detalle", () => {
    const r = evaluar({ marcas: [marca(1, "08:15"), marca(2, "18:00")], incidencia });
    expect(r.detalle.calculo_original).toMatchObject({ estatus: "retardo", minutos_retardo: 15 });
  });

  it.each([
    ["puntual", { marcas: [marca(1, "08:00"), marca(2, "18:00")] }],
    ["vacaciones", { vacaciones: { id: 1 } }],
    ["festivo", { calendario: { id: 1 } }],
    ["permiso", { permiso: { id: 1 } }],
    ["descanso", { fecha: "2026-10-17" }],
  ])("una incidencia no cambia un día %s", (estatus, extra) => {
    expect(evaluar({ ...extra, incidencia }).estatus).toBe(estatus);
  });

  it("un día pendiente no se justifica todavía", () => {
    expect(evaluar({ ahora: utc(DIA, "12:00"), incidencia }).estatus).toBe("pendiente");
  });
});

describe("motor: turnos nocturnos y parámetros del turno", () => {
  const NOCTURNO = {
    ...RAYHSA, id: 2, nombre: "Noche", descanso_min: 0, descanso_inicio: null,
    dias: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ dia_semana: d, laborable: d <= 5, hora_entrada: d <= 5 ? "22:00" : null, hora_salida: d <= 5 ? "06:00" : null, cruza_medianoche: d <= 5 })),
  };
  const ahora = new Date("2026-10-22T20:00:00Z");

  it("el día pertenece a la fecha de la ENTRADA: salida al día siguiente", () => {
    const r = evaluar({ turno: NOCTURNO, ahora, marcas: [{ id: 1, ts: utc("2026-10-20", "21:50") }, { id: 2, ts: utc("2026-10-21", "06:05") }] });
    expect(r.estatus).toBe("puntual");
    expect(r.marcas_usadas).toEqual([1, 2]);
  });

  it("en un turno nocturno la marca de la mañana (salida del turno del día anterior) no es la entrada del día", () => {
    const r = evaluar({ turno: NOCTURNO, ahora, marcas: [{ id: 9, ts: utc("2026-10-20", "06:03") }, { id: 1, ts: utc("2026-10-20", "21:55") }, { id: 2, ts: utc("2026-10-21", "06:02") }] });
    expect(r.estatus).toBe("puntual");
    expect(r.marcas_usadas).toEqual([1, 2]);
  });

  it("entrada tarde cruzando medianoche (00:20) = falta por más de 30 min con minutos correctos", () => {
    const r = evaluar({ turno: NOCTURNO, ahora, marcas: [{ id: 1, ts: utc("2026-10-21", "00:20") }, { id: 2, ts: utc("2026-10-21", "06:00") }] });
    expect(r.estatus).toBe("falta");
    expect(r.minutos_retardo).toBe(140);
  });

  it("antes de salida + margen (08:00 del día siguiente) el turno nocturno está pendiente", () => {
    const r = evaluar({ turno: NOCTURNO, ahora: utc("2026-10-21", "07:59"), marcas: [{ id: 1, ts: utc("2026-10-20", "22:00") }] });
    expect(r.estatus).toBe("pendiente");
    expect(evaluar({ turno: NOCTURNO, ahora: utc("2026-10-21", "08:00"), marcas: [{ id: 1, ts: utc("2026-10-20", "22:00") }] }).estatus).toBe("incompleta");
  });

  it("la entrada de las 21:10 (ventana de 60 min antes) cuenta para el turno de las 22:00", () => {
    const r = evaluar({ turno: NOCTURNO, ahora, marcas: [{ id: 1, ts: utc("2026-10-20", "21:00") }, { id: 2, ts: utc("2026-10-21", "06:00") }] });
    expect(r.estatus).toBe("puntual");
  });

  it("tolerancias propias del turno: tolerancia 0 y umbral 15", () => {
    const estricto = { ...RAYHSA, tolerancia_retardo_min: 0, umbral_falta_min: 15, tolerancia_salida_min: 0 };
    expect(evaluar({ turno: estricto, marcas: [marca(1, "08:00:59"), marca(2, "18:00")] }).estatus).toBe("puntual");
    expect(evaluar({ turno: estricto, marcas: [marca(1, "08:01"), marca(2, "18:00")] }).estatus).toBe("retardo");
    expect(evaluar({ turno: estricto, marcas: [marca(1, "08:15"), marca(2, "18:00")] }).estatus).toBe("retardo");
    expect(evaluar({ turno: estricto, marcas: [marca(1, "08:16"), marca(2, "18:00")] }).estatus).toBe("falta");
    expect(evaluar({ turno: estricto, marcas: [marca(1, "08:00"), marca(2, "17:59")] }).estatus).toBe("salida_anticipada");
  });

  it("turno inactivo se califica igual pero lleva la bandera", () => {
    const r = evaluar({ turno: { ...RAYHSA, activo: false }, marcas: [marca(1, "08:00"), marca(2, "18:00")] });
    expect(r.estatus).toBe("puntual");
    expect(r.banderas).toContain("turno_inactivo");
  });

  it("un día sin fila en el turno se trata como descanso", () => {
    expect(evaluar({ turno: { ...RAYHSA, dias: RAYHSA.dias.filter((d) => d.dia_semana !== 2) } }).estatus).toBe("descanso");
  });
});

describe("snapshotTurno", () => {
  it("copia nombre, horario del día, tolerancias, ventanas, descanso y origen", () => {
    expect(snapshotTurno(RAYHSA, DIA, "departamento", 4)).toEqual({
      turno_id: 1, turno_nombre: "Rayhsa", entrada_programada: "08:00", salida_programada: "18:00", cruza_medianoche: false,
      tolerancia_retardo_min: 10, tolerancia_salida_min: 3, umbral_falta_min: 30,
      ventana_entrada_antes_min: 60, ventana_entrada_despues_min: 150, ventana_salida_antes_min: 5, ventana_salida_despues_min: 359,
      descanso_inicio: "13:00", descanso_min: 60, origen_turno: "departamento", departamento_id: 4,
    });
  });

  it("en un día de descanso no hay horario pero sí el resto del snapshot; sin turno es null", () => {
    expect(snapshotTurno(RAYHSA, "2026-10-17", "empleado", null)).toMatchObject({ entrada_programada: null, salida_programada: null, turno_nombre: "Rayhsa", origen_turno: "empleado", departamento_id: null });
    expect(snapshotTurno(null, DIA, null, null)).toBeNull();
  });
});
