// Layout de la carga masiva de empleados: TODAS las columnas editables del expediente, en el orden del expediente.
// Las 17 columnas del layout anterior conservan su clave y su etiqueta (los archivos antiguos siguen funcionando).
// Los encabezados se reconocen sin importar acentos, mayúsculas, espacios ni puntuación (etiqueta, clave o alias).
// Las reglas de validación viven en el backend (modules/rh/backend/utils/importarEmpleados.js); una prueba exige que
// las claves de ambos lados coincidan.

import {
  ESTADOS_MEXICO, BANCOS_MEXICO, GENEROS, ESTADOS_CIVILES, NIVELES_ESCOLARIDAD, TIPOS_CONTRATO,
} from './catalogos';

export const ESTATUS_IMPORTACION = ['activo', 'baja', 'suspendido'];

export const GRUPOS_EMPLEADO = ['Personales', 'Contacto', 'Domicilio', 'Laborales', 'Financieros', 'Control'];

const c = (grupo, clave, etiqueta, extra) => ({ grupo, clave, etiqueta, requerido: false, ...(extra || {}) });

export const COLUMNAS_EMPLEADOS = [
  // Personales
  c('Personales', 'nombre', 'Nombre', { requerido: true, alias: ['Nombres', 'Nombre(s)'] }),
  c('Personales', 'apellido_paterno', 'Apellido Paterno', { requerido: true, alias: ['Primer apellido', 'Ap. paterno', 'Apellido P'] }),
  c('Personales', 'apellido_materno', 'Apellido Materno', { alias: ['Segundo apellido', 'Ap. materno', 'Apellido M'] }),
  c('Personales', 'fecha_nacimiento', 'Fecha Nacimiento', { tipo: 'fecha', alias: ['Fecha de nacimiento', 'Fecha nac.', 'Nacimiento', 'F. nacimiento'] }),
  c('Personales', 'curp', 'CURP'),
  c('Personales', 'rfc', 'RFC'),
  c('Personales', 'nss', 'NSS', { alias: ['Numero de seguro social', 'No. IMSS', 'Seguro social'] }),
  c('Personales', 'genero', 'Género', { alias: ['Sexo'] }),
  c('Personales', 'estado_civil', 'Estado Civil'),
  c('Personales', 'escolaridad', 'Escolaridad', { alias: ['Nivel de estudios', 'Grado de estudios'] }),
  c('Personales', 'estado_nacimiento', 'Estado de nacimiento', { alias: ['Entidad de nacimiento', 'Lugar de nacimiento'] }),
  // Contacto
  c('Contacto', 'celular_personal', 'Celular Personal', { alias: ['Telefono celular', 'Celular', 'Telefono personal', 'Tel. celular'] }),
  c('Contacto', 'correo_personal', 'Correo Personal', { alias: ['Correo', 'Email', 'E-mail', 'Correo electronico'] }),
  c('Contacto', 'telefono_emergencia', 'Teléfono de emergencia', { alias: ['Tel. emergencia', 'Telefono emergencia'] }),
  c('Contacto', 'parentesco_emergencia', 'Parentesco de emergencia', { alias: ['Parentesco'] }),
  c('Contacto', 'contacto_emergencia', 'Contacto de emergencia', { alias: ['Nombre contacto emergencia'] }),
  // Domicilio
  c('Domicilio', 'calle', 'Calle', { alias: ['Domicilio', 'Calle y numero'] }),
  c('Domicilio', 'colonia', 'Colonia'),
  c('Domicilio', 'codigo_postal', 'Código postal', { alias: ['C.P.', 'CP', 'Codigo postal domicilio'] }),
  c('Domicilio', 'municipio', 'Municipio', { alias: ['Alcaldia', 'Municipio / Alcaldia', 'Delegacion'] }),
  c('Domicilio', 'estado_residencia', 'Estado de residencia', { alias: ['Estado (domicilio)', 'Estado domicilio'] }),
  // Laborales
  c('Laborales', 'numero_nomina', 'Número de Nómina', { alias: ['No. Nomina', 'Nomina', 'No. de nomina', 'Num. nomina'] }),
  c('Laborales', 'fecha_imss', 'Fecha de alta IMSS', { tipo: 'fecha', alias: ['Fecha alta IMSS', 'Alta IMSS', 'Fecha IMSS'] }),
  c('Laborales', 'fecha_ingreso', 'Fecha Ingreso', { tipo: 'fecha', alias: ['Fecha de ingreso', 'Ingreso', 'F. ingreso'] }),
  c('Laborales', 'fecha_renovacion', 'Fecha de renovación', { tipo: 'fecha', alias: ['Renovacion', 'Fecha renovacion contrato'] }),
  c('Laborales', 'tipo_contrato', 'Tipo Contrato', { alias: ['Tipo de contrato', 'Contrato'] }),
  c('Laborales', 'celular_corporativo', 'Celular corporativo', { alias: ['Telefono corporativo', 'Celular empresa'] }),
  c('Laborales', 'infonavit', 'Infonavit', { alias: ['Credito Infonavit', 'Numero infonavit'] }),
  c('Laborales', 'fonacot', 'Fonacot', { alias: ['Credito Fonacot', 'Numero fonacot'] }),
  c('Laborales', 'puesto', 'Puesto', { alias: ['Puesto de trabajo'] }),
  c('Laborales', 'departamento', 'Departamento', { alias: ['Depto.', 'Depto'] }),
  c('Laborales', 'ubicacion', 'Ubicación', { alias: ['Sucursal', 'Planta'] }),
  c('Laborales', 'jefe_nomina', 'Jefe (número de nómina)', { alias: ['Jefe nomina', 'Nomina del jefe', 'Numero de nomina del jefe', 'Jefe inmediato (nomina)'] }),
  c('Laborales', 'jefe_curp', 'Jefe (CURP)', { alias: ['Jefe curp', 'CURP del jefe', 'Jefe inmediato (CURP)'] }),
  // Financieros
  c('Financieros', 'banco', 'Banco'),
  c('Financieros', 'clabe', 'CLABE', { alias: ['CLABE interbancaria', 'Cuenta CLABE'] }),
  c('Financieros', 'cp_fiscal', 'CP fiscal', { alias: ['C.P. fiscal', 'Codigo postal fiscal'] }),
  // Control
  c('Control', 'estatus', 'Estatus', { alias: ['Status', 'Situacion'] }),
  c('Control', 'fecha_baja', 'Fecha de baja', { tipo: 'fecha', alias: ['Baja'] }),
  c('Control', 'motivo_baja', 'Motivo de baja', { alias: ['Motivo baja'] }),
];

// Las dos filas de ejemplo son FICTICIAS. La segunda fila apunta a la primera como jefe (mismo archivo).
export const FILAS_EJEMPLO_EMPLEADOS = [
  {
    nombre: 'Ana', apellido_paterno: 'Prueba', apellido_materno: 'Ejemplo', fecha_nacimiento: '1990-01-31',
    curp: 'PEEA900131MDFRJN01', rfc: 'PEEA900131AB1', nss: '01234567890', genero: 'Femenino', estado_civil: 'Casado',
    escolaridad: 'Licenciatura', estado_nacimiento: 'Jalisco',
    celular_personal: '5512345678', correo_personal: 'ana.prueba@ejemplo.com', telefono_emergencia: '5587654321',
    parentesco_emergencia: 'Hermano', contacto_emergencia: 'Luis Prueba',
    calle: 'Calle Falsa 123', colonia: 'Centro', codigo_postal: '06000', municipio: 'Cuauhtémoc', estado_residencia: 'Ciudad de México',
    numero_nomina: 'NOM-9001', fecha_imss: '2024-01-15', fecha_ingreso: '2024-01-15', fecha_renovacion: '2025-01-15',
    tipo_contrato: 'Indeterminado', celular_corporativo: '5511112222', infonavit: '', fonacot: '',
    puesto: 'Analista', departamento: 'Sistemas', ubicacion: 'Matriz', jefe_nomina: '', jefe_curp: '',
    banco: 'BBVA México', clabe: '012345678901234567', cp_fiscal: '06000',
    estatus: 'activo', fecha_baja: '', motivo_baja: '',
  },
  {
    nombre: 'Luis', apellido_paterno: 'Muestra', apellido_materno: 'Ficticio', fecha_nacimiento: '1985-12-05',
    curp: 'MUFL851205HDFSCS02', rfc: 'MUFL851205CD2', nss: '09876543210', genero: 'Masculino', estado_civil: 'Soltero',
    escolaridad: 'Preparatoria / Bachillerato', estado_nacimiento: 'México',
    celular_personal: '5598765432', correo_personal: 'luis.muestra@ejemplo.com', telefono_emergencia: '5512341234',
    parentesco_emergencia: 'Madre', contacto_emergencia: 'Rosa Ficticio',
    calle: 'Avenida Inventada 45', colonia: 'Norte', codigo_postal: '01234', municipio: 'Álvaro Obregón', estado_residencia: 'Ciudad de México',
    numero_nomina: 'NOM-9002', fecha_imss: '2023-06-01', fecha_ingreso: '2023-06-01', fecha_renovacion: '',
    tipo_contrato: 'Determinado', celular_corporativo: '', infonavit: '', fonacot: '',
    puesto: 'Auxiliar', departamento: 'Sistemas', ubicacion: 'Matriz', jefe_nomina: 'NOM-9001', jefe_curp: '',
    banco: 'Banorte', clabe: '072345678901234568', cp_fiscal: '01234',
    estatus: 'activo', fecha_baja: '', motivo_baja: '',
  },
];

export const INSTRUCCIONES_EMPLEADOS = [
  ['Carga masiva de empleados'],
  [''],
  ['Obligatorio'],
  ['Solo Nombre y Apellido Paterno son obligatorios. Una fila sin ellos no se importa.'],
  [''],
  ['Encabezados'],
  ['Deja los encabezados de la hoja "Empleados" en la fila 1. Se reconocen sin importar acentos, mayúsculas, espacios o puntos (por ejemplo "No. Nómina" o "Numero de Nomina"). Puedes quitar o reordenar columnas; las columnas desconocidas se ignoran y la vista previa te las muestra.'],
  [''],
  ['Fechas'],
  ['Escribe las fechas como AAAA-MM-DD (2024-01-31) o DD/MM/AAAA (31/01/2024, día primero). También sirven las celdas con formato de fecha de Excel. Una fecha inválida omite la fila completa. Columnas de fecha: Fecha Nacimiento, Fecha de alta IMSS, Fecha Ingreso, Fecha de renovación y Fecha de baja.'],
  [''],
  ['Ceros a la izquierda'],
  ['NSS, código postal, CP fiscal, número de nómina, CLABE y teléfonos deben capturarse como TEXTO (formato de celda "Texto" antes de escribir); si no, Excel quita los ceros iniciales o cambia el número a notación científica. La plantilla ya trae esas columnas en formato texto. Si el NSS llega con 10 dígitos se completa con un 0 a la izquierda y se avisa; el código postal de 4 dígitos se completa a 5.'],
  [''],
  ['Formatos'],
  ['CURP: 18 caracteres. RFC: 12 o 13. NSS: 11 dígitos. CLABE: 18 dígitos. Teléfonos: 10 dígitos (se quitan espacios, guiones, paréntesis y el +52 inicial). Código postal y CP fiscal: 5 dígitos.'],
  ['Un valor inválido en un campo OPCIONAL no rechaza la fila: la fila se importa sin ese campo y el resultado muestra una advertencia con la fila, el campo y el motivo.'],
  [''],
  ['Valores permitidos'],
  ['Género, Estado Civil, Escolaridad, Tipo Contrato, Estatus, Estado de nacimiento, Estado de residencia y Banco deben ser de la hoja "Catálogos" (se ignoran acentos y mayúsculas y se guarda el nombre oficial). Estatus: activo, baja o suspendido (por omisión, activo).'],
  ['Puesto, Departamento y Ubicación se buscan por nombre en los catálogos vigentes (hoja "Catálogos"). Si el nombre no existe, el empleado se importa sin ese dato y el resultado lo avisa.'],
  [''],
  ['Jefe inmediato'],
  ['Indica al jefe con "Jefe (número de nómina)" o "Jefe (CURP)". El jefe puede estar en el mismo archivo (incluso más abajo) o ya existir. Al final de la importación se asignan todos los jefes; se avisa de jefes no encontrados, de un empleado que sería su propio jefe y de ciclos (A jefe de B y B jefe de A) y esos casos no se asignan.'],
  [''],
  ['Qué hacer con los empleados que ya existen'],
  ['"Omitirlos" (por omisión): una fila cuya CURP o número de nómina ya existe se cuenta como duplicada y no se toca.'],
  ['"Actualizarlos con los datos del archivo": el empleado se busca por CURP y, si la fila no trae CURP, por número de nómina. Solo las celdas CON valor sobrescriben; una celda vacía NUNCA borra datos. La CURP y el número de nómina se pueden completar si el empleado no los tiene; si ya tiene otro valor distinto, o si la CURP es de un empleado y la nómina de otro, la fila se reporta como error y no se modifica. Nunca se cambia la cuenta de usuario del empleado.'],
  [''],
  ['Límites'],
  ['El archivo se envía en lotes de 100 filas. No cubre hijos, documentos del expediente ni cuentas de usuario.'],
  ['Las dos filas de ejemplo de la hoja "Empleados" son ficticias: bórralas antes de cargar tu archivo.'],
];

// Nombres de la hoja "Catálogos": una columna por catálogo.
export function hojaCatalogos({ puestos, departamentos, ubicaciones }) {
  const nombres = (lista) => (lista || []).map((x) => (x && typeof x === 'object' ? x.nombre : x)).filter(Boolean);
  const columnas = [
    ['Puestos', nombres(puestos)],
    ['Departamentos', nombres(departamentos)],
    ['Ubicaciones', nombres(ubicaciones)],
    ['Género', GENEROS],
    ['Estado Civil', ESTADOS_CIVILES],
    ['Escolaridad', NIVELES_ESCOLARIDAD],
    ['Tipo Contrato', TIPOS_CONTRATO],
    ['Estatus', ESTATUS_IMPORTACION],
    ['Estados', ESTADOS_MEXICO],
    ['Bancos', BANCOS_MEXICO],
  ];
  const alto = Math.max(...columnas.map((col) => col[1].length));
  const filas = [columnas.map((col) => col[0])];
  for (let i = 0; i < alto; i++) filas.push(columnas.map((col) => (i < col[1].length ? col[1][i] : '')));
  return filas;
}

export function filaDeObjeto(obj) {
  return COLUMNAS_EMPLEADOS.map((col) => {
    const v = obj[col.clave];
    return v === null || v === undefined ? '' : String(v);
  });
}

// Hojas de la plantilla (arreglos de arreglos): Empleados (encabezados + 2 ejemplos), Instrucciones y Catálogos.
export function hojasPlantillaEmpleados(catalogos) {
  return {
    Empleados: [COLUMNAS_EMPLEADOS.map((col) => col.etiqueta), ...FILAS_EJEMPLO_EMPLEADOS.map(filaDeObjeto)],
    Instrucciones: INSTRUCCIONES_EMPLEADOS,
    'Catálogos': hojaCatalogos(catalogos || {}),
  };
}

// Empleados actuales (respuesta de GET /empleados, con todas las páginas) en el mismo formato de la plantilla, para
// corregirlos y reimportarlos en modo actualizar. El jefe se expresa por número de nómina (o CURP si no tiene nómina).
export function hojaEmpleadosActuales(empleados) {
  const porId = new Map((empleados || []).map((e) => [e.id, e]));
  const fecha = (v) => (v ? String(v).slice(0, 10) : '');
  const filas = (empleados || []).map((e) => {
    const jefe = e.jefe_inmediato_id ? porId.get(e.jefe_inmediato_id) : null;
    const obj = { ...e };
    COLUMNAS_EMPLEADOS.forEach((col) => { if (col.tipo === 'fecha') obj[col.clave] = fecha(e[col.clave]); });
    obj.jefe_nomina = jefe && jefe.numero_nomina ? jefe.numero_nomina : '';
    obj.jefe_curp = jefe && !jefe.numero_nomina && jefe.curp ? jefe.curp : '';
    return filaDeObjeto(obj);
  });
  return { Empleados: [COLUMNAS_EMPLEADOS.map((col) => col.etiqueta), ...filas] };
}
