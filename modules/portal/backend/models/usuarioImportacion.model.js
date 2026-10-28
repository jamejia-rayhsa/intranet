// "Importar usuarios": crea cuentas Microsoft (auth_tipo 'ms365', SIN contraseña) con el rol rh_empleado y las vincula a su
// empleado (empleados.usuario_id) en el mismo paso. Solo super_admin (lo exige la ruta).
//
// Orden por fila (GoTrue y PostgreSQL no comparten transacción):
//   A) tx: fila local con auth_uid NULL y activo=false (nadie entra con ella); COMMIT.
//   B) GoTrue POST /admin/users sin contraseña (fuera de toda transacción).
//   C) tx: auth_uid + activo=true + rol rh_empleado + vínculo (reutiliza empleadoCuenta, candado 4601); COMMIT.
// Error HTTP definitivo de GoTrue (o fallo de C) -> se compensa (se borra lo creado). Sin respuesta (timeout/red) el resultado es
// INCIERTO: no se compensa, la fila queda 'verificar' (cuenta local inactiva y sin vincular; un reintento la reporta como
// "cuenta incompleta"). Nunca hay éxito parcial silencioso: cada fila termina en creada | omitida | error | verificar.
// Candado: pg_advisory_xact_lock(4701, 1) al inicio de cada transacción de fila y ANTES del 4601 (orden 4701 -> 4601).
const { grupo } = require("../config/database");
const supabaseAdmin = require("../services/supabaseAdmin.service");
const EmpleadoCuenta = require("../../../rh/backend/models/empleadoCuenta.model");
const { describirErrorSql } = require("../../../rh/backend/utils/logSeguro");
const U = require("../utils/importarUsuarios");

const ESPACIO_IMPORTAR_USUARIOS = 4701;
const CLAVE_IMPORTAR_USUARIOS = 1;
const LOCK_TIMEOUT = "3s";
const MAX_INCIERTOS_SEGUIDOS = 3; // GoTrue sin responder: se detiene (cada intento espera hasta 10 s)
const MENSAJE_EN_CURSO = "Hay otra importación de usuarios en curso; no se aplicó nada. Espera unos segundos y reintenta";
const MENSAJE_BLOQUEO = "Hay registros bloqueados por otra operación (por ejemplo una importación de empleados); la fila no se aplicó. Reintenta en unos segundos";
const MENSAJE_INCOMPLETA = "Ya existe una cuenta local incompleta (sin cuenta en Supabase Auth) de una importación interrumpida: elimínala en Administración de usuarios y vuelve a importar";

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

  const existentes = new Map(); // correo en minúsculas -> { conAuth }
  if (correos.length) {
    const r = await ejecutor.query(
      "SELECT LOWER(correo) AS correo_l, (auth_uid IS NOT NULL) AS con_auth FROM usuarios WHERE LOWER(correo) = ANY($1::text[])",
      [correos],
    );
    for (const f of r.rows) {
      const previo = existentes.get(f.correo_l);
      existentes.set(f.correo_l, { conAuth: Boolean(previo && previo.conAuth) || f.con_auth });
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
    if (previo) {
      return previo.conAuth
        ? { ...base, estado: "omitir", motivo: "Ya existe una cuenta con ese correo; no se modificó" }
        : { ...base, estado: "error", motivo: MENSAJE_INCOMPLETA };
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
    return { ...base, estado: "crear", motivo: "", empleado: r.empleado, avisos: r.avisos };
  });
}

const nombreFila = (p) => (p.fila ? `${p.fila.nombre} ${p.fila.apellido}`.trim() : (p.visible && p.visible.nombre) || "");

const EmpleadoDeSalida = (e) => (e ? { id: e.id, nombre: U.nombreDeEmpleado(e) } : null);

const UsuarioImportacion = {
  ESPACIO_IMPORTAR_USUARIOS, CLAVE_IMPORTAR_USUARIOS, ErrorImportacionUsuarios, MENSAJE_EN_CURSO,

  // Vista previa de SOLO LECTURA: nada se escribe en la BD ni en GoTrue. `preparadas`: salida de prepararFilasUsuarios.
  async vistaPrevia(preparadas) {
    await obtenerRolImportado(grupo);
    const evaluadas = await clasificar(grupo, preparadas);
    const filas = evaluadas.map((e) => ({
      fila: e.numero, nombre: nombreFila(e), correo: e.fila ? e.fila.correo : (e.visible && e.visible.correo) || "", estado: e.estado, motivo: e.motivo,
      empleado: EmpleadoDeSalida(e.empleado), avisos: e.avisos,
    }));
    const resumen = { total: filas.length, crear: 0, omitir: 0, error: 0 };
    for (const f of filas) resumen[f.estado]++;
    return { filas, resumen, rol: U.ROL_IMPORTADO };
  },

  // Aplica fila por fila (ver cabecera). Devuelve { filas:[{ fila, nombre, estado:'creada'|'omitida'|'error'|'verificar', motivo,
  // usuario_id, empleado_id, avisos }], creadas, omitidas, errores, verificar }. Lanza ErrorImportacionUsuarios 409 si ya hay una en curso.
  async aplicar(preparadas, { servicio = supabaseAdmin } = {}) {
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
        const r = await procesarFila(p, rolId, servicio);
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
    await cliente.query("COMMIT");
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
  if (e && (e.status === 422 || e.status === 409)) return "Supabase Auth ya tiene ese correo sin una cuenta local: no se adopta; revísalo con el administrador de la plataforma";
  if (e && e.status === 500 && e.definitivo) return "Supabase Auth no está configurado en el servidor";
  return `Supabase Auth rechazó el alta (HTTP ${e && e.status ? e.status : "sin código"})`;
}

async function borrarFilaLocal(usuarioId) {
  await grupo.query("DELETE FROM usuarios WHERE id = $1 AND auth_uid IS NULL", [usuarioId]);
}

async function procesarFila(p, rolId, servicio) {
  if (!p.fila) return resultado(p, "error", p.error);

  // A) Reserva local inactiva y sin auth_uid (la fila se revalida con el candado tomado: lo visto en la vista previa pudo cambiar)
  let reserva;
  try {
    reserva = await transaccion(async (cliente) => {
      const [ev] = await clasificar(cliente, [p]);
      if (ev.estado !== "crear") return { ev };
      const r = await cliente.query(
        `INSERT INTO usuarios (correo, nombre, apellido, auth_tipo, activo, auth_uid)
         VALUES ($1, $2, $3, 'ms365', false, NULL) RETURNING id`,
        [p.fila.correo, p.fila.nombre, p.fila.apellido],
      );
      return { ev, usuarioId: r.rows[0].id };
    });
  } catch (e) {
    if (e && e.code === "55P03") return resultado(p, "error", MENSAJE_BLOQUEO);
    if (e && e.code === "23505") return resultado(p, "omitida", "Ya existe una cuenta con ese correo; no se modificó");
    console.error(`[usuarios] importar usuarios, reserva local: ${describirErrorSql(e)}`);
    return resultado(p, "error", "Error interno al preparar la cuenta; no se creó nada");
  }
  const { ev, usuarioId } = reserva;
  if (ev.estado === "omitir") return resultado(p, "omitida", ev.motivo);
  if (ev.estado === "error") return resultado(p, "error", ev.motivo);
  const empleadoId = ev.empleado.id;

  // B) GoTrue, sin contraseña y sin transacción abierta
  let authUid;
  try {
    const nuevo = await servicio.crearUsuario({ correo: p.fila.correo, metadata: { usuario_id: usuarioId, nombre: p.fila.nombre, apellido: p.fila.apellido } });
    authUid = nuevo && nuevo.id;
    if (!authUid) throw Object.assign(new Error("respuesta sin id"), { incierto: true });
  } catch (e) {
    if (e && e.incierto) {
      return resultado(p, "verificar", "No se pudo confirmar el alta en Supabase Auth: la cuenta local quedó inactiva y sin vincular. Revísala en Administración de usuarios y elimínala antes de reintentar", { usuario_id: usuarioId, incierto: true });
    }
    try {
      await borrarFilaLocal(usuarioId);
    } catch (e2) {
      console.error(`[usuarios] importar usuarios, limpieza de la reserva: ${describirErrorSql(e2)}`);
      return resultado(p, "verificar", `${motivoGoTrue(e)}; además no se pudo limpiar la cuenta local inactiva: elimínala en Administración de usuarios`, { usuario_id: usuarioId });
    }
    return resultado(p, "error", motivoGoTrue(e));
  }

  // C) Activación + rol + vínculo en UNA transacción (misma regla y mismo candado 4601 que la vinculación de RH)
  try {
    const vinculo = await transaccion(async (cliente) => {
      const act = await cliente.query("UPDATE usuarios SET auth_uid = $2, activo = true WHERE id = $1 AND auth_uid IS NULL", [usuarioId, authUid]);
      if (act.rowCount !== 1) throw new ErrorImportacionUsuarios(409, "La cuenta local cambió durante la importación");
      await cliente.query("INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [usuarioId, rolId]);
      await EmpleadoCuenta.tomarCandadoVinculacion(cliente);
      return EmpleadoCuenta.vincularEnTransaccion(cliente, [{ usuario_id: usuarioId, empleado_id: empleadoId }], { confirmarPrivilegiadas: false });
    });
    if (!vinculo.detalle.length || vinculo.detalle[0].resultado !== "vinculada") throw new ErrorImportacionUsuarios(409, "El empleado ya tenía esa cuenta");
    return resultado(p, "creada", "", { usuario_id: usuarioId, empleado_id: empleadoId, avisos: ev.avisos });
  } catch (e) {
    let motivo;
    if (e instanceof EmpleadoCuenta.ErrorVinculacion || e instanceof ErrorImportacionUsuarios) motivo = `${e.message}. Se deshizo la cuenta de esta fila`;
    else if (e && e.code === "55P03") motivo = `${MENSAJE_BLOQUEO}. Se deshizo la cuenta de esta fila`;
    else {
      console.error(`[usuarios] importar usuarios, activación y vínculo: ${describirErrorSql(e)}`);
      motivo = "Error interno al activar y vincular la cuenta. Se deshizo la cuenta de esta fila";
    }
    // Compensación: la transacción C ya hizo ROLLBACK; GoTrue acaba de crear la cuenta y aquí sí sabemos su id
    try {
      await servicio.eliminarUsuario(authUid);
    } catch (e2) {
      // Sin poder borrar en GoTrue se conserva el auth_uid en la fila (inactiva) para que 'Eliminar' también limpie GoTrue
      try { await grupo.query("UPDATE usuarios SET auth_uid = $2 WHERE id = $1 AND auth_uid IS NULL", [usuarioId, authUid]); } catch (e3) { console.error(`[usuarios] importar usuarios, conservar auth_uid: ${describirErrorSql(e3)}`); }
      return resultado(p, "verificar", `${motivo}, pero no se pudo borrar la cuenta en Supabase Auth: elimínala en Administración de usuarios`, { usuario_id: usuarioId });
    }
    try {
      await borrarFilaLocal(usuarioId);
    } catch (e3) {
      console.error(`[usuarios] importar usuarios, limpieza de la reserva: ${describirErrorSql(e3)}`);
      return resultado(p, "verificar", `${motivo}, pero no se pudo limpiar la cuenta local: elimínala en Administración de usuarios`, { usuario_id: usuarioId });
    }
    return resultado(p, "error", motivo);
  }
}

module.exports = UsuarioImportacion;
module.exports.clasificar = clasificar;
