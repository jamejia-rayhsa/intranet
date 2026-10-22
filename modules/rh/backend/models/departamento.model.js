const { grupo } = require("../config/database");
const {
  textoSeguro, numeroFila, normalizarClave, valorParaMostrar, MAX_DUPLICADOS_DETALLE, MAX_ADVERTENCIAS_LOTE,
} = require("../utils/importarEmpleados");
const { prepararFilaDepartamento } = require("../utils/importarDepartamentos");
const TurnoAsignacion = require("./turnoAsignacion.model");
const { ErrorAsistencia } = require("../utils/erroresAsistencia");

// Día anterior a una fecha AAAA-MM-DD (aritmética UTC: sin desfase de zona horaria)
function diaAnterior(fecha) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

// Mensaje seguro de un error esperado (reglas de turnos); null si es inesperado (no se muestra su texto).
function mensajeSeguro(e) {
  if (e instanceof ErrorAsistencia) return e.message;
  if (e && e.code === "23P01") return "La vigencia del turno se traslapa con otra asignación";
  if (e && e.code === "23514") return "Las fechas de la vigencia del turno no son válidas";
  return null;
}

// Aplica el turno al departamento dentro de la transacción del lote. Devuelve 'turnos_asignados', 'turnos_cambiados' o
// 'turnos_sin_cambio'; lanza ErrorAsistencia si la fecha no es posterior al inicio de la vigente (terminar solo acorta).
async function aplicarTurno(cliente, departamentoId, turno, desde, usuarioId) {
  const asignaciones = await TurnoAsignacion.listar("departamento", { padreId: departamentoId }, cliente);
  const vigente = asignaciones.find((a) => a.vigente_desde <= desde && (a.vigente_hasta === null || a.vigente_hasta >= desde));
  const nueva = { departamento_id: departamentoId, turno_id: turno.id, vigente_desde: desde, vigente_hasta: null, creado_por: usuarioId };
  if (!vigente) {
    await TurnoAsignacion.asignar("departamento", nueva, cliente);
    return "turnos_asignados";
  }
  if (vigente.turno_id === turno.id) return "turnos_sin_cambio";
  if (desde <= vigente.vigente_desde) {
    throw new ErrorAsistencia(
      409,
      `La fecha ${desde} debe ser posterior al inicio del turno vigente (${vigente.vigente_desde}, ${vigente.turno_nombre}): la vigente solo se puede terminar el día anterior`
    );
  }
  await TurnoAsignacion.terminar("departamento", vigente.id, diaAnterior(desde), cliente);
  await TurnoAsignacion.asignar("departamento", nueva, cliente);
  return "turnos_cambiados";
}

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
    // turno_actual: nombre del turno vigente hoy (America/Mexico_City) del departamento; solo lectura
    return (await grupo.query(`
      SELECT d.*, a.nombre AS area_nombre, ta.nombre AS turno_actual
      FROM departamentos d
      LEFT JOIN areas a ON d.area_id = a.id
      LEFT JOIN LATERAL (
        SELECT t.nombre
        FROM turno_departamento td JOIN turnos t ON t.id = td.turno_id
        WHERE td.departamento_id = d.id
          AND td.vigente_desde <= (now() AT TIME ZONE 'America/Mexico_City')::date
          AND (td.vigente_hasta IS NULL OR td.vigente_hasta >= (now() AT TIME ZONE 'America/Mexico_City')::date)
        ORDER BY td.vigente_desde DESC
        LIMIT 1
      ) ta ON true
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

  // Importación por lotes (modo 'omitir' por omisión o 'actualizar'; coincidencia por nombre sin acentos ni mayúsculas).
  // ctx: { mapaAreas, mapaTurnos, puedeTurnos, hoy, usuarioId } (mapas por normalizarClave). Una transacción por lote
  // con SAVEPOINT por fila: el error de una fila (turno que se traslapa, SQL inesperado) deshace solo esa fila.
  // Solo las celdas con valor sobrescriben; una celda vacía nunca borra. El turno usa TurnoAsignacion (candados y traslape):
  // sin vigente -> asignar; mismo turno -> sin cambio; otro turno -> terminar la vigente el día anterior y asignar la nueva.
  // Respuesta: { insertados (= creados), creados, actualizados, sin_cambios, duplicados, duplicados_detalle, actualizados_detalle,
  //   errores, advertencias, turnos_asignados, turnos_cambiados, turnos_sin_cambio }.
  async importarLote(filas, ctx = {}, opciones = {}) {
    const actualizar = opciones.modo === "actualizar";
    const { mapaAreas = {}, mapaTurnos = {}, puedeTurnos = false, hoy, usuarioId = null } = ctx;
    const r = {
      insertados: 0, creados: 0, actualizados: 0, sin_cambios: 0, duplicados: 0, duplicados_detalle: [], actualizados_detalle: [],
      errores: [], advertencias: [], advertencias_omitidas: 0, turnos_asignados: 0, turnos_cambiados: 0, turnos_sin_cambio: 0,
    };
    const nombreDe = (cruda) => (cruda && typeof textoSeguro(cruda.nombre) === "string" ? textoSeguro(cruda.nombre).slice(0, 300) : "");
    const error = (cruda, mensaje) => r.errores.push({ fila: numeroFila(cruda), nombre: nombreDe(cruda), error: mensaje });

    const cliente = await grupo.connect();
    let transaccion = false;
    try {
      await cliente.query("BEGIN");
      transaccion = true;
      const todos = (await cliente.query(
        "SELECT id, nombre, descripcion, area_id, cupo_vacaciones FROM departamentos ORDER BY id"
      )).rows;
      const porNombre = new Map();
      for (const d of todos) { const k = normalizarClave(d.nombre); if (!porNombre.has(k)) porNombre.set(k, { ...d, enArchivo: false }); }

      let n = 0;
      for (const cruda of filas) {
        const { fila, advertencias, error: problema } = prepararFilaDepartamento(cruda);
        if (problema) { error(cruda, problema); continue; }

        const clave = normalizarClave(fila.nombre);
        const existente = porNombre.get(clave) || null;
        if (existente && (!actualizar || existente.enArchivo)) {
          r.duplicados++;
          if (r.duplicados_detalle.length < MAX_DUPLICADOS_DETALLE) {
            r.duplicados_detalle.push({ fila: numeroFila(cruda), nombre: fila.nombre, motivo: existente.enArchivo ? "repetida en el archivo" : "Nombre ya existe" });
          }
          continue;
        }

        const avisos = [...advertencias];
        const areaId = fila.area ? (mapaAreas[normalizarClave(fila.area)] || null) : null;
        if (fila.area && !areaId) avisos.push({ campo: "area", valor_recibido: valorParaMostrar(fila.area), motivo: "El área no existe en el catálogo" });

        // Turno solicitado: se ignora con advertencia si falta el permiso, el turno no existe o está inactivo
        let turno = null;
        if (fila.turno) {
          const t = mapaTurnos[normalizarClave(fila.turno)];
          if (!puedeTurnos) avisos.push({ campo: "turno", valor_recibido: valorParaMostrar(fila.turno), motivo: "Sin permiso de edición de Turnos: la columna de turno se ignoró" });
          else if (!t) avisos.push({ campo: "turno", valor_recibido: valorParaMostrar(fila.turno), motivo: "El turno no existe en el catálogo; no se asignó" });
          else if (!t.activo) avisos.push({ campo: "turno", valor_recibido: valorParaMostrar(fila.turno), motivo: "El turno está inactivo; no se asignó" });
          else turno = t;
        }

        const punto = `fila_${n++}`;
        await cliente.query(`SAVEPOINT ${punto}`);
        const local = { turnos_asignados: 0, turnos_cambiados: 0, turnos_sin_cambio: 0 };
        try {
          let departamento;
          let camposModificados = 0;
          let accion;
          if (!existente) {
            const ins = await cliente.query(
              "INSERT INTO departamentos (nombre, descripcion, area_id, cupo_vacaciones) VALUES ($1, $2, $3, COALESCE($4, 1)) RETURNING id, nombre, descripcion, area_id, cupo_vacaciones",
              [fila.nombre, fila.descripcion || null, areaId, fila.cupo]
            );
            departamento = { ...ins.rows[0], enArchivo: true };
            porNombre.set(clave, departamento);
            accion = "insertado";
          } else {
            departamento = existente;
            const cambios = {};
            if (fila.descripcion && fila.descripcion !== (existente.descripcion || "")) cambios.descripcion = fila.descripcion;
            if (areaId && areaId !== existente.area_id) cambios.area_id = areaId;
            if (fila.cupo !== null && fila.cupo !== existente.cupo_vacaciones) cambios.cupo_vacaciones = fila.cupo;
            const claves = Object.keys(cambios);
            if (claves.length) {
              await cliente.query(
                `UPDATE departamentos SET ${claves.map((c, i) => `${c} = $${i + 1}`).join(", ")} WHERE id = $${claves.length + 1}`,
                [...claves.map((c) => cambios[c]), existente.id]
              );
              Object.assign(existente, cambios);
            }
            camposModificados = claves.length;
            existente.enArchivo = true;
            accion = "existente";
          }

          if (turno) {
            const resultadoTurno = await aplicarTurno(cliente, departamento.id, turno, fila.turno_desde || hoy, usuarioId);
            local[resultadoTurno] = 1;
            if (resultadoTurno !== "turnos_sin_cambio") camposModificados++;
          }
          await cliente.query(`RELEASE SAVEPOINT ${punto}`);

          if (accion === "insertado") { r.insertados++; r.creados++; }
          else if (camposModificados === 0) r.sin_cambios++;
          else {
            r.actualizados++;
            if (r.actualizados_detalle.length < MAX_DUPLICADOS_DETALLE) r.actualizados_detalle.push({ fila: numeroFila(cruda), nombre: fila.nombre, campos: camposModificados });
          }
          for (const k of Object.keys(local)) r[k] += local[k];
          for (const a of avisos) {
            if (r.advertencias.length >= MAX_ADVERTENCIAS_LOTE) r.advertencias_omitidas++;
            else r.advertencias.push({ fila: numeroFila(cruda), nombre: fila.nombre, ...a });
          }
        } catch (e) {
          await cliente.query(`ROLLBACK TO SAVEPOINT ${punto}`);
          if (!existente) porNombre.delete(clave);
          else existente.enArchivo = false;
          const mensaje = mensajeSeguro(e);
          if (!mensaje) console.error("[departamentos] importar", e);
          error(cruda, mensaje || "No se pudo guardar la fila");
        }
      }
      await cliente.query("COMMIT");
      transaccion = false;
    } catch (e) {
      if (transaccion) { try { await cliente.query("ROLLBACK"); } catch (e2) { console.error("[departamentos] rollback", e2); } }
      throw e;
    } finally {
      cliente.release();
    }
    return r;
  },
};

module.exports = Departamento;
