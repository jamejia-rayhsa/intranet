// Pruebas de la lógica pura del formulario de vacaciones (Fase 4 frontend):
// modules/rh/frontend/utils/calendarioLaboral.js. El util es ESM plano y Jest corre sin transpilar:
// se evalúa el fuente sin `export` (mismo cargador que calendarioLaboral.util.test.js).
const fs = require("fs");
const path = require("path");

const fuente = fs.readFileSync(path.join(__dirname, "../frontend/utils/calendarioLaboral.js"), "utf8");
if (/^\s*import\s/m.test(fuente)) throw new Error("calendarioLaboral.js no debe tener imports");
const nombres = [...fuente.matchAll(/^export\s+(?:async\s+)?(?:const|let|function\*?|class)\s+(\w+)/gm)].map((m) => m[1]);
const U = new Function(`${fuente.replace(/^export\s+/gm, "")}\nreturn { ${nombres.join(", ")} };`)();

const OCUPACION = {
  fechas_llenas: ["2026-10-14", "2026-10-21"],
  dias_no_habiles: [
    { fecha: "2026-10-12", tipo: "oficial", nombre: "Día de prueba" },
    { fecha: "2026-10-20", tipo: "otorgado", nombre: "Puente" },
  ],
  eventos: [{ fecha: "2026-10-16", nombre: "Inventario" }, { fecha: "2026-10-16", nombre: "Auditoría" }],
};

const celdas = (semanas) => semanas.flat();
const celda = (semanas, fecha) => celdas(semanas).find((c) => c.fecha === fecha);

describe("formulario de vacaciones - mensajes de conflicto", () => {
  it("devuelve null cuando no hay conflicto", () => {
    expect(U.mensajeConflicto(null)).toBeNull();
    expect(U.mensajeConflicto(undefined)).toBeNull();
  });

  it("usa el mensaje del backend tal cual", () => {
    expect(U.mensajeConflicto({ codigo: "CUPO_LLENO", mensaje: "El 14 de octubre el cupo está lleno" }))
      .toBe("El 14 de octubre el cupo está lleno");
  });

  it("recurre al mensaje por código cuando el mensaje falta o está vacío", () => {
    for (const codigo of ["SIN_DIAS_HABILES", "TRASLAPE", "SALDO_INSUFICIENTE", "CUPO_LLENO"]) {
      expect(U.mensajeConflicto({ codigo })).toBe(U.MENSAJES_CONFLICTO[codigo]);
      expect(U.mensajeConflicto({ codigo, mensaje: "   " })).toBe(U.MENSAJES_CONFLICTO[codigo]);
    }
  });

  it("usa un mensaje genérico ante un código desconocido", () => {
    expect(U.mensajeConflicto({ codigo: "NUEVO" })).toBe(U.MENSAJE_CONFLICTO_GENERICO);
  });
});

describe("formulario de vacaciones - resumen de disponibilidad", () => {
  const datos = {
    dias_habiles: 3,
    dias_no_habiles: [
      { fecha: "2026-10-20", tipo: "otorgado", nombre: "Puente" },
      { fecha: "2026-10-12", tipo: "oficial", nombre: "Día de prueba" },
    ],
    eventos: [{ fecha: "2026-10-16", nombre: "Inventario" }],
    cupo: 2,
    saldo: 10,
    conflicto: null,
  };

  it("toma los días hábiles del backend y calcula el saldo restante", () => {
    const r = U.resumirDisponibilidad(datos);
    expect(r.dias).toBe(3);
    expect(r.saldo).toBe(10);
    expect(r.quedarian).toBe(7);
    expect(r.conflicto).toBeNull();
  });

  it("ordena los días no hábiles y rotula su tipo", () => {
    const r = U.resumirDisponibilidad(datos);
    expect(r.noHabiles.map((d) => d.fecha)).toEqual(["2026-10-12", "2026-10-20"]);
    expect(r.noHabiles[0].etiquetaTipo).toBe("Oficial de ley");
    expect(r.noHabiles[1].etiquetaTipo).toBe("Descanso otorgado");
    expect(r.eventos).toHaveLength(1);
  });

  it("el saldo restante puede ser negativo (el backend marca SALDO_INSUFICIENTE)", () => {
    const r = U.resumirDisponibilidad({ ...datos, dias_habiles: 12, conflicto: { codigo: "SALDO_INSUFICIENTE", mensaje: "No alcanza" } });
    expect(r.quedarian).toBe(-2);
    expect(r.conflicto).toEqual({ codigo: "SALDO_INSUFICIENTE", mensaje: "No alcanza" });
  });

  it("sin saldo en la respuesta usa el de respaldo o no calcula restante", () => {
    expect(U.resumirDisponibilidad({ ...datos, saldo: null }, 8).quedarian).toBe(5);
    expect(U.resumirDisponibilidad({ ...datos, saldo: null }).quedarian).toBeNull();
  });

  it("es tolerante a una respuesta incompleta", () => {
    const r = U.resumirDisponibilidad({});
    expect(r.dias).toBe(0);
    expect(r.noHabiles).toEqual([]);
    expect(r.eventos).toEqual([]);
    expect(r.cupo).toBeUndefined();
    expect(U.resumirDisponibilidad(null).dias).toBe(0);
  });

  it("conserva cupo null (sin departamento)", () => {
    expect(U.resumirDisponibilidad({ ...datos, cupo: null }).cupo).toBeNull();
  });

  it("pluraliza los días hábiles", () => {
    expect(U.textoDiasHabiles(1)).toBe("1 día hábil");
    expect(U.textoDiasHabiles(0)).toBe("0 días hábiles");
    expect(U.textoDiasHabiles(5)).toBe("5 días hábiles");
  });
});

describe("formulario de vacaciones - rango y botón Enviar", () => {
  it("rangoCompleto exige dos fechas reales y en orden", () => {
    expect(U.rangoCompleto("2026-10-14", "2026-10-16")).toBe(true);
    expect(U.rangoCompleto("2026-10-14", "2026-10-14")).toBe(true);
    expect(U.rangoCompleto("2026-10-16", "2026-10-14")).toBe(false);
    expect(U.rangoCompleto("", "2026-10-14")).toBe(false);
    expect(U.rangoCompleto("2026-02-30", "2026-03-02")).toBe(false);
    expect(U.rangoCompleto("20260-10-14", "20260-10-16")).toBe(false);
  });

  it("bloquea Enviar sin rango, cargando, con error, con conflicto o enviando", () => {
    const limpio = { estado: "listo", resumen: { conflicto: null } };
    expect(U.envioBloqueado(limpio)).toBe(false);
    expect(U.envioBloqueado({ estado: "ocioso", resumen: null })).toBe(true);
    expect(U.envioBloqueado({ estado: "cargando", resumen: limpio.resumen })).toBe(true);
    expect(U.envioBloqueado({ estado: "error", resumen: null })).toBe(true);
    expect(U.envioBloqueado({ estado: "listo", resumen: { conflicto: { codigo: "CUPO_LLENO", mensaje: "x" } } })).toBe(true);
    expect(U.envioBloqueado(limpio, true)).toBe(true);
    expect(U.envioBloqueado(null)).toBe(true);
  });

  it("siguienteSeleccion: primer clic fija la inicial, el segundo la final", () => {
    expect(U.siguienteSeleccion({ inicio: "", fin: "" }, "2026-10-14")).toEqual({ inicio: "2026-10-14", fin: "" });
    expect(U.siguienteSeleccion({ inicio: "2026-10-14", fin: "" }, "2026-10-16")).toEqual({ inicio: "2026-10-14", fin: "2026-10-16" });
    expect(U.siguienteSeleccion({ inicio: "2026-10-14", fin: "" }, "2026-10-14")).toEqual({ inicio: "2026-10-14", fin: "2026-10-14" });
  });

  it("siguienteSeleccion: una fecha anterior reemplaza la inicial y un rango completo se reinicia", () => {
    expect(U.siguienteSeleccion({ inicio: "2026-10-14", fin: "" }, "2026-10-13")).toEqual({ inicio: "2026-10-13", fin: "" });
    expect(U.siguienteSeleccion({ inicio: "2026-10-14", fin: "2026-10-16" }, "2026-10-19")).toEqual({ inicio: "2026-10-19", fin: "" });
    expect(U.siguienteSeleccion(null, "2026-10-19")).toEqual({ inicio: "2026-10-19", fin: "" });
  });
});

describe("formulario de vacaciones - mes de ocupación", () => {
  const semanas = U.construirMesOcupacion(2026, 10, OCUPACION, { inicio: "2026-10-14", fin: "2026-10-16", hoy: "2026-10-15" });

  it("conserva la cuadrícula de lunes a domingo en múltiplos de 7", () => {
    expect(celdas(semanas).length % 7).toBe(0);
    expect(semanas[0][0].fecha).toBe("2026-09-28");
    expect(semanas[semanas.length - 1][6].fecha).toBe("2026-11-01");
  });

  it("marca el cupo lleno", () => {
    expect(celda(semanas, "2026-10-14").lleno).toBe(true);
    expect(celda(semanas, "2026-10-15").lleno).toBe(false);
    expect(celda(semanas, "2026-10-21").lleno).toBe(true);
  });

  it("marca no hábiles oficiales, otorgados y fines de semana", () => {
    expect(celda(semanas, "2026-10-12").noHabil).toMatchObject({ tipo: "oficial", etiquetaTipo: "Oficial de ley" });
    expect(celda(semanas, "2026-10-20").noHabil).toMatchObject({ tipo: "otorgado", nombre: "Puente" });
    expect(celda(semanas, "2026-10-17").finDeSemana).toBe(true);
    expect(celda(semanas, "2026-10-17").noHabil).toBeNull();
  });

  it("agrupa los eventos del día sin bloquearlo", () => {
    const c = celda(semanas, "2026-10-16");
    expect(c.eventos.sort()).toEqual(["Auditoría", "Inventario"]);
    expect(c.seleccionable).toBe(true);
  });

  it("solo un día hábil libre es seleccionable", () => {
    expect(celda(semanas, "2026-10-13").seleccionable).toBe(true);
    expect(celda(semanas, "2026-10-14").seleccionable).toBe(false); // lleno
    expect(celda(semanas, "2026-10-12").seleccionable).toBe(false); // oficial
    expect(celda(semanas, "2026-10-20").seleccionable).toBe(false); // otorgado
    expect(celda(semanas, "2026-10-18").seleccionable).toBe(false); // domingo
  });

  it("destaca el rango elegido y sus extremos", () => {
    expect(celda(semanas, "2026-10-14")).toMatchObject({ esInicio: true, enRango: true, esFin: false });
    expect(celda(semanas, "2026-10-15")).toMatchObject({ esInicio: false, enRango: true, esFin: false, esHoy: true });
    expect(celda(semanas, "2026-10-16")).toMatchObject({ esFin: true, enRango: true });
    expect(celda(semanas, "2026-10-13").enRango).toBe(false);
    expect(celda(semanas, "2026-10-19").enRango).toBe(false);
  });

  it("con solo fecha inicial destaca ese día y no pinta rango", () => {
    const s = U.construirMesOcupacion(2026, 10, OCUPACION, { inicio: "2026-10-13", fin: "" });
    expect(celda(s, "2026-10-13")).toMatchObject({ esInicio: true, enRango: false, esFin: false });
    expect(celdas(s).filter((c) => c.enRango)).toHaveLength(0);
  });

  it("tolera ocupación nula (cargando o con error) y rango invertido", () => {
    const s = U.construirMesOcupacion(2026, 10, null, { inicio: "2026-10-16", fin: "2026-10-14" });
    expect(celdas(s).some((c) => c.lleno || c.noHabil || c.eventos.length)).toBe(false);
    expect(celdas(s).some((c) => c.enRango)).toBe(false);
  });

  it("el aria-label empieza por el número del día e incluye texto de cada marca", () => {
    expect(celda(semanas, "2026-10-14").etiqueta).toMatch(/^14 Cupo lleno\. miércoles 14 de octubre de 2026/);
    expect(celda(semanas, "2026-10-14").etiqueta).toContain("Fecha inicial elegida");
    expect(celda(semanas, "2026-10-12").etiqueta).toContain("Día no hábil, Oficial de ley: Día de prueba");
    expect(celda(semanas, "2026-10-17").etiqueta).toContain("Fin de semana, día no hábil");
    expect(celda(semanas, "2026-10-16").etiqueta).toContain("Evento: Inventario");
    expect(celda(semanas, "2026-10-15").etiqueta).toContain("Dentro del rango elegido");
  });

  it("no depende de la zona horaria: las fechas son texto", () => {
    expect(celda(semanas, "2026-10-31").dia).toBe(31);
    expect(celdas(semanas).every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.fecha))).toBe(true);
  });

  it("detalleMesOcupacion lista solo las marcas del mes ordenadas por fecha", () => {
    const d = U.detalleMesOcupacion(2026, 10, { ...OCUPACION, fechas_llenas: [...OCUPACION.fechas_llenas, "2026-11-03"] });
    expect(d.map((f) => `${f.fecha} ${f.clase}`)).toEqual([
      "2026-10-12 no-habil",
      "2026-10-14 lleno",
      "2026-10-16 evento",
      "2026-10-16 evento",
      "2026-10-20 no-habil",
      "2026-10-21 lleno",
    ]);
    expect(d[1].texto).toBe("Cupo lleno");
    expect(d[0].texto).toBe("Oficial de ley: Día de prueba");
    expect(U.detalleMesOcupacion(2026, 10, null)).toEqual([]);
  });
});

describe("formulario de vacaciones - periodo, cruce de año y fecha de regreso", () => {
  it("anioDeTexto lee el año del texto y rechaza fechas inválidas", () => {
    expect(U.anioDeTexto("2026-12-28")).toBe(2026);
    expect(U.anioDeTexto("2027-01-01")).toBe(2027);
    expect(U.anioDeTexto("2027-02-29")).toBeNull();
    expect(U.anioDeTexto("")).toBeNull();
    expect(U.anioDeTexto(undefined)).toBeNull();
  });

  it("notaCruceDeAnio avisa solo si el rango cruza de año y dice el periodo de la fecha inicial", () => {
    expect(U.notaCruceDeAnio("2026-12-28", "2027-01-04")).toMatch(/periodo 2026/);
    expect(U.notaCruceDeAnio("2026-10-19", "2026-10-23")).toBeNull();
    expect(U.notaCruceDeAnio("2026-12-28", "")).toBeNull();
    expect(U.notaCruceDeAnio("2027-01-04", "2026-12-28")).toBeNull();
  });

  it("regresoValido: vacío es válido; debe ser >= fecha final", () => {
    expect(U.regresoValido("2026-10-23", "")).toBe(true);
    expect(U.regresoValido("2026-10-23", "2026-10-23")).toBe(true);
    expect(U.regresoValido("2026-10-23", "2026-10-26")).toBe(true);
    expect(U.regresoValido("2026-10-23", "2026-10-22")).toBe(false);
    expect(U.regresoValido("2026-10-23", "mañana")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Día Actividad Empresa
// ---------------------------------------------------------------------------------------------
const CON_ACTIVIDAD = {
  ...OCUPACION,
  fechas_bloqueadas: [
    { fecha: "2026-10-22", nombre: "Inventario general" },
    { fecha: "2026-10-22", nombre: "Auditoría externa" },
    { fecha: "2026-10-28", nombre: "Taller anual" },
  ],
};

const luminancia = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
};

describe("Día Actividad Empresa - tipo y textos", () => {
  it("el tipo existe con etiqueta, ícono propio, bloquea y no descuenta", () => {
    const t = U.TIPOS_CALENDARIO.find((x) => x.valor === "actividad");
    expect(t).toMatchObject({ etiqueta: "Día Actividad Empresa", icono: "■", bloquea: true, descuenta: false });
    const iconos = U.TIPOS_CALENDARIO.map((x) => x.icono);
    expect(new Set(iconos).size).toBe(iconos.length);
    expect(U.TIPOS_CALENDARIO.filter((x) => x.bloquea).map((x) => x.valor)).toEqual(["actividad"]);
  });

  it("tiene texto de ayuda que dice que bloquea las vacaciones para todos; los demás tipos no bloquean", () => {
    expect(U.ayudaDelTipo("actividad")).toMatch(/bloquea las vacaciones para todos/i);
    for (const tipo of ["oficial", "otorgado", "evento"]) expect(U.ayudaDelTipo(tipo)).not.toMatch(/bloquea las vacaciones/i);
    expect(U.ayudaDelTipo("desconocido")).toBe("");
  });

  it("los códigos de conflicto del frontend coinciden con los del backend", () => {
    const controlador = fs.readFileSync(path.join(__dirname, "../backend/controllers/vacaciones.controller.js"), "utf8");
    const codigosBackend = [...controlador.matchAll(/codigo: "([A-Z_]+)"/g)].map((m) => m[1]);
    expect(codigosBackend).toContain("ACTIVIDAD_EMPRESA");
    for (const codigo of new Set(codigosBackend)) expect(U.MENSAJES_CONFLICTO[codigo]).toEqual(expect.any(String));
  });

  it("el color de la actividad cumple AA (>= 4,5:1) en marca, chip, aviso y fila", () => {
    const css = fs.readFileSync(path.join(__dirname, "../frontend/styles/calendario.css"), "utf8");
    const fondo = css.match(/--cal-actividad-fondo:\s*(#[0-9a-f]{6})/i)[1];
    const texto = css.match(/--cal-actividad-texto:\s*(#[0-9a-f]{6})/i)[1];
    expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(texto, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contraste(texto, "#eceff3")).toBeGreaterThanOrEqual(4.5);
    // distinto de los otros tipos
    for (const otro of ["oficial", "otorgado", "evento"]) {
      expect(css.match(new RegExp(`--cal-${otro}-fondo:\\s*(#[0-9a-f]{6})`, "i"))[1].toLowerCase()).not.toBe(fondo.toLowerCase());
    }
  });

  it("ordena la actividad después de oficial, otorgado y evento", () => {
    const orden = U.ordenarItems([
      { fecha: "2026-10-22", tipo: "actividad", id: 1 },
      { fecha: "2026-10-22", tipo: "evento", id: 2 },
      { fecha: "2026-10-22", tipo: "oficial", id: 3 },
    ]);
    expect(orden.map((i) => i.tipo)).toEqual(["oficial", "evento", "actividad"]);
  });

  it("etiquetaDia (calendario laboral) usa la etiqueta del tipo", () => {
    expect(U.etiquetaDia("2026-10-22", [{ tipo: "actividad", nombre: "Inventario", activo: true }]))
      .toBe("22 Inventario. jueves 22 de octubre de 2026. Día Actividad Empresa: Inventario");
  });
});

describe("Día Actividad Empresa - aviso de solicitudes afectadas", () => {
  it("cuenta aprobadas y pendientes con singular/plural y aclara que no se modificaron", () => {
    const uno = U.mensajeAvisosActividad({ solicitudes_aprobadas: 1, solicitudes_pendientes: 1 });
    expect(uno).toMatch(/hay 1 solicitud aprobada y 1 solicitud pendiente/);
    expect(uno).toMatch(/No se modificaron/);
    const varios = U.mensajeAvisosActividad({ solicitudes_aprobadas: 3, solicitudes_pendientes: 2 });
    expect(varios).toMatch(/3 solicitudes aprobadas y 2 solicitudes pendientes/);
  });

  it("solo menciona lo que hay", () => {
    expect(U.mensajeAvisosActividad({ solicitudes_aprobadas: 2, solicitudes_pendientes: 0 })).toMatch(/^Atención: hay 2 solicitudes aprobadas de vacaciones que incluyen/);
    expect(U.mensajeAvisosActividad({ solicitudes_aprobadas: 0, solicitudes_pendientes: 1 })).not.toMatch(/\d solicitudes? aprobadas?/);
  });

  it("'Ninguna solicitud' solo con motivo sin_solicitudes; sin motivo y en cero no afirma nada", () => {
    expect(U.mensajeAvisosActividad({ solicitudes_aprobadas: 0, solicitudes_pendientes: 0, motivo: "sin_solicitudes" })).toBe(
      "Ninguna solicitud de vacaciones, aprobada o pendiente, incluye esta fecha.",
    );
    expect(U.mensajeAvisosActividad({ solicitudes_aprobadas: 0, solicitudes_pendientes: 0 })).toBeNull();
  });

  it("inactiva y no hábil: texto veraz, nunca 'Ninguna', y con conteos si existen solicitudes", () => {
    const base = { solicitudes_aprobadas: 0, solicitudes_pendientes: 0 };
    expect(U.mensajeAvisosActividad({ ...base, motivo: "inactiva" })).toBe("Esta fecha ya no bloquea vacaciones.");
    expect(U.mensajeAvisosActividad({ ...base, motivo: "no_habil" })).toBe(
      "Esta fecha cae en un día no hábil y no bloquea vacaciones.",
    );
    const inactiva = U.mensajeAvisosActividad({ solicitudes_aprobadas: 1, solicitudes_pendientes: 2, motivo: "inactiva" });
    expect(inactiva).toMatch(/^Esta fecha ya no bloquea vacaciones\. Hay 1 solicitud aprobada y 2 solicitudes pendientes de vacaciones que incluyen esta fecha; no se modificaron\.$/);
    expect(inactiva).not.toMatch(/Ninguna/);
    const noHabil = U.mensajeAvisosActividad({ solicitudes_aprobadas: 0, solicitudes_pendientes: 1, motivo: "no_habil" });
    expect(noHabil).toMatch(/día no hábil y no bloquea vacaciones\. Hay 1 solicitud pendiente/);
    expect(noHabil).not.toMatch(/Ninguna|aprobada/);
  });

  it("sin aviso (otros tipos) devuelve null; avisos null (fallo del cálculo) da texto de respaldo; basura se ignora", () => {
    expect(U.mensajeAvisosActividad(undefined)).toBeNull();
    expect(U.mensajeAvisosActividad("texto")).toBeNull();
    expect(U.mensajeAvisosActividad(null)).toMatch(/no se pudo calcular/);
    expect(U.mensajeAvisosActividad({ solicitudes_aprobadas: "x", solicitudes_pendientes: -0.5 })).toBeNull();
  });
});

describe("Día Actividad Empresa - calendario de ocupación y disponibilidad", () => {
  const semanas = U.construirMesOcupacion(2026, 10, CON_ACTIVIDAD, { hoy: "2026-10-15" });

  it("marca la fecha como bloqueada, no seleccionable, y junta nombres de la misma fecha", () => {
    const c = celda(semanas, "2026-10-22");
    expect(c.bloqueado).toBe("Inventario general, Auditoría externa");
    expect(c.seleccionable).toBe(false);
    expect(celda(semanas, "2026-10-28").bloqueado).toBe("Taller anual");
    expect(celda(semanas, "2026-10-23").bloqueado).toBeNull();
    expect(celda(semanas, "2026-10-23").seleccionable).toBe(true);
  });

  it("el aria-label empieza por el texto visible «Bloqueado: nombre» y explica el bloqueo", () => {
    const c = celda(semanas, "2026-10-28");
    expect(c.etiqueta.startsWith("28 Bloqueado: Taller anual. ")).toBe(true);
    expect(c.etiqueta).toMatch(/vacaciones están bloqueadas para todos/);
  });

  it("si además está lleno, el texto visible conserva el orden: número, Cupo lleno, Bloqueado", () => {
    const m = U.construirMesOcupacion(2026, 10, { fechas_llenas: ["2026-10-22"], fechas_bloqueadas: [{ fecha: "2026-10-22", nombre: "X" }] });
    expect(celda(m, "2026-10-22").etiqueta.startsWith("22 Cupo lleno Bloqueado: X. ")).toBe(true);
  });

  it("detalleMesOcupacion lista «Bloqueado: nombre» ordenado entre lleno y no hábil", () => {
    const detalle = U.detalleMesOcupacion(2026, 10, { ...CON_ACTIVIDAD, fechas_llenas: ["2026-10-22"], dias_no_habiles: [{ fecha: "2026-10-22", tipo: "oficial", nombre: "F" }] });
    expect(detalle.filter((f) => f.fecha === "2026-10-22").map((f) => f.clase)).toEqual(["lleno", "bloqueado", "no-habil"]);
    expect(detalle.find((f) => f.clase === "bloqueado").texto).toBe("Bloqueado: Inventario general, Auditoría externa");
    expect(U.detalleMesOcupacion(2026, 11, CON_ACTIVIDAD).some((f) => f.clase === "bloqueado")).toBe(false);
  });

  it("sin fechas_bloqueadas (respuesta antigua o vacía) no marca nada y no falla", () => {
    const m = U.construirMesOcupacion(2026, 10, OCUPACION);
    expect(celdas(m).every((c) => c.bloqueado === null)).toBe(true);
    expect(() => U.construirMesOcupacion(2026, 10, { fechas_bloqueadas: "no es lista" })).not.toThrow();
  });

  it("resumirDisponibilidad expone las fechas bloqueadas ordenadas y el mensaje del conflicto", () => {
    const r = U.resumirDisponibilidad({
      dias_habiles: 5,
      saldo: 10,
      fechas_bloqueadas: [{ fecha: "2026-10-28", nombre: "B" }, { fecha: "2026-10-22", nombre: "A" }],
      conflicto: { codigo: "ACTIVIDAD_EMPRESA", mensaje: "El 22/10/2026 es Día Actividad Empresa (A)" },
    });
    expect(r.bloqueadas.map((b) => b.nombre)).toEqual(["A", "B"]);
    expect(r.conflicto.codigo).toBe("ACTIVIDAD_EMPRESA");
    expect(U.resumirDisponibilidad({ dias_habiles: 1 }).bloqueadas).toEqual([]);
  });

  it("Enviar queda deshabilitado cuando hay conflicto ACTIVIDAD_EMPRESA", () => {
    const resumen = U.resumirDisponibilidad({ dias_habiles: 3, saldo: 9, conflicto: { codigo: "ACTIVIDAD_EMPRESA" } });
    expect(resumen.conflicto.mensaje).toBe(U.MENSAJES_CONFLICTO.ACTIVIDAD_EMPRESA);
    expect(U.envioBloqueado({ estado: "listo", resumen })).toBe(true);
    expect(U.envioBloqueado({ estado: "listo", resumen: U.resumirDisponibilidad({ dias_habiles: 3, saldo: 9, conflicto: null }) })).toBe(false);
  });
});

describe("Día Actividad Empresa - JSX (lectura del fuente, no hay jsdom)", () => {
  const leer = (...p) => fs.readFileSync(path.join(__dirname, "../frontend", ...p), "utf8");

  it("el modal muestra la ayuda del tipo y pasa el aviso solo si el tipo es actividad", () => {
    const modal = leer("components", "ModalFechaCalendario.jsx");
    expect(modal).toMatch(/aria-describedby="cal-tipo-ayuda"/);
    expect(modal).toMatch(/cuerpo\.tipo === "actividad"[\s\S]*mensajeAvisosActividad\(respuesta\.avisos\)/);
  });

  it("la página muestra el aviso en la región role=status y la leyenda explica el bloqueo", () => {
    const pagina = leer("pages", "CalendarioLaboralPage.jsx");
    expect(pagina).toMatch(/<div role="status" aria-live="polite">[\s\S]*avisoActividad[\s\S]*errorPermisos/);
    expect(pagina).toMatch(/t\.bloquea && /);
  });

  it("el calendario de ocupación pinta «Bloqueado: nombre» y su versión corta, y el detalle siempre lo muestra", () => {
    const comp = leer("components", "CalendarioOcupacion.jsx");
    expect(comp).toMatch(/celda\.bloqueado && /);
    expect(comp).toMatch(/Bloqueado: \{celda\.bloqueado\}/);
    expect(comp).toMatch(/ocupacion__bloq-corto">Bloq</);
  });

  it("el formulario de vacaciones lista las fechas bloqueadas y no usa Enviar sin envioBloqueado", () => {
    const pagina = leer("pages", "VacacionesPage.jsx");
    expect(pagina).toMatch(/resumen\.bloqueadas\.length > 0/);
    expect(pagina).toMatch(/Bloqueado: \{b\.nombre\}/);
    expect(pagina).toMatch(/envioBloqueado\(/);
  });
});
