const { grupo } = require("../config/database");
const {
  MAX_DUPLICADOS_DETALLE, MAX_SIN_CATALOGO, numeroFila, nombreCompleto, prepararFilaEmpleado,
} = require("../utils/importarEmpleados");

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
      nss,
      infonavit,
      fonacot,
      numero_nomina,
      fecha_imss,
      fecha_renovacion,
      tipo_contrato,
      celular_corporativo,
      estado_nacimiento,
      genero,
      estado_civil,
      escolaridad,
      celular_personal,
      telefono_emergencia,
      parentesco_emergencia,
      contacto_emergencia,
      correo_personal,
      calle,
      colonia,
      codigo_postal,
      municipio,
      estado_residencia,
      banco,
      clabe,
      cp_fiscal,
      puesto_id,
      departamento_id,
      ubicacion_id,
      fecha_ingreso,
      jefe_inmediato_id,
      estatus,
    } = datos;

    const consulta = `
      INSERT INTO empleados (
        usuario_id, nombre, apellido_paterno, apellido_materno, fecha_nacimiento,
        curp, rfc, nss, infonavit, fonacot,
        numero_nomina, fecha_imss, fecha_renovacion, tipo_contrato, celular_corporativo,
        estado_nacimiento, genero, estado_civil, escolaridad, celular_personal,
        telefono_emergencia, parentesco_emergencia, contacto_emergencia, correo_personal,
        calle, colonia, codigo_postal, municipio, estado_residencia,
        banco, clabe, cp_fiscal,
        puesto_id, departamento_id, ubicacion_id,
        fecha_ingreso, jefe_inmediato_id, estatus
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20,
        $21, $22, $23, $24,
        $25, $26, $27, $28, $29,
        $30, $31, $32,
        $33, $34, $35,
        $36, $37, $38
      )
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
      nss || null,
      infonavit || null,
      fonacot || null,
      numero_nomina || null,
      fecha_imss || null,
      fecha_renovacion || null,
      tipo_contrato || null,
      celular_corporativo || null,
      estado_nacimiento || null,
      genero || null,
      estado_civil || null,
      escolaridad || null,
      celular_personal || null,
      telefono_emergencia || null,
      parentesco_emergencia || null,
      contacto_emergencia || null,
      correo_personal || null,
      calle || null,
      colonia || null,
      codigo_postal || null,
      municipio || null,
      estado_residencia || null,
      banco || null,
      clabe || null,
      cp_fiscal || null,
      puesto_id || null,
      departamento_id || null,
      ubicacion_id || null,
      fecha_ingreso || null,
      jefe_inmediato_id || null,
      estatus || "activo",
    ];
    const resultado = await grupo.query(consulta, valores);
    return resultado.rows[0];
  },

  // `cliente`: dentro de una transacción debe pasarse el cliente de ésta (pedir otra conexión al
  // pool con la transacción abierta puede agotarlo y congelar el portal)
  async obtenerPorId(id, cliente = grupo) {
    const consulta = `${SELECT_EMPLEADO} WHERE e.id = $1`;
    const resultado = await cliente.query(consulta, [id]);
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

  // Importación por lotes. Cada fila se valida (fechas AAAA-MM-DD reales y longitudes) ANTES del INSERT.
  // Respuesta: { sin_catalogo:{puestos:[{nombre,filas}],departamentos:[...]} (máx. 100 nombres c/u), insertados, duplicados, duplicados_detalle:[{fila,nombre,motivo}] (máx. 200), errores:[{fila,nombre,error}] }.
  // `fila` es el número de fila del archivo (_fila). Nunca se devuelve texto de PostgreSQL.
  async importarLote(filas, mapaPuestos = {}, mapaDepartamentos = {}) {
    const curpsExistentes = new Set(
      (await grupo.query("SELECT LOWER(curp) AS curp FROM empleados WHERE curp IS NOT NULL AND curp != ''")).rows.map(r => r.curp)
    );
    const nominasExistentes = new Set(
      (await grupo.query("SELECT LOWER(numero_nomina) AS n FROM empleados WHERE numero_nomina IS NOT NULL AND numero_nomina != ''")).rows.map(r => r.n)
    );
    // Claves insertadas por ESTE lote: distinguen "repetida en el archivo" de "ya existe".
    const curpsArchivo = new Set();
    const nominasArchivo = new Set();

    let insertados = 0;
    let duplicados = 0;
    const duplicadosDetalle = [];
    const errores = [];
    // Puestos/departamentos escritos en el archivo que no existen en el catálogo: la fila se guarda con NULL y se avisa.
    const sinPuesto = new Map();
    const sinDepto = new Map();
    const anotarFaltante = (mapa, nombre) => {
      const k = nombre.toLowerCase();
      const previo = mapa.get(k);
      if (previo) previo.filas++;
      else if (mapa.size < MAX_SIN_CATALOGO) mapa.set(k, { nombre, filas: 1 });
    };

    const registrarDuplicado = (cruda, fila, motivo) => {
      duplicados++;
      if (duplicadosDetalle.length < MAX_DUPLICADOS_DETALLE) {
        duplicadosDetalle.push({ fila: numeroFila(cruda), nombre: nombreCompleto(fila || cruda), motivo });
      }
    };

    for (const cruda of filas) {
      const { fila, error } = prepararFilaEmpleado(cruda);
      if (error) {
        errores.push({ fila: numeroFila(cruda), nombre: nombreCompleto(cruda), error });
        continue;
      }

      const curpLower = fila.curp ? fila.curp.toLowerCase() : null;
      const nominaLower = fila.numero_nomina ? fila.numero_nomina.toLowerCase() : null;

      if (curpLower && curpsExistentes.has(curpLower)) {
        registrarDuplicado(cruda, fila, curpsArchivo.has(curpLower) ? 'repetida en el archivo' : 'CURP ya existe');
        continue;
      }
      if (nominaLower && nominasExistentes.has(nominaLower)) {
        registrarDuplicado(cruda, fila, nominasArchivo.has(nominaLower) ? 'repetida en el archivo' : 'Número de nómina ya existe');
        continue;
      }

      const puestoId = fila.puesto ? (mapaPuestos[fila.puesto.toLowerCase()] || null) : null;
      const deptId = fila.departamento ? (mapaDepartamentos[fila.departamento.toLowerCase()] || null) : null;

      try {
        await grupo.query(`
          INSERT INTO empleados (
            nombre, apellido_paterno, apellido_materno,
            curp, rfc, nss, numero_nomina,
            genero, estado_civil, escolaridad, tipo_contrato,
            fecha_nacimiento, fecha_ingreso,
            correo_personal, celular_personal,
            puesto_id, departamento_id, estatus
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'activo')`,
          [
            fila.nombre, fila.apellido_paterno, fila.apellido_materno || null,
            fila.curp || null, fila.rfc || null, fila.nss || null, fila.numero_nomina || null,
            fila.genero || null, fila.estado_civil || null, fila.escolaridad || null, fila.tipo_contrato || null,
            fila.fecha_nacimiento || null, fila.fecha_ingreso || null,
            fila.correo_personal || null, fila.celular_personal || null,
            puestoId, deptId,
          ]
        );
        insertados++;
        if (fila.puesto && !puestoId) anotarFaltante(sinPuesto, fila.puesto);
        if (fila.departamento && !deptId) anotarFaltante(sinDepto, fila.departamento);
        if (curpLower) { curpsExistentes.add(curpLower); curpsArchivo.add(curpLower); }
        if (nominaLower) { nominasExistentes.add(nominaLower); nominasArchivo.add(nominaLower); }
      } catch (e) {
        console.error('[empleados] importar fila', numeroFila(cruda), e);
        errores.push({ fila: numeroFila(cruda), nombre: nombreCompleto(fila), error: 'No se pudo insertar la fila' });
      }
    }

    return {
      insertados, duplicados, duplicados_detalle: duplicadosDetalle, errores,
      sin_catalogo: { puestos: [...sinPuesto.values()], departamentos: [...sinDepto.values()] },
    };
  },
};

module.exports = Empleado;
