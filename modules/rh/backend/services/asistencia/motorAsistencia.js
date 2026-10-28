// Orquestador del motor de asistencia (Fase 4): lee por CONJUNTOS (sin N+1), califica cada empleado-día con el motor
// puro (motor.js) y hace el upsert idempotente en asistencia_diaria SOLO de periodos abiertos. Toda corrida:
//  - toma el candado consultivo del motor (candado.js) en una conexión dedicada y deja bitácora en asistencia_ejecuciones;
//  - trabaja por bloques de empleados, cada uno en su propia transacción corta (lectura fuera de la transacción);
//  - nunca modifica un periodo cerrado (FOR SHARE del periodo dentro de la transacción + trigger en la BD);
//  - registra en asistencia_ajustes_pendientes las marcas que llegan o se vinculan después del cierre.
const { grupo } = require("../../../../portal/backend/config/database");
const Ingesta = require("../../models/ingesta.model");
const { evaluarDia, snapshotTurno } = require("./motor");
const { interpretarParametros, validarVentanaComida, CLAVES } = require("./parametros");
const { quincenaDe, quincenasEntre } = require("./periodos");
const { conCandadoDelMotor, abortarCorrida } = require("./candado");
const { ZONA, aLocal, hoyMexico, sumarDias } = require("./tiempo");
const { aNumeroDia, deNumeroDia } = require("../../utils/diasHabiles");

const TAMANO_BLOQUE = 20;
const TIEMPO_MAXIMO_MS = 10 * 60 * 1000;
// Traslape del cursor incremental: una marca cuya transacción de ingesta empezó antes de la última vuelta pero se
// confirmó después tiene fecha_importacion (= inicio de su transacción) anterior al cursor; 10 min cubren con holgura
// cualquier ingesta razonable y el barrido completo (24 h) recoge el resto.
const SOLAPE_CURSOR_MS = 10 * 60 * 1000;
const LIMITE_VINCULACION = 5000;
const MAX_VUELTAS_VINCULACION = 20;

const hoy = (ahora) => hoyMexico(ahora());
const MAX = (a, b) => (a > b ? a : b);
const MIN = (a, b) => (a < b ? a : b);

// Nunca el texto del error de PostgreSQL (puede traer datos de la fila): solo código y tipo
const motivoSeguro = (error) => (error && error.code ? `codigo ${String(error.code).slice(0, 10)}` : (error && error.name) || "Error");

// ---------------------------------------------------------------- parámetros
async function leerParametros(c = grupo) {
  const r = await c.query("SELECT clave, valor FROM asistencia_parametros");
  return interpretarParametros(r.rows);
}

async function listarParametros(c = grupo) {
  const r = await c.query(
    `SELECT clave, valor, descripcion, actualizado_por, fecha_actualizacion FROM asistencia_parametros ORDER BY clave`,
  );
  return r.rows.filter((f) => CLAVES.includes(f.clave));
}

/** cambios: { clave: valorTipado }. Devuelve { previos, nuevos } para la auditoría. */
async function guardarParametros(cambios, usuarioId) {
  const claves = Object.keys(cambios);
  const lock = [...new Set([...claves, "comida_desde", "comida_hasta"])];
  const cliente = await grupo.connect();
  let errorRollback;
  try {
    await cliente.query("BEGIN");
    const bloqueadas = await cliente.query(
      "SELECT clave, valor FROM asistencia_parametros WHERE clave = ANY($1::text[]) ORDER BY clave FOR UPDATE",
      [lock],
    );
    // la ventana de comida se valida contra los valores ya bloqueados: dos PUT simultáneos no la dejan invertida
    const errorComida = validarVentanaComida(cambios, interpretarParametros(bloqueadas.rows));
    if (errorComida) {
      const e = new Error("validacion");
      e.validacion = errorComida;
      throw e;
    }
    const previos = { rows: bloqueadas.rows.filter((f) => claves.includes(f.clave)) };
    await cliente.query(
      `INSERT INTO asistencia_parametros (clave, valor, actualizado_por, fecha_actualizacion)
       SELECT k, v, $3, NOW() FROM unnest($1::text[], $2::text[]) AS t(k, v)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por,
         fecha_actualizacion = NOW()`,
      [claves, claves.map((k) => String(cambios[k])), usuarioId || null],
    );
    await cliente.query("COMMIT");
    return {
      previos: Object.fromEntries(previos.rows.map((f) => [f.clave, f.valor])),
      nuevos: Object.fromEntries(claves.map((k) => [k, String(cambios[k])])),
    };
  } catch (error) {
    await cliente.query("ROLLBACK").catch((e) => {
      errorRollback = e;
    });
    throw error;
  } finally {
    cliente.release(errorRollback);
  }
}

// ---------------------------------------------------------------- periodos
async function asegurarPeriodos(c, desde, hasta) {
  const quincenas = quincenasEntre(desde, hasta);
  if (quincenas.length > 0) {
    await c.query(
      `INSERT INTO asistencia_periodos (fecha_inicio, fecha_fin)
       SELECT i, f FROM unnest($1::date[], $2::date[]) AS t(i, f)
       ON CONFLICT (fecha_inicio) DO NOTHING`,
      [quincenas.map((q) => q.inicio), quincenas.map((q) => q.fin)],
    );
  }
  const r = await c.query(
    `SELECT id, to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin, estado
     FROM asistencia_periodos WHERE fecha_fin >= $1::date AND fecha_inicio <= $2::date ORDER BY fecha_inicio`,
    [desde, hasta],
  );
  return r.rows;
}

// ---------------------------------------------------------------- lecturas por conjuntos
const COLUMNAS_EMPLEADO = `e.id, e.numero_nomina, e.estatus, e.departamento_id,
  to_char(e.fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso, to_char(e.fecha_baja, 'YYYY-MM-DD') AS fecha_baja,
  (e.numero_nomina IS NOT NULL AND btrim(e.numero_nomina) <> '' AND EXISTS (
     SELECT 1 FROM empleados o
     WHERE o.id <> e.id AND o.numero_nomina = e.numero_nomina
       AND daterange(COALESCE(o.fecha_ingreso, '-infinity'::date), COALESCE(o.fecha_baja, 'infinity'::date), '[]')
        && daterange(COALESCE(e.fecha_ingreso, '-infinity'::date), COALESCE(e.fecha_baja, 'infinity'::date), '[]')
  )) AS nomina_duplicada`;

/** Empleados con vigencia en el rango. Una baja sin fecha no se analiza (se desconoce hasta cuándo trabajó). */
async function empleadosEnAlcance(c, desde, hasta, ids) {
  const r = await c.query(
    `SELECT ${COLUMNAS_EMPLEADO} FROM empleados e
     WHERE (e.fecha_ingreso IS NULL OR e.fecha_ingreso <= $2::date)
       AND (e.fecha_baja IS NULL OR e.fecha_baja >= $1::date)
       AND (e.estatus IS DISTINCT FROM 'baja' OR e.fecha_baja IS NOT NULL)
       AND ($3::int[] IS NULL OR e.id = ANY($3::int[]))
     ORDER BY e.id`,
    [desde, hasta, ids && ids.length ? ids : null],
  );
  return r.rows;
}

async function cargarTurnos(c) {
  const turnos = await c.query(
    `SELECT id, nombre, activo, tolerancia_retardo_min, umbral_falta_min, tolerancia_salida_min,
            ventana_entrada_antes_min, ventana_entrada_despues_min, ventana_salida_antes_min, ventana_salida_despues_min,
            to_char(descanso_inicio, 'HH24:MI') AS descanso_inicio, descanso_min
     FROM turnos`,
  );
  const dias = await c.query(
    `SELECT turno_id, dia_semana, laborable, to_char(hora_entrada, 'HH24:MI') AS hora_entrada,
            to_char(hora_salida, 'HH24:MI') AS hora_salida, cruza_medianoche
     FROM turno_dias`,
  );
  const mapa = new Map(turnos.rows.map((t) => [t.id, { ...t, dias: [] }]));
  for (const d of dias.rows) {
    const t = mapa.get(d.turno_id);
    if (t) t.dias.push(d);
  }
  return mapa;
}

async function cargarCalendario(c, desde, hasta) {
  const r = await c.query(
    `SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, tipo FROM calendario_laboral
     WHERE activo AND tipo IN ('oficial', 'otorgado') AND fecha BETWEEN $1::date AND $2::date
     ORDER BY fecha, (tipo = 'oficial') DESC, id`,
    [desde, hasta],
  );
  const mapa = new Map();
  for (const f of r.rows) if (!mapa.has(f.fecha)) mapa.set(f.fecha, { id: f.id, tipo: f.tipo });
  return mapa;
}

const agrupar = (filas, clave) => {
  const mapa = new Map();
  for (const f of filas) {
    const k = f[clave];
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(f);
  }
  return mapa;
};

async function cargarBloque(c, ids, deptos, desde, hasta) {
  const marcas = await c.query(
    `SELECT id, empleado_id, marca_ts FROM asistencia_marcas
     WHERE empleado_id = ANY($1::int[])
       AND marca_ts >= (($2::date - 1)::timestamp AT TIME ZONE '${ZONA}')
       AND marca_ts < (($3::date + 3)::timestamp AT TIME ZONE '${ZONA}')
     ORDER BY empleado_id, marca_ts, id`,
    [ids, desde, hasta],
  );
  const individuales = await c.query(
    `SELECT empleado_id, turno_id, to_char(vigente_desde, 'YYYY-MM-DD') AS desde, to_char(vigente_hasta, 'YYYY-MM-DD') AS hasta
     FROM turno_empleado WHERE empleado_id = ANY($1::int[])
       AND vigente_desde <= $3::date AND COALESCE(vigente_hasta, 'infinity'::date) >= $2::date`,
    [ids, desde, hasta],
  );
  const departamentales = deptos.length
    ? await c.query(
        `SELECT departamento_id, turno_id, to_char(vigente_desde, 'YYYY-MM-DD') AS desde, to_char(vigente_hasta, 'YYYY-MM-DD') AS hasta
         FROM turno_departamento WHERE departamento_id = ANY($1::int[])
           AND vigente_desde <= $3::date AND COALESCE(vigente_hasta, 'infinity'::date) >= $2::date`,
        [deptos, desde, hasta],
      )
    : { rows: [] };
  const vacaciones = await c.query(
    `SELECT id, empleado_id, to_char(fecha_inicial, 'YYYY-MM-DD') AS desde, to_char(fecha_final, 'YYYY-MM-DD') AS hasta
     FROM solicitudes_vacaciones
     WHERE estatus = 'aprobado' AND empleado_id = ANY($1::int[]) AND fecha_inicial <= $3::date AND fecha_final >= $2::date
     ORDER BY id`,
    [ids, desde, hasta],
  );
  const permisos = await c.query(
    `SELECT id, empleado_id, to_char(fecha_inicio, 'YYYY-MM-DD') AS desde, to_char(fecha_fin, 'YYYY-MM-DD') AS hasta
     FROM permisos_ausencia
     WHERE estatus = 'aprobado' AND empleado_id = ANY($1::int[]) AND fecha_inicio <= $3::date AND fecha_fin >= $2::date
     ORDER BY id`,
    [ids, desde, hasta],
  );
  const incidencias = await c.query(
    `SELECT DISTINCT ON (empleado_id, fecha) id, empleado_id, to_char(fecha, 'YYYY-MM-DD') AS fecha
     FROM asistencia_incidencias
     WHERE activa AND tipo = 'justificacion' AND empleado_id = ANY($1::int[]) AND fecha BETWEEN $2::date AND $3::date
     ORDER BY empleado_id, fecha, id DESC`,
    [ids, desde, hasta],
  );
  return {
    marcas: agrupar(marcas.rows, "empleado_id"),
    individuales: agrupar(individuales.rows, "empleado_id"),
    departamentales: agrupar(departamentales.rows, "departamento_id"),
    vacaciones: agrupar(vacaciones.rows, "empleado_id"),
    permisos: agrupar(permisos.rows, "empleado_id"),
    incidencias: new Map(incidencias.rows.map((i) => [`${i.empleado_id}|${i.fecha}`, i])),
  };
}

// ---------------------------------------------------------------- cálculo
const contiene = (a, fecha) => a.desde <= fecha && (!a.hasta || a.hasta >= fecha);

function resolverTurno(emp, fecha, datos, turnos) {
  const individual = (datos.individuales.get(emp.id) || []).find((a) => contiene(a, fecha));
  if (individual) return { origen: "empleado", turno: turnos.get(individual.turno_id) || null };
  if (emp.departamento_id != null) {
    const dep = (datos.departamentales.get(emp.departamento_id) || []).find((a) => contiene(a, fecha));
    if (dep) return { origen: "departamento", turno: turnos.get(dep.turno_id) || null };
  }
  return { origen: null, turno: null };
}

function marcasCercanas(marcasEmp, fecha) {
  // marcas del día anterior, del día y del siguiente (local); cada marca lleva su día local en caché
  const n = aNumeroDia(fecha);
  return marcasEmp.filter((m) => {
    const d = m._dia - n;
    return d >= -1 && d <= 1;
  });
}

function construirFila(emp, fecha, periodo, resultado, resolucion, ctx, version) {
  const snap = snapshotTurno(resolucion.turno, fecha, resolucion.origen, emp.departamento_id) || {};
  const est = resultado.estatus;
  return {
    empleado_id: emp.id,
    fecha,
    periodo_id: periodo.id,
    turno_id: snap.turno_id ?? null,
    estatus: est,
    primera_marca: resultado.primera_marca,
    ultima_marca: resultado.ultima_marca,
    minutos_retardo: resultado.minutos_retardo,
    minutos_salida_anticipada: resultado.minutos_salida_anticipada,
    solicitud_vacaciones_id: est === "vacaciones" && ctx.vacaciones ? ctx.vacaciones.id : null,
    permiso_id: est === "permiso" && ctx.permiso ? ctx.permiso.id : null,
    calendario_id: est === "festivo" && ctx.calendario ? ctx.calendario.id : null,
    incidencia_id: est === "justificada" && ctx.incidencia ? ctx.incidencia.id : null,
    version_calculo: version,
    departamento_id: snap.departamento_id ?? emp.departamento_id ?? null,
    origen_turno: snap.origen_turno ?? null,
    turno_nombre: snap.turno_nombre ?? null,
    entrada_programada: snap.entrada_programada ?? null,
    salida_programada: snap.salida_programada ?? null,
    cruza_medianoche: snap.cruza_medianoche ?? null,
    tolerancia_retardo_min: snap.tolerancia_retardo_min ?? null,
    tolerancia_salida_min: snap.tolerancia_salida_min ?? null,
    umbral_falta_min: snap.umbral_falta_min ?? null,
    ventana_entrada_antes_min: snap.ventana_entrada_antes_min ?? null,
    ventana_entrada_despues_min: snap.ventana_entrada_despues_min ?? null,
    ventana_salida_antes_min: snap.ventana_salida_antes_min ?? null,
    ventana_salida_despues_min: snap.ventana_salida_despues_min ?? null,
    descanso_inicio: snap.descanso_inicio ?? null,
    descanso_min: snap.descanso_min ?? null,
    marcas_usadas: resultado.marcas_usadas.map(String),
    detalle: { ...resultado.detalle, explicaciones: resultado.explicaciones, banderas: resultado.banderas },
  };
}

// Columnas del upsert: [nombre, tipo SQL en jsonb_to_recordset]
const COLUMNAS_UPSERT = [
  ["empleado_id", "int"], ["fecha", "date"], ["periodo_id", "int"], ["turno_id", "int"], ["estatus", "text"],
  ["primera_marca", "timestamptz"], ["ultima_marca", "timestamptz"], ["minutos_retardo", "int"],
  ["minutos_salida_anticipada", "int"], ["solicitud_vacaciones_id", "int"], ["permiso_id", "int"],
  ["calendario_id", "int"], ["incidencia_id", "int"], ["version_calculo", "smallint"], ["departamento_id", "int"],
  ["origen_turno", "text"], ["turno_nombre", "text"], ["entrada_programada", "time"], ["salida_programada", "time"],
  ["cruza_medianoche", "boolean"], ["tolerancia_retardo_min", "int"], ["tolerancia_salida_min", "int"],
  ["umbral_falta_min", "int"], ["ventana_entrada_antes_min", "int"], ["ventana_entrada_despues_min", "int"],
  ["ventana_salida_antes_min", "int"], ["ventana_salida_despues_min", "int"], ["descanso_inicio", "time"],
  ["descanso_min", "int"], ["marcas_usadas", "jsonb"], ["detalle", "jsonb"],
];
const COLUMNAS_COMPARADAS = COLUMNAS_UPSERT.map(([n]) => n).filter((n) => n !== "empleado_id" && n !== "fecha");
const valorColumna = (n) => (n === "marcas_usadas" ? "ARRAY(SELECT jsonb_array_elements_text(r.marcas_usadas)::bigint)" : `r.${n}`);
const SQL_UPSERT = `
  INSERT INTO asistencia_diaria (${COLUMNAS_UPSERT.map(([n]) => n).join(", ")}, calculado_en)
  SELECT ${COLUMNAS_UPSERT.map(([n]) => valorColumna(n)).join(", ")}, NOW()
  FROM jsonb_to_recordset($1::jsonb) AS r(${COLUMNAS_UPSERT.map(([n, t]) => `${n} ${t}`).join(", ")})
  ON CONFLICT (empleado_id, fecha) DO UPDATE SET
    ${COLUMNAS_COMPARADAS.map((n) => `${n} = EXCLUDED.${n}`).join(", ")}, calculado_en = NOW()
  WHERE (${COLUMNAS_COMPARADAS.map((n) => `asistencia_diaria.${n}`).join(", ")})
        IS DISTINCT FROM (${COLUMNAS_COMPARADAS.map((n) => `EXCLUDED.${n}`).join(", ")})
  RETURNING (xmax = 0) AS insertada`;

/** SET LOCAL statement_timeout en las transacciones de una corrida con tope duro (ver candado.js) */
async function fijarTimeoutLocal(c) {
  if (Number.isInteger(c.timeoutMs) && c.timeoutMs > 0) await c.query(`SET LOCAL statement_timeout = ${c.timeoutMs}`);
}

/** Escribe un bloque en UNA transacción corta, re-verificando que los periodos sigan abiertos. */
async function escribirBloque(c, filas, borrar) {
  if (filas.length === 0 && borrar.length === 0) return { modificadas: 0, omitidasCerradas: 0 };
  const idsPeriodo = [...new Set([...filas, ...borrar].map((f) => f.periodo_id))];
  await c.query("BEGIN");
  try {
    await fijarTimeoutLocal(c);
    const periodos = await c.query(
      "SELECT id, estado FROM asistencia_periodos WHERE id = ANY($1::int[]) ORDER BY id FOR SHARE",
      [idsPeriodo],
    );
    const cerrados = new Set(periodos.rows.filter((p) => p.estado !== "abierto").map((p) => p.id));
    const aEscribir = filas.filter((f) => !cerrados.has(f.periodo_id));
    const aBorrar = borrar.filter((f) => !cerrados.has(f.periodo_id));
    let modificadas = 0;
    if (aEscribir.length > 0) {
      const r = await c.query(SQL_UPSERT, [JSON.stringify(aEscribir)]);
      modificadas += r.rowCount;
    }
    if (aBorrar.length > 0) {
      const r = await c.query(
        `DELETE FROM asistencia_diaria d USING unnest($1::int[], $2::date[]) AS t(e, f)
         WHERE d.empleado_id = t.e AND d.fecha = t.f`,
        [aBorrar.map((b) => b.empleado_id), aBorrar.map((b) => b.fecha)],
      );
      modificadas += r.rowCount;
    }
    await c.query("COMMIT");
    return { modificadas, omitidasCerradas: filas.length + borrar.length - aEscribir.length - aBorrar.length };
  } catch (error) {
    await c.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

/**
 * Califica y guarda los pares empleado-fecha de `objetivos` (Map<empleadoId, string[] fechas>).
 * Devuelve estadísticas; si se vence `limite` (ms epoch) se detiene entre bloques con parcial=true.
 */
async function calcular(c, { objetivos, parametros, ahora, limite, tamanoBloque = TAMANO_BLOQUE, turnos, calendario, periodosPorFecha }) {
  const stats = { empleados: 0, dias_evaluados: 0, dias_modificados: 0, dias_omitidos_cerrados: 0, parcial: false };
  const ids = [...objetivos.keys()].sort((a, b) => a - b);
  const instante = ahora();
  for (let i = 0; i < ids.length; i += tamanoBloque) {
    if (limite && Date.now() > limite) {
      stats.parcial = true;
      break;
    }
    const bloque = ids.slice(i, i + tamanoBloque);
    const fechas = bloque.flatMap((id) => objetivos.get(id));
    if (fechas.length === 0) continue;
    const desde = fechas.reduce(MIN);
    const hasta = fechas.reduce(MAX);
    const emps = await empleadosEnAlcance(c, "1900-01-01", "2200-01-01", bloque);
    const deptos = [...new Set(emps.map((e) => e.departamento_id).filter((d) => d != null))];
    const datos = await cargarBloque(c, bloque, deptos, desde, hasta);
    const filas = [];
    const borrar = [];
    for (const emp of emps) {
      const marcasEmp = (datos.marcas.get(emp.id) || []).map((m) => ({ id: m.id, ts: m.marca_ts, _dia: aLocal(m.marca_ts).dia }));
      const vacs = datos.vacaciones.get(emp.id) || [];
      const perms = datos.permisos.get(emp.id) || [];
      for (const fecha of objetivos.get(emp.id)) {
        const periodo = periodosPorFecha(fecha);
        if (!periodo || periodo.estado !== "abierto") {
          stats.dias_omitidos_cerrados++;
          continue;
        }
        const resolucion = resolverTurno(emp, fecha, datos, turnos);
        const ctx = {
          fecha,
          ahora: instante,
          parametros,
          empleado: emp,
          turno: resolucion.turno,
          calendario: calendario.get(fecha) || null,
          vacaciones: vacs.find((v) => contiene(v, fecha)) || null,
          permiso: perms.find((p) => contiene(p, fecha)) || null,
          incidencia: datos.incidencias.get(`${emp.id}|${fecha}`) || null,
          marcas: marcasCercanas(marcasEmp, fecha),
        };
        const resultado = evaluarDia(ctx);
        stats.dias_evaluados++;
        if (resultado.estatus === "no_aplica" || resultado.estatus === "sin_identificador") {
          borrar.push({ empleado_id: emp.id, fecha, periodo_id: periodo.id });
        } else {
          filas.push(construirFila(emp, fecha, periodo, resultado, resolucion, ctx, parametros.version_motor));
        }
      }
    }
    stats.empleados += emps.length;
    const escrito = await escribirBloque(c, filas, borrar);
    stats.dias_modificados += escrito.modificadas;
    stats.dias_omitidos_cerrados += escrito.omitidasCerradas;
  }
  return stats;
}

/** Prepara periodos, turnos y calendario para un rango y llama a calcular() */
async function calcularRango(c, { objetivos, desde, hasta, parametros, ahora, limite, tamanoBloque }) {
  const periodos = await asegurarPeriodos(c, desde, hasta);
  const turnos = await cargarTurnos(c);
  const calendario = await cargarCalendario(c, desde, hasta);
  const periodosPorFecha = (fecha) => periodos.find((p) => p.fecha_inicio <= fecha && p.fecha_fin >= fecha) || null;
  return calcular(c, { objetivos, parametros, ahora, limite, tamanoBloque, turnos, calendario, periodosPorFecha });
}

// ---------------------------------------------------------------- bitácora
/** Con el candado en la mano nadie más corre: lo que siga 'en_curso' quedó huérfano (proceso apagado a medias). */
async function marcarInterrumpidas(c) {
  await c.query(
    `UPDATE asistencia_ejecuciones SET estado = 'error', fin = NOW(), error = 'interrumpida' WHERE estado = 'en_curso'`,
  );
}

async function abrirEjecucion(c, { tipo, origen, desde, hasta, usuarioId }) {
  const r = await c.query(
    `INSERT INTO asistencia_ejecuciones (tipo, origen, estado, desde, hasta, usuario_id)
     VALUES ($1, $2, 'en_curso', $3, $4, $5) RETURNING id, inicio`,
    [tipo, origen, desde || null, hasta || null, usuarioId || null],
  );
  return r.rows[0];
}

async function cerrarEjecucion(c, id, { estado, stats = {}, error = null, detalle = {} }) {
  await c.query(
    `UPDATE asistencia_ejecuciones SET estado = $2, fin = NOW(), empleados_evaluados = $3, dias_evaluados = $4,
       dias_modificados = $5, marcas_vinculadas = $6, periodos_cerrados = $7, ajustes_nuevos = $8, error = $9, detalle = $10::jsonb
     WHERE id = $1`,
    [
      id, estado, stats.empleados || 0, stats.dias_evaluados || 0, stats.dias_modificados || 0,
      stats.marcas_vinculadas || 0, stats.periodos_cerrados || 0, stats.ajustes_nuevos || 0, error,
      JSON.stringify(detalle),
    ],
  );
}

/** Corre fn dentro de una ejecución registrada; ante un error deja la bitácora con un motivo SIN datos personales. */
async function conBitacora(c, datos, fn) {
  const ej = await abrirEjecucion(c, datos);
  if (datos.control) datos.control.ejecucionId = ej.id;
  try {
    const { estado = "ok", stats = {}, detalle = {}, valor } = await fn(ej);
    await cerrarEjecucion(c, ej.id, { estado, stats, detalle });
    return { ejecucion_id: ej.id, estado, ...valor };
  } catch (error) {
    if (!(datos.control && datos.control.abortado)) {
      await cerrarEjecucion(c, ej.id, { estado: "error", error: motivoSeguro(error) }).catch(() => {});
    }
    throw error;
  }
}

// ---------------------------------------------------------------- ajustes pendientes
/**
 * Marcas que llegaron (fecha_importacion posterior al cierre) o se vincularon (ids) cuando su periodo ya estaba cerrado.
 * Idempotente: una fila por marca (UNIQUE marca_id).
 */
async function detectarAjustes(c, { analisisDesde, idsVinculadas = [] }) {
  const nuevas = await c.query(
    `INSERT INTO asistencia_ajustes_pendientes (empleado_id, fecha, periodo_id, marca_id, motivo)
     SELECT m.empleado_id, f.fecha, p.id, m.id, 'marca_posterior_cierre'
     FROM asistencia_periodos p
     JOIN asistencia_marcas m ON m.empleado_id IS NOT NULL
       AND m.marca_ts >= (p.fecha_inicio::timestamp AT TIME ZONE '${ZONA}')
       AND m.marca_ts < ((p.fecha_fin + 1)::timestamp AT TIME ZONE '${ZONA}')
       AND m.fecha_importacion > p.cerrado_en
     CROSS JOIN LATERAL (SELECT (m.marca_ts AT TIME ZONE '${ZONA}')::date AS fecha) f
     WHERE p.estado = 'cerrado' AND f.fecha >= $1::date
     ON CONFLICT (marca_id) DO NOTHING`,
    [analisisDesde],
  );
  let vinculadas = { rowCount: 0 };
  if (idsVinculadas.length > 0) {
    vinculadas = await c.query(
      `INSERT INTO asistencia_ajustes_pendientes (empleado_id, fecha, periodo_id, marca_id, motivo)
       SELECT m.empleado_id, f.fecha, p.id, m.id, 'marca_vinculada_posterior_cierre'
       FROM asistencia_marcas m
       CROSS JOIN LATERAL (SELECT (m.marca_ts AT TIME ZONE '${ZONA}')::date AS fecha) f
       JOIN asistencia_periodos p ON p.estado = 'cerrado' AND f.fecha BETWEEN p.fecha_inicio AND p.fecha_fin
       WHERE m.id = ANY($2::bigint[]) AND m.empleado_id IS NOT NULL AND f.fecha >= $1::date
       ON CONFLICT (marca_id) DO NOTHING`,
      [analisisDesde, idsVinculadas.map(String)],
    );
  }
  return nuevas.rowCount + vinculadas.rowCount;
}

// ---------------------------------------------------------------- objetivos
function agregar(mapa, empleadoId, fecha) {
  let conjunto = mapa.get(empleadoId);
  if (!conjunto) mapa.set(empleadoId, (conjunto = new Set()));
  conjunto.add(fecha);
}

const comoObjetivos = (mapa) => new Map([...mapa].map(([id, set]) => [id, [...set].sort()]));

function objetivosRango(empleados, desde, hasta) {
  const fechas = [];
  for (let n = aNumeroDia(desde); n <= aNumeroDia(hasta); n++) fechas.push(deNumeroDia(n));
  return new Map(empleados.map((e) => [e.id, fechas]));
}

/** Cambios desde `cursor` que obligan a recalcular: marcas nuevas, vinculadas, calendario, vacaciones, permisos, etc. */
async function objetivosIncrementales(c, { cursor, parametros, hoyTexto, empleados, vinculadas }) {
  const mapa = new Map();
  const ids = new Set(empleados.map((e) => e.id));
  const desdeAnalisis = parametros.analisis_desde;
  const agregarSiAplica = (empleadoId, fecha) => {
    if (ids.has(empleadoId) && fecha >= desdeAnalisis && fecha <= hoyTexto) agregar(mapa, empleadoId, fecha);
  };
  const agregarTodos = (fecha) => {
    for (const id of ids) agregarSiAplica(id, fecha);
  };
  const agregarRango = (empleadoId, desde, hasta) => {
    const ini = MAX(desde, desdeAnalisis);
    const fin = MIN(hasta, hoyTexto);
    for (let n = aNumeroDia(ini); n <= aNumeroDia(fin); n++) agregarSiAplica(empleadoId, deNumeroDia(n));
  };

  // 1) Ventana de seguridad: los últimos N días de todos
  if (parametros.ventana_seguridad_dias > 0) {
    for (let k = 0; k < parametros.ventana_seguridad_dias; k++) agregarTodos(sumarDias(hoyTexto, -k));
  }
  // 2) Marcas importadas desde el cursor (y el día anterior: turnos que cruzan medianoche)
  const marcas = await c.query(
    `SELECT DISTINCT m.empleado_id, to_char(d.fecha, 'YYYY-MM-DD') AS fecha
     FROM asistencia_marcas m
     CROSS JOIN LATERAL (VALUES ((m.marca_ts AT TIME ZONE '${ZONA}')::date), ((m.marca_ts AT TIME ZONE '${ZONA}')::date - 1)) AS d(fecha)
     WHERE m.empleado_id IS NOT NULL AND m.fecha_importacion > $1::timestamptz`,
    [cursor],
  );
  for (const f of marcas.rows) agregarSiAplica(f.empleado_id, f.fecha);
  // 3) Marcas re-vinculadas en esta corrida
  for (const v of vinculadas) {
    const dia = aLocal(v.marca_ts).fecha;
    agregarSiAplica(v.empleado_id, dia);
    agregarSiAplica(v.empleado_id, sumarDias(dia, -1));
  }
  // 4) Calendario laboral modificado: ese día para todos
  const cal = await c.query(
    `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM calendario_laboral
     WHERE fecha_actualizacion > $1::timestamptz OR fecha_creacion > $1::timestamptz`,
    [cursor],
  );
  for (const f of cal.rows) agregarTodos(f.fecha);
  // 5) Vacaciones y permisos respondidos o creados
  const vac = await c.query(
    `SELECT empleado_id, to_char(fecha_inicial, 'YYYY-MM-DD') AS desde, to_char(fecha_final, 'YYYY-MM-DD') AS hasta
     FROM solicitudes_vacaciones WHERE empleado_id IS NOT NULL AND (fecha_autoriza > $1::timestamptz OR fecha_creacion > $1::timestamptz)`,
    [cursor],
  );
  for (const f of vac.rows) agregarRango(f.empleado_id, f.desde, f.hasta);
  const per = await c.query(
    `SELECT empleado_id, to_char(fecha_inicio, 'YYYY-MM-DD') AS desde, to_char(fecha_fin, 'YYYY-MM-DD') AS hasta
     FROM permisos_ausencia WHERE empleado_id IS NOT NULL AND (fecha_respuesta > $1::timestamptz OR fecha_solicitud > $1::timestamptz)`,
    [cursor],
  );
  for (const f of per.rows) agregarRango(f.empleado_id, f.desde, f.hasta);
  // 6) Incidencias de RH
  const inc = await c.query(
    `SELECT empleado_id, to_char(fecha, 'YYYY-MM-DD') AS fecha FROM asistencia_incidencias
     WHERE fecha_actualizacion > $1::timestamptz OR fecha_creacion > $1::timestamptz`,
    [cursor],
  );
  for (const f of inc.rows) agregarSiAplica(f.empleado_id, f.fecha);
  // 7) Altas/cambios de empleados: todo su rango reciente de análisis (ingreso, baja, nómina, departamento)
  const emp = await c.query(
    "SELECT id FROM empleados WHERE fecha_actualizacion > $1::timestamptz OR fecha_creacion > $1::timestamptz",
    [cursor],
  );
  for (const f of emp.rows) agregarRango(f.id, desdeAnalisis, hoyTexto);
  // 8) Asignaciones de turno nuevas
  const ti = await c.query(
    `SELECT empleado_id, to_char(vigente_desde, 'YYYY-MM-DD') AS desde, to_char(vigente_hasta, 'YYYY-MM-DD') AS hasta
     FROM turno_empleado WHERE fecha_creacion > $1::timestamptz`,
    [cursor],
  );
  for (const f of ti.rows) agregarRango(f.empleado_id, f.desde, f.hasta || hoyTexto);
  const td = await c.query(
    `SELECT e.id AS empleado_id, to_char(a.vigente_desde, 'YYYY-MM-DD') AS desde, to_char(a.vigente_hasta, 'YYYY-MM-DD') AS hasta
     FROM turno_departamento a JOIN empleados e ON e.departamento_id = a.departamento_id
     WHERE a.fecha_creacion > $1::timestamptz`,
    [cursor],
  );
  for (const f of td.rows) agregarRango(f.empleado_id, f.desde, f.hasta || hoyTexto);
  return comoObjetivos(mapa);
}

/** ¿Se editó un turno desde el cursor? Cambia horarios y tolerancias de todos sus empleados: barrido completo. */
async function turnosEditados(c, cursor) {
  const r = await c.query("SELECT 1 FROM turnos WHERE fecha_actualizacion > $1::timestamptz LIMIT 1", [cursor]);
  return r.rows.length > 0;
}

// ---------------------------------------------------------------- vinculación periódica
async function revincularMarcas(c) {
  let total = 0;
  const afectadas = [];
  for (let i = 0; i < MAX_VUELTAS_VINCULACION; i++) {
    const r = await Ingesta.vincularHuerfanas({ limite: LIMITE_VINCULACION }, c);
    total += r.vinculadas;
    afectadas.push(...(r.afectadas || []));
    if (r.vinculadas < LIMITE_VINCULACION) break;
  }
  return { total, afectadas };
}

// ---------------------------------------------------------------- cierre y reapertura
async function recalcularPeriodo(c, periodo, ctx) {
  const hoyTexto = hoy(ctx.ahora);
  const hasta = MIN(periodo.fecha_fin, hoyTexto);
  const desde = MAX(periodo.fecha_inicio, ctx.parametros.analisis_desde);
  if (hasta < desde) return { empleados: 0, dias_evaluados: 0, dias_modificados: 0, dias_omitidos_cerrados: 0, parcial: false };
  const empleados = await empleadosEnAlcance(c, desde, hasta);
  return calcularRango(c, {
    objetivos: objetivosRango(empleados, desde, hasta), desde, hasta, parametros: ctx.parametros, ahora: ctx.ahora,
    limite: ctx.limite, tamanoBloque: ctx.tamanoBloque,
  });
}

async function marcarCerrado(c, id, { tipo, usuarioId }) {
  await c.query("BEGIN");
  try {
    await fijarTimeoutLocal(c);
    const r = await c.query(
      `UPDATE asistencia_periodos SET estado = 'cerrado', cerrado_en = NOW(), cerrado_por = $2, tipo_cierre = $3
       WHERE id = $1 AND estado = 'abierto'
       RETURNING id, to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin, estado, cerrado_en, tipo_cierre`,
      [id, usuarioId || null, tipo],
    );
    await c.query("COMMIT");
    return r.rows[0] || null;
  } catch (error) {
    await c.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function cerrarVencidos(c, ctx) {
  const hoyTexto = hoy(ctx.ahora);
  const r = await c.query(
    `SELECT id, to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin
     FROM asistencia_periodos
     WHERE estado = 'abierto' AND NOT no_cerrar_automatico
       AND fecha_fin >= $1::date AND (fecha_fin + $2::int) <= $3::date
     ORDER BY fecha_inicio`,
    [ctx.parametros.cierre_automatico_desde, ctx.parametros.dias_cierre, hoyTexto],
  );
  let cerrados = 0;
  const stats = { empleados: 0, dias_evaluados: 0, dias_modificados: 0 };
  for (const p of r.rows) {
    if (ctx.limite && Date.now() > ctx.limite) return { cerrados, stats, parcial: true };
    const s = await recalcularPeriodo(c, p, ctx); // última pasada antes de congelarlo
    stats.empleados += s.empleados;
    stats.dias_evaluados += s.dias_evaluados;
    stats.dias_modificados += s.dias_modificados;
    if (s.parcial) return { cerrados, stats, parcial: true };
    if (await marcarCerrado(c, p.id, { tipo: "auto", usuarioId: null })) cerrados++;
  }
  return { cerrados, stats, parcial: false };
}

// ---------------------------------------------------------------- API de la orquestación
const opcionesBase = (o = {}) => ({
  ahora: o.ahora || (() => new Date()),
  tamanoBloque: o.tamanoBloque || TAMANO_BLOQUE,
  limite: o.tiempoMaxMs ? Date.now() + o.tiempoMaxMs : null,
});

/**
 * Corrida periódica (planificador): vincula huérfanas, recalcula lo afectado (o todo si toca el barrido) y cierra los
 * periodos vencidos. Devuelve { omitida: true } si otro proceso tiene el candado.
 */
async function ejecutarCiclo(opciones = {}) {
  const base = opcionesBase({ tiempoMaxMs: TIEMPO_MAXIMO_MS, ...opciones });
  const origen = opciones.origen || "planificador";
  const control = opciones.control || null;
  const salida = await conCandadoDelMotor(
    async (c) => {
      await marcarInterrumpidas(c);
      const parametros = await leerParametros(c);
      const hoyTexto = hoy(base.ahora);
      const previa = await c.query(
        `SELECT inicio, tipo FROM asistencia_ejecuciones WHERE estado = 'ok' AND tipo IN ('incremental', 'completa')
         ORDER BY inicio DESC LIMIT 1`,
      );
      const ultimaCompleta = await c.query(
        `SELECT inicio FROM asistencia_ejecuciones WHERE estado = 'ok' AND tipo = 'completa' ORDER BY inicio DESC LIMIT 1`,
      );
      const cursor = previa.rows[0] ? new Date(new Date(previa.rows[0].inicio).getTime() - SOLAPE_CURSOR_MS) : null;
      const vencido = !ultimaCompleta.rows[0] ||
        base.ahora().getTime() - new Date(ultimaCompleta.rows[0].inicio).getTime() >= parametros.barrido_completo_horas * 3600 * 1000;
      const completa = !cursor || vencido || (await turnosEditados(c, cursor));
      const tipo = completa ? "completa" : "incremental";

      return conBitacora(c, { tipo, origen, desde: parametros.analisis_desde, hasta: hoyTexto, control }, async () => {
        const vinculacion = await revincularMarcas(c);
        const ajustes = await detectarAjustes(c, {
          analisisDesde: parametros.analisis_desde,
          idsVinculadas: vinculacion.afectadas.map((v) => v.id),
        });
        // Rango de la barrida completa: del periodo abierto más antiguo a hoy
        const abiertos = await c.query(
          `SELECT to_char(MIN(fecha_inicio), 'YYYY-MM-DD') AS primero FROM asistencia_periodos WHERE estado = 'abierto'`,
        );
        const ultimo = await c.query(`SELECT to_char(MAX(fecha_fin), 'YYYY-MM-DD') AS ultimo FROM asistencia_periodos`);
        let desde = parametros.analisis_desde;
        if (abiertos.rows[0].primero) desde = MAX(desde, abiertos.rows[0].primero);
        else if (ultimo.rows[0].ultimo) desde = MAX(desde, sumarDias(ultimo.rows[0].ultimo, 1));
        const hasta = hoyTexto;
        let stats = { empleados: 0, dias_evaluados: 0, dias_modificados: 0, parcial: false };
        if (desde <= hasta) {
          const empleados = await empleadosEnAlcance(c, MIN(desde, parametros.analisis_desde), hasta);
          const objetivos = completa
            ? objetivosRango(empleados, desde, hasta)
            : await objetivosIncrementales(c, { cursor, parametros, hoyTexto, empleados, vinculadas: vinculacion.afectadas });
          if (objetivos.size > 0) {
            const fechas = [...objetivos.values()].flat();
            stats = await calcularRango(c, {
              objetivos, desde: fechas.reduce(MIN), hasta: fechas.reduce(MAX), parametros, ahora: base.ahora,
              limite: base.limite, tamanoBloque: base.tamanoBloque,
            });
          }
        }
        let cierre = { cerrados: 0, stats: {}, parcial: false };
        if (!stats.parcial) cierre = await cerrarVencidos(c, { parametros, ahora: base.ahora, limite: base.limite, tamanoBloque: base.tamanoBloque });
        const parcial = stats.parcial || cierre.parcial;
        return {
          estado: parcial ? "parcial" : "ok",
          stats: {
            ...stats,
            dias_modificados: stats.dias_modificados + (cierre.stats.dias_modificados || 0),
            marcas_vinculadas: vinculacion.total,
            periodos_cerrados: cierre.cerrados,
            ajustes_nuevos: ajustes,
          },
          detalle: { completa, dias_omitidos_cerrados: stats.dias_omitidos_cerrados || 0 },
          valor: {
            tipo,
            marcas_vinculadas: vinculacion.total,
            dias_evaluados: stats.dias_evaluados,
            dias_modificados: stats.dias_modificados,
            periodos_cerrados: cierre.cerrados,
            ajustes_nuevos: ajustes,
          },
        };
      });
    },
    { esperaMs: opciones.esperaMs || 0, control, statementTimeoutMs: opciones.timeoutMs || null },
  );
  if (salida.ocupado) return { omitida: true, motivo: "candado" };
  return { omitida: false, ...salida.valor };
}

/**
 * Recalcula un rango (manual, desde la API). Solo periodos abiertos; los cerrados se cuentan en
 * dias_omitidos_cerrados. { ocupado: true } si el candado no se obtuvo en esperaMs.
 */
async function recalcular({ desde, hasta, empleadoIds, usuarioId, origen = "api", esperaMs = 0, tiempo, ...resto }) {
  const base = opcionesBase(resto);
  const salida = await conCandadoDelMotor(
    async (c) => {
      await marcarInterrumpidas(c);
      return conBitacora(c, { tipo: "manual", origen, desde, hasta, usuarioId }, async () => {
        const parametros = await leerParametros(c);
        const hoyTexto = hoy(base.ahora);
        const ini = MAX(desde, parametros.analisis_desde);
        const fin = MIN(hasta, hoyTexto);
        if (fin < ini) {
          return { estado: "ok", stats: {}, valor: { desde: ini, hasta: fin, empleados: 0, dias_evaluados: 0, dias_modificados: 0, dias_omitidos_cerrados: 0 } };
        }
        const empleados = await empleadosEnAlcance(c, ini, fin, empleadoIds);
        const stats = await calcularRango(c, {
          objetivos: objetivosRango(empleados, ini, fin), desde: ini, hasta: fin, parametros, ahora: base.ahora,
          limite: base.limite, tamanoBloque: base.tamanoBloque,
        });
        return {
          estado: stats.parcial ? "parcial" : "ok",
          stats,
          valor: { desde: ini, hasta: fin, empleados: stats.empleados, dias_evaluados: stats.dias_evaluados, dias_modificados: stats.dias_modificados, dias_omitidos_cerrados: stats.dias_omitidos_cerrados },
        };
      });
    },
    { esperaMs, tiempo },
  );
  if (salida.ocupado) return { ocupado: true };
  return { ocupado: false, ...salida.valor };
}

async function periodoPorId(c, id) {
  const r = await c.query(
    `SELECT id, to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin, estado,
            cerrado_en, tipo_cierre, no_cerrar_automatico, veces_reabierto
     FROM asistencia_periodos WHERE id = $1`,
    [id],
  );
  return r.rows[0] || null;
}

async function contarPendientes(c, periodoId) {
  const r = await c.query("SELECT COUNT(*)::int AS n FROM asistencia_diaria WHERE periodo_id = $1 AND estatus = 'pendiente'", [periodoId]);
  return r.rows[0].n;
}

/** Cierre manual: recalcula una última vez el periodo y lo congela. Devuelve { codigo } ante una condición de negocio. */
async function cerrarPeriodo({ id, usuarioId, esperaMs = 0, tiempo, ...resto }) {
  const base = opcionesBase(resto);
  const salida = await conCandadoDelMotor(
    async (c) => {
      const periodo = await periodoPorId(c, id);
      if (!periodo) return { codigo: "no_existe" };
      if (periodo.estado === "cerrado") return { codigo: "ya_cerrado" };
      if (periodo.fecha_fin >= hoy(base.ahora)) return { codigo: "no_terminado", periodo };
      // Un día 'pendiente' no se congela (decisión del orquestador): sin excepción ni 'forzar'
      const pendientes = await contarPendientes(c, id);
      if (pendientes > 0) return { codigo: "con_pendientes", pendientes, periodo };
      const parametros = await leerParametros(c);
      const resultado = await conBitacora(
        c, { tipo: "cierre", origen: "api", desde: periodo.fecha_inicio, hasta: periodo.fecha_fin, usuarioId },
        async () => {
          const stats = await recalcularPeriodo(c, periodo, { parametros, ahora: base.ahora, limite: null, tamanoBloque: base.tamanoBloque });
          // la última pasada pudo dejar días sin calificar: tampoco se cierra
          const tras = await contarPendientes(c, id);
          if (tras > 0) return { stats, valor: { codigo: "con_pendientes", pendientes: tras, periodo } };
          const cerrado = await marcarCerrado(c, id, { tipo: "manual", usuarioId });
          return { stats: { ...stats, periodos_cerrados: cerrado ? 1 : 0 }, valor: { periodo: cerrado, dias_evaluados: stats.dias_evaluados } };
        },
      );
      return { codigo: "ok", periodo_previo: periodo, ...resultado };
    },
    { esperaMs, tiempo },
  );
  if (salida.ocupado) return { codigo: "ocupado" };
  return salida.valor;
}

/** Reapertura: solo la usa RH (rh_admin / super_admin). Deja el periodo abierto, sin cierre automático, y lo recalcula. */
async function reabrirPeriodo({ id, usuarioId, motivo, esperaMs = 0, tiempo, ...resto }) {
  const base = opcionesBase(resto);
  const salida = await conCandadoDelMotor(
    async (c) => {
      const periodo = await periodoPorId(c, id);
      if (!periodo) return { codigo: "no_existe" };
      if (periodo.estado !== "cerrado") return { codigo: "no_cerrado" };
      const parametros = await leerParametros(c);
      return conBitacora(
        c, { tipo: "reapertura", origen: "api", desde: periodo.fecha_inicio, hasta: periodo.fecha_fin, usuarioId },
        async () => {
          await c.query("BEGIN");
          let reabierto;
          try {
            await fijarTimeoutLocal(c);
            const r = await c.query(
              `UPDATE asistencia_periodos SET estado = 'abierto', reabierto_en = NOW(), reabierto_por = $2, reabierto_motivo = $3,
                 veces_reabierto = veces_reabierto + 1, no_cerrar_automatico = true
               WHERE id = $1 AND estado = 'cerrado'
               RETURNING id, to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin, estado, reabierto_en`,
              [id, usuarioId || null, motivo],
            );
            await c.query("COMMIT");
            reabierto = r.rows[0];
          } catch (error) {
            await c.query("ROLLBACK").catch(() => {});
            throw error;
          }
          const stats = await recalcularPeriodo(c, { ...periodo, ...reabierto }, { parametros, ahora: base.ahora, limite: null, tamanoBloque: base.tamanoBloque });
          return { stats, valor: { codigo: "ok", periodo_previo: periodo, periodo: reabierto, dias_evaluados: stats.dias_evaluados } };
        },
      ).then((r) => ({ ...r, codigo: "ok" }));
    },
    { esperaMs, tiempo },
  );
  if (salida.ocupado) return { codigo: "ocupado" };
  return salida.valor;
}

/** Recalcula un día de un empleado sin esperar (usado tras una incidencia). false si el motor está ocupado. */
async function recalcularDia({ empleadoId, fecha, ...resto }) {
  const r = await recalcular({ desde: fecha, hasta: fecha, empleadoIds: [empleadoId], esperaMs: 0, origen: "api", ...resto });
  return !r.ocupado;
}

/**
 * Tope duro de una vuelta: destruye su conexión (liberando el candado de sesión) y deja constancia en la bitácora,
 * sin datos personales. Si la vuelta aún no había abierto su ejecución, registra una ya en error.
 */
async function abortarVuelta(control) {
  await abortarCorrida(control);
  try {
    if (control && control.ejecucionId) {
      await grupo.query(
        `UPDATE asistencia_ejecuciones SET estado = 'error', fin = NOW(), error = 'tiempo_excedido' WHERE id = $1 AND estado = 'en_curso'`,
        [control.ejecucionId],
      );
    } else {
      await grupo.query(
        `INSERT INTO asistencia_ejecuciones (tipo, origen, estado, fin, error) VALUES ('incremental', 'planificador', 'error', NOW(), 'tiempo_excedido')`,
      );
    }
  } catch (error) {
    console.error(`[Asistencia] no se pudo registrar el tiempo excedido (${motivoSeguro(error)})`);
  }
}

module.exports = {
  abortarVuelta,
  leerParametros, listarParametros, guardarParametros, asegurarPeriodos,
  ejecutarCiclo, recalcular, recalcularDia, cerrarPeriodo, reabrirPeriodo,
  // internos expuestos para pruebas
  calcular, calcularRango, empleadosEnAlcance, detectarAjustes, objetivosRango, objetivosIncrementales, quincenaDe,
  SQL_UPSERT, TAMANO_BLOQUE, TIEMPO_MAXIMO_MS,
};
