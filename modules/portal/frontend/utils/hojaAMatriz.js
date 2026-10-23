// Hoja de SheetJS -> matriz de celdas crudas (la primera fila es el encabezado). A diferencia de sheet_to_json:
//  - una celda NUMÉRICA con formato de fecha de Excel se entrega como { serialExcel: n } (serial exacto): se lee con
//    cellDates:false para no pasar por objetos Date con la zona horaria local (fechas de 1939-1950 se desplazaban un día);
//  - con el sistema de fechas 1904 del libro (tercer argumento) el serial se corrige a la época 1900;
//  - el resto sale como el valor crudo de la celda ('' si no existe).
// Recibe XLSX por parámetro para poder probarse con la librería de Node (modules/rh/tests/importarFechasExcel.test.js).

// date1904: el libro usa el sistema de fechas 1904 (wb.Workbook.WBProps.date1904): su serial 0 es 1904-01-01, 1462 días después
// del sistema 1900, así que se suma 1462 para convertir con la época correcta.
export const DIAS_ENTRE_SISTEMAS_1900_Y_1904 = 1462;

export function libroEs1904(wb) {
  return !!(wb && wb.Workbook && wb.Workbook.WBProps && (wb.Workbook.WBProps.date1904 === true || wb.Workbook.WBProps.date1904 === 1 || wb.Workbook.WBProps.date1904 === '1' || wb.Workbook.WBProps.date1904 === 'true'));
}

export function hojaAMatriz(XLSX, ws, date1904) {
  if (!ws || !ws['!ref']) return [];
  const rango = XLSX.utils.decode_range(ws['!ref']);
  const matriz = [];
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const fila = [];
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r: r, c: c })];
      if (!celda) { fila.push(''); continue; }
      if (celda.t === 'n' && typeof celda.v === 'number' && celda.z && XLSX.SSF.is_date(celda.z)) fila.push({ serialExcel: date1904 ? celda.v + DIAS_ENTRE_SISTEMAS_1900_Y_1904 : celda.v });
      else fila.push(celda.v === undefined || celda.v === null ? '' : celda.v);
    }
    matriz.push(fila);
  }
  return matriz;
}
