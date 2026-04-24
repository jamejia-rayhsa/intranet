const { grupo } = require("../config/database");

const Usuario = {
  async crear(datos) {
    const {
      correo,
      nombre,
      apellido,
      auth_tipo = "local",
      external_id,
      hash_password,
    } = datos;
    const consulta = `
      INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, external_id, hash_password)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, correo, nombre, apellido, auth_tipo, activo, fecha_creacion
    `;
    const valores = [
      correo,
      nombre,
      apellido,
      auth_tipo,
      external_id || null,
      hash_password || null,
    ];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async buscarPorCorreo(correo) {
    const consulta = "SELECT * FROM usuarios WHERE correo = $1";
    const resultado = await grupo.query(consulta, [correo]);
    return resultado.rows[0];
  },

  async buscarPorId(id) {
    const consulta =
      "SELECT id, correo, nombre, apellido, auth_tipo, activo, requiere_cambio_password, hash_password, fecha_creacion FROM usuarios WHERE id = $1";
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async actualizar(id, datos) {
    const campos = [];
    const valores = [];
    let contador = 1;

    if (datos.nombre !== undefined) {
      campos.push(`nombre = $${contador}`);
      valores.push(datos.nombre);
      contador++;
    }
    if (datos.apellido !== undefined) {
      campos.push(`apellido = $${contador}`);
      valores.push(datos.apellido);
      contador++;
    }
    if (datos.activo !== undefined) {
      campos.push(`activo = $${contador}`);
      valores.push(datos.activo);
      contador++;
    }
    if (datos.hash_password) {
      campos.push(`hash_password = $${contador}`);
      valores.push(datos.hash_password);
      contador++;
    }
    if (datos.requiere_cambio_password !== undefined) {
      campos.push(`requiere_cambio_password = $${contador}`);
      valores.push(datos.requiere_cambio_password);
      contador++;
    }

    valores.push(id);

    const consulta = `UPDATE usuarios SET ${campos.join(", ")} WHERE id = $${contador} RETURNING id, correo, nombre, apellido, auth_tipo, activo, fecha_creacion`;
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async listar(pagina = 1, limite = 20) {
    const desplazamiento = (pagina - 1) * limite;
    const consulta = `
      SELECT id, correo, nombre, apellido, auth_tipo, activo, fecha_creacion
      FROM usuarios
      ORDER BY fecha_creacion DESC
      LIMIT $1 OFFSET $2
    `;
    const resultado = await grupo.query(consulta, [limite, desplazamiento]);
    return resultado.rows;
  },

  async contar() {
    const resultado = await grupo.query("SELECT COUNT(*) FROM usuarios");
    return parseInt(resultado.rows[0].count);
  },

  async obtenerTodos() {
    const consulta = `
      SELECT u.id, u.correo, u.nombre, u.apellido, u.auth_tipo, u.activo, u.fecha_creacion,
        json_agg(json_build_object('id', r.id, 'nombre', r.nombre)) FILTER (WHERE r.id IS NOT NULL) as roles
      FROM usuarios u
      LEFT JOIN usuario_rol ur ON u.id = ur.usuario_id
      LEFT JOIN roles r ON ur.rol_id = r.id
      GROUP BY u.id
      ORDER BY u.fecha_creacion DESC
    `;
    const resultado = await grupo.query(consulta);
    return resultado.rows;
  },

  async eliminar(id) {
    const client = await grupo.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM usuario_rol WHERE usuario_id = $1", [id]);
      const resultado = await client.query(
        "DELETE FROM usuarios WHERE id = $1 RETURNING id, correo, nombre, apellido",
        [id],
      );
      await client.query("COMMIT");
      return resultado.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};

module.exports = Usuario;
