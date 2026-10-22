const { grupo } = require("../config/database");
const { textoSeguro, numeroFila, MAX_DUPLICADOS_DETALLE } = require("../utils/importarEmpleados");

const Departamento = {
  async crear(datos) {
    if (datos.cupo_vacaciones !== undefined) {
      return (
        await grupo.query(
          `INSERT INTO departamentos (nombre, descripcion, cupo_vacaciones) VALUES ($1, $2, $3) RETURNING *`,
          [datos.nombre, datos.descripcion || null, datos.cupo_vacaciones]
        )
      ).rows[0];
    }
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
    if (datos.cupo_vacaciones !== undefined) {
      campos.push(`cupo_vacaciones = $${c}`);
      valores.push(datos.cupo_vacaciones);
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
    const duplicadosDetalle = [];

    for (const fila of filas) {
      const nombre = textoSeguro(fila && fila.nombre);
      if (!nombre) { errores.push({ fila: numeroFila(fila), nombre: '', error: "El campo nombre es requerido" }); continue; }
      if (existentes.has(nombre.toLowerCase())) {
        duplicados++;
        if (duplicadosDetalle.length < MAX_DUPLICADOS_DETALLE) duplicadosDetalle.push({ fila: numeroFila(fila), nombre, motivo: 'Nombre ya existe' });
        continue;
      }
      const area = textoSeguro(fila.area);
      const areaId = area ? (mapaAreas[area.toLowerCase()] || null) : null;
      try {
        await grupo.query(
          "INSERT INTO departamentos (nombre, descripcion, area_id) VALUES ($1, $2, $3)",
          [nombre, textoSeguro(fila.descripcion) || null, areaId]
        );
        insertados++;
        existentes.add(nombre.toLowerCase());
      } catch (e) {
        console.error("[departamentos] importar", e);
        errores.push({ fila: numeroFila(fila), nombre, error: "No se pudo insertar la fila" });
      }
    }

    return { insertados, duplicados, duplicados_detalle: duplicadosDetalle, errores };
  },
};

module.exports = Departamento;
