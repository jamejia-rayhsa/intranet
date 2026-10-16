// modules/portal/backend/services/delegacionPermisos.js
//
// Delegación de permisos y roles: evita que quien administra roles/usuarios (p. ej. portal_admin
// con portal/Roles:edicion o portal/Usuarios:edicion) se otorgue o otorgue a otros más poder del
// que él mismo tiene.
//
// Regla:
//  - super_admin: sin restricción.
//  - Cualquier otro: solo puede otorgar o quitar permisos (módulo/opción/tipo) que él posee. 'consulta'
//    se considera poseída también por quien tiene 'edicion' (misma semántica que verificarPermiso).
//  - Un no super_admin no puede tocar el rol super_admin ni crear/renombrar/borrar roles con nombres
//    privilegiados (el código decide por nombre: super_admin, rh_admin, tickets_admin).
//  - Asignar un rol a un usuario exige que el rol no sea privilegiado (decisión del humano: un no
//    super_admin PUEDE asignar roles no privilegiados aunque tengan más permisos que él). Un no
//    super_admin tampoco cambia su propio rol (no se auto-eleva).
//  - Un no super_admin no edita, desactiva ni borra usuarios con rol privilegiado.
//  - Cambiar o resetear la contraseña de un usuario (tomar su cuenta) exige además que los permisos del
//    rol del usuario sean un subconjunto de los del actor; si no, solo super_admin.
//
// Todas las funciones reciben un `cliente` de transacción: no piden otra conexión al pool
// (evita el interbloqueo del pool dentro de una transacción).

const NOMBRES_PRIVILEGIADOS = ["super_admin", "rh_admin", "tickets_admin"];
const TIPOS_VALIDOS = ["consulta", "edicion"];
const INT4_MAX = 2147483647;

class ErrorDelegacion extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

const esSuperAdmin = (usuario) => Boolean(usuario) && usuario.rol_nombre === "super_admin";

const esNombrePrivilegiado = (nombre) =>
  NOMBRES_PRIVILEGIADOS.includes(String(nombre || "").trim().toLowerCase());

// Solo cadenas o números: un array como ["9"] se convertiría en "9" con String() y pasaría
const esEnteroInt4 = (valor) =>
  (typeof valor === "string" || typeof valor === "number") &&
  /^\d+$/.test(String(valor)) &&
  Number(valor) <= INT4_MAX;

const clave = (opcionId, tipo) => `${opcionId}:${tipo}`;

/** Permisos efectivos de un rol como conjunto de claves "opcionId:tipo" (con nombres para los mensajes). */
async function permisosDeRol(cliente, rolId) {
  if (rolId === null || rolId === undefined) return { claves: new Set(), detalle: [] };
  const resultado = await cliente.query(
    `SELECT rop.opcion_id, rop.tipo, m.nombre AS modulo, mo.nombre AS opcion
     FROM rol_opcion_permisos rop
     JOIN modulo_opciones mo ON mo.id = rop.opcion_id
     JOIN modulos m ON m.id = mo.modulo_id
     WHERE rop.rol_id = $1`,
    [rolId],
  );
  return {
    claves: new Set(resultado.rows.map((f) => clave(f.opcion_id, f.tipo))),
    detalle: resultado.rows,
  };
}

/** ¿El conjunto de claves cubre (opción, tipo)? 'edicion' cubre también 'consulta'. */
function posee(claves, opcionId, tipo) {
  if (claves.has(clave(opcionId, tipo))) return true;
  return tipo === "consulta" && claves.has(clave(opcionId, "edicion"));
}

const etiqueta = (f) => `${f.modulo}/${f.opcion} (${f.tipo})`;

/**
 * Lanza 403 si el actor (no super_admin) intenta cambiar permisos que no posee.
 * @param {Set<string>} clavesActor
 * @param {Array<{opcion_id,tipo,modulo,opcion}>} cambios - permisos que se otorgan o se quitan
 * @param {'otorgar'|'quitar'} verbo
 */
function exigirPosesion(clavesActor, cambios, verbo) {
  const ajenos = cambios.filter((c) => !posee(clavesActor, c.opcion_id, c.tipo));
  if (ajenos.length > 0) {
    throw new ErrorDelegacion(
      403,
      `No puedes ${verbo} permisos que tú no posees: ${ajenos.map(etiqueta).join(", ")}`,
    );
  }
}

/**
 * Valida y normaliza el cuerpo de PUT /permisos/rol/:rol_id/modulo/:modulo.
 * Devuelve la lista sin duplicados [{opcion_id, tipo}] o lanza 400.
 */
function normalizarPermisosSolicitados(permisos) {
  if (!Array.isArray(permisos)) {
    throw new ErrorDelegacion(400, "permisos debe ser un array");
  }
  const vistos = new Map();
  for (const p of permisos) {
    if (!p || typeof p !== "object" || !esEnteroInt4(p.opcion_id)) {
      throw new ErrorDelegacion(400, "Cada permiso necesita un opcion_id numérico válido");
    }
    if (p.tipos !== undefined && !Array.isArray(p.tipos)) {
      throw new ErrorDelegacion(400, "tipos debe ser un array");
    }
    for (const tipo of p.tipos || []) {
      if (!TIPOS_VALIDOS.includes(tipo)) {
        throw new ErrorDelegacion(400, `Tipo de permiso inválido: ${tipo}`);
      }
      vistos.set(clave(Number(p.opcion_id), tipo), { opcion_id: Number(p.opcion_id), tipo });
    }
  }
  return [...vistos.values()];
}

/**
 * Reemplaza los permisos de un rol dentro de un módulo, validando todo ANTES de escribir y en una
 * sola transacción (si algo falla no queda ningún cambio). Aplica solo la diferencia.
 * @returns {Promise<{otorgados:number, quitados:number}>}
 */
async function guardarPermisosDeModulo(pool, actor, rolId, modulo, permisos) {
  if (!esEnteroInt4(rolId)) throw new ErrorDelegacion(400, "rol_id no válido");
  const solicitados = normalizarPermisosSolicitados(permisos);

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");

    // Bloquea el rol: dos ediciones simultáneas del mismo rol se serializan
    const rol = await cliente.query("SELECT id, nombre FROM roles WHERE id = $1 FOR UPDATE", [rolId]);
    if (rol.rows.length === 0) throw new ErrorDelegacion(404, "Rol no encontrado");

    const superAdmin = esSuperAdmin(actor);
    // Los permisos de los roles privilegiados (otorgar O quitar) son solo de super_admin: quitar
    // rh/Calendario a rh_admin degradaría a un rol de confianza aunque no escale privilegios
    if (!superAdmin && esNombrePrivilegiado(rol.rows[0].nombre)) {
      throw new ErrorDelegacion(
        403,
        `Solo un super_admin puede modificar los permisos del rol ${rol.rows[0].nombre}`,
      );
    }

    const opciones = await cliente.query(
      `SELECT mo.id, mo.nombre, m.nombre AS modulo
       FROM modulo_opciones mo JOIN modulos m ON m.id = mo.modulo_id
       WHERE m.nombre = $1`,
      [modulo],
    );
    if (opciones.rows.length === 0) throw new ErrorDelegacion(404, "Módulo no encontrado");
    const porId = new Map(opciones.rows.map((o) => [o.id, o]));
    const fuera = solicitados.find((s) => !porId.has(s.opcion_id));
    if (fuera) {
      throw new ErrorDelegacion(400, `La opción ${fuera.opcion_id} no pertenece al módulo ${modulo}`);
    }

    const actuales = await cliente.query(
      `SELECT rop.opcion_id, rop.tipo
       FROM rol_opcion_permisos rop
       WHERE rop.rol_id = $1 AND rop.opcion_id = ANY($2::int[])`,
      [rolId, opciones.rows.map((o) => o.id)],
    );
    const clavesActuales = new Set(actuales.rows.map((f) => clave(f.opcion_id, f.tipo)));
    const clavesSolicitadas = new Set(solicitados.map((s) => clave(s.opcion_id, s.tipo)));

    const aOtorgar = solicitados.filter((s) => !clavesActuales.has(clave(s.opcion_id, s.tipo)));
    const aQuitar = actuales.rows.filter((f) => !clavesSolicitadas.has(clave(f.opcion_id, f.tipo)));

    if (!superAdmin) {
      // Permisos del propio actor, leídos con el rol ya bloqueado (si edita su propio rol, el estado es el vigente)
      const { claves: clavesActor } = await permisosDeRol(cliente, actor && actor.rol_id);
      const conNombre = (f) => {
        const o = porId.get(f.opcion_id);
        return { ...f, modulo: o.modulo, opcion: o.nombre };
      };
      exigirPosesion(clavesActor, aOtorgar.map(conNombre), "otorgar");
      exigirPosesion(clavesActor, aQuitar.map(conNombre), "quitar");
    }

    for (const f of aQuitar) {
      await cliente.query(
        "DELETE FROM rol_opcion_permisos WHERE rol_id = $1 AND opcion_id = $2 AND tipo = $3",
        [rolId, f.opcion_id, f.tipo],
      );
    }
    for (const s of aOtorgar) {
      await cliente.query(
        `INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [rolId, s.opcion_id, s.tipo],
      );
    }

    await cliente.query("COMMIT");
    return { otorgados: aOtorgar.length, quitados: aQuitar.length };
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * Valida (con `cliente`, dentro de la transacción) que el actor pueda asignar `rolId`: el rol no debe
 * ser privilegiado (super_admin, rh_admin, tickets_admin). super_admin: sin restricción. Los roles no
 * privilegiados se pueden asignar aunque tengan más permisos que el actor (decisión del humano).
 */
async function exigirRolAsignable(cliente, actor, rolId) {
  const rol = await cliente.query("SELECT id, nombre FROM roles WHERE id = $1", [rolId]);
  if (rol.rows.length === 0) throw new ErrorDelegacion(404, "Rol no encontrado");
  if (esSuperAdmin(actor)) return rol.rows[0];

  if (esNombrePrivilegiado(rol.rows[0].nombre)) {
    throw new ErrorDelegacion(
      403,
      `No puedes asignar el rol ${rol.rows[0].nombre}: solo un super_admin puede hacerlo`,
    );
  }
  return rol.rows[0];
}

/**
 * Valida la lista de roles que un actor quiere asignar al CREAR una cuenta (alta de usuario o de
 * empleado): cada rol debe existir y ser asignable. Usa una conexión propia y la libera; se llama
 * ANTES de crear nada en GoTrue. Devuelve los ids como números, sin duplicados.
 */
async function validarRolesAsignables(pool, actor, rolIds) {
  if (!Array.isArray(rolIds)) throw new ErrorDelegacion(400, "roles debe ser un array");
  if (!rolIds.every(esEnteroInt4)) throw new ErrorDelegacion(400, "rol_id no válido");
  const ids = [...new Set(rolIds.map(Number))];
  if (ids.length === 0) return ids;
  const cliente = await pool.connect();
  try {
    for (const id of ids) await exigirRolAsignable(cliente, actor, id);
  } finally {
    cliente.release();
  }
  return ids;
}

/** El usuario objetivo no debe tener un rol privilegiado si el actor no es super_admin. */
async function exigirUsuarioNoPrivilegiado(cliente, actor, usuarioId) {
  if (esSuperAdmin(actor)) return;
  const roles = await cliente.query(
    `SELECT r.nombre FROM usuario_rol ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
    [usuarioId],
  );
  const privilegiado = roles.rows.find((r) => esNombrePrivilegiado(r.nombre));
  if (privilegiado) {
    throw new ErrorDelegacion(
      403,
      `No puedes modificar a un usuario con el rol ${privilegiado.nombre}: solo un super_admin puede hacerlo`,
    );
  }
}

/**
 * Los permisos de TODOS los roles `rolIds` deben ser poseídos por el actor (toma de cuenta); si no, 403.
 * No aplica a super_admin (quien llama ya lo descartó).
 */
async function exigirPermisosPoseidos(cliente, actor, rolIds) {
  const { claves: clavesActor } = await permisosDeRol(cliente, actor && actor.rol_id);
  for (const rolId of rolIds) {
    const { detalle } = await permisosDeRol(cliente, rolId);
    const ajenos = detalle.filter((f) => !posee(clavesActor, f.opcion_id, f.tipo));
    if (ajenos.length > 0) {
      throw new ErrorDelegacion(
        403,
        `No puedes cambiar la contraseña de este usuario: su rol incluye permisos que tú no posees (${ajenos
          .slice(0, 5)
          .map(etiqueta)
          .join(", ")}${ajenos.length > 5 ? ", ..." : ""}); solo un super_admin puede hacerlo`,
      );
    }
  }
}

/**
 * Operación ATÓMICA sobre un usuario (cambio de rol, edición, contraseña, borrado): valida y escribe en
 * UNA transacción con el usuario bloqueado (SELECT ... FOR UPDATE). Así un ascenso concurrente de rol
 * no se cuela entre la validación y la escritura, y un PUT {contraseña, rol_id} se valida contra el
 * ESTADO FINAL (roles resultantes) además del actual.
 *
 * @param {object} opciones
 * @param {undefined|null|""|number|string} opciones.rolId - undefined = no cambia el rol; null/"" = quitarlo
 * @param {boolean} opciones.tomaCuenta - la operación cambia credenciales: exige poseer los permisos de los
 *   roles actuales Y finales (no super_admin)
 * @param {(cliente)=>Promise<any>} [opciones.escribir] - escrituras extra, con el MISMO cliente y tras
 *   validar y cambiar el rol. Si lanza, todo se revierte. Pensada para llamar a GoTrue AL FINAL: un fallo
 *   de GoTrue revierte la BD; el único riesgo residual es que falle el COMMIT después de GoTrue.
 * @returns {Promise<{encontrado:boolean, valor?:any}>}
 */
async function operarSobreUsuario(pool, actor, usuarioId, { rolId, tomaCuenta = false, escribir } = {}) {
  const cambiaRol = rolId !== undefined;
  const quitar = rolId === null || rolId === "";
  if (cambiaRol && !quitar && !esEnteroInt4(rolId)) throw new ErrorDelegacion(400, "rol_id no válido");
  if (!esEnteroInt4(usuarioId)) throw new ErrorDelegacion(400, "id de usuario no válido");

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const usuario = await cliente.query("SELECT id FROM usuarios WHERE id = $1 FOR UPDATE", [usuarioId]);
    if (usuario.rows.length === 0) {
      await cliente.query("ROLLBACK");
      return { encontrado: false };
    }

    // Estado actual, leído con el usuario ya bloqueado
    const actuales = await cliente.query("SELECT rol_id FROM usuario_rol WHERE usuario_id = $1", [usuarioId]);
    const rolesActuales = actuales.rows.map((f) => Number(f.rol_id));
    await exigirUsuarioNoPrivilegiado(cliente, actor, usuarioId);

    // Mismo rol que ya tiene: no cambia nada (editar el nombre de un usuario conserva su rol)
    const sinCambio =
      cambiaRol && !quitar && rolesActuales.length === 1 && rolesActuales[0] === Number(rolId);
    const hayCambioDeRol = cambiaRol && !sinCambio;

    if (hayCambioDeRol) {
      // Un no super_admin no cambia ni quita su propio rol (se auto-elevaría con un rol con más permisos)
      if (!esSuperAdmin(actor) && actor && Number(actor.usuario_id) === Number(usuarioId)) {
        throw new ErrorDelegacion(403, "No puedes cambiar tu propio rol: pídelo a un super_admin");
      }
      if (!quitar) await exigirRolAsignable(cliente, actor, Number(rolId));
    }

    const rolesFinales = !hayCambioDeRol ? rolesActuales : quitar ? [] : [Number(rolId)];
    if (tomaCuenta && !esSuperAdmin(actor)) {
      await exigirPermisosPoseidos(cliente, actor, [...new Set([...rolesActuales, ...rolesFinales])]);
    }

    if (hayCambioDeRol) {
      await cliente.query("DELETE FROM usuario_rol WHERE usuario_id = $1", [usuarioId]);
      if (!quitar) {
        await cliente.query(
          "INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [usuarioId, Number(rolId)],
        );
      }
    }

    const valor = escribir ? await escribir(cliente) : undefined;
    await cliente.query("COMMIT");
    return { encontrado: true, valor };
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * Cambia el rol de un usuario (un solo rol: se reemplaza el anterior) en una transacción.
 * `nuevoRolId` null/"" = quitar el rol. Valida antes de escribir.
 * @returns {Promise<boolean>} false si el usuario no existe
 */
async function cambiarRolDeUsuario(pool, actor, usuarioId, nuevoRolId) {
  if (nuevoRolId === undefined) throw new ErrorDelegacion(400, "rol_id no válido");
  const { encontrado } = await operarSobreUsuario(pool, actor, usuarioId, { rolId: nuevoRolId });
  return encontrado;
}

/**
 * Comprobación de solo lectura para editar, desactivar o borrar a un usuario: un no super_admin no
 * puede hacerlo sobre un usuario con rol privilegiado (tampoco sobre sí mismo si lo es).
 * Ojo: para escribir use operarSobreUsuario (valida y escribe bajo el mismo bloqueo).
 */
async function validarUsuarioAdministrable(pool, actor, usuarioId) {
  if (esSuperAdmin(actor)) return;
  if (!esEnteroInt4(usuarioId)) throw new ErrorDelegacion(400, "id de usuario no válido");
  const cliente = await pool.connect();
  try {
    await exigirUsuarioNoPrivilegiado(cliente, actor, usuarioId);
  } finally {
    cliente.release();
  }
}

/**
 * Cambiar o resetear la contraseña de un usuario equivale a tomar su cuenta: además de no ser
 * privilegiado, los permisos de TODOS sus roles deben ser poseídos por el actor. Si no, solo super_admin.
 * Solo lectura: para escribir use operarSobreUsuario({ tomaCuenta: true }).
 */
async function validarCuentaTomable(pool, actor, usuarioId) {
  if (esSuperAdmin(actor)) return;
  if (!esEnteroInt4(usuarioId)) throw new ErrorDelegacion(400, "id de usuario no válido");
  const cliente = await pool.connect();
  try {
    await exigirUsuarioNoPrivilegiado(cliente, actor, usuarioId);
    const roles = await cliente.query("SELECT rol_id FROM usuario_rol WHERE usuario_id = $1", [usuarioId]);
    await exigirPermisosPoseidos(
      cliente,
      actor,
      roles.rows.map((f) => f.rol_id),
    );
  } finally {
    cliente.release();
  }
}

/** Responde un ErrorDelegacion; devuelve true si lo manejó. */
function responderErrorDelegacion(res, error) {
  if (error instanceof ErrorDelegacion) {
    res.status(error.estado).json({ exito: false, mensaje: error.message });
    return true;
  }
  return false;
}

module.exports = {
  NOMBRES_PRIVILEGIADOS,
  ErrorDelegacion,
  esSuperAdmin,
  esNombrePrivilegiado,
  posee,
  permisosDeRol,
  guardarPermisosDeModulo,
  exigirRolAsignable,
  exigirUsuarioNoPrivilegiado,
  cambiarRolDeUsuario,
  operarSobreUsuario,
  validarUsuarioAdministrable,
  validarCuentaTomable,
  validarRolesAsignables,
  esEnteroInt4,
  responderErrorDelegacion,
};
