// Lógica del modelo de vinculación con una BD en memoria que interpreta solo sus consultas. Solo se escribe usuario_id.
jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn(), connect: jest.fn() } }));
const { grupo } = require("../../../portal/backend/config/database");
const Modelo = require("../models/empleadoCuenta.model");

function crearBd({ empleados, cuentas, retraso, sinUnique = false, falloRollback = false } = {}) {
  const estado = { empleados: empleados.map((e) => ({ ...e })), sentencias: [], candados: [], commits: 0, rollbacks: 0, liberados: 0, liberadosConError: 0 };
  let respaldo = null;
  const cuentaFila = (c) => ({ id: c.id, correo: c.correo, nombre: c.nombre || "X", apellido: c.apellido || "", activo: c.activo !== false, roles: c.roles || [], con_acceso_asistencia: c.con_acceso_asistencia !== false, con_permisos_admin: Boolean(c.con_permisos_admin), correo_duplicado: Boolean(c.correo_duplicado) });
  const query = async (sql, params = []) => {
    const q = sql.replace(/\s+/g, " ").trim();
    estado.sentencias.push(q);
    if (retraso && /pg_advisory_xact_lock/.test(q)) await retraso();
    if (q === "BEGIN") { respaldo = JSON.stringify(estado.empleados); return { rows: [] }; }
    if (q === "COMMIT") { estado.commits++; respaldo = null; return { rows: [] }; }
    if (q === "ROLLBACK") { if (falloRollback) throw new Error("rollback fallido (interno)"); estado.rollbacks++; if (respaldo) estado.empleados = JSON.parse(respaldo); return { rows: [] }; }
    if (/^SET LOCAL lock_timeout/.test(q)) return { rows: [] };
    if (/^SELECT pg_advisory_xact_lock/.test(q)) { estado.candados.push(params); return { rows: [] }; }
    if (/^SELECT id, usuario_id, COALESCE\(estatus, 'activo'\) AS estatus FROM empleados WHERE id = ANY/.test(q)) {
      return { rows: estado.empleados.filter((e) => params[0].includes(e.id)).map((e) => ({ id: e.id, usuario_id: e.usuario_id ?? null, estatus: e.estatus || "activo" })) };
    }
    if (/WHERE u\.id = ANY\(\$1::int\[\]\) ORDER BY u\.id$/.test(q)) return { rows: cuentas.filter((c) => params[0].includes(c.id)).map(cuentaFila) };
    if (/^SELECT 1 FROM usuarios WHERE id = ANY/.test(q)) return { rows: [] };
    if (/^SELECT id, usuario_id FROM empleados WHERE usuario_id = ANY/.test(q)) {
      return { rows: estado.empleados.filter((e) => e.usuario_id && params[0].includes(e.usuario_id)).map((e) => ({ id: e.id, usuario_id: e.usuario_id })) };
    }
    if (/^UPDATE empleados SET usuario_id = \$1, fecha_actualizacion = NOW\(\) WHERE id = \$2 AND usuario_id IS NULL$/.test(q)) {
      const e = estado.empleados.find((x) => x.id === params[1]);
      if (!e || e.usuario_id) return { rows: [], rowCount: 0 };
      if (!sinUnique && estado.empleados.some((x) => x.usuario_id === params[0])) throw Object.assign(new Error("duplicate key (interno)"), { code: "23505" });
      e.usuario_id = params[0];
      return { rows: [], rowCount: 1 };
    }
    if (/^SELECT id, usuario_id FROM empleados WHERE id = \$1 FOR UPDATE/.test(q)) {
      const e = estado.empleados.find((x) => x.id === params[0]);
      return { rows: e ? [{ id: e.id, usuario_id: e.usuario_id ?? null }] : [] };
    }
    if (/^UPDATE empleados SET usuario_id = NULL/.test(q)) { estado.empleados.find((x) => x.id === params[0]).usuario_id = null; return { rows: [], rowCount: 1 }; }
    if (/^SELECT u\.id, u\.correo.* WHERE NOT EXISTS \(SELECT 1 FROM empleados e WHERE e\.usuario_id = u\.id\) ORDER BY/.test(q)) {
      return { rows: cuentas.filter((c) => !estado.empleados.some((e) => e.usuario_id === c.id)).map(cuentaFila) };
    }
    if (/^SELECT e\.id, e\.nombre, e\.apellido_paterno.*COALESCE\(e\.estatus, 'activo'\) = 'activo'/.test(q)) {
      return { rows: estado.empleados.filter((e) => e.usuario_id == null && (e.estatus || "activo") === "activo").map((e) => ({ id: e.id, nombre: e.nombre, apellido_paterno: e.apellido_paterno, apellido_materno: e.apellido_materno || null, numero_nomina: e.numero_nomina || null, departamento: e.departamento || null, puesto: null, subordinados: e.subordinados || 0 })) };
    }
    if (/^SELECT e\.id AS empleado_id, e\.usuario_id, COALESCE\(e\.estatus, 'activo'\) AS estatus/.test(q)) {
      return { rows: estado.empleados.filter((e) => e.usuario_id != null && (e.estatus || "activo") !== "activo").map((e) => ({ empleado_id: e.id, usuario_id: e.usuario_id, estatus: e.estatus })) };
    }
    if (/^SELECT usuario_id, array_agg\(id ORDER BY id\) AS empleados FROM empleados/.test(q)) {
      const por = {};
      for (const e of estado.empleados) if (e.usuario_id != null) (por[e.usuario_id] = por[e.usuario_id] || []).push(e.id);
      return { rows: Object.entries(por).filter(([, v]) => v.length > 1).map(([k, v]) => ({ usuario_id: Number(k), empleados: v })) };
    }
    if (/^SELECT EXISTS \( SELECT 1 FROM pg_index/.test(q)) return { rows: [{ existe: !sinUnique }] };
    throw new Error(`consulta no simulada: ${q}`);
  };
  const cliente = { query, release: (err) => { estado.liberados++; if (err) estado.liberadosConError++; } };
  return { estado, connect: async () => cliente, query };
}

const emp = (id, extra = {}) => ({ id, usuario_id: null, estatus: "activo", ...extra });
const cta = (id, extra = {}) => ({ id, correo: `u${id}@ejemplo.test`, ...extra });
function simular(empleados, cuentas, opciones) {
  const bd = crearBd({ empleados, cuentas, ...opciones });
  grupo.connect.mockImplementation(bd.connect);
  grupo.query.mockImplementation(bd.query);
  return bd;
}
const par = (u, e) => ({ usuario_id: u, empleado_id: e });
const rechazo = async (promesa) => { try { await promesa; } catch (e) { return e; } throw new Error("debía fallar"); };

beforeEach(() => { jest.resetAllMocks(); jest.spyOn(console, "error").mockImplementation(() => {}); });

describe("vincularLote", () => {
  it("vincula, toma el candado propio 4601/1 y solo escribe usuario_id", async () => {
    const bd = simular([emp(1), emp(2)], [cta(10), cta(11)]);
    const r = await Modelo.vincularLote([par(10, 1), par(11, 2)]);
    expect(r.vinculadas).toBe(2);
    expect(r.omitidas).toBe(0);
    expect(bd.estado.empleados.map((e) => e.usuario_id)).toEqual([10, 11]);
    expect(bd.estado.candados).toEqual([[4601, 1]]);
    expect(bd.estado.sentencias.filter((s) => /^(UPDATE|INSERT|DELETE)/.test(s)).every((s) => /^UPDATE empleados SET usuario_id/.test(s))).toBe(true);
    expect(bd.estado.liberados).toBe(1);
  });

  it("es idempotente: re-ejecutar el mismo lote no cambia nada y reporta omitidas", async () => {
    const bd = simular([emp(1)], [cta(10)]);
    await Modelo.vincularLote([par(10, 1)]);
    const r = await Modelo.vincularLote([par(10, 1)]);
    expect(r).toMatchObject({ vinculadas: 0, omitidas: 1 });
    expect(bd.estado.empleados[0].usuario_id).toBe(10);
  });

  it.each([
    ["la cuenta ya está vinculada a otro empleado", [emp(1), emp(2, { usuario_id: 10 })], [cta(10)], par(10, 1), "cuenta_ya_vinculada"],
    ["el empleado ya tiene otra cuenta", [emp(1, { usuario_id: 11 })], [cta(10), cta(11)], par(10, 1), "empleado_ya_vinculado"],
    ["el empleado está de baja", [emp(1, { estatus: "baja" })], [cta(10)], par(10, 1), "empleado_no_activo"],
    ["el empleado está suspendido", [emp(1, { estatus: "suspendido" })], [cta(10)], par(10, 1), "empleado_no_activo"],
    ["la cuenta tiene el correo duplicado (solo difiere en mayúsculas)", [emp(1)], [cta(10, { correo_duplicado: true })], par(10, 1), "cuenta_correo_duplicado"],
    ["el empleado no existe", [emp(1)], [cta(10)], par(10, 99), "empleado_no_existe"],
    ["la cuenta no existe", [emp(1)], [cta(10)], par(77, 1), "cuenta_no_existe"],
  ])("409 sin aplicar NADA del lote cuando %s", async (_t, empleados, cuentas, conflictivo, motivo) => {
    const bd = simular([...empleados, emp(50)], [...cuentas, cta(60)]);
    const e = await rechazo(Modelo.vincularLote([par(60, 50), conflictivo]));
    expect(e.estado).toBe(409);
    expect(e.extra.conflictos).toEqual([{ usuario_id: conflictivo.usuario_id, empleado_id: conflictivo.empleado_id, motivo }]);
    expect(bd.estado.empleados.find((x) => x.id === 50).usuario_id).toBeNull(); // el par sano tampoco se aplicó
    expect(bd.estado.rollbacks).toBe(1);
    expect(bd.estado.liberados).toBe(1);
    expect(e.message).not.toMatch(/duplicate|SQL/i);
  });

  it("nunca pisa un usuario_id existente aunque otro proceso lo tome entre la lectura y el UPDATE", async () => {
    const bd = simular([emp(1)], [cta(10)]);
    const original = bd.connect;
    grupo.connect.mockImplementation(async () => {
      const c = await original();
      const q = c.query;
      c.query = async (sql, params) => {
        if (/^\s*UPDATE empleados SET usuario_id = \$1/.test(sql)) bd.estado.empleados[0].usuario_id = 99;
        return q(sql, params);
      };
      return c;
    });
    const e = await rechazo(Modelo.vincularLote([par(10, 1)]));
    expect(e.estado).toBe(409);
    expect(e.extra.conflictos[0].motivo).toBe("empleado_ya_vinculado");
    expect(bd.estado.rollbacks).toBe(1);
  });

  it("SIN la UNIQUE de usuario_id la comprobación en JS sigue impidiendo que una cuenta tenga dos empleados", async () => {
    const bd = simular([emp(1), emp(2, { usuario_id: 10 })], [cta(10)], { sinUnique: true });
    const e = await rechazo(Modelo.vincularLote([par(10, 1)]));
    expect(e.estado).toBe(409);
    expect(e.extra.conflictos[0].motivo).toBe("cuenta_ya_vinculada");
    expect(bd.estado.empleados.filter((x) => x.usuario_id === 10)).toHaveLength(1);
  });

  it("una cuenta con permisos de administración (no solo por nombre de rol) pide la confirmación aparte", async () => {
    simular([emp(1)], [cta(10, { roles: ["rol_personalizado"], con_permisos_admin: true })]);
    expect((await rechazo(Modelo.vincularLote([par(10, 1)]))).extra.requiere_confirmacion_privilegiadas).toBe(true);
  });

  it("el mensaje de un 55P03 por filas bloqueadas (no el candado propio) es distinto", async () => {
    const bd = simular([emp(1)], [cta(10)]);
    const q = bd.query;
    grupo.connect.mockImplementation(async () => ({ query: async (sql, p) => { if (/FOR UPDATE/.test(sql)) throw Object.assign(new Error("lock"), { code: "55P03" }); return q(sql, p); }, release: () => {} }));
    const e = await rechazo(Modelo.vincularLote([par(10, 1)]));
    expect(e.estado).toBe(409);
    expect(e.message).toBe(Modelo.MENSAJE_BLOQUEO_FILAS);
    expect(e.message).not.toMatch(/otra vinculación en curso/);
  });

  it("si el ROLLBACK falla, la conexión se descarta (release con error) y no vuelve sana al pool", async () => {
    const bd = simular([emp(1)], [cta(10, { correo_duplicado: true })], { falloRollback: true });
    await rechazo(Modelo.vincularLote([par(10, 1)]));
    expect(bd.estado.liberados).toBe(1);
    expect(bd.estado.liberadosConError).toBe(1);
  });

  it("cuenta privilegiada: 400 sin la confirmación aparte; con ella se vincula", async () => {
    const bd = simular([emp(1)], [cta(10, { roles: ["rh_admin"] })]);
    const e = await rechazo(Modelo.vincularLote([par(10, 1)]));
    expect(e.estado).toBe(400);
    expect(e.extra).toMatchObject({ requiere_confirmacion_privilegiadas: true, cuentas_privilegiadas: [10] });
    expect(bd.estado.empleados[0].usuario_id).toBeNull();
    const r = await Modelo.vincularLote([par(10, 1)], { confirmarPrivilegiadas: true });
    expect(r).toMatchObject({ vinculadas: 1, privilegiadas: 1 });
  });

  it("advierte las cuentas sin rol con acceso a Asistencia y las inactivas en el resultado", async () => {
    simular([emp(1), emp(2)], [cta(10, { con_acceso_asistencia: false }), cta(11, { activo: false })]);
    const r = await Modelo.vincularLote([par(10, 1), par(11, 2)]);
    expect(r.sin_acceso_asistencia).toBe(1);
    expect(r.detalle.find((d) => d.usuario_id === 11).inactiva).toBe(true);
  });

  it("dos ejecuciones simultáneas: la que llega con 2 en curso recibe 409 amable sin pedir conexión", async () => {
    let liberar;
    const espera = new Promise((r) => { liberar = r; });
    const bd = simular([emp(1), emp(2), emp(3)], [cta(10), cta(11), cta(12)], { retraso: () => espera });
    const a = Modelo.vincularLote([par(10, 1)]);
    const b = Modelo.vincularLote([par(11, 2)]);
    const e = await rechazo(Modelo.vincularLote([par(12, 3)]));
    expect(e.estado).toBe(409);
    expect(e.message).toMatch(/otra vinculación en curso/);
    expect(grupo.connect).toHaveBeenCalledTimes(2);
    liberar();
    await Promise.all([a, b]);
    expect(bd.estado.empleados.map((x) => x.usuario_id)).toEqual([10, 11, null]);
    // el cupo se libera: una nueva ejecución ya puede correr
    expect((await Modelo.vincularLote([par(12, 3)])).vinculadas).toBe(1);
  });

  it("lock_timeout vencido (55P03) responde 409 amable y deshace", async () => {
    const bd = simular([emp(1)], [cta(10)], { retraso: async () => { throw Object.assign(new Error("lock timeout"), { code: "55P03" }); } });
    const e = await rechazo(Modelo.vincularLote([par(10, 1)]));
    expect(e.estado).toBe(409);
    expect(bd.estado.rollbacks).toBe(1);
    expect(bd.estado.liberados).toBe(1);
  });

  it("un error inesperado deshace, libera la conexión y se propaga", async () => {
    const bd = simular([emp(1)], [cta(10)]);
    const q = bd.query;
    grupo.connect.mockImplementation(async () => ({ query: async (s, p) => { if (/FOR UPDATE/.test(s)) throw Object.assign(new Error("caída"), { code: "57P01" }); return q(s, p); }, release: () => { bd.estado.liberados++; } }));
    const e = await rechazo(Modelo.vincularLote([par(10, 1)]));
    expect(e.code).toBe("57P01");
    expect(bd.estado.liberados).toBe(1);
    // y el cupo se liberó
    simular([emp(1)], [cta(10)]);
    expect((await Modelo.vincularLote([par(10, 1)])).vinculadas).toBe(1);
  });
});

describe("cambiarCuentaDeEmpleado", () => {
  it("vincula uno (misma validación y candado)", async () => {
    const bd = simular([emp(1)], [cta(10)]);
    const r = await Modelo.cambiarCuentaDeEmpleado(1, 10);
    expect(r).toMatchObject({ accion: "vinculada", usuario_id: 10 });
    expect(bd.estado.empleados[0].usuario_id).toBe(10);
  });
  it("desvincula (solo pone usuario_id en NULL) y es idempotente", async () => {
    const bd = simular([emp(1, { usuario_id: 10 })], [cta(10)]);
    const r = await Modelo.cambiarCuentaDeEmpleado(1, null);
    expect(r).toMatchObject({ accion: "desvinculada", anterior: 10 });
    expect(bd.estado.empleados[0].usuario_id).toBeNull();
    expect((await Modelo.cambiarCuentaDeEmpleado(1, null)).accion).toBe("sin_cuenta");
    expect(bd.estado.candados).toEqual([[4601, 1], [4601, 1]]);
  });
  it("desvincular un empleado inexistente: 404", async () => {
    simular([emp(1)], []);
    expect((await rechazo(Modelo.cambiarCuentaDeEmpleado(9, null))).estado).toBe(404);
  });
});

describe("vistaPrevia", () => {
  const emps = [
    { id: 1, nombre: "Ana", apellido_paterno: "Lopez", numero_nomina: "N1", departamento: "A", subordinados: 2 },
    { id: 2, nombre: "Luis", apellido_paterno: "Peña", numero_nomina: "N2", departamento: "B" },
    { id: 3, nombre: "Eva", apellido_paterno: "Soto", estatus: "suspendido" },
    { id: 4, nombre: "Eva", apellido_paterno: "Soto", estatus: "baja" },
    { id: 5, nombre: "Zoe", apellido_paterno: "Vinc", usuario_id: 50, estatus: "baja" },
    { id: 6, nombre: "Dos", apellido_paterno: "Veces", usuario_id: 60 },
    { id: 7, nombre: "Dos", apellido_paterno: "Veces", usuario_id: 60 },
  ];
  const cuentas = [
    cta(10, { nombre: "Ana", apellido: "Lopez" }),
    cta(11, { nombre: "Luis", apellido: "Pena" }),
    cta(12, { nombre: "Eva", apellido: "Soto" }),
    cta(13, { nombre: "Ana", apellido: "Lopez", correo_duplicado: true }),
    cta(14, { nombre: "Admin", apellido: "X", roles: ["rh_admin"], con_acceso_asistencia: false, activo: false }),
    cta(50), cta(60),
  ];
  const vp = (o) => { simular(emps, cuentas, o); return Modelo.vistaPrevia({ limite: 100 }); };

  it("contadores exactos sobre TODAS las cuentas sin empleado; solo empleados activos se sugieren", async () => {
    const r = await vp();
    expect(r.contadores).toEqual({
      cuentas_sin_empleado: 5, empleados_activos_sin_cuenta: 2, coincidencia_exacta: 1, varias_posibles: 0, sin_coincidencia: 4,
      sin_acceso_asistencia: 1, privilegiadas: 1, inactivas: 1, correos_duplicados: 1,
    });
    const porId = Object.fromEntries(r.cuentas.map((c) => [c.id, c]));
    expect(porId[10].sugerencia.candidatos[0]).toMatchObject({ id: 1, subordinados: 2, departamento: "A" });
    expect(porId[11].sugerencia.estado).toBe("sin_coincidencia"); // Peña != Pena
    expect(porId[12].sugerencia.estado).toBe("sin_coincidencia"); // el suspendido y el de baja no se sugieren
    expect(porId[13].sugerencia.estado).toBe("sin_coincidencia"); // correo duplicado: sin sugerencia
    expect(porId[13].correo_duplicado).toBe(true);
    expect(porId[14].privilegiada).toBe(true);
  });

  it("avisos: vinculadas a no activos, usuario con varios empleados y UNIQUE ausente", async () => {
    const r = await vp({ sinUnique: true });
    expect(r.avisos.vinculadas_a_no_activos).toEqual([{ empleado_id: 5, usuario_id: 50, estatus: "baja" }]);
    expect(r.avisos.usuarios_con_varios_empleados).toEqual([{ usuario_id: 60, empleados: [6, 7] }]);
    expect(r.avisos.falta_unique_usuario_id).toBe(true);
    expect((await (async () => { simular(emps, cuentas); return Modelo.vistaPrevia({}); })()).avisos.falta_unique_usuario_id).toBe(false);
  });

  it("filtra por estado, pagina y no trunca los contadores", async () => {
    simular(emps, cuentas);
    const r = await Modelo.vistaPrevia({ pagina: 2, limite: 2, estado: "sin_coincidencia" });
    expect(r.total).toBe(4);
    expect(r.cuentas).toHaveLength(2);
    expect(r.paginas_totales).toBe(2);
    expect(r.contadores.cuentas_sin_empleado).toBe(5);
    expect(r.truncado).toBeUndefined();
  });

  it("más de 10 homónimos: se informa candidatos_total y se recortan a 10", async () => {
    const muchos = Array.from({ length: 13 }, (_, i) => ({ id: 100 + i, nombre: "Juan", apellido_paterno: "Igual" }));
    simular(muchos, [cta(10, { nombre: "Juan", apellido: "Igual" })]);
    const r = await Modelo.vistaPrevia({});
    expect(r.cuentas[0].sugerencia).toMatchObject({ estado: "varias", candidatos_total: 13 });
    expect(r.cuentas[0].sugerencia.candidatos).toHaveLength(10);
  });
});

describe("cuentasDisponibles", () => {
  it("exige al menos 2 caracteres de búsqueda: con menos no consulta nada", async () => {
    grupo.query.mockResolvedValue({ rows: [] });
    for (const b of ["", "a"]) {
      const r = await Modelo.cuentasDisponibles({ busqueda: b });
      expect(r).toMatchObject({ cuentas: [], total: 0, requiere_busqueda: true, minimo_busqueda: 2 });
    }
    expect(grupo.query).not.toHaveBeenCalled();
  });
  it("limita la página a 25", async () => {
    grupo.query.mockImplementation(async (sql) => (/COUNT/.test(sql) ? { rows: [{ n: 0 }] } : { rows: [] }));
    const r = await Modelo.cuentasDisponibles({ busqueda: "ab", limite: 100 });
    expect(r.limite).toBe(25);
    expect(grupo.query.mock.calls[1][1].slice(-2)).toEqual([25, 0]);
  });
});
