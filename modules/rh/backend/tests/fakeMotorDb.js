/* eslint-env jest */
// BD simulada del orquestador del motor de asistencia: responde a las consultas por conjuntos con los datos de un
// escenario mutable y registra cada consulta (para comprobar orden, parámetros, transacciones y que no hay N+1).
const { crearBD } = require("./fakeAsistenciaDb");

const TURNO_RAYHSA = {
  id: 1, nombre: "Rayhsa", activo: true, tolerancia_retardo_min: 10, umbral_falta_min: 30, tolerancia_salida_min: 3,
  ventana_entrada_antes_min: 60, ventana_entrada_despues_min: 150, ventana_salida_antes_min: 5, ventana_salida_despues_min: 359,
  descanso_inicio: "13:00", descanso_min: 60,
};
const DIAS_RAYHSA = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
  turno_id: 1, dia_semana: d, laborable: d <= 5, hora_entrada: d <= 5 ? "08:00" : null, hora_salida: d <= 5 ? "18:00" : null, cruza_medianoche: false,
}));

function escenarioBase() {
  return {
    cerraduraLibre: true,
    parametros: [],
    empleados: [],
    turnos: [TURNO_RAYHSA],
    turnoDias: DIAS_RAYHSA,
    individuales: [],
    departamentales: [{ departamento_id: 10, turno_id: 1, desde: "2026-01-01", hasta: null }],
    marcas: [], // { id, empleado_id, marca_ts }
    vacaciones: [],
    permisos: [],
    incidencias: [],
    calendario: [],
    periodos: [], // { id, fecha_inicio, fecha_fin, estado }
    ejecucionPrevia: null, // { inicio, tipo }
    ultimaCompleta: null, // { inicio }
    turnosEditados: false,
    cambios: { marcas: [], calendario: [], vacaciones: [], permisos: [], incidencias: [], empleados: [], turnoEmpleado: [], turnoDepto: [] },
    vinculadas: [], // filas devueltas por vincularHuerfanas
    periodosVencidos: [], // filas devueltas por la consulta de cierre automático
    periodosEnTransaccion: null, // si se define, FOR SHARE responde esto (carrera con un cierre)
    ajustesNuevos: 0,
    ejecuciones: [],
    upserts: [],
    borrados: [],
    cerrados: [],
    reabiertos: [],
    falla: null, // (sql) => Error | null
  };
}

function crearMotorBD(esc) {
  const bd = crearBD();
  const periodoPorId = (id) => esc.periodos.find((p) => p.id === Number(id));
  let siguienteEjecucion = 100;
  const cuando = (re, fn) => bd.cuando(re, fn);

  const conFalla = (re, fn) =>
    cuando(re, (sql, params) => {
      const e = esc.falla && esc.falla(sql, params);
      return e || fn(sql, params);
    });

  conFalla(/pg_try_advisory_lock/, () => ({ rows: [{ obtenido: esc.cerraduraLibre }] }));
  conFalla(/pg_advisory_unlock/, () => ({ rows: [{}] }));
  conFalla(/^\s*BEGIN|^\s*COMMIT|^\s*ROLLBACK/, () => ({ rows: [] }));
  conFalla(/FROM asistencia_parametros/, () => ({ rows: esc.parametros }));
  conFalla(/UPDATE asistencia_ejecuciones SET estado = 'error'/, () => ({ rows: [], rowCount: 0 }));
  conFalla(/INSERT INTO asistencia_ejecuciones/, (sql, p) => {
    const ej = { id: siguienteEjecucion++, tipo: p[0], origen: p[1], desde: p[2], hasta: p[3], usuario: p[4], estado: "en_curso", inicio: new Date("2026-10-23T15:00:00Z") };
    esc.ejecuciones.push(ej);
    return { rows: [{ id: ej.id, inicio: ej.inicio }] };
  });
  conFalla(/UPDATE asistencia_ejecuciones SET estado = \$2/, (sql, p) => {
    const ej = esc.ejecuciones.find((e) => e.id === p[0]);
    Object.assign(ej, { estado: p[1], empleados: p[2], dias_evaluados: p[3], dias_modificados: p[4], vinculadas: p[5], cerrados: p[6], ajustes: p[7], error: p[8], detalle: JSON.parse(p[9]) });
    return { rows: [] };
  });
  conFalla(/estado = 'ok' AND tipo = 'completa'/, () => ({ rows: esc.ultimaCompleta ? [esc.ultimaCompleta] : [] }));
  conFalla(/estado = 'ok' AND tipo IN \('incremental', 'completa'\)/, () => ({ rows: esc.ejecucionPrevia ? [esc.ejecucionPrevia] : [] }));
  conFalla(/FROM turnos WHERE fecha_actualizacion/, () => ({ rows: esc.turnosEditados ? [{ "?column?": 1 }] : [] }));
  // vinculación de huérfanas (Ingesta.vincularHuerfanas)
  conFalla(/UPDATE asistencia_marcas m SET empleado_id/, () => {
    const filas = esc.vinculadas.splice(0, esc.vinculadas.length);
    return { rows: filas, rowCount: filas.length };
  });
  conFalla(/SELECT COUNT\(\*\) AS total FROM asistencia_marcas WHERE empleado_id IS NULL/, () => ({ rows: [{ total: "0" }] }));
  conFalla(/INSERT INTO asistencia_ajustes_pendientes/, () => ({ rows: [], rowCount: esc.ajustesNuevos }));
  conFalla(/MIN\(fecha_inicio\)/, () => {
    const abiertos = esc.periodos.filter((p) => p.estado === "abierto").map((p) => p.fecha_inicio).sort();
    return { rows: [{ primero: abiertos[0] || null }] };
  });
  conFalla(/MAX\(fecha_fin\)/, () => ({ rows: [{ ultimo: esc.periodos.map((p) => p.fecha_fin).sort().pop() || null }] }));
  // periodos
  conFalla(/INSERT INTO asistencia_periodos/, (sql, p) => {
    p[0].forEach((inicio, i) => {
      if (!esc.periodos.some((x) => x.fecha_inicio === inicio)) {
        esc.periodos.push({ id: esc.periodos.length + 1, fecha_inicio: inicio, fecha_fin: p[1][i], estado: "abierto" });
      }
    });
    return { rows: [], rowCount: 0 };
  });
  conFalla(/FROM asistencia_periodos WHERE fecha_fin >= \$1::date AND fecha_inicio <= \$2::date/, (sql, p) => ({
    rows: esc.periodos.filter((x) => x.fecha_fin >= p[0] && x.fecha_inicio <= p[1]).sort((a, b) => (a.fecha_inicio < b.fecha_inicio ? -1 : 1)),
  }));
  conFalla(/SELECT id, estado FROM asistencia_periodos WHERE id = ANY\(\$1::int\[\]\)/, (sql, p) => ({
    rows: esc.periodosEnTransaccion || p[0].map((id) => ({ id, estado: periodoPorId(id).estado })),
  }));
  conFalla(/FROM asistencia_periodos\s+WHERE estado = 'abierto' AND NOT no_cerrar_automatico/, () => ({ rows: esc.periodosVencidos }));
  conFalla(/UPDATE asistencia_periodos SET estado = 'cerrado'/, (sql, p) => {
    const per = periodoPorId(p[0]);
    if (!per || per.estado !== "abierto") return { rows: [] };
    per.estado = "cerrado";
    esc.cerrados.push({ id: per.id, usuario: p[1], tipo: p[2] });
    return { rows: [{ ...per, tipo_cierre: p[2] }] };
  });
  conFalla(/UPDATE asistencia_periodos SET estado = 'abierto'/, (sql, p) => {
    const per = periodoPorId(p[0]);
    if (!per || per.estado !== "cerrado") return { rows: [] };
    per.estado = "abierto";
    per.no_cerrar_automatico = true;
    esc.reabiertos.push({ id: per.id, usuario: p[1], motivo: p[2] });
    return { rows: [{ ...per }] };
  });
  conFalla(/FROM asistencia_periodos WHERE id = \$1/, (sql, p) => ({ rows: periodoPorId(p[0]) ? [periodoPorId(p[0])] : [] }));
  // lecturas por conjuntos
  conFalla(/FROM empleados e\s+WHERE \(e\.fecha_ingreso IS NULL/, (sql, p) => {
    const ids = p[2];
    return { rows: esc.empleados.filter((e) => !ids || ids.includes(e.id)) };
  });
  conFalla(/FROM turnos$/m, () => ({ rows: esc.turnos }));
  conFalla(/FROM turno_dias/, () => ({ rows: esc.turnoDias }));
  conFalla(/FROM calendario_laboral\s+WHERE activo/, () => ({ rows: esc.calendario }));
  conFalla(/FROM asistencia_marcas\s+WHERE empleado_id = ANY/, (sql, p) => ({ rows: esc.marcas.filter((m) => p[0].includes(m.empleado_id)) }));
  conFalla(/FROM turno_empleado WHERE empleado_id = ANY/, (sql, p) => ({ rows: esc.individuales.filter((a) => p[0].includes(a.empleado_id)) }));
  conFalla(/FROM turno_departamento WHERE departamento_id = ANY/, (sql, p) => ({ rows: esc.departamentales.filter((a) => p[0].includes(a.departamento_id)) }));
  conFalla(/FROM solicitudes_vacaciones\s+WHERE estatus = 'aprobado'/, (sql, p) => ({ rows: esc.vacaciones.filter((v) => p[0].includes(v.empleado_id)) }));
  conFalla(/FROM permisos_ausencia\s+WHERE estatus = 'aprobado'/, (sql, p) => ({ rows: esc.permisos.filter((v) => p[0].includes(v.empleado_id)) }));
  conFalla(/FROM asistencia_incidencias\s+WHERE activa/, (sql, p) => ({ rows: esc.incidencias.filter((i) => p[0].includes(i.empleado_id)) }));
  // cambios desde el cursor (incremental)
  conFalla(/SELECT DISTINCT m\.empleado_id, to_char\(d\.fecha/, () => ({ rows: esc.cambios.marcas }));
  conFalla(/FROM calendario_laboral\s+WHERE fecha_actualizacion/, () => ({ rows: esc.cambios.calendario }));
  conFalla(/FROM solicitudes_vacaciones WHERE empleado_id IS NOT NULL/, () => ({ rows: esc.cambios.vacaciones }));
  conFalla(/FROM permisos_ausencia WHERE empleado_id IS NOT NULL/, () => ({ rows: esc.cambios.permisos }));
  conFalla(/FROM asistencia_incidencias\s+WHERE fecha_actualizacion/, () => ({ rows: esc.cambios.incidencias }));
  conFalla(/SELECT id FROM empleados WHERE fecha_actualizacion/, () => ({ rows: esc.cambios.empleados }));
  conFalla(/FROM turno_empleado WHERE fecha_creacion/, () => ({ rows: esc.cambios.turnoEmpleado }));
  conFalla(/FROM turno_departamento a JOIN empleados e/, () => ({ rows: esc.cambios.turnoDepto }));
  // escritura de días
  conFalla(/INSERT INTO asistencia_diaria/, (sql, p) => {
    const filas = JSON.parse(p[0]);
    esc.upserts.push(...filas);
    return { rows: filas.map(() => ({ insertada: true })), rowCount: filas.length };
  });
  conFalla(/DELETE FROM asistencia_diaria/, (sql, p) => {
    esc.borrados.push(...p[0].map((e, i) => ({ empleado_id: e, fecha: p[1][i] })));
    return { rows: [], rowCount: p[0].length };
  });
  return bd;
}

const empleado = (id, extra = {}) => ({
  id, numero_nomina: String(9000 + id), estatus: "activo", departamento_id: 10, fecha_ingreso: "2020-01-01", fecha_baja: null, nomina_duplicada: false, ...extra,
});
const parametros = (extra = {}) => {
  const base = { analisis_desde: "2026-09-01", cierre_automatico_desde: "2026-10-16", dias_cierre: "3", margen_dia_completo_min: "120", version_motor: "1", ventana_seguridad_dias: "7", barrido_completo_horas: "24", ...extra };
  return Object.entries(base).map(([clave, valor]) => ({ clave, valor: String(valor) }));
};
// Hora local de México -> instante UTC
const marcaLocal = (id, empleado_id, fecha, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return { id: String(id), empleado_id, marca_ts: new Date(new Date(`${fecha}T00:00:00Z`).getTime() + ((h + 6) * 60 + m) * 60000) };
};

module.exports = { escenarioBase, crearMotorBD, empleado, parametros, marcaLocal, TURNO_RAYHSA, DIAS_RAYHSA };
