// Relación cuenta de usuario <-> empleado. SOLO escribe empleados.usuario_id: no crea cuentas, no toca GoTrue, roles,
// contraseñas ni la tabla usuarios. Todo lo demás (alta de la cuenta y su rol) lo hace el administrador de usuarios.
const { grupo } = require("../config/database");
const Delegacion = require("../../../portal/backend/services/delegacionPermisos");
const { describirErrorSql } = require("../utils/logSeguro");
const { sugerirCoincidencias, ESTADOS_SUGERENCIA } = require("../utils/vincularCuentas");

// Candado consultivo propio de la vinculación: pg_advisory_xact_lock(4601, 1). Espacios en uso en el repo: 4217
// (vacaciones), 4301/4302 (turnos), 4410 (importaciones), 4501 (motor de asistencia).
const ESPACIO_VINCULACION = 4601;
const CLAVE_VINCULACION = 1;
const LOCK_TIMEOUT = "3s";
const MAX_VINCULACIONES_SIMULTANEAS = 2;
const MIN_BUSQUEDA = 2;
const MAX_LIMITE_SELECTOR = 25;
const MAX_CANDIDATOS = 10;
const MAX_AVISOS = 20;
const MENSAJE_BLOQUEO_FILAS = "Hay registros bloqueados por otra operación (por ejemplo una importación en curso); no se aplicó nada. Espera unos segundos y reintenta";
const MENSAJE_EN_CURSO = "Hay otra vinculación en curso; no se aplicó nada. Espera unos segundos y reintenta";

class ErrorVinculacion extends Error {
  constructor(estado, mensaje, extra) {
    super(mensaje);
    this.name = "ErrorVinculacion";
    this.estado = estado;
    this.extra = extra || {};
  }
}

let enEjecucion = 0;

// Privilegiada = algún rol con nombre privilegiado (super_admin, rh_admin, tickets_admin) O con permisos de edición de
// administración (portal/Usuarios, portal/Roles, rh/Empleados, rh/Asistencia): vincularla da el acceso de esa persona a un
// empleado, y por eso pide confirmación aparte. `correo_duplicado`: otra cuenta con el mismo correo salvo mayúsculas.
// Acceso a Asistencia = algún rol de la cuenta es super_admin o tiene una opción rh/Asistencia (consulta o edición).
const SQL_CUENTAS = `
  SELECT u.id, u.correo, u.nombre, u.apellido, u.activo,
    COALESCE((SELECT array_agg(DISTINCT r.nombre ORDER BY r.nombre) FROM usuario_rol ur JOIN roles r ON r.id = ur.rol_id
              WHERE ur.usuario_id = u.id), '{}') AS roles,
    EXISTS (
      SELECT 1 FROM usuario_rol ur JOIN roles r ON r.id = ur.rol_id
      WHERE ur.usuario_id = u.id AND (
        r.nombre = 'super_admin' OR EXISTS (
          SELECT 1 FROM rol_opcion_permisos rop
          JOIN modulo_opciones mo ON mo.id = rop.opcion_id
          JOIN modulos m ON m.id = mo.modulo_id
          WHERE rop.rol_id = r.id AND m.nombre = 'rh' AND mo.nombre = 'Asistencia')
      )
    ) AS con_acceso_asistencia,
    EXISTS (
      SELECT 1 FROM usuario_rol ur
      JOIN rol_opcion_permisos rop ON rop.rol_id = ur.rol_id AND rop.tipo = 'edicion'
      JOIN modulo_opciones mo ON mo.id = rop.opcion_id
      JOIN modulos m ON m.id = mo.modulo_id
      WHERE ur.usuario_id = u.id
        AND ((m.nombre = 'portal' AND mo.nombre IN ('Usuarios', 'Roles')) OR (m.nombre = 'rh' AND mo.nombre IN ('Empleados', 'Asistencia')))
    ) AS con_permisos_admin,
    EXISTS (SELECT 1 FROM usuarios u2 WHERE LOWER(u2.correo) = LOWER(u.correo) AND u2.id <> u.id) AS correo_duplicado
  FROM usuarios u
`;

function formatearCuenta(f) {
  const roles = Array.isArray(f.roles) ? f.roles : [];
  return {
    id: f.id,
    correo: f.correo,
    nombre: f.nombre,
    apellido: f.apellido || "",
    activo: f.activo !== false,
    roles,
    privilegiada: roles.some((r) => Delegacion.esNombrePrivilegiado(r)) || Boolean(f.con_permisos_admin),
    correo_duplicado: Boolean(f.correo_duplicado),
    con_acceso_asistencia: Boolean(f.con_acceso_asistencia),
  };
}

const nombreDeEmpleado = (e) => [e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" ");

function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const EmpleadoCuenta = {
  ESPACIO_VINCULACION, CLAVE_VINCULACION, LOCK_TIMEOUT, MAX_PARES_LOTE: 50, ErrorVinculacion, MENSAJE_EN_CURSO, MENSAJE_BLOQUEO_FILAS,

  // Cuentas que ningún empleado tiene vinculadas (selector del perfil), con búsqueda y paginación.
  // Exige una búsqueda de MIN_BUSQUEDA caracteres como mínimo (no se vuelcan todas las cuentas) y limita la página.
  async cuentasDisponibles({ busqueda = "", pagina = 1, limite = 25 } = {}) {
    limite = Math.min(limite, MAX_LIMITE_SELECTOR);
    if (busqueda.length < MIN_BUSQUEDA) {
      return { cuentas: [], total: 0, pagina, limite, paginas_totales: 1, requiere_busqueda: true, minimo_busqueda: MIN_BUSQUEDA };
    }
    const valores = [];
    let filtro = "WHERE NOT EXISTS (SELECT 1 FROM empleados e WHERE e.usuario_id = u.id)";
    if (busqueda) {
      valores.push(`%${escaparLike(busqueda)}%`);
      filtro += ` AND (u.nombre ILIKE $1 OR COALESCE(u.apellido, '') ILIKE $1 OR u.correo ILIKE $1
                  OR (u.nombre || ' ' || COALESCE(u.apellido, '')) ILIKE $1)`;
    }
    const total = await grupo.query(`SELECT COUNT(*)::int AS n FROM usuarios u ${filtro}`, valores);
    const filas = await grupo.query(
      `${SQL_CUENTAS} ${filtro} ORDER BY u.nombre, u.apellido, u.id LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limite, (pagina - 1) * limite],
    );
    const n = total.rows[0].n;
    return { cuentas: filas.rows.map(formatearCuenta), total: n, pagina, limite, paginas_totales: Math.max(1, Math.ceil(n / limite)) };
  },

  // Cuentas por correo (sin distinguir mayúsculas) con el empleado que ya las tiene (si lo hay), para el importador.
  // `cliente`: la transacción del lote. Map correo en minúsculas -> cuenta formateada + empleado_id.
  async cuentasPorCorreo(cliente, correos) {
    const r = await cliente.query(
      `${SQL_CUENTAS} WHERE LOWER(u.correo) = ANY($1::text[])`,
      [correos.map((c) => c.toLowerCase())],
    );
    const ids = r.rows.map((f) => f.id);
    const duenos = ids.length
      ? new Map((await cliente.query("SELECT usuario_id, id FROM empleados WHERE usuario_id = ANY($1::int[])", [ids])).rows.map((f) => [f.usuario_id, f.id]))
      : new Map();
    const mapa = new Map();
    for (const f of r.rows) {
      const k = f.correo.toLowerCase();
      // Dos cuentas cuyo correo solo difiere en mayúsculas: no se elige una en silencio
      if (mapa.has(k)) mapa.get(k).ambigua = true;
      else mapa.set(k, { ...formatearCuenta(f), empleado_id: duenos.get(f.id) || null, ambigua: false });
    }
    return mapa;
  },

  // Vista previa SIN cambios: contadores (sobre TODAS las cuentas sin empleado) y lista paginada con la sugerencia por
  // nombre. Solo se sugieren empleados con estatus 'activo' (suspendidos y bajas no se vinculan). Avisa de cuentas vinculadas
  // a empleados que ya no están activos, de usuarios con más de un empleado y de la falta de la UNIQUE sobre usuario_id.
  async vistaPrevia({ pagina = 1, limite = 25, estado = "" } = {}) {
    const [resCuentas, resEmpleados, resNoActivos, resDuplicados, resUnique] = await Promise.all([
      grupo.query(`${SQL_CUENTAS} WHERE NOT EXISTS (SELECT 1 FROM empleados e WHERE e.usuario_id = u.id) ORDER BY u.nombre, u.apellido, u.id`),
      grupo.query(
        `SELECT e.id, e.nombre, e.apellido_paterno, e.apellido_materno, e.numero_nomina,
                d.nombre AS departamento, p.nombre AS puesto,
                (SELECT COUNT(*)::int FROM empleados s WHERE s.jefe_inmediato_id = e.id AND COALESCE(s.estatus, 'activo') = 'activo') AS subordinados
         FROM empleados e
         LEFT JOIN departamentos d ON d.id = e.departamento_id
         LEFT JOIN puestos p ON p.id = e.puesto_id
         WHERE e.usuario_id IS NULL AND COALESCE(e.estatus, 'activo') = 'activo'
         ORDER BY e.nombre, e.apellido_paterno, e.id`,
      ),
      grupo.query(
        `SELECT e.id AS empleado_id, e.usuario_id, COALESCE(e.estatus, 'activo') AS estatus
         FROM empleados e WHERE e.usuario_id IS NOT NULL AND COALESCE(e.estatus, 'activo') <> 'activo' ORDER BY e.id`,
      ),
      grupo.query(
        `SELECT usuario_id, array_agg(id ORDER BY id) AS empleados FROM empleados
         WHERE usuario_id IS NOT NULL GROUP BY usuario_id HAVING COUNT(*) > 1 ORDER BY usuario_id`,
      ),
      grupo.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
           WHERE i.indrelid = 'empleados'::regclass AND i.indisunique AND i.indnatts = 1 AND i.indpred IS NULL AND a.attname = 'usuario_id'
         ) AS existe`,
      ),
    ]);
    const cuentas = resCuentas.rows.map(formatearCuenta);
    const empleados = resEmpleados.rows;
    const porId = new Map(empleados.map((e) => [e.id, e]));
    const sugerencias = sugerirCoincidencias(cuentas.filter((c) => !c.correo_duplicado), empleados);

    const contadores = {
      cuentas_sin_empleado: cuentas.length,
      empleados_activos_sin_cuenta: empleados.length,
      coincidencia_exacta: 0,
      varias_posibles: 0,
      sin_coincidencia: 0,
      sin_acceso_asistencia: 0,
      privilegiadas: 0,
      inactivas: 0,
      correos_duplicados: 0,
    };
    const lista = cuentas.map((c) => {
      const s = sugerencias.get(c.id) || { estado: ESTADOS_SUGERENCIA.SIN, candidatos: [] };
      if (s.estado === ESTADOS_SUGERENCIA.EXACTA) contadores.coincidencia_exacta++;
      else if (s.estado === ESTADOS_SUGERENCIA.VARIAS) contadores.varias_posibles++;
      else contadores.sin_coincidencia++;
      if (!c.con_acceso_asistencia) contadores.sin_acceso_asistencia++;
      if (c.privilegiada) contadores.privilegiadas++;
      if (!c.activo) contadores.inactivas++;
      if (c.correo_duplicado) contadores.correos_duplicados++;
      return {
        ...c,
        sugerencia: {
          estado: s.estado,
          candidatos_total: s.candidatos.length,
          candidatos: s.candidatos.slice(0, MAX_CANDIDATOS).map((id) => {
            const e = porId.get(id);
            return {
              id, nombre: nombreDeEmpleado(e), numero_nomina: e.numero_nomina || "",
              departamento: e.departamento || "", puesto: e.puesto || "", subordinados: e.subordinados || 0,
            };
          }),
        },
      };
    });
    const filtradas = estado ? lista.filter((c) => c.sugerencia.estado === estado) : lista;
    const inicio = (pagina - 1) * limite;
    return {
      contadores,
      avisos: {
        vinculadas_a_no_activos: resNoActivos.rows.slice(0, MAX_AVISOS).map((f) => ({ empleado_id: f.empleado_id, usuario_id: f.usuario_id, estatus: f.estatus })),
        total_vinculadas_a_no_activos: resNoActivos.rows.length,
        usuarios_con_varios_empleados: resDuplicados.rows.slice(0, MAX_AVISOS).map((f) => ({ usuario_id: f.usuario_id, empleados: f.empleados })),
        total_usuarios_con_varios_empleados: resDuplicados.rows.length,
        falta_unique_usuario_id: !resUnique.rows[0].existe,
      },
      cuentas: filtradas.slice(inicio, inicio + limite),
      total: filtradas.length,
      pagina,
      limite,
      paginas_totales: Math.max(1, Math.ceil(filtradas.length / limite)),
    };
  },

  // Toma el candado propio (xact) con lock_timeout local a la transacción de `cliente`; 409 si otra vinculación lo tiene.
  // Lo usa también el importador de usuarios (portal) dentro de SU transacción: así la vinculación es la misma regla y el mismo candado.
  async tomarCandadoVinculacion(cliente) {
    try {
      await cliente.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
      await cliente.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [ESPACIO_VINCULACION, CLAVE_VINCULACION]);
    } catch (e) {
      if (e && e.code === "55P03") throw new ErrorVinculacion(409, MENSAJE_EN_CURSO);
      throw e;
    }
  },

  // Revalida y aplica los pares con las filas bloqueadas, DENTRO de la transacción abierta de `cliente` (que ya tomó el candado
  // y hará COMMIT/ROLLBACK). Lanza ErrorVinculacion (409/400) sin escribir nada si algo no se puede aplicar.
  async vincularEnTransaccion(cliente, pares, { confirmarPrivilegiadas = false } = {}) {
    const empleadoIds = pares.map((p) => p.empleado_id).sort((a, b) => a - b);
    const usuarioIds = pares.map((p) => p.usuario_id).sort((a, b) => a - b);
    const empleados = new Map(
      (await cliente.query(
        "SELECT id, usuario_id, COALESCE(estatus, 'activo') AS estatus FROM empleados WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE",
        [empleadoIds],
      )).rows.map((f) => [f.id, f]),
    );
    const cuentas = new Map(
      (await cliente.query(`${SQL_CUENTAS} WHERE u.id = ANY($1::int[]) ORDER BY u.id`, [usuarioIds])).rows
        .map((f) => [f.id, formatearCuenta(f)]),
    );
    await cliente.query("SELECT 1 FROM usuarios WHERE id = ANY($1::int[]) ORDER BY id FOR SHARE", [usuarioIds]);
    const duenos = new Map(
      (await cliente.query("SELECT id, usuario_id FROM empleados WHERE usuario_id = ANY($1::int[])", [usuarioIds])).rows
        .map((f) => [f.usuario_id, f.id]),
    );

    const conflictos = [];
    const trabajo = [];
    for (const p of pares) {
      const e = empleados.get(p.empleado_id);
      const c = cuentas.get(p.usuario_id);
      let motivo = null;
      if (!e) motivo = "empleado_no_existe";
      else if (!c) motivo = "cuenta_no_existe";
      else if (e.usuario_id === p.usuario_id) { trabajo.push({ ...p, cuenta: c, omitida: true }); continue; }
      else if (e.estatus !== "activo") motivo = "empleado_no_activo";
      else if (c.correo_duplicado) motivo = "cuenta_correo_duplicado";
      else if (e.usuario_id !== null) motivo = "empleado_ya_vinculado";
      else if (duenos.has(p.usuario_id)) motivo = "cuenta_ya_vinculada";
      if (motivo) conflictos.push({ usuario_id: p.usuario_id, empleado_id: p.empleado_id, motivo });
      else trabajo.push({ ...p, cuenta: c, omitida: false });
    }
    if (conflictos.length) {
      throw new ErrorVinculacion(
        409,
        `Los datos cambiaron desde la vista previa: ${conflictos.length} vínculo(s) ya no se pueden aplicar. No se aplicó nada; actualiza la vista previa`,
        { conflictos },
      );
    }
    const privilegiadas = trabajo.filter((t) => !t.omitida && t.cuenta.privilegiada).map((t) => t.usuario_id);
    if (privilegiadas.length && !confirmarPrivilegiadas) {
      throw new ErrorVinculacion(
        400,
        "El lote incluye cuentas con rol privilegiado: vincularlas da a esa persona el acceso a lo del empleado (asistencia, expediente, recibos y, si es jefe, vacaciones de su equipo). Requiere una confirmación aparte; no se aplicó nada",
        { requiere_confirmacion_privilegiadas: true, cuentas_privilegiadas: privilegiadas },
      );
    }

    const detalle = [];
    let vinculadas = 0;
    let omitidas = 0;
    for (const t of trabajo.sort((a, b) => a.empleado_id - b.empleado_id)) {
      if (!t.omitida) {
        let r;
        try {
          r = await cliente.query(
            "UPDATE empleados SET usuario_id = $1, fecha_actualizacion = NOW() WHERE id = $2 AND usuario_id IS NULL",
            [t.usuario_id, t.empleado_id],
          );
        } catch (e) {
          if (e && e.code === "23505") throw new ErrorVinculacion(409, "La cuenta ya está vinculada a otro empleado; no se aplicó nada", { conflictos: [{ usuario_id: t.usuario_id, empleado_id: t.empleado_id, motivo: "cuenta_ya_vinculada" }] });
          throw e;
        }
        if (r.rowCount !== 1) throw new ErrorVinculacion(409, "El empleado ya está vinculado; no se aplicó nada", { conflictos: [{ usuario_id: t.usuario_id, empleado_id: t.empleado_id, motivo: "empleado_ya_vinculado" }] });
        vinculadas++;
      } else omitidas++;
      detalle.push({
        usuario_id: t.usuario_id, empleado_id: t.empleado_id, resultado: t.omitida ? "omitida" : "vinculada",
        sin_acceso_asistencia: !t.cuenta.con_acceso_asistencia, privilegiada: t.cuenta.privilegiada, inactiva: !t.cuenta.activo,
      });
    }
    return {
      vinculadas, omitidas, detalle,
      sin_acceso_asistencia: detalle.filter((d) => d.resultado === "vinculada" && d.sin_acceso_asistencia).length,
      privilegiadas: detalle.filter((d) => d.resultado === "vinculada" && d.privilegiada).length,
    };
  },

  // Aplica un lote de vínculos { usuario_id, empleado_id } en UNA transacción con el candado propio. Revalida todo con
  // las filas bloqueadas: si algo cambió desde la vista previa (cuenta o empleado ya vinculados, empleado de baja,
  // cuenta o empleado inexistentes) no se aplica NADA y se lanza ErrorVinculacion 409. Un par ya aplicado (el mismo
  // empleado con la misma cuenta) es 'omitida': re-ejecutar no falla ni duplica. Nunca pisa un usuario_id.
  async vincularLote(pares, { confirmarPrivilegiadas = false } = {}) {
    if (enEjecucion >= MAX_VINCULACIONES_SIMULTANEAS) throw new ErrorVinculacion(409, MENSAJE_EN_CURSO);
    enEjecucion++;
    let cliente;
    try {
      cliente = await grupo.connect();
    } catch (e) {
      enEjecucion--;
      throw e;
    }
    let transaccion = false;
    let rollbackFallo = null;
    try {
      await cliente.query("BEGIN");
      transaccion = true;
      await EmpleadoCuenta.tomarCandadoVinculacion(cliente);
      const resultado = await EmpleadoCuenta.vincularEnTransaccion(cliente, pares, { confirmarPrivilegiadas });
      await cliente.query("COMMIT");
      transaccion = false;
      return resultado;
    } catch (e) {
      if (transaccion) {
        try { await cliente.query("ROLLBACK"); } catch (e2) { rollbackFallo = e2; console.error(`[empleados] rollback de vincular cuentas: ${describirErrorSql(e2)}`); }
      }
      // 55P03 fuera del candado propio: una fila bloqueada por otra operación (p. ej. una importación)
      if (e && e.code === "55P03") throw new ErrorVinculacion(409, MENSAJE_BLOQUEO_FILAS);
      throw e;
    } finally {
      cliente.release(rollbackFallo || undefined);
      enEjecucion--;
    }
  },

  // Vincula o desvincula UN empleado. usuarioId null = desvincular (solo si tiene cuenta). Mismas reglas y mismo candado.
  // Devuelve { accion: 'vinculada'|'omitida'|'desvinculada'|'sin_cuenta', empleado_id, usuario_id, anterior, cuenta }.
  async cambiarCuentaDeEmpleado(empleadoId, usuarioId, { confirmarPrivilegiada = false } = {}) {
    if (usuarioId !== null) {
      const r = await this.vincularLote([{ usuario_id: usuarioId, empleado_id: empleadoId }], { confirmarPrivilegiadas: confirmarPrivilegiada });
      const d = r.detalle[0];
      return { accion: d.resultado === "vinculada" ? "vinculada" : "omitida", empleado_id: empleadoId, usuario_id: usuarioId, anterior: null, cuenta: d };
    }
    if (enEjecucion >= MAX_VINCULACIONES_SIMULTANEAS) throw new ErrorVinculacion(409, MENSAJE_EN_CURSO);
    enEjecucion++;
    let cliente;
    try {
      cliente = await grupo.connect();
    } catch (e) {
      enEjecucion--;
      throw e;
    }
    let transaccion = false;
    let rollbackFallo = null;
    try {
      await cliente.query("BEGIN");
      transaccion = true;
      await cliente.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
      try {
        await cliente.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [ESPACIO_VINCULACION, CLAVE_VINCULACION]);
      } catch (e) {
        if (e && e.code === "55P03") throw new ErrorVinculacion(409, MENSAJE_EN_CURSO);
        throw e;
      }
      const f = (await cliente.query("SELECT id, usuario_id FROM empleados WHERE id = $1 FOR UPDATE", [empleadoId])).rows[0];
      if (!f) throw new ErrorVinculacion(404, "Empleado no encontrado");
      let accion = "sin_cuenta";
      if (f.usuario_id !== null) {
        await cliente.query("UPDATE empleados SET usuario_id = NULL, fecha_actualizacion = NOW() WHERE id = $1", [empleadoId]);
        accion = "desvinculada";
      }
      await cliente.query("COMMIT");
      transaccion = false;
      return { accion, empleado_id: empleadoId, usuario_id: null, anterior: f.usuario_id, cuenta: null };
    } catch (e) {
      if (transaccion) {
        try { await cliente.query("ROLLBACK"); } catch (e2) { rollbackFallo = e2; console.error(`[empleados] rollback de desvincular: ${describirErrorSql(e2)}`); }
      }
      if (e && e.code === "55P03") throw new ErrorVinculacion(409, MENSAJE_BLOQUEO_FILAS);
      throw e;
    } finally {
      cliente.release(rollbackFallo || undefined);
      enEjecucion--;
    }
  },
};

module.exports = EmpleadoCuenta;
