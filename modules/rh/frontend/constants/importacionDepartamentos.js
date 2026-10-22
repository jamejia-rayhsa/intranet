// Layout de la carga masiva de departamentos: nombre, área, descripción, cupo de vacaciones y turno.
// Los encabezados se reconocen sin importar acentos, mayúsculas ni puntuación (etiqueta, clave o alias).

export const COLUMNAS_DEPARTAMENTOS = [
  { clave: 'nombre', etiqueta: 'Nombre', requerido: true, alias: ['Departamento'] },
  { clave: 'area', etiqueta: 'Área', requerido: false, alias: ['Area'] },
  { clave: 'descripcion', etiqueta: 'Descripción', requerido: false },
  { clave: 'cupo_vacaciones', etiqueta: 'Cupo de vacaciones', requerido: false, alias: ['Cupo', 'Cupo vacaciones', 'Cupo de vacaciones (personas a la vez)'] },
  { clave: 'turno', etiqueta: 'Turno', requerido: false, alias: ['Turno asignado'] },
  { clave: 'turno_vigente_desde', etiqueta: 'Turno vigente desde', requerido: false, tipo: 'fecha', alias: ['Vigente desde', 'Fecha del turno', 'Fecha de inicio del turno'] },
];

// Ejemplos FICTICIOS
export const FILAS_EJEMPLO_DEPARTAMENTOS = [
  { nombre: 'Contabilidad', area: 'Administración', descripcion: 'Gestión financiera y contable', cupo_vacaciones: '2', turno: 'Rayhsa', turno_vigente_desde: '2026-01-01' },
  { nombre: 'Logística', area: 'Operaciones', descripcion: 'Distribución y almacén', cupo_vacaciones: '3', turno: '', turno_vigente_desde: '' },
];

export const INSTRUCCIONES_DEPARTAMENTOS = [
  ['Carga masiva de departamentos'],
  [''],
  ['Obligatorio'],
  ['Solo Nombre es obligatorio.'],
  [''],
  ['Cupo de vacaciones'],
  ['Cuántas personas del departamento pueden estar de vacaciones a la vez: un entero entre 1 y 999. Vacío = no cambia (al crear, 1). Un valor inválido (0, texto, decimales) no rechaza la fila: se ignora y el resultado muestra una advertencia.'],
  [''],
  ['Turno'],
  ['Nombre de un turno ACTIVO de la hoja "Catálogos" (no importan acentos ni mayúsculas). "Turno vigente desde" (AAAA-MM-DD o DD/MM/AAAA, día primero) es opcional; por omisión, hoy (hora de México).'],
  ['Sin turno vigente: se asigna. Mismo turno vigente: no cambia. Otro turno: la asignación vigente termina el día anterior a "Turno vigente desde" y se crea la nueva. Si esa fecha no es posterior al inicio de la vigente, o se traslapa con otra asignación, esa fila se reporta como error (el resto del departamento no se modifica) y las demás filas siguen.'],
  ['Un turno inexistente o inactivo es advertencia: el departamento se importa sin tocar su turno. Para asignar turnos hace falta el permiso de edición de Turnos; sin él la columna se ignora con una advertencia.'],
  [''],
  ['Qué hacer con los departamentos que ya existen'],
  ['"Omitirlos" (por omisión): se cuentan como duplicados y no se tocan. "Actualizarlos con los datos del archivo": se buscan por nombre (sin acentos ni mayúsculas); solo las celdas CON valor sobrescriben y una celda vacía NUNCA borra datos.'],
  [''],
  ['Las filas de ejemplo de la hoja "Departamentos" son ficticias: bórralas antes de cargar tu archivo.'],
];

const ABREVIATURAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// "Lun-Vie 08:00-17:00; Sáb 08:00-13:00" a partir del detalle por día de un turno (dias: [{dia_semana, laborable, hora_entrada, hora_salida}]).
export function resumenHorario(turno) {
  const dias = ((turno && turno.dias) || []).filter((d) => d.laborable).sort((a, b) => a.dia_semana - b.dia_semana);
  if (!dias.length) return 'Sin días laborables';
  const grupos = [];
  dias.forEach((d) => {
    const horario = `${d.hora_entrada}-${d.hora_salida}`;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.horario === horario && ultimo.fin === d.dia_semana - 1) ultimo.fin = d.dia_semana;
    else grupos.push({ horario, inicio: d.dia_semana, fin: d.dia_semana });
  });
  return grupos
    .map((g) => `${g.inicio === g.fin ? ABREVIATURAS[g.inicio - 1] : `${ABREVIATURAS[g.inicio - 1]}-${ABREVIATURAS[g.fin - 1]}`} ${g.horario}`)
    .join('; ');
}

// Hojas de la plantilla: Departamentos (encabezados + ejemplos), Instrucciones y Catálogos (turnos activos con horario resumido, áreas).
// turnos: [{ nombre, activo, dias? }]; areas: [{ nombre }].
export function hojasPlantillaDepartamentos({ turnos, areas }) {
  const activos = (turnos || []).filter((t) => t && t.activo !== false);
  const nombresAreas = (areas || []).map((a) => (a && typeof a === 'object' ? a.nombre : a)).filter(Boolean);
  const alto = Math.max(activos.length, nombresAreas.length);
  const catalogo = [['Turnos activos', 'Horario', 'Áreas']];
  for (let i = 0; i < alto; i++) {
    catalogo.push([
      i < activos.length ? activos[i].nombre : '',
      i < activos.length ? resumenHorario(activos[i]) : '',
      i < nombresAreas.length ? nombresAreas[i] : '',
    ]);
  }
  return {
    Departamentos: [
      COLUMNAS_DEPARTAMENTOS.map((c) => c.etiqueta),
      ...FILAS_EJEMPLO_DEPARTAMENTOS.map((f) => COLUMNAS_DEPARTAMENTOS.map((c) => f[c.clave] || '')),
    ],
    Instrucciones: INSTRUCCIONES_DEPARTAMENTOS,
    'Catálogos': catalogo,
  };
}
