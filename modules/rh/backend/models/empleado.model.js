const { grupo } = require("../config/database");
const {
  MAX_DUPLICADOS_DETALLE, MAX_SIN_CATALOGO, MAX_ADVERTENCIAS_LOTE, CAMPOS_DIRECTOS, CAMPOS_FECHA,
  numeroFila, nombreCompleto, prepararFilaEmpleado, normalizarClave, valorParaMostrar,
} = require("../utils/importarEmpleados");

// Columnas para comparar/actualizar en la importación (los nombres salen solo de constantes: nunca del archivo).
// Las fechas se leen como texto AAAA-MM-DD (un DATE de pg llegaría como Date con desfase de zona horaria).
const SELECT_IMPORTACION = [
  "id", "puesto_id", "departamento_id", "ubicacion_id", "jefe_inmediato_id",
  "LOWER(curp) AS curp_l", "LOWER(numero_nomina) AS nomina_l",
  ...CAMPOS_DIRECTOS.map((c) => (CAMPOS_FECHA.includes(c) ? `to_char(${c}, 'YYYY-MM-DD') AS ${c}` : c)),
].join(", ");
const REFERENCIAS = [
  ["puesto", "puesto_id", "puestos"],
  ["departamento", "departamento_id", "departamentos"],
  ["ubicacion", "ubicacion_id", "ubicaciones"],
];

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

  // Importación por lotes (modo 'omitir' por omisión o 'actualizar'). Cada fila se valida ANTES de tocar la BD.
  // catalogos: { puestos, departamentos, ubicaciones } con mapas { normalizarClave(nombre): id }.
  // Respuesta: { insertados, actualizados, sin_cambios, duplicados, duplicados_detalle:[{fila,nombre,motivo}] (máx. 200),
  //   actualizados_detalle:[{fila,nombre,campos}] (máx. 200; solo el número de campos), errores:[{fila,nombre,error}],
  //   advertencias:[{fila,nombre,campo,valor_recibido,motivo}] (máx. 1000), advertencias_omitidas,
  //   sin_catalogo:{puestos,departamentos,ubicaciones:[{nombre,filas}]} (máx. 100 nombres c/u),
  //   jefes_pendientes:[{empleado_id,fila,jefe_nomina,jefe_curp}] (para asignarJefes), jefes:{pendientes} }.
  // `fila` es el número de fila del archivo (_fila). Nunca se devuelve texto de PostgreSQL.
  // Modo 'actualizar': una transacción por lote (todo el lote o nada si falla el SQL); los errores de validación o
  // de conflicto por fila no la abortan. Solo las celdas con valor sobrescriben; nunca se borra un dato; usuario_id no se toca.
  async importarLote(filas, catalogos = {}, opciones = {}) {
    const actualizar = opciones.modo === "actualizar";
    const mapas = {
      puesto: catalogos.puestos || {},
      departamento: catalogos.departamentos || {},
      ubicacion: catalogos.ubicaciones || {},
    };

    let insertados = 0;
    let actualizados = 0;
    let sinCambios = 0;
    let duplicados = 0;
    let advertenciasOmitidas = 0;
    const duplicadosDetalle = [];
    const actualizadosDetalle = [];
    const errores = [];
    const advertencias = [];
    const jefesPendientes = [];
    const faltantes = { puesto: new Map(), departamento: new Map(), ubicacion: new Map() };
    const anotarFaltante = (mapa, nombre) => {
      const k = normalizarClave(nombre);
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
    const registrarError = (cruda, fila, error) => errores.push({ fila: numeroFila(cruda), nombre: nombreCompleto(fila || cruda), error });
    const aceptarAdvertencias = (cruda, fila, lista) => {
      for (const a of lista) {
        if (advertencias.length >= MAX_ADVERTENCIAS_LOTE) { advertenciasOmitidas++; continue; }
        advertencias.push({ fila: numeroFila(cruda), nombre: nombreCompleto(fila), ...a });
      }
    };

    // 1. Validación de todas las filas (sin tocar la BD)
    const validas = [];
    for (const cruda of filas) {
      const { fila, advertencias: avisos, error } = prepararFilaEmpleado(cruda);
      if (error) { errores.push({ fila: numeroFila(cruda), nombre: nombreCompleto(cruda), error }); continue; }
      validas.push({ cruda, fila, avisos });
    }

    // 2. Empleados que ya existen según las claves del lote (una consulta, sin recorrer toda la tabla)
    const curps = [...new Set(validas.map((v) => v.fila.curp.toLowerCase()).filter(Boolean))];
    const nominas = [...new Set(validas.map((v) => v.fila.numero_nomina.toLowerCase()).filter(Boolean))];

    let cliente = grupo;
    let transaccion = false;
    try {
      if (actualizar) {
        cliente = await grupo.connect();
        await cliente.query("BEGIN");
        transaccion = true;
      }

      const porCurp = new Map();
      const porNomina = new Map();
      if (curps.length || nominas.length) {
        const res = await cliente.query(
          `SELECT ${SELECT_IMPORTACION} FROM empleados WHERE LOWER(curp) = ANY($1) OR LOWER(numero_nomina) = ANY($2) ORDER BY id`,
          [curps, nominas]
        );
        for (const r of res.rows) {
          const entrada = { id: r.id, valores: r, enArchivo: false };
          if (r.curp_l && !porCurp.has(r.curp_l)) porCurp.set(r.curp_l, entrada);
          if (r.nomina_l && !porNomina.has(r.nomina_l)) porNomina.set(r.nomina_l, entrada);
        }
      }
      const registrarClaves = (entrada, curpL, nominaL) => {
        entrada.enArchivo = true;
        if (curpL) porCurp.set(curpL, entrada);
        if (nominaL) porNomina.set(nominaL, entrada);
      };

      for (const { cruda, fila, avisos } of validas) {
        const curpL = fila.curp ? fila.curp.toLowerCase() : null;
        const nominaL = fila.numero_nomina ? fila.numero_nomina.toLowerCase() : null;
        const porC = curpL ? porCurp.get(curpL) : null;
        const porN = nominaL ? porNomina.get(nominaL) : null;

        let destino = null;
        if (!actualizar) {
          if (porC) { registrarDuplicado(cruda, fila, porC.enArchivo ? "repetida en el archivo" : "CURP ya existe"); continue; }
          if (porN) { registrarDuplicado(cruda, fila, porN.enArchivo ? "repetida en el archivo" : "Número de nómina ya existe"); continue; }
        } else {
          if (porC && porN && porC.id !== porN.id) {
            registrarError(cruda, fila, "Conflicto: la CURP corresponde a un empleado y el número de nómina a otro; no se modificó ninguno");
            continue;
          }
          destino = porC || porN;
          if (destino && destino.enArchivo) { registrarDuplicado(cruda, fila, "repetida en el archivo"); continue; }
          if (destino) {
            const v = destino.valores;
            if (curpL && v.curp_l && v.curp_l !== curpL) {
              registrarError(cruda, fila, "Conflicto: el empleado con ese número de nómina ya tiene otra CURP; no se sobrescribe");
              continue;
            }
            if (nominaL && v.nomina_l && v.nomina_l !== nominaL) {
              registrarError(cruda, fila, "Conflicto: el empleado con esa CURP ya tiene otro número de nómina; no se sobrescribe");
              continue;
            }
          }
        }

        // Referencias a catálogos por nombre (sin acentos ni mayúsculas)
        const ids = {};
        for (const [clave, columna] of REFERENCIAS) {
          if (!fila[clave]) continue;
          const id = mapas[clave][normalizarClave(fila[clave])] || null;
          if (id) ids[columna] = id;
          else anotarFaltante(faltantes[clave], fila[clave]);
        }

        let empleadoId;
        if (destino) {
          const v = destino.valores;
          const cambios = {};
          for (const clave of CAMPOS_DIRECTOS) {
            const nuevo = fila[clave];
            if (!nuevo) continue;
            const actual = v[clave] === null || v[clave] === undefined ? "" : String(v[clave]);
            const igual = clave === "curp" || clave === "numero_nomina" ? actual.toLowerCase() === nuevo.toLowerCase() : actual === nuevo;
            if (!igual) cambios[clave] = nuevo;
          }
          for (const [columna, id] of Object.entries(ids)) {
            if (Number(v[columna]) !== Number(id)) cambios[columna] = id;
          }
          const claves = Object.keys(cambios);
          if (claves.length === 0) {
            sinCambios++;
          } else {
            const sets = claves.map((c, i) => `${c} = $${i + 1}`);
            await cliente.query(
              `UPDATE empleados SET ${sets.join(", ")}, fecha_actualizacion = NOW() WHERE id = $${claves.length + 1}`,
              [...claves.map((c) => cambios[c]), destino.id]
            );
            actualizados++;
            if (actualizadosDetalle.length < MAX_DUPLICADOS_DETALLE) {
              actualizadosDetalle.push({ fila: numeroFila(cruda), nombre: nombreCompleto(fila), campos: claves.length });
            }
          }
          empleadoId = destino.id;
          registrarClaves(destino, curpL, nominaL);
        } else {
          const columnas = [];
          const valores = [];
          for (const clave of CAMPOS_DIRECTOS) {
            if (fila[clave]) { columnas.push(clave); valores.push(fila[clave]); }
          }
          for (const [columna, id] of Object.entries(ids)) { columnas.push(columna); valores.push(id); }
          if (!fila.estatus) { columnas.push("estatus"); valores.push("activo"); }
          const sql = `INSERT INTO empleados (${columnas.join(", ")}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`;
          let nuevoId;
          if (actualizar) {
            nuevoId = (await cliente.query(sql, valores)).rows[0].id;
          } else {
            try {
              nuevoId = (await cliente.query(sql, valores)).rows[0].id;
            } catch (e) {
              console.error("[empleados] importar fila", numeroFila(cruda), e);
              registrarError(cruda, fila, "No se pudo insertar la fila");
              continue;
            }
          }
          insertados++;
          empleadoId = nuevoId;
          registrarClaves({ id: nuevoId, valores: { ...fila, curp_l: curpL, nomina_l: nominaL }, enArchivo: true }, curpL, nominaL);
        }

        aceptarAdvertencias(cruda, fila, avisos);
        if (fila.jefe_nomina || fila.jefe_curp) {
          jefesPendientes.push({ empleado_id: empleadoId, fila: numeroFila(cruda), jefe_nomina: fila.jefe_nomina, jefe_curp: fila.jefe_curp });
        }
      }

      if (transaccion) { await cliente.query("COMMIT"); transaccion = false; }
    } catch (e) {
      if (transaccion) {
        try { await cliente.query("ROLLBACK"); } catch (e2) { console.error("[empleados] rollback de la importación", e2); }
      }
      throw e;
    } finally {
      if (cliente !== grupo) cliente.release();
    }

    return {
      insertados, actualizados, sin_cambios: sinCambios, duplicados,
      duplicados_detalle: duplicadosDetalle, actualizados_detalle: actualizadosDetalle, errores,
      advertencias, advertencias_omitidas: advertenciasOmitidas,
      sin_catalogo: {
        puestos: [...faltantes.puesto.values()],
        departamentos: [...faltantes.departamento.values()],
        ubicaciones: [...faltantes.ubicacion.values()],
      },
      jefes_pendientes: jefesPendientes,
      jefes: { pendientes: jefesPendientes.length },
    };
  },

  // Segunda pasada: asigna jefe_inmediato_id a partir de los pares { empleado_id, fila, jefe_nomina, jefe_curp } que
  // devolvió importarLote. Con TODOS los pares juntos detecta jefes inexistentes, autorreferencias y ciclos (también
  // contra los jefes que ya están en la BD) y no asigna ninguno de esos casos. Una transacción.
  // Devuelve { asignados, sin_cambios, no_encontrados, ciclos, conflictos, advertencias:[{fila,nombre,campo,valor_recibido,motivo}] }.
  async asignarJefes(pares) {
    const cliente = await grupo.connect();
    let transaccion = false;
    try {
      await cliente.query("BEGIN");
      transaccion = true;
      const todos = (await cliente.query(
        `SELECT id, nombre, apellido_paterno, apellido_materno, LOWER(curp) AS curp_l, LOWER(numero_nomina) AS nomina_l, jefe_inmediato_id FROM empleados`
      )).rows;
      const porId = new Map();
      const porCurp = new Map();
      const porNomina = new Map();
      for (const e of todos) {
        porId.set(e.id, e);
        if (e.curp_l && !porCurp.has(e.curp_l)) porCurp.set(e.curp_l, e.id);
        if (e.nomina_l && !porNomina.has(e.nomina_l)) porNomina.set(e.nomina_l, e.id);
      }

      const resultado = { asignados: 0, sin_cambios: 0, no_encontrados: 0, ciclos: 0, conflictos: 0, advertencias: [] };
      const nombreDe = (id) => nombreCompleto(porId.get(id) || {});
      const avisar = (par, campo, valor, motivo) => resultado.advertencias.push({
        fila: par.fila || null, nombre: nombreDe(par.empleado_id), campo, valor_recibido: valor === null ? null : valorParaMostrar(valor), motivo,
      });

      const candidatos = new Map(); // empleado_id -> { jefeId, par }
      for (const par of pares) {
        if (!porId.has(par.empleado_id)) {
          resultado.no_encontrados++;
          resultado.advertencias.push({ fila: par.fila || null, nombre: "", campo: "jefe", valor_recibido: null, motivo: "El empleado ya no existe" });
          continue;
        }
        const jn = par.jefe_nomina ? par.jefe_nomina.toLowerCase() : "";
        const jc = par.jefe_curp ? par.jefe_curp.toLowerCase() : "";
        const idN = jn ? porNomina.get(jn) : undefined;
        const idC = jc ? porCurp.get(jc) : undefined;
        if (idN !== undefined && idC !== undefined && idN !== idC) {
          resultado.conflictos++;
          avisar(par, "jefe", null, "Jefe (número de nómina) y Jefe (CURP) corresponden a empleados distintos; no se asignó");
          continue;
        }
        const jefeId = idN !== undefined ? idN : idC;
        if (jefeId === undefined) {
          resultado.no_encontrados++;
          avisar(par, "jefe", jn ? par.jefe_nomina : null,
            jn ? "No existe un empleado con ese número de nómina de jefe" : "No existe un empleado con esa CURP de jefe");
          continue;
        }
        if (jefeId === par.empleado_id) {
          resultado.ciclos++;
          avisar(par, "jefe", null, "Un empleado no puede ser su propio jefe (auto-referencia); no se asignó");
          continue;
        }
        candidatos.set(par.empleado_id, { jefeId, par });
      }

      // Ciclos: en el grafo "jefe actual + asignaciones nuevas" cada empleado tiene a lo más un jefe, así que
      // un empleado está en un ciclo si al subir por sus jefes vuelve a él. Se descartan las asignaciones nuevas de todo el ciclo.
      const siguiente = (id) => (candidatos.has(id) ? candidatos.get(id).jefeId : (porId.get(id) || {}).jefe_inmediato_id);
      const enCiclo = new Set();
      for (const inicio of candidatos.keys()) {
        const camino = [inicio];
        const visto = new Set(camino);
        let actual = siguiente(inicio);
        while (actual !== null && actual !== undefined && !visto.has(actual)) {
          camino.push(actual);
          visto.add(actual);
          actual = siguiente(actual);
        }
        if (actual === inicio) camino.forEach((id) => enCiclo.add(id));
      }
      const aplicar = [];
      for (const [empleadoId, { jefeId, par }] of candidatos) {
        if (enCiclo.has(empleadoId)) {
          resultado.ciclos++;
          avisar(par, "jefe", null, "Asignar este jefe crearía un ciclo de jefes (A es jefe de B y B de A, directa o indirectamente); no se asignó");
        } else if (porId.get(empleadoId).jefe_inmediato_id === jefeId) {
          resultado.sin_cambios++;
        } else {
          aplicar.push([empleadoId, jefeId]);
        }
      }
      if (aplicar.length) {
        await cliente.query(
          `UPDATE empleados e SET jefe_inmediato_id = v.jefe, fecha_actualizacion = NOW()
           FROM (SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS jefe) v WHERE e.id = v.id`,
          [aplicar.map((a) => a[0]), aplicar.map((a) => a[1])]
        );
      }
      resultado.asignados = aplicar.length;

      await cliente.query("COMMIT");
      transaccion = false;
      return resultado;
    } catch (e) {
      if (transaccion) {
        try { await cliente.query("ROLLBACK"); } catch (e2) { console.error("[empleados] rollback de jefes", e2); }
      }
      throw e;
    } finally {
      cliente.release();
    }
  },
};

module.exports = Empleado;
