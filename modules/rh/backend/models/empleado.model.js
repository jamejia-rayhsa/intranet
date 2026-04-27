const { grupo } = require("../config/database");

const CAMPOS_PERMITIDOS = [
  "nombre",
  "apellido_paterno",
  "apellido_materno",
  "fecha_nacimiento",
  "curp",
  "rfc",
  "nss",
  "infonavit",
  "fonacot",
  "numero_nomina",
  "fecha_imss",
  "fecha_renovacion",
  "tipo_contrato",
  "celular_corporativo",
  "estado_nacimiento",
  "genero",
  "estado_civil",
  "escolaridad",
  "celular_personal",
  "telefono_emergencia",
  "parentesco_emergencia",
  "contacto_emergencia",
  "correo_personal",
  "calle",
  "colonia",
  "codigo_postal",
  "municipio",
  "estado_residencia",
  "banco",
  "clabe",
  "cp_fiscal",
  "puesto_id",
  "departamento_id",
  "ubicacion_id",
  "fecha_ingreso",
  "jefe_inmediato_id",
];

const SELECT_EMPLEADO = `
  SELECT e.*,
    u.correo as usuario_correo,
    p.nombre as puesto,
    d.nombre as departamento,
    ub.nombre as ubicacion,
    jefe.nombre as jefe_nombre, jefe.apellido_paterno as jefe_apellido
  FROM empleados e
  LEFT JOIN usuarios u ON e.usuario_id = u.id
  LEFT JOIN puestos p ON e.puesto_id = p.id
  LEFT JOIN departamentos d ON e.departamento_id = d.id
  LEFT JOIN ubicaciones ub ON e.ubicacion_id = ub.id
  LEFT JOIN empleados jefe ON e.jefe_inmediato_id = jefe.id
`;

const Empleado = {
  async crear(datos) {
    const {
      usuario_id,
      nombre,
      apellido_paterno,
      apellido_materno,
      fecha_nacimiento,
      curp,
      rfc,
      puesto_id,
      departamento_id,
      ubicacion_id,
      fecha_ingreso,
      jefe_inmediato_id,
    } = datos;

    const consulta = `
      INSERT INTO empleados (usuario_id, nombre, apellido_paterno, apellido_materno, fecha_nacimiento, curp, rfc, puesto_id, departamento_id, ubicacion_id, fecha_ingreso, jefe_inmediato_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const valores = [
      usuario_id || null,
      nombre,
      apellido_paterno,
      apellido_materno || null,
      fecha_nacimiento || null,
      curp || null,
      rfc || null,
      puesto_id || null,
      departamento_id || null,
      ubicacion_id || null,
      fecha_ingreso || null,
      jefe_inmediato_id || null,
    ];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async obtenerPorId(id) {
    const consulta = `${SELECT_EMPLEADO} WHERE e.id = $1`;
    const resultado = await grupo.query(consulta, [id]);
    return resultado.rows[0];
  },

  async listar(filtros = {}) {
    let consulta = `${SELECT_EMPLEADO} WHERE 1=1`;
    const valores = [];
    let contador = 1;

    if (filtros.estatus) {
      consulta += ` AND e.estatus = $${contador}`;
      valores.push(filtros.estatus);
      contador++;
    }

    if (filtros.departamento_id) {
      consulta += ` AND e.departamento_id = $${contador}`;
      valores.push(filtros.departamento_id);
      contador++;
    }

    if (filtros.busqueda) {
      consulta += ` AND (e.nombre ILIKE $${contador} OR e.apellido_paterno ILIKE $${contador} OR p.nombre ILIKE $${contador})`;
      valores.push(`%${filtros.busqueda}%`);
      contador++;
    }

    consulta += " ORDER BY e.nombre, e.apellido_paterno";

    if (filtros.limite) {
      const desplazamiento = ((filtros.pagina || 1) - 1) * filtros.limite;
      consulta += ` LIMIT $${contador} OFFSET $${contador + 1}`;
      valores.push(filtros.limite, desplazamiento);
    }

    const resultado = await grupo.query(consulta, valores);
    return resultado.rows;
  },

  async contar(filtros = {}) {
    let consulta = "SELECT COUNT(*) FROM empleados WHERE 1=1";
    const valores = [];
    let contador = 1;

    if (filtros.estatus) {
      consulta += ` AND estatus = $${contador}`;
      valores.push(filtros.estatus);
      contador++;
    }

    const resultado = await grupo.query(consulta, valores);
    return parseInt(resultado.rows[0].count);
  },

  async actualizar(id, datos) {
    const campos = [];
    const valores = [];
    let contador = 1;

    for (const campo of CAMPOS_PERMITIDOS) {
      if (datos[campo] !== undefined) {
        campos.push(`${campo} = $${contador}`);
        valores.push(datos[campo] || null);
        contador++;
      }
    }

    if (campos.length === 0) {
      return this.obtenerPorId(id);
    }

    campos.push("fecha_actualizacion = NOW()");
    valores.push(id);

    const consulta = `UPDATE empleados SET ${campos.join(", ")} WHERE id = $${contador} RETURNING *`;
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  async marcarBaja(id, motivo = null) {
    const consulta = `
      UPDATE empleados SET estatus = 'baja', fecha_baja = NOW(), motivo_baja = $1, fecha_actualizacion = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const resultado = await grupo.query(consulta, [motivo || null, id]);
    return resultado.rows[0];
  },

  async obtenerPorUsuarioId(usuarioId) {
    const consulta = "SELECT * FROM empleados WHERE usuario_id = $1";
    const resultado = await grupo.query(consulta, [usuarioId]);
    return resultado.rows[0];
  },

  async listarPorJefe(jefeId) {
    const consulta = `
      SELECT e.* FROM empleados e
      WHERE e.jefe_inmediato_id = $1 AND e.estatus = 'activo'
      ORDER BY e.nombre, e.apellido_paterno
    `;
    const resultado = await grupo.query(consulta, [jefeId]);
    return resultado.rows;
  },
};

module.exports = Empleado;
