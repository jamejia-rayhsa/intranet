// Validación estricta de turnos y asignaciones. Funciones puras (sin BD).
// Las fechas son SIEMPRE texto 'YYYY-MM-DD' y las horas texto 'HH:MM' (hora local America/Mexico_City):
// nunca se pasan por new Date(texto), que interpreta UTC y puede correr el día.
const MAX_INT4 = 2147483647;
const MAX_NOMBRE = 100;
const MAX_DESCRIPCION = 1000;
const MAX_MINUTOS = 720;
const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7]; // ISO: 1 = lunes ... 7 = domingo

// Minutos (0..720) de tolerancias y ventanas de marcaje
const CAMPOS_MINUTOS = [
  "tolerancia_retardo_min",
  "umbral_falta_min",
  "tolerancia_salida_min",
  "ventana_entrada_antes_min",
  "ventana_entrada_despues_min",
  "ventana_salida_antes_min",
  "ventana_salida_despues_min",
  "descanso_min",
];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Fecha estricta 'YYYY-MM-DD' que existe en el calendario (rechaza 2026-02-30). */
function esFechaValida(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split("-").map(Number);
  if (anio < 1900 || anio > 2200) return false;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

const esHoraValida = (valor) => typeof valor === "string" && HORA.test(valor);

/** Id entero 1..int4 (texto o número; arreglos y objetos no pasan). */
function esIdValido(valor) {
  return (
    (typeof valor === "string" || typeof valor === "number") &&
    /^\d{1,10}$/.test(String(valor)) &&
    Number(valor) >= 1 &&
    Number(valor) <= MAX_INT4
  );
}

/** Entero 0..720 como número o texto de dígitos; devuelve el número o null. */
function aMinutos(valor) {
  if (typeof valor === "number") {
    return Number.isInteger(valor) && valor >= 0 && valor <= MAX_MINUTOS ? valor : null;
  }
  if (typeof valor === "string" && /^\d{1,4}$/.test(valor)) {
    const n = Number(valor);
    return n <= MAX_MINUTOS ? n : null;
  }
  return null;
}

const esObjeto = (v) => v && typeof v === "object" && !Array.isArray(v);

/**
 * Valida y normaliza el detalle por día. Los días que no vengan se completan como no laborables
 * (el turno siempre queda con 7 filas). Exige al menos un día laborable.
 * @returns {{error?: string, dias?: object[]}}
 */
function validarDias(dias) {
  if (!Array.isArray(dias) || dias.length === 0 || dias.length > 7) {
    return { error: "dias debe ser una lista de 1 a 7 días de la semana" };
  }
  const porDia = new Map();
  for (const d of dias) {
    if (!esObjeto(d)) return { error: "Cada día debe ser un objeto" };
    if (!Number.isInteger(d.dia_semana) || d.dia_semana < 1 || d.dia_semana > 7) {
      return { error: "dia_semana debe ser un entero de 1 (lunes) a 7 (domingo)" };
    }
    if (porDia.has(d.dia_semana)) return { error: `El día ${d.dia_semana} está repetido` };
    if (typeof d.laborable !== "boolean") {
      return { error: `laborable debe ser verdadero o falso (día ${d.dia_semana})` };
    }
    const tieneEntrada = d.hora_entrada !== undefined && d.hora_entrada !== null;
    const tieneSalida = d.hora_salida !== undefined && d.hora_salida !== null;
    if (d.laborable) {
      if (!esHoraValida(d.hora_entrada) || !esHoraValida(d.hora_salida)) {
        return { error: `hora_entrada y hora_salida deben tener el formato HH:MM de 24 horas (día ${d.dia_semana})` };
      }
      if (d.hora_entrada === d.hora_salida) {
        return { error: `La hora de entrada y la de salida no pueden ser iguales (día ${d.dia_semana})` };
      }
      const cruza = d.hora_salida < d.hora_entrada;
      if (d.cruza_medianoche !== undefined && d.cruza_medianoche !== null && d.cruza_medianoche !== cruza) {
        return {
          error: `cruza_medianoche no coincide con las horas del día ${d.dia_semana} (la salida es ${cruza ? "anterior" : "posterior"} a la entrada)`,
        };
      }
      porDia.set(d.dia_semana, {
        dia_semana: d.dia_semana,
        laborable: true,
        hora_entrada: d.hora_entrada,
        hora_salida: d.hora_salida,
        cruza_medianoche: cruza,
      });
    } else {
      if (tieneEntrada || tieneSalida) {
        return { error: `Un día no laborable no lleva horas (día ${d.dia_semana})` };
      }
      if (d.cruza_medianoche === true) {
        return { error: `Un día no laborable no cruza la medianoche (día ${d.dia_semana})` };
      }
      porDia.set(d.dia_semana, {
        dia_semana: d.dia_semana,
        laborable: false,
        hora_entrada: null,
        hora_salida: null,
        cruza_medianoche: false,
      });
    }
  }
  if (![...porDia.values()].some((d) => d.laborable)) {
    return { error: "El turno debe tener al menos un día laborable" };
  }
  const completos = DIAS_SEMANA.map(
    (n) =>
      porDia.get(n) || {
        dia_semana: n,
        laborable: false,
        hora_entrada: null,
        hora_salida: null,
        cruza_medianoche: false,
      },
  );
  return { dias: completos };
}

/**
 * Valida el cuerpo de un turno. Alta (parcial=false): nombre y dias obligatorios. Edición
 * (parcial=true): solo los campos presentes. `base` = valores actuales del turno para comprobar
 * umbral_falta_min >= tolerancia_retardo_min con los valores resultantes.
 * @returns {{error?: string, datos?: object}}
 */
function validarTurno(cuerpo, { parcial = false, base = null } = {}) {
  const c = esObjeto(cuerpo) ? cuerpo : {};
  const datos = {};

  if (c.nombre !== undefined || !parcial) {
    const nombre = typeof c.nombre === "string" ? c.nombre.trim() : "";
    if (!nombre) return { error: "El nombre es obligatorio" };
    if (nombre.length > MAX_NOMBRE) return { error: `El nombre no puede superar ${MAX_NOMBRE} caracteres` };
    datos.nombre = nombre;
  }
  if (c.descripcion !== undefined && c.descripcion !== null) {
    if (typeof c.descripcion !== "string") return { error: "La descripción debe ser texto" };
    const descripcion = c.descripcion.trim();
    if (descripcion.length > MAX_DESCRIPCION) {
      return { error: `La descripción no puede superar ${MAX_DESCRIPCION} caracteres` };
    }
    datos.descripcion = descripcion || null;
  } else if (c.descripcion === null) {
    datos.descripcion = null;
  }
  if (c.activo !== undefined) {
    if (typeof c.activo !== "boolean") return { error: "activo debe ser verdadero o falso" };
    datos.activo = c.activo;
  }
  for (const campo of CAMPOS_MINUTOS) {
    if (c[campo] !== undefined) {
      const minutos = aMinutos(c[campo]);
      if (minutos === null) return { error: `${campo} debe ser un entero de 0 a ${MAX_MINUTOS} minutos` };
      datos[campo] = minutos;
    }
  }
  const tolerancia =
    datos.tolerancia_retardo_min ?? (base ? base.tolerancia_retardo_min : 10);
  const umbral = datos.umbral_falta_min ?? (base ? base.umbral_falta_min : 30);
  if (umbral < tolerancia) {
    return { error: "umbral_falta_min no puede ser menor que tolerancia_retardo_min" };
  }
  if (c.descanso_inicio !== undefined) {
    if (c.descanso_inicio !== null && !esHoraValida(c.descanso_inicio)) {
      return { error: "descanso_inicio debe tener el formato HH:MM de 24 horas" };
    }
    datos.descanso_inicio = c.descanso_inicio;
  }
  // Un descanso con duración necesita hora de inicio (valores resultantes tras la edición)
  const descansoMin = datos.descanso_min ?? (base ? base.descanso_min : 0) ?? 0;
  const descansoInicio = datos.descanso_inicio !== undefined ? datos.descanso_inicio : base ? base.descanso_inicio : null;
  if (descansoMin > 0 && !descansoInicio) {
    return { error: "descanso_inicio es obligatorio si descanso_min es mayor que 0" };
  }
  if (c.dias !== undefined || !parcial) {
    const { error, dias } = validarDias(c.dias);
    if (error) return { error };
    datos.dias = dias;
  }
  if (parcial && Object.keys(datos).length === 0) return { error: "No hay campos para actualizar" };
  return { datos };
}

/**
 * Valida el cuerpo de una asignación. `columna` = 'departamento_id' | 'empleado_id'.
 * @returns {{error?: string, datos?: object}}
 */
function validarAsignacion(cuerpo, columna) {
  const c = esObjeto(cuerpo) ? cuerpo : {};
  if (!esIdValido(c[columna])) return { error: `${columna} debe ser un entero positivo` };
  if (!esIdValido(c.turno_id)) return { error: "turno_id debe ser un entero positivo" };
  if (!esFechaValida(c.vigente_desde)) {
    return { error: "vigente_desde debe tener el formato YYYY-MM-DD y ser una fecha real" };
  }
  let hasta = null;
  if (c.vigente_hasta !== undefined && c.vigente_hasta !== null) {
    if (!esFechaValida(c.vigente_hasta)) {
      return { error: "vigente_hasta debe tener el formato YYYY-MM-DD y ser una fecha real" };
    }
    if (c.vigente_hasta < c.vigente_desde) {
      return { error: "vigente_hasta no puede ser anterior a vigente_desde" };
    }
    hasta = c.vigente_hasta;
  }
  return {
    datos: {
      [columna]: Number(c[columna]),
      turno_id: Number(c.turno_id),
      vigente_desde: c.vigente_desde,
      vigente_hasta: hasta,
    },
  };
}

module.exports = {
  esFechaValida,
  esHoraValida,
  esIdValido,
  validarDias,
  validarTurno,
  validarAsignacion,
  DIAS_SEMANA,
};
