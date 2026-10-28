const { grupo } = require("../config/database");
const { tomarCandadoImportacion, tomarCupoImportacion } = require("../utils/candadosImportacion");
const { describirErrorSql } = require("../utils/logSeguro");
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

  /**
   * ¿Asignar `jefeId` como jefe inmediato de `empleadoId` crea un ciclo (A jefe de B y B de A, directa o indirectamente)?
   * Sube por la cadena de jefes (tope de 100 pasos: una cadena real nunca es tan larga). Un empleado no puede ser su propio jefe.
   */
  async creaCicloDeJefes(empleadoId, jefeId) {
    let actual = Number(jefeId);
    const objetivo = Number(empleadoId);
    for (let i = 0; i < 100 && Number.isInteger(actual) && actual > 0; i += 1) {
      if (actual === objetivo) return true;
      const r = await grupo.query("SELECT jefe_inmediato_id FROM empleados WHERE id = $1", [actual]);
      actual = r.rows[0] ? r.rows[0].jefe_inmediato_id : null;
    }
    return false;
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

  // Todos los empleados en el formato de la plantilla de carga (para corregirlos y reimportarlos en modo actualizar).
  // Orden ÚNICO (nombre, apellidos, id) y fechas con to_char en SQL: independiente de la zona horaria del servidor y del
  // navegador. El jefe sale por número de nómina o, si no tiene, por CURP.
  async listarParaExportar() {
    const directas = CAMPOS_DIRECTOS.map((c) => (CAMPOS_FECHA.includes(c) ? `to_char(e.${c}, 'YYYY-MM-DD') AS ${c}` : `e.${c}`)).join(", ");
    const r = await grupo.query(`
      SELECT ${directas},
        p.nombre AS puesto, d.nombre AS departamento, ub.nombre AS ubicacion,
        CASE WHEN COALESCE(j.numero_nomina, '') <> '' THEN j.numero_nomina ELSE '' END AS jefe_nomina,
        CASE WHEN COALESCE(j.numero_nomina, '') = '' THEN COALESCE(j.curp, '') ELSE '' END AS jefe_curp
      FROM empleados e
      LEFT JOIN puestos p ON p.id = e.puesto_id
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      LEFT JOIN ubicaciones ub ON ub.id = e.ubicacion_id
      LEFT JOIN empleados j ON j.id = e.jefe_inmediato_id
      ORDER BY e.nombre, e.apellido_paterno, e.apellido_materno NULLS FIRST, e.id
    `);
    return r.rows;
  },

  // Importación por lotes (modo 'omitir' por omisión o 'actualizar'). Cada fila se valida ANTES de tocar la BD.
  // catalogos: { puestos, departamentos, ubicaciones } con mapas { normalizarClave(nombre): id }.
  // Respuesta: { insertados, actualizados, sin_cambios, duplicados, duplicados_detalle:[{fila,nombre,motivo}] (máx. 200),
  //   actualizados_detalle:[{fila,nombre,campos}] (máx. 200; solo el número de campos), errores:[{fila,nombre,error}],
  //   advertencias:[{fila,nombre,campo,valor_recibido,motivo}] (máx. 1000), advertencias_omitidas,
  //   sin_catalogo:{puestos,departamentos,ubicaciones:[{nombre,filas}]} (máx. 100 nombres c/u),
  //   jefes_pendientes:[{empleado_id,fila,jefe_nomina,jefe_curp}] (para asignarJefes), jefes:{pendientes} }.
  // `fila` es el número de fila del archivo (_fila). Nunca se devuelve texto de PostgreSQL.
  //
  // Integridad (se usa con datos reales): UNA transacción por lote en ambos modos que empieza con el candado de importación
  // (serializa importaciones simultáneas) y lee el estado DESPUÉS del candado. Fase A (en memoria, en el orden del archivo):
  // decide qué hace cada fila; fase B: ejecuta las escrituras en un orden determinista (actualizaciones por id, altas por
  // clave) con un SAVEPOINT por fila: un error SQL inesperado revierte solo esa fila, que se reporta, y el lote sigue.
  // Identificación: una CURP presente pero inválida es error de la fila (prepararFilaEmpleado); en modo actualizar una fila
  // sin CURP ni nómina es error y NUNCA se inserta; una clave que coincide con varios empleados es error; una nómina que
  // solo coincide ignorando ceros a la izquierda es posible duplicado (error). Solo las celdas con valor sobrescriben,
  // nunca se borra un dato, usuario_id no se toca y en modo actualizar se ignoran estatus/fecha_baja/motivo_baja.
  async importarLote(filas, catalogos = {}, opciones = {}) {
    const actualizar = opciones.modo === "actualizar";
    const mapas = {
      puesto: catalogos.puestos || {},
      departamento: catalogos.departamentos || {},
      ubicacion: catalogos.ubicaciones || {},
    };

    const r = {
      insertados: 0, actualizados: 0, sin_cambios: 0, duplicados: 0, duplicados_detalle: [], actualizados_detalle: [],
      errores: [], advertencias: [], advertencias_omitidas: 0, jefes_pendientes: [],
    };
    const faltantes = { puesto: new Map(), departamento: new Map(), ubicacion: new Map() };
    const anotarFaltante = (mapa, nombre) => {
      const k = normalizarClave(nombre);
      const previo = mapa.get(k);
      if (previo) previo.filas++;
      else if (mapa.size < MAX_SIN_CATALOGO) mapa.set(k, { nombre, filas: 1 });
    };
    const duplicado = (cruda, fila, motivo) => {
      r.duplicados++;
      if (r.duplicados_detalle.length < MAX_DUPLICADOS_DETALLE) {
        r.duplicados_detalle.push({ fila: numeroFila(cruda), nombre: nombreCompleto(fila || cruda), motivo });
      }
    };
    const error = (cruda, fila, mensaje) => r.errores.push({ fila: numeroFila(cruda), nombre: nombreCompleto(fila || cruda), error: mensaje });
    const avisar = (cruda, fila, lista) => {
      for (const a of lista) {
        if (r.advertencias.length >= MAX_ADVERTENCIAS_LOTE) { r.advertencias_omitidas++; continue; }
        r.advertencias.push({ fila: numeroFila(cruda), nombre: nombreCompleto(fila), ...a });
      }
    };

    // 1. Validación de todas las filas (sin tocar la BD)
    const validas = [];
    for (const cruda of filas) {
      const { fila, advertencias: avisos, error: problema } = prepararFilaEmpleado(cruda);
      if (problema) { error(cruda, null, problema); continue; }
      validas.push({ cruda, fila, avisos: [...avisos] });
    }

    const sinCeros = (t) => t.replace(/^0+/, "");
    const curps = [...new Set(validas.map((v) => v.fila.curp.toLowerCase()).filter(Boolean))];
    const nominas = [...new Set(validas.map((v) => v.fila.numero_nomina.toLowerCase()).filter(Boolean))];
    const nominasSC = [...new Set(nominas.map(sinCeros).filter(Boolean))];

    const liberarCupo = tomarCupoImportacion();
    let cliente;
    try {
      cliente = await grupo.connect();
    } catch (e) {
      liberarCupo();
      throw e;
    }
    let transaccion = false;
    try {
      await cliente.query("BEGIN");
      transaccion = true;
      await tomarCandadoImportacion(cliente, "empleados");

      // 2. Estado actual de los empleados con esas claves, leído con el candado ya tomado
      const porCurp = new Map();
      const porNomina = new Map();
      const porNominaSC = new Map();
      const agregar = (mapa, clave, entrada) => {
        if (!clave) return;
        if (!mapa.has(clave)) mapa.set(clave, []);
        if (!mapa.get(clave).includes(entrada)) mapa.get(clave).push(entrada);
      };
      if (curps.length || nominas.length) {
        const res = await cliente.query(
          `SELECT ${SELECT_IMPORTACION} FROM empleados
           WHERE LOWER(curp) = ANY($1) OR LOWER(numero_nomina) = ANY($2) OR LTRIM(LOWER(numero_nomina), '0') = ANY($3)
           ORDER BY id`,
          [curps, nominas, nominasSC]
        );
        for (const row of res.rows) {
          const entrada = { id: row.id, valores: row, enArchivo: false };
          agregar(porCurp, row.curp_l, entrada);
          agregar(porNomina, row.nomina_l, entrada);
          agregar(porNominaSC, row.nomina_l ? sinCeros(row.nomina_l) : "", entrada);
        }
      }

      // 3. Fase A: decisión de cada fila, en el orden del archivo
      const ops = [];
      for (const { cruda, fila, avisos } of validas) {
        const curpL = fila.curp ? fila.curp.toLowerCase() : null;
        const nominaL = fila.numero_nomina ? fila.numero_nomina.toLowerCase() : null;
        const candC = curpL ? porCurp.get(curpL) || [] : [];
        const candN = nominaL ? porNomina.get(nominaL) || [] : [];

        if (candC.length > 1) { error(cruda, fila, `La CURP coincide con ${candC.length} empleados; resuelve el duplicado antes de importar`); continue; }
        if (candN.length > 1) { error(cruda, fila, `El número de nómina coincide con ${candN.length} empleados; resuelve el duplicado antes de importar`); continue; }
        if (nominaL && candN.length === 0) {
          const sc = sinCeros(nominaL);
          if (sc && (porNominaSC.get(sc) || []).length) {
            error(cruda, fila, "Posible duplicado: el número de nómina coincide con el de otro empleado ignorando los ceros a la izquierda; corrígelo en el archivo");
            continue;
          }
        }
        const porC = candC[0] || null;
        const porN = candN[0] || null;

        let destino = null;
        if (!actualizar) {
          if (porC) { duplicado(cruda, fila, porC.enArchivo ? "repetida en el archivo" : "CURP ya existe"); continue; }
          if (porN) { duplicado(cruda, fila, porN.enArchivo ? "repetida en el archivo" : "Número de nómina ya existe"); continue; }
          if (!curpL && !nominaL) avisos.push({ campo: "numero_nomina", valor_recibido: null, motivo: "sin CURP ni número de nómina: reimportar el archivo duplicará a este empleado" });
        } else {
          if (!curpL && !nominaL) {
            error(cruda, fila, "Sin identificador: la fila no trae CURP ni número de nómina; en modo actualizar no se puede identificar al empleado y no se crea");
            continue;
          }
          if (porC && porN && porC !== porN) {
            error(cruda, fila, "Conflicto: la CURP corresponde a un empleado y el número de nómina a otro; no se modificó ninguno");
            continue;
          }
          destino = porC || porN;
          if (destino && destino.enArchivo) { duplicado(cruda, fila, "repetida en el archivo"); continue; }
          if (destino) {
            const v = destino.valores;
            if (curpL && v.curp_l && v.curp_l !== curpL) {
              error(cruda, fila, "Conflicto: el empleado con ese número de nómina ya tiene otra CURP; no se sobrescribe");
              continue;
            }
            if (nominaL && v.nomina_l && v.nomina_l !== nominaL) {
              error(cruda, fila, "Conflicto: el empleado con esa CURP ya tiene otro número de nómina; no se sobrescribe");
              continue;
            }
          }
        }

        // Estatus y baja: al actualizar NO se tocan (reactivar o dar de baja se hace en la pantalla de Empleados);
        // al crear se respetan, y una baja exige fecha de baja.
        const datos = { ...fila };
        if (destino) {
          if (fila.estatus || fila.fecha_baja || fila.motivo_baja) {
            avisos.push({ campo: "estatus", valor_recibido: null, motivo: "para dar de baja o reactivar usa la pantalla de Empleados: estatus, fecha de baja y motivo de baja se ignoraron" });
          }
          datos.estatus = ""; datos.fecha_baja = ""; datos.motivo_baja = "";
        } else if (fila.estatus === "baja" && !fila.fecha_baja) {
          avisos.push({ campo: "estatus", valor_recibido: null, motivo: "una baja necesita fecha de baja: el empleado se creó como activo" });
          datos.estatus = ""; datos.motivo_baja = "";
        } else if (fila.estatus !== "baja" && (fila.fecha_baja || fila.motivo_baja)) {
          avisos.push({ campo: "fecha_baja", valor_recibido: null, motivo: "fecha y motivo de baja se ignoraron porque el estatus no es baja" });
          datos.fecha_baja = ""; datos.motivo_baja = "";
        }

        // Referencias a catálogos por nombre (sin acentos ni mayúsculas)
        const ids = {};
        const sinCatalogo = [];
        for (const [clave, columna] of REFERENCIAS) {
          if (!fila[clave]) continue;
          const id = mapas[clave][normalizarClave(fila[clave])] || null;
          if (id) ids[columna] = id;
          else sinCatalogo.push([clave, fila[clave]]);
        }

        const op = { cruda, fila: datos, avisos, ids, sinCatalogo, destino, curpL, nominaL };
        ops.push(op);
        // Las claves de esta fila cuentan para las siguientes (repetidas en el archivo)
        const entrada = destino || { id: null, valores: { ...datos, curp_l: curpL, nomina_l: nominaL }, enArchivo: false };
        entrada.enArchivo = true;
        if (!destino || curpL) agregar(porCurp, curpL, entrada);
        if (!destino || nominaL) agregar(porNomina, nominaL, entrada);
        if (!destino && nominaL) agregar(porNominaSC, sinCeros(nominaL), entrada);
        op.entrada = entrada;
      }

      // 4. Fase B: escrituras en orden determinista, un SAVEPOINT por fila
      const clave = (op) => (op.destino ? [0, op.destino.id, ""] : [1, 0, `${op.curpL || ""}|${op.nominaL || ""}`]);
      ops.sort((x, y) => {
        const a = clave(x);
        const b = clave(y);
        return a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0) || (numeroFila(x.cruda) || 0) - (numeroFila(y.cruda) || 0);
      });
      let n = 0;
      for (const op of ops) {
        const { cruda, fila: datos, avisos, ids, sinCatalogo, destino } = op;
        const punto = `fila_${n++}`;
        await cliente.query(`SAVEPOINT ${punto}`);
        try {
          let empleadoId;
          let resultado; // 'insertado' | 'actualizado' | 'sin_cambios'
          let campos = 0;
          if (destino) {
            const v = destino.valores;
            const cambios = {};
            for (const c of CAMPOS_DIRECTOS) {
              const nuevo = datos[c];
              if (!nuevo) continue;
              const actual = v[c] === null || v[c] === undefined ? "" : String(v[c]);
              const igual = c === "curp" || c === "numero_nomina" ? actual.toLowerCase() === nuevo.toLowerCase() : actual === nuevo;
              if (!igual) cambios[c] = nuevo;
            }
            for (const [columna, id] of Object.entries(ids)) {
              if (Number(v[columna]) !== Number(id)) cambios[columna] = id;
            }
            const claves = Object.keys(cambios);
            if (claves.length) {
              await cliente.query(
                `UPDATE empleados SET ${claves.map((c, i) => `${c} = $${i + 1}`).join(", ")}, fecha_actualizacion = NOW() WHERE id = $${claves.length + 1}`,
                [...claves.map((c) => cambios[c]), destino.id]
              );
            }
            campos = claves.length;
            empleadoId = destino.id;
            resultado = campos ? "actualizado" : "sin_cambios";
          } else {
            const columnas = [];
            const valores = [];
            for (const c of CAMPOS_DIRECTOS) {
              if (datos[c]) { columnas.push(c); valores.push(datos[c]); }
            }
            for (const [columna, id] of Object.entries(ids)) { columnas.push(columna); valores.push(id); }
            if (!datos.estatus) { columnas.push("estatus"); valores.push("activo"); }
            const res = await cliente.query(
              `INSERT INTO empleados (${columnas.join(", ")}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
              valores
            );
            empleadoId = res.rows[0].id;
            op.entrada.id = empleadoId;
            resultado = "insertado";
          }
          await cliente.query(`RELEASE SAVEPOINT ${punto}`);

          if (resultado === "insertado") r.insertados++;
          else if (resultado === "sin_cambios") r.sin_cambios++;
          else {
            r.actualizados++;
            if (r.actualizados_detalle.length < MAX_DUPLICADOS_DETALLE) {
              r.actualizados_detalle.push({ fila: numeroFila(cruda), nombre: nombreCompleto(datos), campos });
            }
          }
          for (const [c, nombre] of sinCatalogo) anotarFaltante(faltantes[c], nombre);
          avisar(cruda, datos, avisos);
          if (datos.jefe_nomina || datos.jefe_curp) {
            r.jefes_pendientes.push({ empleado_id: empleadoId, fila: numeroFila(cruda), jefe_nomina: datos.jefe_nomina, jefe_curp: datos.jefe_curp });
          }
        } catch (e) {
          await cliente.query(`ROLLBACK TO SAVEPOINT ${punto}`);
          console.error(`[empleados] importar fila ${numeroFila(cruda)}: ${describirErrorSql(e)}`);
          error(cruda, datos, "No se pudo guardar la fila");
        }
      }

      await cliente.query("COMMIT");
      transaccion = false;
    } catch (e) {
      if (transaccion) {
        try { await cliente.query("ROLLBACK"); } catch (e2) { console.error(`[empleados] rollback de la importación: ${describirErrorSql(e2)}`); }
      }
      throw e;
    } finally {
      cliente.release();
      liberarCupo();
    }

    // Resultados en el orden del archivo (la fase B escribe en otro orden)
    const porFila = (x, y) => (x.fila === null ? Infinity : x.fila) - (y.fila === null ? Infinity : y.fila);
    for (const lista of [r.errores, r.advertencias, r.duplicados_detalle, r.actualizados_detalle, r.jefes_pendientes]) lista.sort(porFila);
    return {
      ...r,
      sin_catalogo: {
        puestos: [...faltantes.puesto.values()],
        departamentos: [...faltantes.departamento.values()],
        ubicaciones: [...faltantes.ubicacion.values()],
      },
      jefes: { pendientes: r.jefes_pendientes.length },
    };
  },

  // Segunda pasada: asigna jefe_inmediato_id a partir de los pares { empleado_id, fila, jefe_nomina, jefe_curp } que
  // devolvió importarLote. Toma el MISMO candado que importarLote y relee todos los empleados DENTRO de él, así que los
  // ciclos se validan contra el estado real (dos importaciones simultáneas no cierran un ciclo entre ellas). Con TODOS los
  // pares juntos detecta jefes inexistentes o ambiguos, jefes que no están activos, autorreferencias y ciclos (también
  // contra los jefes que ya están en la BD) y no asigna ninguno de esos casos. Una transacción.
  // Devuelve { asignados, sin_cambios, no_encontrados, ciclos, conflictos, ambiguos, no_activos,
  //   advertencias:[{fila,nombre,campo,valor_recibido,motivo}] }.
  async asignarJefes(pares) {
    const liberarCupo = tomarCupoImportacion();
    let cliente;
    try {
      cliente = await grupo.connect();
    } catch (e) {
      liberarCupo();
      throw e;
    }
    let transaccion = false;
    try {
      await cliente.query("BEGIN");
      transaccion = true;
      await tomarCandadoImportacion(cliente, "empleados");
      const todos = (await cliente.query(
        `SELECT id, nombre, apellido_paterno, apellido_materno, LOWER(curp) AS curp_l, LOWER(numero_nomina) AS nomina_l,
                jefe_inmediato_id, COALESCE(estatus, 'activo') AS estatus
         FROM empleados ORDER BY id`
      )).rows;
      const porId = new Map();
      const porCurp = new Map();
      const porNomina = new Map();
      const agregar = (mapa, clave, id) => {
        if (!clave) return;
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave).push(id);
      };
      for (const e of todos) {
        porId.set(e.id, e);
        agregar(porCurp, e.curp_l, e.id);
        agregar(porNomina, e.nomina_l, e.id);
      }

      const resultado = { asignados: 0, sin_cambios: 0, no_encontrados: 0, ciclos: 0, conflictos: 0, ambiguos: 0, no_activos: 0, advertencias: [] };
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
        const listaN = jn ? porNomina.get(jn) || [] : [];
        const listaC = jc ? porCurp.get(jc) || [] : [];
        if (listaN.length > 1 || listaC.length > 1) {
          resultado.ambiguos++;
          avisar(par, "jefe", null, "El número de nómina o la CURP del jefe coincide con varios empleados; no se asignó");
          continue;
        }
        const idN = listaN[0];
        const idC = listaC[0];
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
        if (porId.get(jefeId).estatus !== "activo") {
          resultado.no_activos++;
          avisar(par, "jefe", null, "El jefe indicado no está activo (baja o suspendido); no se asignó");
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
        try { await cliente.query("ROLLBACK"); } catch (e2) { console.error(`[empleados] rollback de jefes: ${describirErrorSql(e2)}`); }
      }
      throw e;
    } finally {
      cliente.release();
      liberarCupo();
    }
  },
};

module.exports = Empleado;
