// Lógica pura de la pantalla "Importar usuarios" (sin imports: los tests evalúan el fuente). Todos los datos de ejemplo
// son ficticios.

export const MAX_FILAS_USUARIOS = 200;
export const MAX_BYTES_ARCHIVO_USUARIOS = 1024 * 1024; // 1 MB
export const DOMINIO_USUARIOS = '@rayhsa.com.mx';
export const ROL_USUARIOS_IMPORTADOS = 'rh_empleado';
export const NOMBRE_PLANTILLA_USUARIOS = 'plantilla_usuarios.csv';

// Columnas del archivo. Sin columna de rol: toda cuenta importada es rh_empleado. El identificador del empleado es la nómina
// O la CURP (al menos una): la regla la aplica el servidor en la vista previa.
export const COLUMNAS_USUARIOS = [
  { clave: 'correo', etiqueta: 'Correo corporativo', requerido: true, alias: ['correo', 'email'] },
  { clave: 'nombre', etiqueta: 'Nombre', requerido: true },
  { clave: 'apellido', etiqueta: 'Apellido', requerido: true, alias: ['apellidos'] },
  { clave: 'numero_nomina', etiqueta: 'Número de nómina', requerido: false, alias: ['nomina', 'No. nómina'] },
  { clave: 'curp', etiqueta: 'CURP', requerido: false },
];

export const FILAS_EJEMPLO_USUARIOS = [
  { correo: 'ana.prueba@rayhsa.com.mx', nombre: 'Ana', apellido: 'Prueba Ejemplo', numero_nomina: '90001', curp: '' },
  { correo: 'luis.ficticio@rayhsa.com.mx', nombre: 'Luis', apellido: 'Ficticio Demo', numero_nomina: '', curp: 'XXXX000101HDFXXX00' },
];

export const ETIQUETAS_RESULTADO_USUARIOS = {
  insertados: 'Cuentas creadas',
  duplicados: 'Omitidas (ya existen)',
  contrasteAlto: true,
  interrupcion: 'Vuelve a importar el mismo archivo: las cuentas ya creadas se omiten y una fila "por verificar" se completa (se consulta Supabase Auth y, si la cuenta se creó en una importación, se adopta).',
};

export const AVISO_IMPORTACION_USUARIOS =
  `Cada fila crea una cuenta de inicio de sesión con Microsoft (sin contraseña) con el rol ${ROL_USUARIOS_IMPORTADOS} y la vincula al empleado indicado. ` +
  'Esa vinculación da a la persona su asistencia, expediente, recibos de nómina y, si es jefe, la aprobación de vacaciones de su equipo. ' +
  `Solo se aceptan correos ${DOMINIO_USUARIOS}; si el correo ya tiene cuenta, la fila se omite sin modificar nada.`;

// Solo super_admin ve y usa la acción (el servidor lo exige igual).
// El perfil de /auth/perfil trae `roles: ['super_admin']` (sin rol_nombre); se aceptan ambas formas.
export function puedeImportarUsuarios(usuario) {
  if (!usuario) return false;
  return usuario.rol_nombre === 'super_admin' || (Array.isArray(usuario.roles) && usuario.roles.includes('super_admin'));
}

export const ETIQUETAS_ESTADO_USUARIOS = { crear: 'Se creará', omitir: 'Se omitirá', error: 'Error' };
export const TIPO_CHIP_ESTADO_USUARIOS = { crear: 'ok', omitir: 'warn', error: 'err' };

// Resumen de la vista previa del servidor: { total, crear, omitir, error } a partir de las filas (no se fía del contador del servidor).
export function resumirVerificacion(filas) {
  const r = { total: 0, crear: 0, omitir: 0, error: 0 };
  (Array.isArray(filas) ? filas : []).forEach((f) => {
    r.total++;
    if (f && (f.estado === 'crear' || f.estado === 'omitir')) r[f.estado]++;
    else r.error++;
  });
  return r;
}

// Detalle de una fila de la vista previa: motivo, o el empleado que se vinculará, más los avisos.
export function detalleFilaVerificacion(f) {
  const partes = [];
  if (f.motivo) partes.push(f.motivo);
  else if (f.estado === 'crear' && f.empleado && f.empleado.nombre) partes.push(`Se vinculará con ${f.empleado.nombre}`);
  (Array.isArray(f.avisos) ? f.avisos : []).forEach((a) => partes.push(`Aviso: ${a}`));
  return partes.join(' · ');
}

export function textoBotonAplicar(resumen) {
  if (!resumen || resumen.crear === 0) return 'No hay cuentas por crear';
  return `Crear ${resumen.crear} ${resumen.crear === 1 ? 'cuenta' : 'cuentas'}`;
}

// Cuerpo de la vista previa y de la aplicación: solo las claves de las columnas (sin campos internos como __errores). `huellas`
// (Map fila -> huella de la vista previa del servidor) se adjunta como `_huella`: el servidor la exige para aplicar la fila.
export function filasParaServidor(filas, huellas) {
  const claves = COLUMNAS_USUARIOS.map((c) => c.clave);
  return (Array.isArray(filas) ? filas : []).map((f) => {
    const limpia = { _fila: f._fila };
    claves.forEach((k) => { if (f[k] !== undefined && f[k] !== '') limpia[k] = f[k]; });
    if (Array.isArray(f._precision) && f._precision.length) limpia._precision = f._precision;
    const h = huellas && typeof huellas.get === 'function' ? huellas.get(f._fila) : undefined;
    if (typeof h === 'string' && h) limpia._huella = h;
    return limpia;
  });
}

// Map fila -> huella a partir de la respuesta de la vista previa
export function huellasDeVerificacion(datos) {
  const mapa = new Map();
  (datos && Array.isArray(datos.filas) ? datos.filas : []).forEach((f) => { if (f && typeof f.huella === 'string' && f.huella) mapa.set(f.fila, f.huella); });
  return mapa;
}
