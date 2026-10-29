// "Importar usuarios": crea cuentas Microsoft (auth_tipo 'ms365', SIN contraseña) con el rol rh_empleado y las vincula a su
// empleado (empleados.usuario_id) en el mismo paso. Solo super_admin (lo exige la ruta).
//
// Orden por fila (GoTrue y PostgreSQL no comparten transacción):
//   A) tx: fila local con auth_uid NULL y activo=false (nadie entra con ella); COMMIT. (Una fila incompleta de una importación
//      anterior se REUTILIZA en lugar de crear otra.)
//   B) GoTrue POST /admin/users sin contraseña, marcado con app_metadata.origen = 'importacion_usuarios' (no editable por el usuario) (fuera de toda tx).
//   C) tx: auth_uid + activo=true + rol rh_empleado + vínculo (reutiliza empleadoCuenta, candado 4601); la comprobación del
//      vínculo va DENTRO de la tx, antes del COMMIT.
// Qué es "definitivo": solo un rechazo 4xx de GoTrue (salvo 408 y 429). 5xx, timeouts, red, 2xx sin JSON y cualquier excepción
// inesperada son INCIERTOS: la fila local NUNCA se borra y queda 'verificar'. Un reintento repara sin panel de GoTrue: consulta GoTrue por
// correo exacto y, si la cuenta existe, la marcó una importación (origen) y ninguna fila local la usa, la ADOPTA (completa la fila local, rol y
// vínculo); si existe sin esa marca, error "cuenta preexistente, no se adopta".
// Nunca hay éxito parcial silencioso: cada fila termina en creada | omitida | error | verificar.
// Candado: pg_advisory_xact_lock(4701, 1) al inicio de cada transacción de fila y ANTES del 4601 (orden 4701 -> 4601).
const { grupo } = require("../config/database");
const supabaseAdmin = require("../services/supabaseAdmin.service");
const EmpleadoCuenta = require("../../../rh/backend/models/empleadoCuenta.model");
const { describirErrorSql } = require("../../../rh/backend/utils/logSeguro");
const U = require("../utils/importarUsuarios");
const { crearHuella } = require("../utils/huellaVistaPrevia");
const crypto = require("crypto");

const ESPACIO_IMPORTAR_USUARIOS = 4701;
const CLAVE_IMPORTAR_USUARIOS = 1;
const LOCK_TIMEOUT = "3s";
const MAX_INCIERTOS_SEGUIDOS = 3; // GoTrue sin responder: se detiene (cada intento espera hasta 10 s)
const MENSAJE_EN_CURSO = "Hay otra importación de usuarios en curso; no se aplicó nada. Espera unos segundos y reintenta";
const MENSAJE_BLOQUEO = "Hay registros bloqueados por otra operación (por ejemplo una importación de empleados); la fila no se aplicó. Reintenta en unos segundos";
const ORIGEN_IMPORTACION = "importacion_usuarios";
const MENSAJE_INCOMPLETA_SUCIA = "Ya existe una cuenta local incompleta (sin cuenta en Supabase Auth) que además tiene rol o empleado: no se repara sola; revísala en Administración de usuarios";
const AVISO_ALIAS = "El correo lleva un alias con '+': verifica que sea el buzón real de la persona (Microsoft 365 puede entregarlo a otro buzón)";
const AVISO_REPARAR = "Cuenta incompleta de una importación anterior: al aplicar se consultará Supabase Auth y, si la cuenta la creó una importación, se completará";
const MENSAJE_AJENA = "La cuenta ya existe en Supabase Auth y no la creó una importación de usuarios (o ya está en uso): cuenta preexistente, no se adopta. Si es de otra persona o sobra, elimínala en Supabase Auth (consola de Supabase) y reimporta; si es la correcta, vincúlala a mano (Empleados > perfil > Cuenta de usuario)";

class ErrorImportacionUsuarios extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.name = "ErrorImportacionUsuarios";
    this.estado = estado;
  }
}

let enEjecucion = 0;

async function obtenerRolImportado(ejecutor) {
  const r = await ejecutor.query("SELECT id FROM roles WHERE nombre = $1", [U.ROL_IMPORTADO]);
  if (r.rows.length === 0) throw new ErrorImportacionUsuarios(409, `El rol ${U.ROL_IMPORTADO} no existe: no se puede importar`);
  return r.rows[0].id;
}

/**
 * Clasifica filas ya preparadas (salida de prepararFilasUsuarios) SIN escribir. `ejecutor`: pool o cliente de la transacción.
 * Devuelve [{ indice, numero, estado: 'crear'|'omitir'|'error', motivo, empleado, avisos, fila }] en el mismo orden.
 *  - correo ya en `usuarios` (sin distinguir mayúsculas) -> 'omitir'; si solo hay filas sin auth_uid -> error (cuenta incompleta)
 *  - empleado: CURP o nómina (ambigua = error), activo y sin cuenta; el mismo empleado en dos filas -> error en la segunda
 */
async function clasificar(ejecutor, preparadas) {
  const validas = preparadas.filter((p) => p.fila);
  const correos = validas.map((p) => p.fila.correo);
  const curps = [...new Set(validas.map((p) => p.fila.curp).filter(Boolean))];
  const nominasExactas = [...new Set(validas.map((p) => U.nominaClave(p.fila.numero_nomina)).filter((n) => n && n !== ""))];
  const nominasSinCeros = [...new Set(validas.map((p) => (p.fila.numero_nomina ? U.sinCeros(p.fila.numero_nomina) : null)).filter(Boolean))];

  const existentes = new Map(); // correo en minúsculas -> { conAuth, filas: [{ id, ... }] }
  if (correos.length) {
    const r = await ejecutor.query(
      `SELECT id, LOWER(correo) AS correo_l, (auth_uid IS NOT NULL) AS con_auth, activo, auth_tipo,
              NOT EXISTS (SELECT 1 FROM usuario_rol ur WHERE ur.usuario_id = usuarios.id) AS sin_rol,
              NOT EXISTS (SELECT 1 FROM empleados e WHERE e.usuario_id = usuarios.id) AS sin_empleado
       FROM usuarios WHERE LOWER(correo) = ANY($1::text[])`,
      [correos],
    );
    for (const f of r.rows) {
      const previo = existentes.get(f.correo_l) || { conAuth: false, filas: [] };
      previo.conAuth = previo.conAuth || f.con_auth;
      previo.filas.push(f);
      existentes.set(f.correo_l, previo);
    }
  }

  const COLUMNAS = `id, nombre, apellido_paterno, apellido_materno, numero_nomina, UPPER(curp) AS curp_u,
                    COALESCE(estatus, 'activo') AS estatus, usuario_id`;
  const empleadosCurp = curps.length
    ? (await ejecutor.query(`SELECT ${COLUMNAS} FROM empleados WHERE UPPER(curp) = ANY($1::text[])`, [curps])).rows
    : [];
  const empleadosNomina = nominasExactas.length || nominasSinCeros.length
    ? (await ejecutor.query(
      `SELECT ${COLUMNAS} FROM empleados
       WHERE LOWER(BTRIM(numero_nomina)) = ANY($1::text[]) OR LTRIM(LOWER(BTRIM(numero_nomina)), '0') = ANY($2::text[])`,
      [nominasExactas, nominasSinCeros],
    )).rows
    : [];

  const filaPorEmpleado = new Map(); // empleado.id -> número de fila que ya lo usa
  return preparadas.map((p) => {
    const base = { indice: p.indice, numero: p.numero, fila: p.fila || null, visible: p.visible || null, empleado: null, avisos: [] };
    if (!p.fila) return { ...base, estado: "error", motivo: p.error };
    const previo = existentes.get(p.fila.correo);
    let reparar = null;
    if (previo) {
      if (previo.conAuth) {
        // Fila inactiva que conserva su auth_uid: una importación anterior no pudo completarla (p. ej. el vínculo falló)
        const inactiva = previo.filas.every((f) => f.activo === false);
        return { ...base, estado: "omitir", motivo: inactiva ? "Ya existe una fila inactiva con cuenta en Supabase Auth (una importación anterior no se completó): elimínala en Administración de usuarios (también limpia Supabase Auth) y reimporta" : "Ya existe una cuenta con ese correo; no se modificó" };
      }
      // Solo con auth_uid NULL: una reserva de una importación interrumpida. Se repara únicamente si está limpia
      const f = previo.filas[0];
      if (previo.filas.length !== 1 || f.activo !== false || f.auth_tipo !== "ms365" || !f.sin_rol || !f.sin_empleado) {
        return { ...base, estado: "error", motivo: MENSAJE_INCOMPLETA_SUCIA };
      }
      reparar = f.id;
    }
    const porCurp = p.fila.curp ? empleadosCurp.filter((e) => e.curp_u === p.fila.curp) : [];
    const exacta = p.fila.numero_nomina ? U.nominaClave(p.fila.numero_nomina) : null;
    const sc = p.fila.numero_nomina ? U.sinCeros(p.fila.numero_nomina) : null;
    const porNomina = p.fila.numero_nomina
      ? empleadosNomina.filter((e) => {
        const n = U.nominaClave(e.numero_nomina || "");
        return n === exacta || (sc !== null && U.sinCeros(n) === sc);
      })
      : [];
    const r = U.resolverEmpleado(p.fila, porCurp, porNomina);
    if (r.error) return { ...base, estado: "error", motivo: r.error };
    if (filaPorEmpleado.has(r.empleado.id)) {
      return { ...base, estado: "error", motivo: `El empleado ya aparece en la fila ${filaPorEmpleado.get(r.empleado.id)} del archivo` };
    }
    filaPorEmpleado.set(r.empleado.id, p.numero);
    return { ...base, estado: "crear", motivo: "", empleado: r.empleado, avisos: [...(reparar ? [AVISO_REPARAR] : []), ...(U.tieneAlias(p.fila.correo) ? [AVISO_ALIAS] : []), ...r.avisos], reparar };
  });
}

const nombreFila = (p) => (p.fila ? `${p.fila.nombre} ${p.fila.apellido}`.trim() : (p.visible && p.visible.nombre) || "");

const EmpleadoDeSalida = (e) => (e ? { id: e.id, nombre: U.nombreDeEmpleado(e) } : null);

const UsuarioImportacion = {
  ESPACIO_IMPORTAR_USUARIOS, CLAVE_IMPORTAR_USUARIOS, ErrorImportacionUsuarios, MENSAJE_EN_CURSO,

  // Vista previa de SOLO LECTURA: nada se escribe en la BD ni en GoTrue. `preparadas`: salida de prepararFilasUsuarios.
  async vistaPrevia(preparadas, usuarioActorId = null) {
    await obtenerRolImportado(grupo);
    const evaluadas = await clasificar(grupo, preparadas);
    const filas = evaluadas.map((e) => ({
      fila: e.numero, nombre: nombreFila(e), correo: e.fila ? e.fila.correo : (e.visible && e.visible.correo) || "", estado: e.estado, motivo: e.motivo,
      empleado: EmpleadoDeSalida(e.empleado), avisos: e.avisos,
      huella: e.fila && usuarioActorId !== null ? crearHuella(usuarioActorId, e.fila) : undefined,
    }));
    const resumen = { total: filas.length, crear: 0, omitir: 0, error: 0 };
    for (const f of filas) resumen[f.estado]++;
    return { filas, resumen, rol: U.ROL_IMPORTADO };
  },

  // Aplica fila por fila (ver cabecera). Devuelve { filas:[{ fila, nombre, estado:'creada'|'omitida'|'error'|'verificar', motivo,
  // usuario_id, empleado_id, avisos }], creadas, omitidas, errores, verificar }. Lanza ErrorImportacionUsuarios 409 si ya hay una en curso.
  async aplicar(preparadas, { servicio = supabaseAdmin } = {}) {
    const importacionId = crypto.randomUUID();
    if (enEjecucion >= 1) throw new ErrorImportacionUsuarios(409, MENSAJE_EN_CURSO);
    enEjecucion++;
    try {
      const rolId = await obtenerRolImportado(grupo);
      const salida = [];
      let inciertosSeguidos = 0;
      for (const p of preparadas) {
        if (inciertosSeguidos >= MAX_INCIERTOS_SEGUIDOS && p.fila) {
          salida.push({ fila: p.numero, nombre: nombreFila(p), estado: "error", motivo: "No procesada: Supabase Auth no responde; no se escribió nada para esta fila", usuario_id: null, empleado_id: null, avisos: [] });
          continue;
        }
        const r = await procesarFila(p, rolId, servicio, importacionId);
        inciertosSeguidos = r.incierto ? inciertosSeguidos + 1 : (r.estado === "verificar" ? inciertosSeguidos : 0);
        delete r.incierto;
        salida.push(r);
      }
      const cuenta = (estado) => salida.filter((s) => s.estado === estado).length;
      return { filas: salida, creadas: cuenta("creada"), omitidas: cuenta("omitida"), errores: cuenta("error"), verificar: cuenta("verificar") };
    } finally {
      enEjecucion--;
    }
  },
};

function resultado(p, estado, motivo, extra = {}) {
  return { fila: p.numero, nombre: nombreFila(p), estado, motivo, usuario_id: null, empleado_id: null, avisos: [], ...extra };
}

async function transaccion(trabajo) {
  const cliente = await grupo.connect();
  let abierta = false;
  let rollbackFallo = null;
  try {
    await cliente.query("BEGIN");
    abierta = true;
    await cliente.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await cliente.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [ESPACIO_IMPORTAR_USUARIOS, CLAVE_IMPORTAR_USUARIOS]);
    const valor = await trabajo(cliente);
    try {
      await cliente.query("COMMIT");
    } catch (e) {
      // El COMMIT pudo aplicarse aunque falle la respuesta: el estado es INCIERTO y nadie debe compensar
      abierta = false;
      rollbackFallo = e;
      e.enCommit = true;
      throw e;
    }
    abierta = false;
    return valor;
  } catch (e) {
    if (abierta) {
      try { await cliente.query("ROLLBACK"); } catch (e2) { rollbackFallo = e2; console.error(`[usuarios] rollback de importar usuarios: ${describirErrorSql(e2)}`); }
    }
    throw e;
  } finally {
    cliente.release(rollbackFallo || undefined);
  }
}

function motivoGoTrue(e) {
  if (e && (e.status === 422 || e.status === 409)) return MENSAJE_AJENA;
  if (e && e.status === 500 && e.definitivo) return "Supabase Auth no está configurado en el servidor";
  return `Supabase Auth rechazó el alta (HTTP ${e && e.status ? e.status : "sin código"})`;
}

async function borrarFilaLocal(usuarioId) {
  await grupo.query("DELETE FROM usuarios WHERE id = $1 AND auth_uid IS NULL", [usuarioId]);
}

// Conserva el auth_uid en la fila (inactiva) para que 'Eliminar' en Administración de usuarios también limpie GoTrue
async function conservarAuthUid(usuarioId, authUid) {
  try {
    await grupo.query("UPDATE usuarios SET auth_uid = $2 WHERE id = $1 AND auth_uid IS NULL", [usuarioId, authUid]);
  } catch (e3) {
    console.error(`[usuarios] importar usuarios, conservar auth_uid: ${describirErrorSql(e3)}`);
  }
}

// Consulta GoTrue por correo exacto y decide si la cuenta se puede ADOPTAR: la marcó una importación (user_metadata.origen) y ninguna
// fila local la usa. Lanza si GoTrue no responde (el llamador lo trata como incierto).
async function decidirAdopcion(servicio, correo) {
  const hallado = await servicio.obtenerPorCorreo(correo);
  if (!hallado) return { tipo: "no_existe" };
  // app_metadata: solo la escribe GoTrue/admin; el propio usuario NO puede cambiarla (user_metadata sí, por PUT /auth/v1/user)
  const origen = hallado.app_metadata && hallado.app_metadata.origen;
  if (origen !== ORIGEN_IMPORTACION || typeof hallado.id !== "string" || !hallado.id) return { tipo: "ajena" };
  const dueno = await grupo.query("SELECT id FROM usuarios WHERE auth_uid = $1", [hallado.id]);
  if (dueno.rows.length > 0) return { tipo: "ajena" };
  return { tipo: "adoptable", id: hallado.id };
}

const MOTIVO_VERIFICAR = "No se pudo confirmar el alta en Supabase Auth: la cuenta local quedó inactiva y sin vincular. Vuelve a importar este archivo: se consultará Supabase Auth y, si la cuenta se creó en una importación, se completará";

async function procesarFila(p, rolId, servicio, importacionId) {
  if (!p.fila) return resultado(p, "error", p.error);

  // A) Reserva local inactiva y sin auth_uid (la fila se revalida con el candado tomado: lo visto en la vista previa pudo cambiar).
  // Una reserva de una importación interrumpida se reutiliza.
  let reserva;
  try {
    reserva = await transaccion(async (cliente) => {
      const [ev] = await clasificar(cliente, [p]);
      if (ev.estado !== "crear") return { ev };
      if (ev.reparar) return { ev, usuarioId: ev.reparar, reparada: true };
      const r = await cliente.query(
        `INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, activo, auth_uid)
         VALUES ($1, $2, $3, 'ms365', false, NULL) RETURNING id`,
        [p.fila.correo, p.fila.nombre, p.fila.apellido],
      );
      return { ev, usuarioId: r.rows[0].id, reparada: false };
    });
  } catch (e) {
    if (e && e.code === "55P03") return resultado(p, "error", MENSAJE_BLOQUEO);
    if (e && e.code === "23505") return resultado(p, "omitida", "Ya existe una cuenta con ese correo; no se modificó");
    console.error(`[usuarios] importar usuarios, reserva local: ${describirErrorSql(e)}`);
    return resultado(p, "error", "Error interno al preparar la cuenta; no se creó nada");
  }
  const { ev, usuarioId, reparada } = reserva;
  if (ev.estado === "omitir") return resultado(p, "omitida", ev.motivo);
  if (ev.estado === "error") return resultado(p, "error", ev.motivo);
  const empleadoId = ev.empleado.id;

  // B) GoTrue, sin contraseña y sin transacción abierta (o adopción de la cuenta que una importación anterior dejó creada)
  let authUid = null;
  let adoptada = false;
  try {
    if (reparada) {
      const d = await decidirAdopcion(servicio, p.fila.correo);
      if (d.tipo === "ajena") return resultado(p, "error", MENSAJE_AJENA, { usuario_id: usuarioId });
      if (d.tipo === "adoptable") { authUid = d.id; adoptada = true; }
    }
    if (!authUid) {
      try {
        // Sin usuario_id interno en la metadata (el usuario puede editar su user_metadata: no es una fuente de identidad)
        const nuevo = await servicio.crearUsuario({ correo: p.fila.correo, metadata: { nombre: p.fila.nombre, apellido: p.fila.apellido }, appMetadata: { origen: ORIGEN_IMPORTACION, importacion: importacionId } });
        authUid = nuevo && nuevo.id;
      } catch (e) {
        if (!(e && e.definitivo === true && (e.status === 422 || e.status === 409))) throw e;
        // Ya existe en GoTrue: solo se adopta si la creó una importación y ninguna fila local la usa
        const d = await decidirAdopcion(servicio, p.fila.correo);
        if (d.tipo !== "adoptable") throw Object.assign(e, { ajena: true });
        authUid = d.id;
        adoptada = true;
      }
    }
    if (!authUid) throw Object.assign(new Error("respuesta sin id"), { incierto: true });
  } catch (e) {
    if (e && e.definitivo === true) {
      // Rechazo 4xx: GoTrue NO aplicó nada. Una reserva recién creada se borra; la reparada (de una importación anterior) se conserva
      if (!reparada) {
        try {
          await borrarFilaLocal(usuarioId);
        } catch (e2) {
          console.error(`[usuarios] importar usuarios, limpieza de la reserva: ${describirErrorSql(e2)}`);
          return resultado(p, "verificar", `${motivoGoTrue(e)}; además no se pudo limpiar la cuenta local inactiva: vuelve a importar el archivo para reintentar`, { usuario_id: usuarioId });
        }
      }
      return resultado(p, "error", motivoGoTrue(e), reparada ? { usuario_id: usuarioId } : {});
    }
    // Timeout, red, 5xx, 2xx sin JSON o cualquier excepción inesperada: INCIERTO. Nunca se borra ni se compensa
    if (!(e && e.incierto)) console.error(`[usuarios] importar usuarios, paso GoTrue inesperado: ${describirErrorSql(e)}`);
    return resultado(p, "verificar", MOTIVO_VERIFICAR, { usuario_id: usuarioId, incierto: Boolean(e && e.incierto) });
  }

  // C) Activación + rol + vínculo en UNA transacción (misma regla y mismo candado 4601 que la vinculación de RH). La comprobación del
  // vínculo va ANTES del COMMIT: si no se vinculó, ROLLBACK
  try {
    await transaccion(async (cliente) => {
      const act = await cliente.query("UPDATE usuarios SET auth_uid = $2, activo = true WHERE id = $1 AND auth_uid IS NULL", [usuarioId, authUid]);
      if (act.rowCount !== 1) throw new ErrorImportacionUsuarios(409, "La cuenta local cambió durante la importación");
      await cliente.query("INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [usuarioId, rolId]);
      await EmpleadoCuenta.tomarCandadoVinculacion(cliente);
      const vinculo = await EmpleadoCuenta.vincularEnTransaccion(cliente, [{ usuario_id: usuarioId, empleado_id: empleadoId }], { confirmarPrivilegiadas: false });
      if (!vinculo.detalle.length || vinculo.detalle[0].resultado !== "vinculada") throw new ErrorImportacionUsuarios(409, "El empleado ya tenía esa cuenta");
    });
    return resultado(p, "creada", "", { usuario_id: usuarioId, empleado_id: empleadoId, avisos: ev.avisos.filter((a) => a !== AVISO_REPARAR) });
  } catch (e) {
    // COMMIT sin confirmar o error inesperado: el estado puede ser cualquiera. No se compensa; el reintento adopta la cuenta
    const conocido = e instanceof EmpleadoCuenta.ErrorVinculacion || e instanceof ErrorImportacionUsuarios || (e && e.code === "55P03" && !e.enCommit);
    if (e && e.enCommit || !conocido) {
      console.error(`[usuarios] importar usuarios, activación y vínculo (incierto): ${describirErrorSql(e)}`);
      return resultado(p, "verificar", "No se pudo confirmar la activación y el vínculo de la cuenta. Vuelve a importar este archivo: se revisará el estado y se completará lo que falte", { usuario_id: usuarioId });
    }
    const motivo = e.code === "55P03" ? `${MENSAJE_BLOQUEO}. Se deshizo la cuenta de esta fila` : `${e.message}. Se deshizo la cuenta de esta fila`;
    if (adoptada) {
      // La cuenta de GoTrue ya existía de una importación anterior: no se borra; la fila queda inactiva con su auth_uid
      await conservarAuthUid(usuarioId, authUid);
      return resultado(p, "error", `${motivo}. La cuenta de Supabase Auth se conserva (fila inactiva): elimínala en Administración de usuarios si ya no se necesita`, { usuario_id: usuarioId });
    }
    // Compensación: la transacción C ya hizo ROLLBACK; esta cuenta de GoTrue la creó esta misma ejecución y aquí sí se sabe su id
    try {
      await servicio.eliminarUsuario(authUid);
    } catch (e2) {
      await conservarAuthUid(usuarioId, authUid);
      return resultado(p, "verificar", `${motivo}, pero no se pudo borrar la cuenta en Supabase Auth: elimínala en Administración de usuarios (conserva su identificador)`, { usuario_id: usuarioId });
    }
    try {
      await borrarFilaLocal(usuarioId);
    } catch (e3) {
      console.error(`[usuarios] importar usuarios, limpieza de la reserva: ${describirErrorSql(e3)}`);
      return resultado(p, "verificar", `${motivo}, pero no se pudo limpiar la cuenta local: vuelve a importar el archivo para reintentar`, { usuario_id: usuarioId });
    }
    return resultado(p, "error", motivo, reparada ? { usuario_id: usuarioId } : {});
  }
}

module.exports = UsuarioImportacion;
module.exports.clasificar = clasificar;
module.exports.ORIGEN_IMPORTACION = ORIGEN_IMPORTACION;
