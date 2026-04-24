const { Pool } = require("pg");

const grupo = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || "intranet_dev",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "dev_password_123",
});

const Auditoria = {
  async crear(datos) {
    const {
      usuario_id,
      modulo,
      tabla,
      registro_id,
      accion,
      valores_previos,
      valores_nuevos,
      ip_origen,
      user_agent,
    } = datos;

    const consulta = `
      INSERT INTO auditoria (
        usuario_id, modulo, tabla, registro_id, accion,
        valores_previos, valores_nuevos, ip_origen, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const valores = [
      usuario_id,
      modulo,
      tabla,
      registro_id,
      accion,
      valores_previos ? JSON.stringify(valores_previos) : null,
      valores_nuevos ? JSON.stringify(valores_nuevos) : null,
      ip_origen,
      user_agent,
    ];

    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerPorModulo(modulo, pagina = 1, limite = 20) {
    const desplazamiento = (pagina - 1) * limite;
    const consulta = `
      SELECT a.*, u.nombre, u.apellido, u.correo
      FROM auditoria a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      WHERE a.modulo = $1
      ORDER BY a.fecha DESC
      LIMIT $2 OFFSET $3
    `;
    const resultado = await grupo.query(consulta, [
      modulo,
      limite,
      desplazamiento,
    ]);
    return resultado.rows;
  },

  async obtenerPorUsuario(usuario_id, pagina = 1, limite = 20) {
    const desplazamiento = (pagina - 1) * limite;
    const consulta = `
      SELECT a.*, u.nombre, u.apellido, u.correo
      FROM auditoria a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      WHERE a.usuario_id = $1
      ORDER BY a.fecha DESC
      LIMIT $2 OFFSET $3
    `;
    const resultado = await grupo.query(consulta, [
      usuario_id,
      limite,
      desplazamiento,
    ]);
    return resultado.rows;
  },

  async obtenerTodos(pagina = 1, limite = 20, filtros = {}) {
    const desplazamiento = (pagina - 1) * limite;
    let consulta = `
      SELECT a.*, u.nombre, u.apellido, u.correo
      FROM auditoria a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      WHERE 1=1
    `;
    const valores = [];
    let contador = 1;

    if (filtros.modulo) {
      consulta += ` AND a.modulo = $${contador}`;
      valores.push(filtros.modulo);
      contador++;
    }

    if (filtros.tabla) {
      consulta += ` AND a.tabla = $${contador}`;
      valores.push(filtros.tabla);
      contador++;
    }

    if (filtros.accion) {
      consulta += ` AND a.accion = $${contador}`;
      valores.push(filtros.accion);
      contador++;
    }

    if (filtros.fecha_desde) {
      consulta += ` AND a.fecha >= $${contador}`;
      valores.push(filtros.fecha_desde);
      contador++;
    }

    if (filtros.fecha_hasta) {
      consulta += ` AND a.fecha <= $${contador}`;
      valores.push(filtros.fecha_hasta);
      contador++;
    }

    consulta += ` ORDER BY a.fecha DESC LIMIT $${contador} OFFSET $${contador + 1}`;
    valores.push(limite, desplazamiento);

    const resultado = await grupo.query(consulta, valores);
    return resultado.rows;
  },

  async contar(filtros = {}) {
    let consulta = "SELECT COUNT(*) FROM auditoria WHERE 1=1";
    const valores = [];
    let contador = 1;

    if (filtros.modulo) {
      consulta += ` AND modulo = $${contador}`;
      valores.push(filtros.modulo);
      contador++;
    }

    if (filtros.tabla) {
      consulta += ` AND tabla = $${contador}`;
      valores.push(filtros.tabla);
      contador++;
    }

    if (filtros.accion) {
      consulta += ` AND accion = $${contador}`;
      valores.push(filtros.accion);
      contador++;
    }

    const resultado = await grupo.query(consulta, valores);
    return parseInt(resultado.rows[0].count);
  },
};

module.exports = Auditoria;
