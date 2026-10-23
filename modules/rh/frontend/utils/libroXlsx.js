// Descarga de un libro .xlsx simple a partir de hojas { nombre: arreglo de arreglos } (SheetJS, ya dependencia del frontend).
import * as XLSX from 'xlsx';

export function descargarLibro(nombreArchivo, hojas, anchos) {
  const libro = XLSX.utils.book_new();
  Object.keys(hojas).forEach((nombre) => {
    const hoja = XLSX.utils.aoa_to_sheet(hojas[nombre]);
    if (anchos && anchos[nombre]) hoja['!cols'] = anchos[nombre].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  });
  XLSX.writeFile(libro, nombreArchivo, { bookType: 'xlsx' });
}
