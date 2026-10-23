// Hoja de SheetJS -> matriz de celdas crudas (la primera fila es el encabezado). A diferencia de sheet_to_json:
//  - una celda NUMÉRICA con formato de fecha de Excel se entrega como { serialExcel: n } (serial exacto): se lee con
//    cellDates:false para no pasar por objetos Date con la zona horaria local (fechas de 1939-1950 se desplazaban un día);
//  - el resto sale como el valor crudo de la celda ('' si no existe).
// Recibe XLSX por parámetro para poder probarse con la librería de Node (modules/rh/tests/importarFechasExcel.test.js).

export function hojaAMatriz(XLSX, ws) {
  if (!ws || !ws['!ref']) return [];
  const rango = XLSX.utils.decode_range(ws['!ref']);
  const matriz = [];
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const fila = [];
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r: r, c: c })];
      if (!celda) { fila.push(''); continue; }
      if (celda.t === 'n' && typeof celda.v === 'number' && celda.z && XLSX.SSF.is_date(celda.z)) fila.push({ serialExcel: celda.v });
      else fila.push(celda.v === undefined || celda.v === null ? '' : celda.v);
    }
    matriz.push(fila);
  }
  return matriz;
}
