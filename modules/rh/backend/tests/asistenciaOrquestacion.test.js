/* eslint-env jest */
// Orquestación del motor con BD simulada: consultas por conjuntos (sin N+1), upsert solo de periodos abiertos,
// candado, bitácora, ejecución incremental, cierre automático y ajustes pendientes.
jest.mock("../../../portal/backend/config/database", () => {
  const { crearBD } = require("./fakeAsistenciaDb");
  const bd = crearBD();
  return { grupo: bd.grupo, __bd: bd };
});

const { __bd: bdGlobal } = require("../../../portal/backend/config/database");
const { escenarioBase, crearMotorBD, empleado, parametros, marcaLocal } = require("./fakeMotorDb");

let esc;
let bd;
// El módulo del motor usa `grupo` del mock global: se redirige a la BD del escenario en cada prueba
function preparar() {
  esc = escenarioBase();
  esc.parametros = parametros();
  bd = crearMotorBD(esc);
  bdGlobal.grupo.connect.mockImplementation(async () => bd.cliente);
  bdGlobal.grupo.query.mockImplementation(bd.grupo.query.getMockImplementation());
}
const Motor = require("../services/asistencia/motorAsistencia");
const { ESPACIO_MOTOR } = require("../services/asistencia/candado");

const AHORA = () => new Date("2026-10-23T18:00:00Z"); // 12:00 en México
const consultas = (re) => bd.estado.llamadas.filter((l) => re.test(l.sql));

beforeEach(() => {
  jest.clearAllMocks();
  preparar();
});

describe("recalcular: lectura por conjuntos y escritura idempotente", () => {
  beforeEach(() => {
    esc.empleados = [empleado(1), empleado(2), empleado(3, { numero_nomina: null })];
    esc.marcas = [
      marcaLocal(1, 1, "2026-10-19", "07:58"), marcaLocal(2, 1, "2026-10-19", "18:01"),
      marcaLocal(3, 1, "2026-10-20", "08:20"), marcaLocal(4, 1, "2026-10-20", "18:00"),
    ];
    esc.vacaciones = [{ id: 77, empleado_id: 2, desde: "2026-10-19", hasta: "2026-10-19" }];
  });

  it("califica cada empleado-día, guarda el snapshot del turno y descarta a quien no se analiza", async () => {
    const r = await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-20", ahora: AHORA });
    expect(r).toMatchObject({ ocupado: false, estado: "ok", empleados: 3, dias_evaluados: 6, dias_modificados: 6 });
    const porClave = Object.fromEntries(esc.upserts.map((f) => [`${f.empleado_id}|${f.fecha}`, f]));
    expect(porClave["1|2026-10-19"]).toMatchObject({ estatus: "puntual", turno_id: 1, turno_nombre: "Rayhsa", origen_turno: "departamento", departamento_id: 10, entrada_programada: "08:00", salida_programada: "18:00", tolerancia_retardo_min: 10, umbral_falta_min: 30, descanso_min: 60, version_calculo: 1 });
    expect(porClave["1|2026-10-20"]).toMatchObject({ estatus: "retardo", minutos_retardo: 20 });
    expect(porClave["1|2026-10-20"].marcas_usadas).toEqual(["3", "4"]);
    expect(porClave["2|2026-10-19"]).toMatchObject({ estatus: "vacaciones", solicitud_vacaciones_id: 77 });
    expect(porClave["2|2026-10-20"]).toMatchObject({ estatus: "falta" });
    expect(porClave["1|2026-10-19"].detalle.explicaciones.length).toBeGreaterThan(0);
    // 4 días guardados + 2 borrados del empleado sin nómina (3): NO se guarda ni genera falta
    expect(Object.keys(porClave).some((k) => k.startsWith("3|"))).toBe(false);
    expect(esc.borrados.filter((b) => b.empleado_id === 3)).toHaveLength(2);
  });

  it("marca 'origen individual' cuando el turno viene de una asignación del empleado", async () => {
    esc.individuales = [{ empleado_id: 1, turno_id: 1, desde: "2026-10-20", hasta: null }];
    esc.departamentales = [];
    await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-20", empleadoIds: [1], ahora: AHORA });
    const por = Object.fromEntries(esc.upserts.map((f) => [f.fecha, f]));
    expect(por["2026-10-19"]).toMatchObject({ estatus: "sin_turno", turno_id: null, origen_turno: null });
    expect(por["2026-10-20"]).toMatchObject({ origen_turno: "empleado", turno_id: 1 });
  });

  it("la asignación individual gana a la del departamento", async () => {
    esc.turnos = [...esc.turnos, { ...esc.turnos[0], id: 2, nombre: "Corto", tolerancia_retardo_min: 0 }];
    esc.turnoDias = [...esc.turnoDias, ...esc.turnoDias.map((d) => ({ ...d, turno_id: 2 }))];
    esc.individuales = [{ empleado_id: 1, turno_id: 2, desde: "2026-10-01", hasta: "2026-10-31" }];
    await Motor.recalcular({ desde: "2026-10-20", hasta: "2026-10-20", empleadoIds: [1], ahora: AHORA });
    expect(esc.upserts[0]).toMatchObject({ turno_nombre: "Corto", origen_turno: "empleado" });
  });

  it("toma el candado del motor en una conexión, lo libera al final y registra la ejecución", async () => {
    await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-20", usuarioId: 5, ahora: AHORA });
    const lock = consultas(/pg_try_advisory_lock/);
    expect(lock).toHaveLength(1);
    expect(lock[0].params).toEqual([ESPACIO_MOTOR, 1]);
    expect(ESPACIO_MOTOR).toBe(4501);
    expect([4217, 4301, 4302, 4410]).not.toContain(ESPACIO_MOTOR);
    expect(consultas(/pg_advisory_unlock/)).toHaveLength(1);
    expect(bd.cliente.release).toHaveBeenCalledWith(undefined);
    expect(esc.ejecuciones).toHaveLength(1);
    expect(esc.ejecuciones[0]).toMatchObject({ tipo: "manual", origen: "api", usuario: 5, estado: "ok", dias_evaluados: 6 });
    // el candado se toma antes de leer y se suelta después de escribir
    const sqls = bd.estado.llamadas.map((l) => l.sql);
    expect(sqls.findIndex((s) => /pg_try_advisory_lock/.test(s))).toBeLessThan(sqls.findIndex((s) => /INSERT INTO asistencia_diaria/.test(s)));
    expect(sqls.findIndex((s) => /pg_advisory_unlock/.test(s))).toBeGreaterThan(sqls.findIndex((s) => /INSERT INTO asistencia_diaria/.test(s)));
  });

  it("escribe cada bloque en una transacción corta con el periodo bloqueado FOR SHARE", async () => {
    await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-20", ahora: AHORA });
    const sqls = bd.estado.llamadas.map((l) => l.sql.trim());
    const i = sqls.findIndex((s) => /INSERT INTO asistencia_diaria/.test(s));
    expect(sqls[i - 2]).toBe("BEGIN");
    expect(sqls[i - 1]).toMatch(/FROM asistencia_periodos WHERE id = ANY\(\$1::int\[\]\) ORDER BY id FOR SHARE/);
    expect(sqls[i + 2]).toBe("COMMIT");
    // las lecturas van fuera de la transacción (no se retiene una abierta mientras se calcula)
    expect(sqls.slice(0, i - 2).filter((s) => s === "BEGIN")).toHaveLength(0);
  });

  it("el upsert solo actualiza cuando algo cambió (idempotencia sin escrituras inútiles)", () => {
    expect(Motor.SQL_UPSERT).toMatch(/ON CONFLICT \(empleado_id, fecha\) DO UPDATE SET/);
    expect(Motor.SQL_UPSERT).toMatch(/WHERE \(asistencia_diaria\.periodo_id[\s\S]*\)\s+IS DISTINCT FROM \(EXCLUDED\.periodo_id/);
    expect(Motor.SQL_UPSERT).toMatch(/calculado_en = NOW\(\)/);
  });

  it("sin N+1: 50 empleados = 3 bloques de 20 y el mismo número de consultas por bloque", async () => {
    esc.empleados = Array.from({ length: 50 }, (_, i) => empleado(i + 1));
    await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-23", ahora: AHORA });
    expect(consultas(/FROM asistencia_marcas\s+WHERE empleado_id = ANY/)).toHaveLength(3);
    expect(consultas(/FROM solicitudes_vacaciones\s+WHERE estatus/)).toHaveLength(3);
    expect(consultas(/FROM turnos$/m)).toHaveLength(1); // los turnos y el calendario se leen una vez
    expect(consultas(/FROM calendario_laboral\s+WHERE activo/)).toHaveLength(1);
    expect(consultas(/INSERT INTO asistencia_diaria/)).toHaveLength(3);
    expect(bd.estado.llamadas.length).toBeLessThan(80);
    expect(esc.upserts).toHaveLength(250);
  });

  it("una baja sin fecha_baja no entra en el alcance del motor (se desconoce hasta cuándo trabajó)", async () => {
    await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-19", ahora: AHORA });
    const q = consultas(/FROM empleados e\s+WHERE \(e\.fecha_ingreso IS NULL/)[0];
    expect(q.sql).toMatch(/\(e\.estatus IS DISTINCT FROM 'baja' OR e\.fecha_baja IS NOT NULL\)/);
    expect(q.sql).toMatch(/e\.fecha_baja IS NULL OR e\.fecha_baja >= \$1::date/);
    expect(q.sql).toMatch(/e\.fecha_ingreso IS NULL OR e\.fecha_ingreso <= \$2::date/);
  });

  it("recorta el rango: nada antes de analisis_desde ni después de hoy", async () => {
    const r = await Motor.recalcular({ desde: "2026-08-25", hasta: "2026-12-31", empleadoIds: [1], ahora: AHORA });
    expect(r.desde).toBe("2026-09-01");
    expect(r.hasta).toBe("2026-10-23");
    expect(esc.upserts.every((f) => f.fecha >= "2026-09-01" && f.fecha <= "2026-10-23")).toBe(true);
  });

  it("un rango totalmente futuro no calcula nada", async () => {
    const r = await Motor.recalcular({ desde: "2026-11-01", hasta: "2026-11-05", ahora: AHORA });
    expect(r).toMatchObject({ dias_evaluados: 0 });
    expect(esc.upserts).toHaveLength(0);
  });

  it("crea los periodos (quincenas) que necesita, una sola vez", async () => {
    await Motor.recalcular({ desde: "2026-09-10", hasta: "2026-10-20", empleadoIds: [1], ahora: AHORA });
    expect(esc.periodos.map((p) => `${p.fecha_inicio}/${p.fecha_fin}`)).toEqual(["2026-09-01/2026-09-15", "2026-09-16/2026-09-30", "2026-10-01/2026-10-15", "2026-10-16/2026-10-31"]);
    await Motor.recalcular({ desde: "2026-09-10", hasta: "2026-10-20", empleadoIds: [1], ahora: AHORA });
    expect(esc.periodos).toHaveLength(4);
  });
});

describe("recalcular: periodos cerrados y carreras", () => {
  beforeEach(() => {
    esc.empleados = [empleado(1)];
    esc.periodos = [
      { id: 1, fecha_inicio: "2026-10-01", fecha_fin: "2026-10-15", estado: "cerrado" },
      { id: 2, fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31", estado: "abierto" },
    ];
  });

  it("un periodo cerrado NO se recalcula: sus días se cuentan como omitidos y no se escriben", async () => {
    const r = await Motor.recalcular({ desde: "2026-10-13", hasta: "2026-10-20", ahora: AHORA });
    expect(r.dias_omitidos_cerrados).toBe(3); // 13, 14 y 15
    expect(r.dias_evaluados).toBe(5);
    expect(esc.upserts.every((f) => f.fecha >= "2026-10-16")).toBe(true);
    expect(esc.borrados).toHaveLength(0);
  });

  it("si el rango es solo de periodos cerrados no abre ninguna transacción de escritura", async () => {
    const r = await Motor.recalcular({ desde: "2026-10-05", hasta: "2026-10-10", ahora: AHORA });
    expect(r).toMatchObject({ dias_evaluados: 0, dias_omitidos_cerrados: 6 });
    expect(consultas(/INSERT INTO asistencia_diaria/)).toHaveLength(0);
    expect(consultas(/^\s*BEGIN/)).toHaveLength(0);
  });

  it("si el periodo se cierra entre la lectura y la escritura, la transacción lo detecta y no escribe", async () => {
    esc.periodosEnTransaccion = [{ id: 2, estado: "cerrado" }];
    const r = await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-20", ahora: AHORA });
    expect(esc.upserts).toHaveLength(0);
    expect(r.dias_omitidos_cerrados).toBe(2);
  });
});

describe("recalcular: candado y errores", () => {
  beforeEach(() => {
    esc.empleados = [empleado(1)];
  });

  it("con el candado ocupado no ejecuta nada ni registra una ejecución", async () => {
    esc.cerraduraLibre = false;
    const r = await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-20", esperaMs: 0, ahora: AHORA });
    expect(r).toEqual({ ocupado: true });
    expect(esc.ejecuciones).toHaveLength(0);
    expect(esc.upserts).toHaveLength(0);
    expect(consultas(/pg_advisory_unlock/)).toHaveLength(0); // no liberó lo que no tomó
    expect(bd.cliente.release).toHaveBeenCalled();
  });

  it("dos recalculos simultáneos: el segundo reintenta el candado hasta esperaMs", async () => {
    let intentos = 0;
    bd.estado.reglas.unshift({ re: /pg_try_advisory_lock/, respuesta: () => ({ rows: [{ obtenido: ++intentos >= 3 }] }) });
    const r = await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-19", esperaMs: 3000, ahora: AHORA });
    expect(r.ocupado).toBe(false);
    expect(intentos).toBe(3);
  });

  it("un error de la BD deja ROLLBACK, bitácora 'error' SIN texto de PostgreSQL, libera el candado y relanza", async () => {
    esc.falla = (sql) => (/INSERT INTO asistencia_diaria/.test(sql) ? Object.assign(new Error('duplicate key ... Failing row contains (CURP XXXX)'), { code: "23505" }) : null);
    await expect(Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-20", ahora: AHORA })).rejects.toThrow();
    expect(consultas(/^\s*ROLLBACK/)).toHaveLength(1);
    expect(esc.ejecuciones[0]).toMatchObject({ estado: "error", error: "codigo 23505" });
    expect(JSON.stringify(esc.ejecuciones)).not.toMatch(/CURP|Failing/);
    expect(consultas(/pg_advisory_unlock/)).toHaveLength(1);
    expect(bd.cliente.release).toHaveBeenCalledWith(undefined);
  });

  it("si el candado no se pudo liberar, la conexión se destruye (release con error)", async () => {
    const fallo = new Error("conexión caída");
    esc.falla = (sql) => (/pg_advisory_unlock/.test(sql) ? fallo : null);
    await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-19", ahora: AHORA });
    expect(bd.cliente.release).toHaveBeenCalledWith(fallo);
  });

  it("marca como interrumpidas las ejecuciones que quedaron 'en_curso' (se tiene el candado: nadie más corre)", async () => {
    await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-19", ahora: AHORA });
    expect(consultas(/UPDATE asistencia_ejecuciones SET estado = 'error'.*'interrumpida'/s)).toHaveLength(1);
  });
});

describe("ejecutarCiclo: re-vinculación, incremental y completa", () => {
  beforeEach(() => {
    esc.empleados = [empleado(1), empleado(2)];
  });

  it("al empezar marca como interrumpidas las ejecuciones que quedaron 'en_curso'", async () => {
    await Motor.ejecutarCiclo({ ahora: AHORA });
    const sqls = bd.estado.llamadas.map((l) => l.sql);
    expect(sqls.findIndex((s) => /UPDATE asistencia_ejecuciones SET estado = 'error'.*'interrumpida'/s.test(s))).toBeGreaterThan(-1);
    expect(sqls.findIndex((s) => /UPDATE asistencia_ejecuciones SET estado = 'error'.*'interrumpida'/s.test(s))).toBeLessThan(sqls.findIndex((s) => /INSERT INTO asistencia_ejecuciones/.test(s)));
  });

  it("la primera corrida (sin ejecuciones previas) es COMPLETA desde el inicio del análisis", async () => {
    const r = await Motor.ejecutarCiclo({ ahora: AHORA });
    expect(r).toMatchObject({ omitida: false, tipo: "completa", estado: "ok" });
    expect(esc.ejecuciones[0]).toMatchObject({ tipo: "completa", origen: "planificador" });
    const fechas = esc.upserts.map((f) => f.fecha).sort();
    expect(fechas[0]).toBe("2026-09-01");
    expect(fechas[fechas.length - 1]).toBe("2026-10-23");
  });

  it("re-vincula las huérfanas ANTES de calcular y pasa sus ids a los ajustes", async () => {
    esc.vinculadas = [{ id: "50", empleado_id: 1, marca_ts: new Date("2026-10-20T14:00:00Z") }];
    await Motor.ejecutarCiclo({ ahora: AHORA });
    const sqls = bd.estado.llamadas.map((l) => l.sql);
    const iVinc = sqls.findIndex((s) => /UPDATE asistencia_marcas m SET empleado_id/.test(s));
    expect(iVinc).toBeGreaterThan(-1);
    expect(iVinc).toBeLessThan(sqls.findIndex((s) => /INSERT INTO asistencia_diaria/.test(s)));
    const ajustes = consultas(/INSERT INTO asistencia_ajustes_pendientes/);
    expect(ajustes.some((a) => Array.isArray(a.params[1]) && a.params[1].includes("50"))).toBe(true);
    expect(esc.ejecuciones[0].vinculadas).toBe(1);
  });

  it("con una ejecución previa reciente es INCREMENTAL: solo ventana de seguridad + días con cambios", async () => {
    esc.ejecucionPrevia = { inicio: new Date("2026-10-23T17:45:00Z"), tipo: "incremental" };
    esc.ultimaCompleta = { inicio: new Date("2026-10-23T08:00:00Z") };
    esc.cambios.marcas = [{ empleado_id: 1, fecha: "2026-10-05" }];
    await Motor.ejecutarCiclo({ ahora: AHORA });
    expect(esc.ejecuciones[0].tipo).toBe("incremental");
    const fechas = [...new Set(esc.upserts.map((f) => f.fecha))].sort();
    // 7 días de seguridad (17-23 oct) + el 5 de octubre del cambio de marcas
    expect(fechas).toEqual(["2026-10-05", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(esc.upserts.filter((f) => f.fecha === "2026-10-05").map((f) => f.empleado_id)).toEqual([1]); // solo el empleado afectado
  });

  it("el cursor de lo nuevo es el inicio de la ejecución anterior menos 10 minutos de solape (marcas confirmadas tarde)", async () => {
    esc.ejecucionPrevia = { inicio: new Date("2026-10-23T17:45:00Z"), tipo: "incremental" };
    esc.ultimaCompleta = { inicio: new Date("2026-10-23T08:00:00Z") };
    await Motor.ejecutarCiclo({ ahora: AHORA });
    const q = consultas(/SELECT DISTINCT m\.empleado_id/)[0];
    expect(q.params[0].toISOString()).toBe("2026-10-23T17:35:00.000Z");
  });

  it("cambios de calendario, vacaciones, permisos, incidencias y asignaciones recalculan solo lo afectado", async () => {
    esc.ejecucionPrevia = { inicio: new Date("2026-10-23T17:45:00Z"), tipo: "incremental" };
    esc.ultimaCompleta = { inicio: new Date("2026-10-23T08:00:00Z") };
    esc.cambios.calendario = [{ fecha: "2026-10-02" }];
    esc.cambios.vacaciones = [{ empleado_id: 2, desde: "2026-10-06", hasta: "2026-10-07" }];
    esc.cambios.permisos = [{ empleado_id: 1, desde: "2026-10-08", hasta: "2026-10-08" }];
    esc.cambios.incidencias = [{ empleado_id: 1, fecha: "2026-10-09" }];
    esc.cambios.turnoEmpleado = [{ empleado_id: 2, desde: "2026-10-12", hasta: "2026-10-12" }];
    await Motor.ejecutarCiclo({ ahora: AHORA });
    const clave = (f) => `${f.empleado_id}|${f.fecha}`;
    const claves = new Set(esc.upserts.map(clave));
    for (const k of ["1|2026-10-02", "2|2026-10-02", "2|2026-10-06", "2|2026-10-07", "1|2026-10-08", "1|2026-10-09", "2|2026-10-12"]) expect(claves.has(k)).toBe(true);
    for (const k of ["2|2026-10-08", "1|2026-10-06", "1|2026-10-12", "2|2026-10-09"]) expect(claves.has(k)).toBe(false);
  });

  it("las aprobaciones de vacaciones y permisos desde la última vuelta entran al incremental (fecha_autoriza / fecha_respuesta)", async () => {
    esc.ejecucionPrevia = { inicio: new Date("2026-10-23T17:45:00Z"), tipo: "incremental" };
    esc.ultimaCompleta = { inicio: new Date("2026-10-23T08:00:00Z") };
    await Motor.ejecutarCiclo({ ahora: AHORA });
    const v = consultas(/FROM solicitudes_vacaciones WHERE empleado_id IS NOT NULL/)[0];
    expect(v.sql).toMatch(/fecha_autoriza > \$1::timestamptz OR fecha_creacion > \$1::timestamptz/);
    const p = consultas(/FROM permisos_ausencia WHERE empleado_id IS NOT NULL/)[0];
    expect(p.sql).toMatch(/fecha_respuesta > \$1::timestamptz OR fecha_solicitud > \$1::timestamptz/);
    expect(v.params[0].toISOString()).toBe("2026-10-23T17:35:00.000Z");
  });

  it("pasadas 24 h (barrido_completo_horas) de la última completa, la corrida vuelve a ser completa", async () => {
    esc.ejecucionPrevia = { inicio: new Date("2026-10-23T17:45:00Z"), tipo: "incremental" };
    esc.ultimaCompleta = { inicio: new Date("2026-10-22T17:59:00Z") };
    const r = await Motor.ejecutarCiclo({ ahora: AHORA });
    expect(r.tipo).toBe("completa");
  });

  it("editar un turno desde la última vuelta fuerza el barrido completo", async () => {
    esc.ejecucionPrevia = { inicio: new Date("2026-10-23T17:45:00Z"), tipo: "incremental" };
    esc.ultimaCompleta = { inicio: new Date("2026-10-23T08:00:00Z") };
    esc.turnosEditados = true;
    expect((await Motor.ejecutarCiclo({ ahora: AHORA })).tipo).toBe("completa");
  });

  it("si otra réplica tiene el candado la vuelta se omite sin tocar nada", async () => {
    esc.cerraduraLibre = false;
    expect(await Motor.ejecutarCiclo({ ahora: AHORA })).toEqual({ omitida: true, motivo: "candado" });
    expect(esc.ejecuciones).toHaveLength(0);
    expect(consultas(/UPDATE asistencia_marcas/)).toHaveLength(0);
  });

  it("con el tiempo máximo vencido se detiene entre bloques, queda 'parcial' y NO cierra periodos", async () => {
    esc.empleados = Array.from({ length: 50 }, (_, i) => empleado(i + 1));
    esc.periodosVencidos = [{ id: 1, fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31" }];
    const r = await Motor.ejecutarCiclo({ ahora: AHORA, tiempoMaxMs: -1, tamanoBloque: 10 });
    expect(r.estado).toBe("parcial");
    expect(esc.cerrados).toHaveLength(0);
    expect(consultas(/INSERT INTO asistencia_diaria/)).toHaveLength(0);
    expect(esc.ejecuciones[0].estado).toBe("parcial");
  });

  it("un error en medio de la vuelta se registra en la bitácora y se relanza (el planificador lo reintenta)", async () => {
    esc.falla = (sql) => (/UPDATE asistencia_marcas m SET empleado_id/.test(sql) ? Object.assign(new Error("x"), { code: "57014" }) : null);
    await expect(Motor.ejecutarCiclo({ ahora: AHORA })).rejects.toThrow();
    expect(esc.ejecuciones[0]).toMatchObject({ estado: "error", error: "codigo 57014" });
    expect(consultas(/pg_advisory_unlock/)).toHaveLength(1);
  });
});

describe("ejecutarCiclo: cierre automático de periodos", () => {
  beforeEach(() => {
    esc.empleados = [empleado(1)];
    esc.periodos = [{ id: 1, fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31", estado: "abierto" }];
    esc.periodosVencidos = [{ id: 1, fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31" }];
  });
  const AHORA_NOV = () => new Date("2026-11-03T18:00:00Z");

  it("consulta con cierre_automatico_desde, dias_cierre y hoy (fecha_fin + días <= hoy, fecha_fin >= desde)", async () => {
    await Motor.ejecutarCiclo({ ahora: AHORA_NOV });
    const q = consultas(/AND NOT no_cerrar_automatico/)[0];
    expect(q.params).toEqual(["2026-10-16", 3, "2026-11-03"]);
    expect(q.sql).toMatch(/fecha_fin >= \$1::date AND \(fecha_fin \+ \$2::int\) <= \$3::date/);
    expect(q.sql).toMatch(/estado = 'abierto' AND NOT no_cerrar_automatico/);
  });

  it("recalcula el periodo una última vez y lo cierra como 'auto' sin usuario", async () => {
    esc.cambios = { ...esc.cambios };
    const r = await Motor.ejecutarCiclo({ ahora: AHORA_NOV });
    expect(r.periodos_cerrados).toBe(1);
    expect(esc.cerrados).toEqual([{ id: 1, usuario: null, tipo: "auto" }]);
    // la pasada final precede al cierre
    const sqls = bd.estado.llamadas.map((l) => l.sql);
    expect(sqls.findLastIndex((s) => /INSERT INTO asistencia_diaria/.test(s))).toBeLessThan(sqls.findIndex((s) => /UPDATE asistencia_periodos SET estado = 'cerrado'/.test(s)));
    expect(esc.ejecuciones[0].cerrados).toBe(1);
  });

  it("la pasada final antes de cerrar recalcula TODO el periodo aunque la vuelta incremental no tuviera nada que hacer", async () => {
    esc.ejecucionPrevia = { inicio: new Date("2026-11-03T17:50:00Z"), tipo: "incremental" };
    esc.ultimaCompleta = { inicio: new Date("2026-11-03T08:00:00Z") };
    esc.parametros = parametros({ ventana_seguridad_dias: 0 });
    const r = await Motor.ejecutarCiclo({ ahora: AHORA_NOV });
    expect(r.tipo).toBe("incremental");
    expect(r.periodos_cerrados).toBe(1);
    expect(esc.upserts.map((f) => f.fecha).sort()).toEqual(Array.from({ length: 16 }, (_, i) => `2026-10-${String(16 + i)}`));
  });

  it("sin periodos vencidos no cierra nada", async () => {
    esc.periodosVencidos = [];
    const r = await Motor.ejecutarCiclo({ ahora: AHORA_NOV });
    expect(r.periodos_cerrados).toBe(0);
    expect(esc.cerrados).toHaveLength(0);
  });

  it("el cierre usa los parámetros editados por RH (dias_cierre)", async () => {
    esc.parametros = parametros({ dias_cierre: 10, cierre_automatico_desde: "2026-11-01" });
    await Motor.ejecutarCiclo({ ahora: AHORA_NOV });
    expect(consultas(/AND NOT no_cerrar_automatico/)[0].params).toEqual(["2026-11-01", 10, "2026-11-03"]);
  });
});

describe("ajustes pendientes por marcas posteriores al cierre", () => {
  it("detecta marcas importadas DESPUÉS del cierre (fecha_importacion > cerrado_en) con una fila por marca", async () => {
    esc.ajustesNuevos = 2;
    const n = await Motor.detectarAjustes(bd.cliente, { analisisDesde: "2026-09-01" });
    expect(n).toBe(2);
    const q = consultas(/INSERT INTO asistencia_ajustes_pendientes/)[0];
    expect(q.sql).toMatch(/m\.fecha_importacion > p\.cerrado_en/);
    expect(q.sql).toMatch(/p\.estado = 'cerrado'/);
    expect(q.sql).toMatch(/ON CONFLICT \(marca_id\) DO NOTHING/);
    expect(q.sql).toMatch(/'marca_posterior_cierre'/);
    expect(q.params).toEqual(["2026-09-01"]);
  });

  it("las marcas re-vinculadas a un periodo cerrado generan ajuste 'marca_vinculada_posterior_cierre'", async () => {
    await Motor.detectarAjustes(bd.cliente, { analisisDesde: "2026-09-01", idsVinculadas: ["11", "12"] });
    const q = consultas(/marca_vinculada_posterior_cierre/)[0];
    expect(q.params).toEqual(["2026-09-01", ["11", "12"]]);
    expect(q.sql).toMatch(/p\.estado = 'cerrado'/);
  });

  it("no consulta las vinculadas si no hubo ninguna", async () => {
    await Motor.detectarAjustes(bd.cliente, { analisisDesde: "2026-09-01" });
    expect(consultas(/marca_vinculada_posterior_cierre/)).toHaveLength(0);
  });
});

describe("cierre y reapertura manual", () => {
  beforeEach(() => {
    esc.empleados = [empleado(1)];
    esc.periodos = [
      { id: 1, fecha_inicio: "2026-10-01", fecha_fin: "2026-10-15", estado: "abierto" },
      { id: 2, fecha_inicio: "2026-10-16", fecha_fin: "2026-10-31", estado: "abierto" },
      { id: 3, fecha_inicio: "2026-09-16", fecha_fin: "2026-09-30", estado: "cerrado" },
    ];
  });

  it("cierra un periodo terminado: recalcula y cierra como manual con el usuario", async () => {
    const r = await Motor.cerrarPeriodo({ id: 1, usuarioId: 9, ahora: AHORA });
    expect(r.codigo).toBe("ok");
    expect(esc.cerrados).toEqual([{ id: 1, usuario: 9, tipo: "manual" }]);
    expect(esc.ejecuciones[0]).toMatchObject({ tipo: "cierre", usuario: 9, estado: "ok" });
    expect(esc.upserts.length).toBe(15 * 1);
  });

  it.each([
    [2, "no_terminado"], // 16-31 oct sigue en curso a 23-oct
    [3, "ya_cerrado"],
    [99, "no_existe"],
  ])("periodo %i -> %s, sin cambios", async (id, codigo) => {
    const r = await Motor.cerrarPeriodo({ id, usuarioId: 9, ahora: AHORA });
    expect(r.codigo).toBe(codigo);
    expect(esc.cerrados).toHaveLength(0);
    expect(esc.upserts).toHaveLength(0);
  });

  it("con el candado ocupado el cierre responde 'ocupado'", async () => {
    esc.cerraduraLibre = false;
    expect((await Motor.cerrarPeriodo({ id: 1, usuarioId: 9, esperaMs: 0, ahora: AHORA })).codigo).toBe("ocupado");
  });

  it("reabrir deja el periodo abierto, sin cierre automático, con motivo, y lo recalcula", async () => {
    const r = await Motor.reabrirPeriodo({ id: 3, usuarioId: 9, motivo: "Corrección de marcas tardías", ahora: AHORA });
    expect(r.codigo).toBe("ok");
    expect(esc.reabiertos).toEqual([{ id: 3, usuario: 9, motivo: "Corrección de marcas tardías" }]);
    expect(consultas(/UPDATE asistencia_periodos SET estado = 'abierto'/)[0].sql).toMatch(/no_cerrar_automatico = true/);
    expect(consultas(/UPDATE asistencia_periodos SET estado = 'abierto'/)[0].sql).toMatch(/veces_reabierto = veces_reabierto \+ 1/);
    expect(esc.periodos.find((p) => p.id === 3)).toMatchObject({ estado: "abierto", no_cerrar_automatico: true });
    expect(esc.ejecuciones[0]).toMatchObject({ tipo: "reapertura" });
    expect(esc.upserts.length).toBeGreaterThan(0);
  });

  it.each([[1, "no_cerrado"], [99, "no_existe"]])("reabrir el periodo %i -> %s", async (id, codigo) => {
    expect((await Motor.reabrirPeriodo({ id, usuarioId: 9, motivo: "motivo válido", ahora: AHORA })).codigo).toBe(codigo);
    expect(esc.reabiertos).toHaveLength(0);
  });
});

describe("tope duro: statement_timeout, control y abortar", () => {
  const { abortarCorrida } = require("../services/asistencia/candado");
  beforeEach(() => {
    esc.empleados = [empleado(1)];
    bd.estado.reglas.unshift({ re: /pg_backend_pid/, respuesta: { rows: [{ pid: 4242 }] } });
  });

  it("con timeoutMs pone statement_timeout de sesión, SET LOCAL en cada transacción y lo restablece antes de devolver la conexión", async () => {
    const control = {};
    await Motor.ejecutarCiclo({ ahora: AHORA, timeoutMs: 600000, control });
    const sqls = bd.estado.llamadas.map((l) => l.sql.trim());
    expect(sqls).toContain("SET statement_timeout = 600000");
    const locales = sqls.filter((x) => x === "SET LOCAL statement_timeout = 600000");
    expect(locales.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < sqls.length; i++) if (sqls[i] === "BEGIN") expect(sqls[i + 1]).toBe("SET LOCAL statement_timeout = 600000");
    expect(sqls.indexOf("RESET statement_timeout")).toBeGreaterThan(sqls.findLastIndex((x) => /INSERT INTO asistencia_diaria/.test(x)));
    expect(sqls.indexOf("RESET statement_timeout")).toBeLessThan(sqls.findIndex((x) => /pg_advisory_unlock/.test(x)));
    expect(control).toMatchObject({ pid: 4242, liberado: true, ejecucionId: expect.anything() });
  });

  it("sin timeoutMs no toca statement_timeout (API y pruebas)", async () => {
    await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-19", ahora: AHORA });
    expect(bd.estado.llamadas.some((l) => /statement_timeout/.test(l.sql))).toBe(false);
  });

  it("abortarCorrida mata la sesión (pg_terminate_backend), destruye la conexión UNA vez y es idempotente", async () => {
    const cliente = { release: jest.fn() };
    const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const control = { cliente, pid: 4242 };
    await abortarCorrida(control, { pool });
    await abortarCorrida(control, { pool });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0]).toEqual(["SELECT pg_terminate_backend($1::int)", [4242]]);
    expect(cliente.release).toHaveBeenCalledTimes(1);
    expect(cliente.release).toHaveBeenCalledWith(true);
    expect(control).toMatchObject({ abortado: true, liberado: true });
  });

  it("abortarCorrida no hace nada si la corrida ya terminó y liberó su conexión", async () => {
    const control = { cliente: { release: jest.fn() }, pid: 1, liberado: true };
    const pool = { query: jest.fn() };
    await abortarCorrida(control, { pool });
    expect(pool.query).not.toHaveBeenCalled();
    expect(control.cliente.release).not.toHaveBeenCalled();
    await abortarCorrida(null, { pool });
  });

  it("si terminate_backend falla igual se destruye la conexión", async () => {
    const control = { cliente: { release: jest.fn() }, pid: 7 };
    await abortarCorrida(control, { pool: { query: jest.fn().mockRejectedValue(new Error("x")) } });
    expect(control.cliente.release).toHaveBeenCalledWith(true);
  });

  it("abortarVuelta registra 'tiempo_excedido' en la ejecución en curso, o crea una ya en error si aún no había abierto la suya", async () => {
    const { abortarVuelta } = Motor;
    bdGlobal.grupo.query.mockClear();
    await abortarVuelta({ cliente: { release: jest.fn() }, pid: 1, ejecucionId: 55 });
    let q = bdGlobal.grupo.query.mock.calls.map((c) => c[0]);
    expect(q.some((x) => /UPDATE asistencia_ejecuciones SET estado = 'error', fin = NOW\(\), error = 'tiempo_excedido' WHERE id = \$1 AND estado = 'en_curso'/.test(x))).toBe(true);
    bdGlobal.grupo.query.mockClear();
    await abortarVuelta({ cliente: { release: jest.fn() }, pid: 1 });
    q = bdGlobal.grupo.query.mock.calls.map((c) => c[0]);
    expect(q.some((x) => /INSERT INTO asistencia_ejecuciones .*'error', NOW\(\), 'tiempo_excedido'/s.test(x))).toBe(true);
  });

  it("el candado se toma sin esperar por omisión (API: 409 inmediato, sin retener una conexión)", async () => {
    esc.cerraduraLibre = false;
    const t0 = Date.now();
    expect(await Motor.recalcular({ desde: "2026-10-19", hasta: "2026-10-19", ahora: AHORA })).toEqual({ ocupado: true });
    expect((await Motor.cerrarPeriodo({ id: 1, usuarioId: 1, ahora: AHORA })).codigo).toBe("ocupado");
    expect((await Motor.reabrirPeriodo({ id: 1, usuarioId: 1, motivo: "motivo válido", ahora: AHORA })).codigo).toBe("ocupado");
    expect(Date.now() - t0).toBeLessThan(200);
    expect(consultas(/pg_try_advisory_lock/)).toHaveLength(3);
  });
});
