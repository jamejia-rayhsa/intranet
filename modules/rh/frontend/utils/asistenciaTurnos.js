// Turnos de Asistencia: formulario, validaciones y resúmenes. Lógica pura (sin imports: jest evalúa el fuente).
// Replica las reglas de modules/rh/backend/utils/turnoValidacion.js para avisar antes de enviar; el servidor
// sigue siendo la autoridad y sus mensajes se muestran tal cual. Días: 1 = lunes ... 7 = domingo (como la intranet).
export const MAX_MINUTOS = 720;
export const MAX_NOMBRE = 100;
export const MAX_DESCRIPCION = 1000;

export const DIAS_SEMANA = [
  { numero: 1, nombre: 'Lunes', corto: 'Lun' },
  { numero: 2, nombre: 'Martes', corto: 'Mar' },
  { numero: 3, nombre: 'Miércoles', corto: 'Mié' },
  { numero: 4, nombre: 'Jueves', corto: 'Jue' },
  { numero: 5, nombre: 'Viernes', corto: 'Vie' },
  { numero: 6, nombre: 'Sábado', corto: 'Sáb' },
  { numero: 7, nombre: 'Domingo', corto: 'Dom' },
];

export const CAMPOS_MINUTOS = [
  { campo: 'tolerancia_retardo_min', etiqueta: 'Tolerancia de retardo (min)' },
  { campo: 'umbral_falta_min', etiqueta: 'Umbral de falta (min)' },
  { campo: 'tolerancia_salida_min', etiqueta: 'Tolerancia de salida anticipada (min)' },
  { campo: 'ventana_entrada_antes_min', etiqueta: 'Ventana de entrada: minutos antes' },
  { campo: 'ventana_entrada_despues_min', etiqueta: 'Ventana de entrada: minutos después' },
  { campo: 'ventana_salida_antes_min', etiqueta: 'Ventana de salida: minutos antes' },
  { campo: 'ventana_salida_despues_min', etiqueta: 'Ventana de salida: minutos después' },
  { campo: 'descanso_min', etiqueta: 'Duración del descanso (min)' },
];

export const AYUDA_TOLERANCIAS =
  'La tolerancia de retardo son los minutos después de la hora de entrada en que aún no cuenta como retardo. ' +
  'El umbral de falta son los minutos de retraso a partir de los cuales la entrada se considera falta (no puede ser menor que la tolerancia). ' +
  'La tolerancia de salida anticipada son los minutos antes de la hora de salida que se perdonan.';
export const AYUDA_VENTANAS =
  'Las ventanas dicen qué marcas del checador cuentan como entrada o como salida de la jornada: ' +
  'minutos antes y después de la hora de entrada, y minutos antes y después de la hora de salida. Una marca fuera de la ventana no se toma para ese día.';
export const AYUDA_DESCANSO =
  'El descanso se descuenta de la jornada y debe quedar dentro de ella (entre la entrada y la salida de cada día laborable). Déjalo en 0 minutos si no hay descanso.';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const esHoraValida = (valor) => typeof valor === 'string' && HORA.test(valor);
export const horaAMinutos = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

// eslint-disable-next-line no-control-regex
const CONTROL_LINEA = /[\u0000-\u001F\u007F-\u009F]/;
// eslint-disable-next-line no-control-regex
const CONTROL_TEXTO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

/** Formulario nuevo: lunes a viernes 08:00-17:00 con los valores por omisión del servidor. */
export function formularioVacio() {
  return {
    nombre: '',
    descripcion: '',
    activo: true,
    tolerancia_retardo_min: '10',
    umbral_falta_min: '30',
    tolerancia_salida_min: '0',
    ventana_entrada_antes_min: '60',
    ventana_entrada_despues_min: '150',
    ventana_salida_antes_min: '5',
    ventana_salida_despues_min: '359',
    descanso_inicio: '',
    descanso_min: '0',
    dias: DIAS_SEMANA.map((d) => ({
      dia_semana: d.numero,
      laborable: d.numero <= 5,
      hora_entrada: d.numero <= 5 ? '08:00' : '',
      hora_salida: d.numero <= 5 ? '17:00' : '',
    })),
  };
}

/** Turno del servidor (con `dias`) -> valores del formulario (todo texto). */
export function formularioDesdeTurno(turno) {
  const base = formularioVacio();
  const porDia = new Map((turno.dias || []).map((d) => [d.dia_semana, d]));
  const formulario = {
    ...base,
    nombre: turno.nombre || '',
    descripcion: turno.descripcion || '',
    activo: turno.activo !== false,
    descanso_inicio: turno.descanso_inicio || '',
    dias: DIAS_SEMANA.map((d) => {
      const x = porDia.get(d.numero);
      return {
        dia_semana: d.numero,
        laborable: Boolean(x && x.laborable),
        hora_entrada: (x && x.hora_entrada) || '',
        hora_salida: (x && x.hora_salida) || '',
      };
    }),
  };
  for (const { campo } of CAMPOS_MINUTOS) {
    formulario[campo] = turno[campo] === null || turno[campo] === undefined ? base[campo] : String(turno[campo]);
  }
  return formulario;
}

function minutosDe(valor) {
  if (typeof valor === 'number') return Number.isInteger(valor) ? valor : null;
  if (typeof valor !== 'string' || !/^\d{1,4}$/.test(valor.trim())) return null;
  return Number(valor.trim());
}

/** ¿La jornada del día cruza la medianoche (salida anterior a la entrada)? */
export const cruzaMedianoche = (dia) =>
  dia.laborable && esHoraValida(dia.hora_entrada) && esHoraValida(dia.hora_salida) && dia.hora_salida < dia.hora_entrada;

/**
 * Valida el formulario con las reglas del servidor.
 * @returns {{errores: Object<string,string>, lista: string[]}} errores por clave de campo
 *   ('nombre', 'descripcion', campos de minutos, 'descanso_inicio', 'dias', 'dia_<n>') y la lista en orden de lectura.
 */
export function validarFormularioTurno(f) {
  const errores = {};
  const nombre = (f.nombre || '').trim();
  if (!nombre) errores.nombre = 'El nombre es obligatorio';
  else if (CONTROL_LINEA.test(nombre)) errores.nombre = 'El nombre contiene caracteres no válidos';
  else if (nombre.length > MAX_NOMBRE) errores.nombre = `El nombre no puede superar ${MAX_NOMBRE} caracteres`;

  const descripcion = f.descripcion || '';
  if (CONTROL_TEXTO.test(descripcion)) errores.descripcion = 'La descripción contiene caracteres no válidos';
  else if (descripcion.trim().length > MAX_DESCRIPCION) errores.descripcion = `La descripción no puede superar ${MAX_DESCRIPCION} caracteres`;

  const valores = {};
  for (const { campo, etiqueta } of CAMPOS_MINUTOS) {
    const n = minutosDe(f[campo]);
    if (n === null || n < 0 || n > MAX_MINUTOS) errores[campo] = `${etiqueta}: indica un entero de 0 a ${MAX_MINUTOS}`;
    else valores[campo] = n;
  }
  if (
    valores.tolerancia_retardo_min !== undefined &&
    valores.umbral_falta_min !== undefined &&
    valores.umbral_falta_min < valores.tolerancia_retardo_min
  ) {
    errores.umbral_falta_min = 'El umbral de falta no puede ser menor que la tolerancia de retardo';
  }

  const inicio = f.descanso_inicio || '';
  if (inicio && !esHoraValida(inicio)) errores.descanso_inicio = 'El inicio del descanso debe tener formato HH:MM de 24 horas';
  else if (valores.descanso_min > 0 && !inicio) errores.descanso_inicio = 'El inicio del descanso es obligatorio si el descanso dura más de 0 minutos';

  let laborables = 0;
  for (const dia of f.dias || []) {
    const nombreDia = DIAS_SEMANA.find((d) => d.numero === dia.dia_semana).nombre;
    if (!dia.laborable) continue;
    laborables += 1;
    if (!esHoraValida(dia.hora_entrada) || !esHoraValida(dia.hora_salida)) {
      errores[`dia_${dia.dia_semana}`] = `${nombreDia}: indica la hora de entrada y la de salida (HH:MM)`;
    } else if (dia.hora_entrada === dia.hora_salida) {
      errores[`dia_${dia.dia_semana}`] = `${nombreDia}: la entrada y la salida no pueden ser iguales`;
    } else if (valores.descanso_min > 0 && esHoraValida(inicio)) {
      const entrada = horaAMinutos(dia.hora_entrada);
      const salida = horaAMinutos(dia.hora_salida) + (cruzaMedianoche(dia) ? 1440 : 0);
      let ini = horaAMinutos(inicio);
      if (cruzaMedianoche(dia) && ini < entrada) ini += 1440;
      if (ini < entrada || ini + valores.descanso_min > salida) {
        errores[`dia_${dia.dia_semana}`] = `${nombreDia}: el descanso debe quedar dentro de la jornada (entre la entrada y la salida)`;
      }
    }
  }
  if (laborables === 0) errores.dias = 'El turno debe tener al menos un día laborable';

  const orden = ['nombre', 'descripcion', ...CAMPOS_MINUTOS.map((c) => c.campo), 'descanso_inicio', 'dias', ...DIAS_SEMANA.map((d) => `dia_${d.numero}`)];
  return { errores, lista: orden.filter((k) => errores[k]).map((k) => errores[k]) };
}

/** Cuerpo para POST/PUT /api/asistencia/turnos. Solo llamar con el formulario ya validado. */
export function construirCuerpoTurno(f) {
  const cuerpo = {
    nombre: f.nombre.trim(),
    descripcion: f.descripcion.trim() === '' ? null : f.descripcion.trim(),
    activo: Boolean(f.activo),
    descanso_inicio: f.descanso_inicio ? f.descanso_inicio : null,
    dias: f.dias.map((d) =>
      d.laborable
        ? { dia_semana: d.dia_semana, laborable: true, hora_entrada: d.hora_entrada, hora_salida: d.hora_salida }
        : { dia_semana: d.dia_semana, laborable: false },
    ),
  };
  for (const { campo } of CAMPOS_MINUTOS) cuerpo[campo] = minutosDe(f[campo]);
  return cuerpo;
}

/**
 * Resumen del horario semanal: agrupa días CONSECUTIVOS con las mismas horas.
 * Ej. 'Lun a Vie 08:00-17:00; Sáb 08:00-13:00'. Un turno que cruza la medianoche lleva '(+1 día)'.
 */
export function resumirHorario(dias) {
  const laborables = (dias || [])
    .filter((d) => d.laborable && d.hora_entrada && d.hora_salida)
    .sort((a, b) => a.dia_semana - b.dia_semana);
  if (laborables.length === 0) return 'Sin días laborables';
  const nombreCorto = (n) => DIAS_SEMANA.find((d) => d.numero === n).corto;
  const grupos = [];
  for (const d of laborables) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.entrada === d.hora_entrada && ultimo.salida === d.hora_salida && ultimo.fin === d.dia_semana - 1) {
      ultimo.fin = d.dia_semana;
    } else {
      grupos.push({ inicio: d.dia_semana, fin: d.dia_semana, entrada: d.hora_entrada, salida: d.hora_salida });
    }
  }
  return grupos
    .map((g) => {
      let rango = nombreCorto(g.inicio);
      if (g.fin > g.inicio) rango += `${g.fin === g.inicio + 1 ? ' y ' : ' a '}${nombreCorto(g.fin)}`;
      const cruza = g.salida < g.entrada ? ' (+1 día)' : '';
      return `${rango} ${g.entrada}-${g.salida}${cruza}`;
    })
    .join('; ');
}

export function resumirTolerancias(t) {
  return `Retardo +${t.tolerancia_retardo_min} min · Falta +${t.umbral_falta_min} min · Salida ${t.tolerancia_salida_min} min`;
}

/** Texto del uso de un turno ('2 departamentos, 14 empleados'). `uso` puede faltar si la consulta falló. */
export function resumirUso(uso) {
  if (!uso) return '—';
  const dep = uso.departamentos;
  const emp = uso.empleados_efectivos;
  return `${dep} ${dep === 1 ? 'departamento' : 'departamentos'}, ${emp} ${emp === 1 ? 'empleado' : 'empleados'}`;
}
