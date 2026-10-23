// Descripción de un error SQL para el log del servidor SIN datos de la fila: el mensaje y el `detail` de PostgreSQL
// pueden traer los valores ("invalid input syntax ... \"1990-02-30\"", "Key (curp)=(...)"). Solo el SQLSTATE y los
// nombres de columna/constraint/tabla (objetos del esquema, no datos).
function describirErrorSql(error) {
  if (!error) return "error desconocido";
  const partes = [`tipo=${error.name || "Error"}`, `código=${error.code || "sin código"}`];
  if (error.constraint) partes.push(`constraint=${error.constraint}`);
  if (error.column) partes.push(`columna=${error.column}`);
  if (error.table) partes.push(`tabla=${error.table}`);
  return partes.join(" ");
}

module.exports = { describirErrorSql };
