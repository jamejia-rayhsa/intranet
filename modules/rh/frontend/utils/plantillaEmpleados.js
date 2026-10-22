// Descarga de la plantilla .xlsx (hojas Empleados, Instrucciones y Catálogos) y de los empleados actuales en el
// mismo formato. Usa SheetJS, que ya es dependencia del frontend. Las hojas salen de importacionEmpleados.js.

import * as XLSX from 'xlsx';
import { COLUMNAS_EMPLEADOS, hojasPlantillaEmpleados, hojaEmpleadosActuales } from '../constants/importacionEmpleados';

// Columnas que Excel suele dañar si se capturan como número (ceros a la izquierda, notación científica).
const CLAVES_TEXTO = [
  'curp', 'rfc', 'nss', 'numero_nomina', 'codigo_postal', 'cp_fiscal', 'clabe', 'celular_personal',
  'telefono_emergencia', 'celular_corporativo', 'infonavit', 'fonacot', 'jefe_nomina', 'jefe_curp',
];
const FILAS_CON_FORMATO_TEXTO = 1000;

function hojaDesdeMatriz(matriz, { formatoTexto, anchos } = {}) {
  const hoja = XLSX.utils.aoa_to_sheet(matriz);
  if (anchos) hoja['!cols'] = anchos.map((wch) => ({ wch }));
  if (formatoTexto) {
    // Celdas vacías con formato Texto ("@") para que lo que se escriba después conserve sus ceros.
    COLUMNAS_EMPLEADOS.forEach((col, indice) => {
      if (!CLAVES_TEXTO.includes(col.clave)) return;
      for (let fila = matriz.length; fila < FILAS_CON_FORMATO_TEXTO; fila++) {
        hoja[XLSX.utils.encode_cell({ r: fila, c: indice })] = { t: 's', v: '', z: '@' };
      }
    });
    const rango = XLSX.utils.decode_range(hoja['!ref']);
    rango.e.r = Math.max(rango.e.r, FILAS_CON_FORMATO_TEXTO - 1);
    hoja['!ref'] = XLSX.utils.encode_range(rango);
  }
  return hoja;
}

function anchosEmpleados() {
  return COLUMNAS_EMPLEADOS.map((col) => Math.max(14, col.etiqueta.length + 3));
}

function descargar(libro, nombreArchivo) {
  XLSX.writeFile(libro, nombreArchivo, { bookType: 'xlsx' });
}

export function construirLibroPlantilla(catalogos) {
  const hojas = hojasPlantillaEmpleados(catalogos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaDesdeMatriz(hojas.Empleados, { formatoTexto: true, anchos: anchosEmpleados() }), 'Empleados');
  XLSX.utils.book_append_sheet(libro, hojaDesdeMatriz(hojas.Instrucciones, { anchos: [140] }), 'Instrucciones');
  XLSX.utils.book_append_sheet(libro, hojaDesdeMatriz(hojas['Catálogos'], { anchos: Array(10).fill(30) }), 'Catálogos');
  return libro;
}

export function descargarPlantillaEmpleados(catalogos) {
  descargar(construirLibroPlantilla(catalogos), 'plantilla_empleados.xlsx');
}

export function descargarEmpleadosActuales(empleados) {
  const hojas = hojaEmpleadosActuales(empleados);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaDesdeMatriz(hojas.Empleados, { anchos: anchosEmpleados() }), 'Empleados');
  descargar(libro, 'empleados_actuales.xlsx');
}
