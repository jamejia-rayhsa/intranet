const { grupo } = require("../config/database");

const Departamento = {
  async crear(datos) {
    const consulta = `INSERT INTO departamentos (nombre, descripcion) VALUES ($1, $2) RETURNING *`;
    return (
      await grupo.query(consulta, [datos.nombre, datos.descripcion || null])
    ).rows[0];
  },

  async obtenerTodos() {
    return (await grupo.query(`
      SELECT d.*, a.nombre AS area_nombre
      FROM departamentos d
      LEFT JOIN areas a ON d.area_id = a.id
      ORDER BY d.nombre
    `)).rows;
  },

  async actualizar(id, datos) {
    const campos = [];
    const valores = [];
    let c = 1;
    if (datos.nombre !== undefined) {
      campos.push(`nombre = $${c}`);
      valores.push(datos.nombre);
      c++;
    }
    if (datos.descripcion !== undefined) {
      campos.push(`descripcion = $${c}`);
      valores.push(datos.descripcion);
      c++;
    }
    if (datos.area_id !== undefined) {
      campos.push(`area_id = $${c}`);
      valores.push(datos.area_id || null);
      c++;
    }
    if (datos.activo !== undefined) {
      campos.push(`activo = $${c}`);
      valores.push(datos.activo);
      c++;
    }
    valores.push(id);
    const consulta = `UPDATE departamentos SET ${campos.join(", ")} WHERE id = $${c} RETURNING *`;
    return (await grupo.query(consulta, valores)).rows[0];
  },

  async eliminar(id) {
    return (
      await grupo.query("DELETE FROM departamentos WHERE id = $1 RETURNING *", [
        id,
      ])
    ).rows[0];
  },

  async importarLote(filas, mapaAreas = {}) {
    const existentes = new Set(
      (await grupo.query("SELECT LOWER(nombre) AS nombre FROM departamentos")).rows.map(r => r.nombre)
    );

    let insertados = 0;
    let duplicados = 0;
    const errores = [];

    for (const fila of filas) {
      if (!fila.nombre) { errores.push({ fila, error: "El campo nombre es requerido" }); continue; }
      if (existentes.has(fila.nombre.toLowerCase())) { duplicados++; continue; }
      const areaId = fila.area ? (mapaAreas[fila.area.toLowerCase()] || null) : null;
      try {
        await grupo.query(
          "INSERT INTO departamentos (nombre, descripcion, area_id) VALUES ($1, $2, $3)",
          [fila.nombre, fila.descripcion || null, areaId]
        );
        insertados++;
        existentes.add(fila.nombre.toLowerCase());
      } catch (e) {
        errores.push({ fila, error: e.message });
      }
    }

    return { insertados, duplicados, errores };
  },
};

module.exports = Departamento;
