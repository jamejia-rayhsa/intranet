// Motor de análisis de asistencia (Fase 4): función PURA (sin BD, sin reloj propio) que califica UN día de UN empleado.
//
// Reglas (decisiones del humano y del orquestador, ver docs/asistencia/motor-analisis.md):
//  - Precedencia: no_aplica > sin_identificador > sin_turno > descanso > festivo > vacaciones > permiso > marcas.
//  - El día pertenece a la fecha local (America/Mexico_City) de la ENTRADA programada; las marcas se miden en minutos
//    respecto de la medianoche local de esa fecha (un turno nocturno llega a > 1440).
//  - Minutos enteros: los segundos de cada marca se truncan (la entrada 08:10:59 es 10 min tarde; 08:11:00, 11).
//  - Entrada = primera marca del día local (desde las 00:00, sin límite inferior: llegar temprano nunca penaliza) hasta
//    entrada + ventana_entrada_despues. En un turno que cruza la medianoche el límite inferior sigue siendo
//    entrada - ventana_entrada_antes (las marcas de la mañana son la salida del turno del día anterior).
//  - VENTANA DE COMIDA global (parametros.comida_desde..comida_hasta, 13:00-16:00, inclusive en ambos extremos a nivel de
//    minuto; la duración esperada es descanso_min del turno): las marcas dentro de ella son de comida, nunca entrada ni
//    salida. La entrada es la primera marca del día salvo que esa primera marca caiga en la comida o después
//    (llegada tardía = falta). La salida es la última marca POSTERIOR a comida_hasta: antes de salida - tolerancia es
//    salida_anticipada con sus minutos (17:30 = 30). Si la última marca del día está dentro de la comida y no hay una
//    posterior, el día es incompleta con la bandera ultima_marca_en_comida (RH decide). Con >= 2 marcas de comida se
//    guarda detalle.minutos_comida (última - primera) y la bandera exceso_comida si pasa de descanso_min (solo
//    informativa). Un turno que cruza la medianoche no usa la ventana de comida: su corte es entrada + ventana.
//  - Marcas a <= 60 s de la anterior conservada = duplicado de la misma marca.
//  - retardo: tarde > tolerancia_retardo y <= umbral_falta. falta: sin entrada o tarde > umbral_falta.
//    salida_anticipada: salida más de tolerancia_salida antes. incompleta: entrada sin salida. Retardo + salida
//    anticipada = retardo con ambos minutos. El descanso se descuenta y NO se checa.
//  - Un día se califica solo cuando ya terminó: ahora >= salida programada + margen_dia_completo_min; antes: pendiente.
//  - Una incidencia de justificación convierte falta/retardo/salida_anticipada/incompleta en justificada y conserva
//    el cálculo original en detalle.calculo_original.
const { esFinDeSemana, aNumeroDia } = require("../../utils/diasHabiles");
const { aMs, horaAMinutos, diaIso, minutoRelativo } = require("./tiempo");

const ESTATUS_JUSTIFICABLES = new Set(["falta", "retardo", "salida_anticipada", "incompleta"]);
const SEGUNDOS_DUPLICADO = 60;
const MARGEN_POR_OMISION = 120;

const hhmm = (minutos) => {
  const m = ((minutos % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Detalle del turno para un día de la semana ISO: null si el turno no lo trabaja. */
function diaDelTurno(turno, fecha) {
  if (!turno || !Array.isArray(turno.dias)) return null;
  const iso = diaIso(fecha);
  const d = turno.dias.find((x) => Number(x.dia_semana) === iso);
  if (!d || !d.laborable) return null;
  const entrada = horaAMinutos(d.hora_entrada);
  const salida = horaAMinutos(d.hora_salida);
  if (entrada === null || salida === null) return null;
  const cruza = Boolean(d.cruza_medianoche) || salida < entrada;
  return { entrada, salida: salida + (cruza ? 1440 : 0), cruza };
}

/** Snapshot del turno que se guarda con el día calculado (null si no hay turno). */
function snapshotTurno(turno, fecha, origen, departamentoId) {
  if (!turno) return null;
  const dia = diaDelTurno(turno, fecha);
  return {
    turno_id: turno.id == null ? null : Number(turno.id),
    turno_nombre: turno.nombre || null,
    entrada_programada: dia ? hhmm(dia.entrada) : null,
    salida_programada: dia ? hhmm(dia.salida) : null,
    cruza_medianoche: dia ? dia.cruza : false,
    tolerancia_retardo_min: turno.tolerancia_retardo_min,
    tolerancia_salida_min: turno.tolerancia_salida_min,
    umbral_falta_min: turno.umbral_falta_min,
    ventana_entrada_antes_min: turno.ventana_entrada_antes_min,
    ventana_entrada_despues_min: turno.ventana_entrada_despues_min,
    ventana_salida_antes_min: turno.ventana_salida_antes_min,
    ventana_salida_despues_min: turno.ventana_salida_despues_min,
    descanso_inicio: turno.descanso_inicio ? String(turno.descanso_inicio).slice(0, 5) : null,
    descanso_min: turno.descanso_min || 0,
    origen_turno: origen || null,
    departamento_id: departamentoId == null ? null : Number(departamentoId),
  };
}

/**
 * Corte de salida de un turno que cruza la medianoche (no usa ventana de comida): solo una marca posterior a
 * entrada + ventana_entrada_despues puede ser la salida.
 */
function corteNocturno(turno, dia) {
  return dia.entrada + (turno.ventana_entrada_despues_min ?? 150);
}

/** Ventana de comida (minutos desde 00:00) de los parámetros, con los valores por omisión */
function ventanaComida(parametros) {
  const desde = horaAMinutos((parametros && parametros.comida_desde) || "13:00");
  const hasta = horaAMinutos((parametros && parametros.comida_hasta) || "16:00");
  return desde !== null && hasta !== null && desde < hasta ? { desde, hasta } : { desde: 780, hasta: 960 };
}

/** Marcas ordenadas por instante y sin duplicados (<= 60 s de la última conservada). */
function depurarMarcas(marcas) {
  const ordenadas = marcas
    .map((m) => ({ id: m.id, ms: aMs(m.ts) }))
    .sort((a, b) => a.ms - b.ms || Number(a.id) - Number(b.id));
  const unicas = [];
  let duplicadas = 0;
  for (const m of ordenadas) {
    const ultima = unicas[unicas.length - 1];
    if (ultima && m.ms - ultima.ms <= SEGUNDOS_DUPLICADO * 1000) {
      duplicadas++;
    } else {
      unicas.push(m);
    }
  }
  return { unicas, duplicadas };
}

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

function resultadoBase(estatus, explicacion, extra = {}) {
  return {
    estatus,
    minutos_retardo: 0,
    minutos_salida_anticipada: 0,
    primera_marca: null,
    ultima_marca: null,
    marcas_usadas: [],
    explicaciones: [explicacion],
    banderas: [],
    detalle: {},
    ...extra,
  };
}

/**
 * Califica un día.
 * @param {object} ctx
 * @param {string} ctx.fecha 'YYYY-MM-DD' (fecha local del día analizado)
 * @param {Date|number|string} ctx.ahora instante actual
 * @param {{analisis_desde:string, margen_dia_completo_min?:number}} ctx.parametros
 * @param {{numero_nomina?:string|null, fecha_ingreso?:string|null, fecha_baja?:string|null, nomina_duplicada?:boolean}} ctx.empleado
 * @param {object|null} ctx.turno turno efectivo (con `dias`) o null
 * @param {object|null} ctx.calendario {id,tipo} día oficial u otorgado (festivo) o null
 * @param {object|null} ctx.vacaciones {id} solicitud aprobada que cubre el día, o null
 * @param {object|null} ctx.permiso {id} permiso aprobado que cubre el día, o null
 * @param {object|null} ctx.incidencia {id} justificación activa de RH, o null
 * @param {Array<{id:any, ts:Date|number|string}>} ctx.marcas marcas del empleado cerca del día (el motor elige)
 */
function evaluarDia(ctx) {
  const { fecha, ahora, parametros, empleado = {}, turno = null } = ctx;
  const marcas = ctx.marcas || [];
  const margen = Number.isFinite(parametros && parametros.margen_dia_completo_min)
    ? parametros.margen_dia_completo_min
    : MARGEN_POR_OMISION;

  // 1) Fuera de rango
  if (parametros && parametros.analisis_desde && fecha < parametros.analisis_desde) {
    return resultadoBase("no_aplica", "El día es anterior al inicio del análisis de asistencia");
  }
  if (empleado.fecha_ingreso && fecha < empleado.fecha_ingreso) {
    return resultadoBase("no_aplica", "El día es anterior a la fecha de ingreso del empleado");
  }
  if (empleado.fecha_baja && fecha > empleado.fecha_baja) {
    return resultadoBase("no_aplica", "El día es posterior a la fecha de baja del empleado");
  }
  // 2) Sin identificador: no se puede relacionar con sus marcas, no se analiza (evita faltas falsas)
  const nomina = typeof empleado.numero_nomina === "string" ? empleado.numero_nomina.trim() : "";
  if (nomina === "") {
    return resultadoBase("sin_identificador", "El empleado no tiene número de nómina: no se pueden relacionar sus marcas");
  }
  if (empleado.nomina_duplicada) {
    return resultadoBase(
      "sin_identificador",
      "El número de nómina lo comparte otro empleado en el mismo periodo: no se pueden atribuir las marcas",
      { banderas: ["nomina_duplicada"] },
    );
  }
  // 3) Sin turno efectivo: no es falta
  if (!turno) {
    return resultadoBase("sin_turno", "El empleado no tiene turno asignado ese día");
  }
  const banderasTurno = turno.activo === false ? ["turno_inactivo"] : [];
  const dia = diaDelTurno(turno, fecha);

  // Marcas del día calendario local (para días sin jornada: se informan, no se califican)
  const { unicas, duplicadas } = depurarMarcas(marcas);
  const enElDia = (m) => {
    const rel = minutoRelativo(m.ms, fecha);
    return rel >= 0 && rel < 1440;
  };
  const marcasCalendario = unicas.filter(enElDia);
  const conMarcas = (estatus, explicacion, bandera, extra = {}) =>
    resultadoBase(estatus, explicacion, {
      primera_marca: iso(marcasCalendario[0] && marcasCalendario[0].ms),
      ultima_marca: iso(marcasCalendario.length ? marcasCalendario[marcasCalendario.length - 1].ms : null),
      banderas: [...banderasTurno, ...(marcasCalendario.length > 0 ? [bandera] : [])],
      detalle: { marcas_dia: marcasCalendario.length },
      ...extra,
    });

  // 4) Día de descanso del turno
  if (!dia) {
    return conMarcas("descanso", "Día de descanso del turno", "trabajo_en_descanso");
  }
  // 5) Calendario oficial u otorgado
  if (ctx.calendario) {
    return conMarcas("festivo", "Día festivo o descanso otorgado por la empresa", "trabajo_en_festivo");
  }
  // 6) Vacaciones aprobadas en día hábil laborable (lun-vie)
  if (ctx.vacaciones && !esFinDeSemana(fecha)) {
    return conMarcas("vacaciones", "Vacaciones aprobadas", "marcas_en_vacaciones");
  }
  // 7) Permiso aprobado
  if (ctx.permiso) {
    return conMarcas("permiso", "Permiso de ausencia aprobado", "marcas_en_permiso");
  }

  // 8) Día laborable: entrada, salida y retardos
  const cfg = {
    tolRetardo: turno.tolerancia_retardo_min ?? 10,
    umbral: turno.umbral_falta_min ?? 30,
    tolSalida: turno.tolerancia_salida_min ?? 0,
    vea: turno.ventana_entrada_antes_min ?? 60,
    ved: turno.ventana_entrada_despues_min ?? 150,
    vsa: turno.ventana_salida_antes_min ?? 5,
    vsd: turno.ventana_salida_despues_min ?? 359,
  };
  const E = dia.entrada;
  const S = dia.salida;
  const lecturas = unicas.map((m) => ({ ...m, rel: minutoRelativo(m.ms, fecha) }));
  // Entrada: sin límite inferior salvo en turnos que cruzan la medianoche (ver cabecera)
  const inferior = dia.cruza ? E - cfg.vea : Math.min(0, E - cfg.vea);
  const comida = ventanaComida(parametros);
  const esComida = (m) => !dia.cruza && m.rel >= comida.desde && m.rel <= comida.hasta;
  let entrada;
  let salida;
  if (dia.cruza) {
    entrada = lecturas.find((m) => m.rel >= inferior && m.rel <= E + cfg.ved) || null;
    const corte = corteNocturno(turno, dia);
    const candidatas = lecturas.filter((m) => m.rel > corte && m.rel <= S + cfg.vsd && (!entrada || m.ms > entrada.ms));
    salida = candidatas.length ? candidatas[candidatas.length - 1] : null;
  } else {
    // entrada: la primera marca del día, salvo que sea de comida o posterior (o pase de la ventana de entrada)
    const primera = lecturas.find((m) => m.rel >= inferior) || null;
    entrada = primera && primera.rel <= E + cfg.ved && !esComida(primera) && primera.rel < comida.desde ? primera : null;
    // salida: la última marca posterior a comida_hasta (y a la entrada)
    const candidatas = lecturas.filter((m) => m.rel > comida.hasta && m.rel <= S + cfg.vsd && (!entrada || m.ms > entrada.ms));
    salida = candidatas.length ? candidatas[candidatas.length - 1] : null;
  }
  const delDia = lecturas.filter((m) => m.rel >= inferior && m.rel <= S + cfg.vsd);
  const marcasComida = delDia.filter(esComida);

  const explicaciones = [];
  const banderas = [...banderasTurno];
  if (duplicadas > 0) banderas.push("marcas_duplicadas");
  if (delDia.length === 1) banderas.push("marca_unica");
  if (!entrada && salida) banderas.push("salida_sin_entrada");
  const fueraDeVentana = delDia.filter((m) => m !== entrada && m !== salida && !esComida(m));
  if (fueraDeVentana.length > 0) banderas.push("marcas_fuera_de_ventana");

  const tarde = entrada ? entrada.rel - E : 0; // minutos enteros de retraso (negativo = llegó antes)
  const antes = salida ? S - salida.rel : 0; // minutos antes de la salida (negativo = salió después)
  const minutosRetardo = tarde > 0 ? tarde : 0;
  const minutosSalida = antes > 0 ? antes : 0;

  let estatus;
  if (!entrada) {
    estatus = "falta";
    explicaciones.push(
      delDia.length === 0
        ? `Sin marcas en el día: no hay marca de entrada hasta las ${hhmm(E + cfg.ved)}`
        : `Sin marca de entrada hasta las ${hhmm(E + cfg.ved)}`,
    );
  } else if (tarde > cfg.umbral) {
    estatus = "falta";
    explicaciones.push(`Entrada ${tarde} min tarde: más de ${cfg.umbral} min (umbral de falta)`);
  } else if (!salida) {
    estatus = "incompleta";
    explicaciones.push(`Hay entrada (${tarde > 0 ? `${tarde} min tarde` : "a tiempo"}) pero no marca de salida`);
  } else if (tarde > cfg.tolRetardo) {
    estatus = "retardo";
    explicaciones.push(`Entrada ${tarde} min tarde: más de ${cfg.tolRetardo} min de tolerancia`);
    if (antes > cfg.tolSalida) explicaciones.push(`Salida ${antes} min antes: más de ${cfg.tolSalida} min de tolerancia`);
  } else if (antes > cfg.tolSalida) {
    estatus = "salida_anticipada";
    explicaciones.push(`Salida ${antes} min antes: más de ${cfg.tolSalida} min de tolerancia`);
  } else {
    estatus = "puntual";
    explicaciones.push("Entrada y salida dentro de la tolerancia");
  }
  // La salida anticipada solo cuenta cuando supera la tolerancia
  const registrarSalida = salida && antes > cfg.tolSalida ? minutosSalida : 0;
  const registrarRetardo = entrada && tarde > cfg.tolRetardo ? minutosRetardo : 0;

  // Incompleta con más marcas después de la entrada: o la última es de comida (salió a comer sin regreso o se fue:
  // RH decide) o hay marcas sueltas en la mañana
  if (estatus === "incompleta") {
    const posteriores = delDia.filter((m) => entrada && m.ms > entrada.ms);
    if (posteriores.length > 0) {
      const ultimaDelDia = posteriores[posteriores.length - 1];
      if (esComida(ultimaDelDia)) {
        banderas.push("ultima_marca_en_comida");
        explicaciones.push(`La última marca del día (${hhmm(ultimaDelDia.rel)}) cae dentro de la comida y no hay una posterior a las ${hhmm(comida.hasta)}: puede ser salida a comer sin regreso o salida anticipada`);
      } else {
        banderas.push("marca_intermedia_sin_salida");
      }
    }
  }
  // Comida: con >= 2 marcas dentro de la ventana se mide cuánto duró (solo informativo)
  const detalleComida = {};
  if (!dia.cruza && marcasComida.length >= 2) {
    const minutosComida = marcasComida[marcasComida.length - 1].rel - marcasComida[0].rel;
    detalleComida.minutos_comida = minutosComida;
    if ((turno.descanso_min || 0) > 0 && minutosComida > turno.descanso_min) {
      banderas.push("exceso_comida");
      detalleComida.exceso_comida_min = minutosComida - turno.descanso_min;
    }
  }

  // 9) ¿El día ya terminó? Antes: pendiente (con las marcas y minutos provisionales)
  const ahoraRel = minutoRelativo(ahora, fecha);
  const completo = ahoraRel >= S + margen;
  const detalle = {
    entrada_programada_min: E,
    salida_programada_min: S,
    jornada_neta_min: S - E - (turno.descanso_min || 0),
    descanso_min: turno.descanso_min || 0,
    marcas_dia: delDia.length,
    marcas_duplicadas: duplicadas,
    ...(dia.cruza ? {} : { comida: { desde: hhmm(comida.desde), hasta: hhmm(comida.hasta), marcas: marcasComida.length } }),
    ...detalleComida,
    minutos_tarde: entrada ? tarde : null,
    minutos_antes_salida: salida ? antes : null,
    dia_completo: completo,
  };
  const resultado = {
    estatus,
    minutos_retardo: estatus === "falta" ? (entrada && tarde > 0 ? tarde : 0) : registrarRetardo,
    minutos_salida_anticipada: registrarSalida,
    primera_marca: iso(delDia[0] && delDia[0].ms),
    ultima_marca: iso(delDia.length ? delDia[delDia.length - 1].ms : null),
    marcas_usadas: [entrada, salida].filter(Boolean).map((m) => m.id),
    explicaciones,
    banderas,
    detalle,
  };
  if (!completo) {
    resultado.detalle.calculo_provisional = estatus;
    resultado.estatus = "pendiente";
    resultado.banderas.push("dia_pendiente");
    resultado.explicaciones = [
      `El día aún no termina (se califica a partir de ${hhmm(S + margen)}, ${margen} min después de la salida)`,
      ...explicaciones.map((e) => `Provisional: ${e}`),
    ];
    return resultado;
  }

  // 10) Justificación de RH
  if (ctx.incidencia && ESTATUS_JUSTIFICABLES.has(estatus)) {
    resultado.detalle.calculo_original = {
      estatus,
      minutos_retardo: resultado.minutos_retardo,
      minutos_salida_anticipada: resultado.minutos_salida_anticipada,
    };
    resultado.estatus = "justificada";
    resultado.explicaciones = [`Justificada por RH (cálculo original: ${estatus})`, ...explicaciones];
  }
  return resultado;
}

/**
 * Función de cada marca de un día YA calculado, con las mismas reglas del motor (depurarMarcas para los duplicados y la
 * ventana de comida guardada en el detalle del día): la pantalla de detalle muestra lo mismo que se calificó.
 * @param {{fecha:string, marcas:Array<{id:any, ts:any}>, marcasUsadas:any[], banderas?:string[], comida?:{desde:string,hasta:string}|null, cruza?:boolean}} d
 * @returns {Object<string,'entrada'|'salida'|'comida'|'duplicada'|'otra'>} id de la marca -> rol
 */
function clasificarMarcas({ fecha, marcas, marcasUsadas, banderas = [], comida = null, cruza = false }) {
  const usadas = (marcasUsadas || []).map(String);
  const { unicas } = depurarMarcas(marcas || []);
  const conservadas = new Set(unicas.map((m) => String(m.id)));
  const desde = comida ? horaAMinutos(comida.desde) : null;
  const hasta = comida ? horaAMinutos(comida.hasta) : null;
  const roles = {};
  for (const m of marcas || []) {
    const id = String(m.id);
    const i = usadas.indexOf(id);
    if (i !== -1) {
      roles[id] = usadas.length === 2 ? (i === 0 ? "entrada" : "salida") : banderas.includes("salida_sin_entrada") ? "salida" : "entrada";
    } else if (!conservadas.has(id)) {
      roles[id] = "duplicada";
    } else {
      const rel = minutoRelativo(aMs(m.ts), fecha);
      roles[id] = !cruza && desde !== null && hasta !== null && rel >= desde && rel <= hasta ? "comida" : "otra";
    }
  }
  return roles;
}

module.exports = {
  evaluarDia,
  clasificarMarcas,
  snapshotTurno,
  diaDelTurno,
  depurarMarcas,
  ESTATUS_JUSTIFICABLES,
  aNumeroDia,
};
