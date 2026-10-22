const { grupo } = require("../config/database");
const { textoSeguro, numeroFila, MAX_DUPLICADOS_DETALLE } = require("../utils/importarEmpleados");

const Area = {
  async crear(datos) {
    return (await grupo.query(
      "INSERT INTO areas (nombre, descripcion) VALUES ($1, $2) RETURNING *",
      [datos.nombre, datos.descripcion || null]
    )).rows[0];
  },

  async obtenerTodos() {
    return (await grupo.query("SELECT * FROM areas WHERE activo = true ORDER BY nombre")).rows;
  },

  async actualizar(id, datos) {
    const campos = [];
    const valores = [];
    let c = 1;
    if (datos.nombre !== undefined)      { campos.push(`nombre = $${c}`);      valores.push(datos.nombre);      c++; }
    if (datos.descripcion !== undefined) { campos.push(`descripcion = $${c}`); valores.push(datos.descripcion); c++; }
    if (datos.activo !== undefined)      { campos.push(`activo = $${c}`);      valores.push(datos.activo);      c++; }
    valores.push(id);
    return (await grupo.query(
      `UPDATE areas SET ${campos.join(", ")} WHERE id = $${c} RETURNING *`,
      valores
    )).rows[0];
  },

  async eliminar(id) {
    return (await grupo.query("DELETE FROM areas WHERE id = $1 RETURNING *", [id])).rows[0];
  },

  async importarLote(filas) {
    const existentes = new Set(
      (await grupo.query("SELECT LOWER(nombre) AS nombre FROM areas")).rows.map(r => r.nombre)
    );

    let insertados = 0;
    let duplicados = 0;
    const errores = [];
    const duplicadosDetalle = [];

    for (const fila of filas) {
      const nombre = textoSeguro(fila && fila.nombre);
      if (!nombre) { errores.push({ fila: numeroFila(fila), nombre: '', error: "El campo nombre es requerido" }); continue; }
      if (existentes.has(nombre.toLowerCase())) {
        duplicados++;
        if (duplicadosDetalle.length < MAX_DUPLICADOS_DETALLE) duplicadosDetalle.push({ fila: numeroFila(fila), nombre, motivo: 'Nombre ya existe' });
        continue;
      }
      try {
        await grupo.query(
          "INSERT INTO areas (nombre, descripcion) VALUES ($1, $2)",
          [nombre, textoSeguro(fila.descripcion) || null]
        );
        insertados++;
        existentes.add(nombre.toLowerCase());
      } catch (e) {
        console.error("[areas] importar fila", numeroFila(fila), e);
        errores.push({ fila: numeroFila(fila), nombre, error: "No se pudo insertar la fila" });
      }
    }

    return { insertados, duplicados, duplicados_detalle: duplicadosDetalle, errores };
  },
};

module.exports = Area;
