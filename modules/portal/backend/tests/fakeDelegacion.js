// Pool falso con estado en memoria para probar services/delegacionPermisos.js sin Postgres.
// Reconoce solo las consultas de ese servicio (por texto normalizado) y simula BEGIN/ROLLBACK
// con una copia del estado: así se comprueba que un rechazo no deja cambios parciales.
// La verificación contra Postgres real se hizo aparte (ver code-notes.md).

const IDS = { super: 1, portal: 2, rhAdmin: 3, rhEmpleado: 4, ticketsAdmin: 5, auditor: 6, libre: 7 };
// usuarios: 10 portal_admin, 11 super_admin, 12 rh_empleado, 13 rh_admin, 14 rol_libre, 15 portal_admin, 16 tickets_admin, 17 sin rol
const USUARIOS = { portal: 10, super: 11, rhEmpleado: 12, rhAdmin: 13, libre: 14, portal2: 15, ticketsAdmin: 16, sinRol: 17 };

function estadoInicial() {
  const roles = [
    { id: 1, nombre: 'super_admin' },
    { id: 2, nombre: 'portal_admin' },
    { id: 3, nombre: 'rh_admin' },
    { id: 4, nombre: 'rh_empleado' },
    { id: 5, nombre: 'tickets_admin' },
    { id: 6, nombre: 'auditoria_viewer' },
    { id: 7, nombre: 'rol_libre' },
  ];
  const opciones = [
    { id: 1, modulo: 'portal', nombre: 'Roles' },
    { id: 2, modulo: 'portal', nombre: 'Usuarios' },
    { id: 3, modulo: 'rh', nombre: 'Empleados' },
    { id: 4, modulo: 'rh', nombre: 'Vacaciones' },
    { id: 5, modulo: 'rh', nombre: 'Calendario' },
    { id: 6, modulo: 'tickets', nombre: 'Tickets' },
  ];
  const rop = [];
  const dar = (rol, opcion, tipos) => tipos.forEach((tipo) => rop.push({ rol_id: rol, opcion_id: opcion, tipo }));
  opciones.forEach((o) => dar(1, o.id, ['consulta', 'edicion'])); // super_admin: todo
  dar(2, 1, ['consulta', 'edicion']); // portal_admin: portal completo + rh/Calendario
  dar(2, 2, ['consulta', 'edicion']);
  dar(2, 5, ['consulta', 'edicion']);
  dar(3, 3, ['consulta', 'edicion']); // rh_admin
  dar(3, 4, ['consulta', 'edicion']);
  dar(3, 5, ['consulta', 'edicion']);
  dar(4, 4, ['consulta', 'edicion']); // rh_empleado
  dar(4, 5, ['consulta']);
  dar(5, 6, ['consulta', 'edicion']); // tickets_admin
  return {
    roles,
    opciones,
    rop,
    usuarios: [{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }, { id: 15 }, { id: 16 }, { id: 17 }],
    usuario_rol: [
      { usuario_id: 10, rol_id: 2 }, // portal_admin
      { usuario_id: 11, rol_id: 1 }, // super_admin
      { usuario_id: 12, rol_id: 4 }, // rh_empleado (permisos que portal_admin NO posee)
      { usuario_id: 13, rol_id: 3 }, // rh_admin
      { usuario_id: 14, rol_id: 7 }, // rol_libre (sin permisos)
      { usuario_id: 15, rol_id: 2 }, // otro portal_admin (mismos permisos que el actor)
      { usuario_id: 16, rol_id: 5 }, // tickets_admin
      // 17: sin rol
    ],
  };
}

function crearPoolFalso() {
  const pool = { estado: estadoInicial(), consultas: [], conexiones: 0, liberadas: 0 };

  function ejecutar(estado, sql, p) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id, nombre FROM roles WHERE id = $1')) {
      return { rows: estado.roles.filter((r) => r.id === Number(p[0])) };
    }
    if (q.includes('FROM modulo_opciones mo JOIN modulos m ON m.id = mo.modulo_id WHERE m.nombre = $1')) {
      return { rows: estado.opciones.filter((o) => o.modulo === p[0]).map((o) => ({ ...o })) };
    }
    if (q.includes('FROM rol_opcion_permisos rop WHERE rop.rol_id = $1 AND rop.opcion_id = ANY($2::int[])')) {
      return {
        rows: estado.rop.filter((f) => f.rol_id === Number(p[0]) && p[1].includes(f.opcion_id)).map((f) => ({ ...f })),
      };
    }
    if (q.includes('FROM rol_opcion_permisos rop JOIN modulo_opciones mo ON mo.id = rop.opcion_id JOIN modulos m')) {
      return {
        rows: estado.rop
          .filter((f) => f.rol_id === Number(p[0]))
          .map((f) => {
            const o = estado.opciones.find((x) => x.id === f.opcion_id);
            return { opcion_id: f.opcion_id, tipo: f.tipo, modulo: o.modulo, opcion: o.nombre };
          }),
      };
    }
    if (q.startsWith('DELETE FROM rol_opcion_permisos WHERE rol_id = $1 AND opcion_id = $2 AND tipo = $3')) {
      estado.rop = estado.rop.filter(
        (f) => !(f.rol_id === Number(p[0]) && f.opcion_id === Number(p[1]) && f.tipo === p[2]),
      );
      return { rows: [] };
    }
    if (q.startsWith('INSERT INTO rol_opcion_permisos')) {
      const fila = { rol_id: Number(p[0]), opcion_id: Number(p[1]), tipo: p[2] };
      if (!estado.rop.some((f) => f.rol_id === fila.rol_id && f.opcion_id === fila.opcion_id && f.tipo === fila.tipo)) {
        estado.rop.push(fila);
      }
      return { rows: [] };
    }
    if (q.startsWith('SELECT id FROM usuarios WHERE id = $1')) {
      return { rows: estado.usuarios.filter((u) => u.id === Number(p[0])) };
    }
    if (q.startsWith('SELECT rol_id FROM usuario_rol WHERE usuario_id = $1')) {
      return { rows: estado.usuario_rol.filter((u) => u.usuario_id === Number(p[0])).map((u) => ({ rol_id: u.rol_id })) };
    }
    if (q.includes('SELECT r.nombre FROM usuario_rol ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1')) {
      return {
        rows: estado.usuario_rol
          .filter((u) => u.usuario_id === Number(p[0]))
          .map((u) => ({ nombre: estado.roles.find((r) => r.id === u.rol_id).nombre })),
      };
    }
    if (q.startsWith('DELETE FROM usuario_rol WHERE usuario_id = $1')) {
      estado.usuario_rol = estado.usuario_rol.filter((u) => u.usuario_id !== Number(p[0]));
      return { rows: [] };
    }
    if (q.startsWith('INSERT INTO usuario_rol')) {
      const fila = { usuario_id: Number(p[0]), rol_id: Number(p[1]) };
      if (!estado.usuario_rol.some((u) => u.usuario_id === fila.usuario_id && u.rol_id === fila.rol_id)) {
        estado.usuario_rol.push(fila);
      }
      return { rows: [] };
    }
    throw new Error(`Consulta no soportada por el pool falso: ${q}`);
  }

  pool.connect = async () => {
    pool.conexiones++;
    let copia = null;
    return {
      query: async (sql, params = []) => {
        const q = sql.trim();
        pool.consultas.push(q.replace(/\s+/g, ' '));
        if (q === 'BEGIN') {
          copia = JSON.parse(JSON.stringify(pool.estado));
          return { rows: [] };
        }
        if (q === 'COMMIT') {
          copia = null;
          return { rows: [] };
        }
        if (q === 'ROLLBACK') {
          if (copia) pool.estado = copia;
          copia = null;
          return { rows: [] };
        }
        return ejecutar(pool.estado, sql, params);
      },
      release: () => {
        pool.liberadas++;
      },
    };
  };
  pool.query = async (sql, params = []) => {
    const c = await pool.connect();
    try {
      return await c.query(sql, params);
    } finally {
      c.release();
    }
  };
  pool.tiene = (rol, opcion, tipo) =>
    pool.estado.rop.some((f) => f.rol_id === rol && f.opcion_id === opcion && f.tipo === tipo);
  pool.reiniciar = () => {
    pool.estado = estadoInicial();
    pool.consultas = [];
    pool.conexiones = 0;
    pool.liberadas = 0;
  };
  pool.rolDe = (usuario) => pool.estado.usuario_rol.filter((u) => u.usuario_id === usuario).map((u) => u.rol_id);
  return pool;
}

module.exports = { crearPoolFalso, IDS, USUARIOS };
