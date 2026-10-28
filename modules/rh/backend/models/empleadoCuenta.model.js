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
const MAX_CUENTAS_VISTA = 5000;
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
    ) AS con_acceso_asistencia
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
    privilegiada: roles.some((r) => Delegacion.esNombrePrivilegiado(r)),
    con_acceso_asistencia: Boolean(f.con_acceso_asistencia),
  };
}

const nombreDeEmpleado = (e) => [e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" ");

function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const EmpleadoCuenta = {
  ESPACIO_VINCULACION, CLAVE_VINCULACION, LOCK_TIMEOUT, MAX_PARES_LOTE: 50, ErrorVinculacion, MENSAJE_EN_CURSO,

  // Cuentas que ningún empleado tiene vinculadas (selector del perfil), con búsqueda y paginación.
  async cuentasDisponibles({ busqueda = "", pagina = 1, limite = 25 } = {}) {
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
    return new Map(r.rows.map((f) => [f.correo.toLowerCase(), { ...formatearCuenta(f), empleado_id: duenos.get(f.id) || null }]));
  },

  // Vista previa SIN cambios: contadores y lista paginada de cuentas sin empleado con la sugerencia por nombre.
  async vistaPrevia({ pagina = 1, limite = 25, estado = "" } = {}) {
    const [resCuentas, resEmpleados] = await Promise.all([
      grupo.query(
        `${SQL_CUENTAS} WHERE NOT EXISTS (SELECT 1 FROM empleados e WHERE e.usuario_id = u.id) ORDER BY u.nombre, u.apellido, u.id LIMIT ${MAX_CUENTAS_VISTA}`,
      ),
      grupo.query(
        `SELECT e.id, e.nombre, e.apellido_paterno, e.apellido_materno, e.numero_nomina,
                d.nombre AS departamento, p.nombre AS puesto
         FROM empleados e
         LEFT JOIN departamentos d ON d.id = e.departamento_id
         LEFT JOIN puestos p ON p.id = e.puesto_id
         WHERE e.usuario_id IS NULL AND COALESCE(e.estatus, 'activo') <> 'baja'
         ORDER BY e.nombre, e.apellido_paterno, e.id`,
      ),
    ]);
    const cuentas = resCuentas.rows.map(formatearCuenta);
    const empleados = resEmpleados.rows;
    const porId = new Map(empleados.map((e) => [e.id, e]));
    const sugerencias = sugerirCoincidencias(cuentas, empleados);

    const contadores = {
      cuentas_sin_empleado: cuentas.length,
      empleados_activos_sin_cuenta: empleados.length,
      coincidencia_exacta: 0,
      varias_posibles: 0,
      sin_coincidencia: 0,
      sin_acceso_asistencia: 0,
      privilegiadas: 0,
      inactivas: 0,
    };
    const lista = cuentas.map((c) => {
      const s = sugerencias.get(c.id);
      if (s.estado === ESTADOS_SUGERENCIA.EXACTA) contadores.coincidencia_exacta++;
      else if (s.estado === ESTADOS_SUGERENCIA.VARIAS) contadores.varias_posibles++;
      else contadores.sin_coincidencia++;
      if (!c.con_acceso_asistencia) contadores.sin_acceso_asistencia++;
      if (c.privilegiada) contadores.privilegiadas++;
      if (!c.activo) contadores.inactivas++;
      return {
        ...c,
        sugerencia: {
          estado: s.estado,
          candidatos: s.candidatos.slice(0, 10).map((id) => {
            const e = porId.get(id);
            return {
              id, nombre: nombreDeEmpleado(e), numero_nomina: e.numero_nomina || "",
              departamento: e.departamento || "", puesto: e.puesto || "",
            };
          }),
        },
      };
    });
    const filtradas = estado ? lista.filter((c) => c.sugerencia.estado === estado) : lista;
    const inicio = (pagina - 1) * limite;
    return {
      contadores,
      cuentas: filtradas.slice(inicio, inicio + limite),
      total: filtradas.length,
      pagina,
      limite,
      paginas_totales: Math.max(1, Math.ceil(filtradas.length / limite)),
      truncado: cuentas.length >= MAX_CUENTAS_VISTA,
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
    try {
      await cliente.query("BEGIN");
      transaccion = true;
      try {
        await cliente.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
        await cliente.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [ESPACIO_VINCULACION, CLAVE_VINCULACION]);
      } catch (e) {
        if (e && e.code === "55P03") throw new ErrorVinculacion(409, MENSAJE_EN_CURSO);
        throw e;
      }

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
        else if (e.estatus === "baja") motivo = "empleado_baja";
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
          "El lote incluye cuentas con rol privilegiado: vincularlas da su asistencia a ese empleado. Requiere una confirmación aparte; no se aplicó nada",
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
      await cliente.query("COMMIT");
      transaccion = false;
      return {
        vinculadas, omitidas, detalle,
        sin_acceso_asistencia: detalle.filter((d) => d.resultado === "vinculada" && d.sin_acceso_asistencia).length,
        privilegiadas: detalle.filter((d) => d.resultado === "vinculada" && d.privilegiada).length,
      };
    } catch (e) {
      if (transaccion) {
        try { await cliente.query("ROLLBACK"); } catch (e2) { console.error(`[empleados] rollback de vincular cuentas: ${describirErrorSql(e2)}`); }
      }
      if (e && e.code === "55P03") throw new ErrorVinculacion(409, MENSAJE_EN_CURSO);
      throw e;
    } finally {
      cliente.release();
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
    try {
      await cliente.query("BEGIN");
      transaccion = true;
      await cliente.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
      await cliente.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [ESPACIO_VINCULACION, CLAVE_VINCULACION]);
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
        try { await cliente.query("ROLLBACK"); } catch (e2) { console.error(`[empleados] rollback de desvincular: ${describirErrorSql(e2)}`); }
      }
      if (e && e.code === "55P03") throw new ErrorVinculacion(409, MENSAJE_EN_CURSO);
      throw e;
    } finally {
      cliente.release();
      enEjecucion--;
    }
  },
};

module.exports = EmpleadoCuenta;
