const { grupo } = require("../config/database");

const Ubicacion = {
  async crear(datos) {
    const consulta = `
      INSERT INTO ubicaciones (nombre, direccion, ciudad, estado, codigo_postal, telefono, prefijo)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `;
    return (
      await grupo.query(consulta, [
        datos.nombre,
        datos.direccion || null,
        datos.ciudad || null,
        datos.estado || null,
        datos.codigo_postal || null,
        datos.telefono || null,
        datos.prefijo || null,
      ])
    ).rows[0];
  },

  async obtenerTodos() {
    return (await grupo.query("SELECT * FROM ubicaciones ORDER BY nombre"))
      .rows;
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
    if (datos.direccion !== undefined) {
      campos.push(`direccion = $${c}`);
      valores.push(datos.direccion);
      c++;
    }
    if (datos.ciudad !== undefined) {
      campos.push(`ciudad = $${c}`);
      valores.push(datos.ciudad);
      c++;
    }
    if (datos.estado !== undefined) {
      campos.push(`estado = $${c}`);
      valores.push(datos.estado);
      c++;
    }
    if (datos.codigo_postal !== undefined) {
      campos.push(`codigo_postal = $${c}`);
      valores.push(datos.codigo_postal);
      c++;
    }
    if (datos.telefono !== undefined) {
      campos.push(`telefono = $${c}`);
      valores.push(datos.telefono);
      c++;
    }
    if (datos.prefijo !== undefined) {
      campos.push(`prefijo = $${c}`);
      valores.push(datos.prefijo);
      c++;
    }
    if (datos.activo !== undefined) {
      campos.push(`activo = $${c}`);
      valores.push(datos.activo);
      c++;
    }
    valores.push(id);
    const consulta = `UPDATE ubicaciones SET ${campos.join(", ")} WHERE id = $${c} RETURNING *`;
    return (await grupo.query(consulta, valores)).rows[0];
  },

  async siguienteFolio(id) {
    const fila = (await grupo.query(
      "UPDATE ubicaciones SET ultimo_folio = ultimo_folio + 1 WHERE id = $1 RETURNING prefijo, ultimo_folio",
      [id]
    )).rows[0];
    if (!fila) return null;
    const num = String(fila.ultimo_folio).padStart(3, "0");
    return `${fila.prefijo || id}-${num}`;
  },

  async previsualizarFolio(id) {
    const fila = (await grupo.query(
      "SELECT prefijo, ultimo_folio + 1 AS siguiente FROM ubicaciones WHERE id = $1",
      [id]
    )).rows[0];
    if (!fila) return null;
    const num = String(fila.siguiente).padStart(3, "0");
    return `${fila.prefijo || id}-${num}`;
  },

  async eliminar(id) {
    return (
      await grupo.query("DELETE FROM ubicaciones WHERE id = $1 RETURNING *", [
        id,
      ])
    ).rows[0];
  },
};

module.exports = Ubicacion;
