// Lógica del modelo de vinculación con una BD en memoria que interpreta solo sus consultas. Solo se escribe usuario_id.
jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn(), connect: jest.fn() } }));
const { grupo } = require("../../../portal/backend/config/database");
const Modelo = require("../models/empleadoCuenta.model");

function crearBd({ empleados, cuentas, retraso } = {}) {
  const estado = { empleados: empleados.map((e) => ({ ...e })), sentencias: [], candados: [], commits: 0, rollbacks: 0, liberados: 0 };
  let respaldo = null;
  const cuentaFila = (c) => ({ id: c.id, correo: c.correo, nombre: c.nombre || "X", apellido: c.apellido || "", activo: c.activo !== false, roles: c.roles || [], con_acceso_asistencia: c.con_acceso_asistencia !== false });
  const query = async (sql, params = []) => {
    const q = sql.replace(/\s+/g, " ").trim();
    estado.sentencias.push(q);
    if (retraso && /pg_advisory_xact_lock/.test(q)) await retraso();
    if (q === "BEGIN") { respaldo = JSON.stringify(estado.empleados); return { rows: [] }; }
    if (q === "COMMIT") { estado.commits++; respaldo = null; return { rows: [] }; }
    if (q === "ROLLBACK") { estado.rollbacks++; if (respaldo) estado.empleados = JSON.parse(respaldo); return { rows: [] }; }
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
      if (estado.empleados.some((x) => x.usuario_id === params[0])) throw Object.assign(new Error("duplicate key (interno)"), { code: "23505" });
      e.usuario_id = params[0];
      return { rows: [], rowCount: 1 };
    }
    if (/^SELECT id, usuario_id FROM empleados WHERE id = \$1 FOR UPDATE/.test(q)) {
      const e = estado.empleados.find((x) => x.id === params[0]);
      return { rows: e ? [{ id: e.id, usuario_id: e.usuario_id ?? null }] : [] };
    }
    if (/^UPDATE empleados SET usuario_id = NULL/.test(q)) { estado.empleados.find((x) => x.id === params[0]).usuario_id = null; return { rows: [], rowCount: 1 }; }
    throw new Error(`consulta no simulada: ${q}`);
  };
  const cliente = { query, release: () => { estado.liberados++; } };
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
    ["el empleado está de baja", [emp(1, { estatus: "baja" })], [cta(10)], par(10, 1), "empleado_baja"],
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
