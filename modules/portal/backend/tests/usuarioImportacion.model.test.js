// Modelo de "Importar usuarios" con un pool en memoria (transacciones con ROLLBACK real sobre una copia del estado) y un
// GoTrue simulado. La vinculación (rh/empleadoCuenta) se simula: su lógica se prueba en rh/tests y todo el flujo, contra
// Postgres real, en scripts/importar-usuarios. Datos ficticios.
const mockEstado = { roles: [], usuarios: [], usuario_rol: [], empleados: [], sig: 1, bitacora: [], falla: {} };
const estado = mockEstado;
const mockClonar = () => JSON.parse(JSON.stringify({ usuarios: estado.usuarios, usuario_rol: estado.usuario_rol, empleados: estado.empleados }));

function mockResponder(sql, p) {
  const t = sql.replace(/\s+/g, " ").trim();
  estado.bitacora.push(t.slice(0, 60));
  if (/^SET LOCAL lock_timeout/.test(t)) return { rows: [] };
  if (/pg_advisory_xact_lock/.test(t)) {
    if (estado.falla.candado) throw Object.assign(new Error("lock"), { code: "55P03" });
    estado.bitacora.push(`LOCK ${p[0]}`);
    return { rows: [] };
  }
  if (/FROM roles WHERE nombre/.test(t)) {
    const r = estado.roles.find((x) => x.nombre === p[0]);
    return { rows: r ? [{ id: r.id }] : [] };
  }
  if (/FROM usuarios WHERE LOWER\(correo\) = ANY/.test(t)) {
    return { rows: estado.usuarios.filter((u) => p[0].includes(u.correo.toLowerCase())).map((u) => ({ correo_l: u.correo.toLowerCase(), con_auth: u.auth_uid !== null })) };
  }
  const colE = (e) => ({ ...e, curp_u: (e.curp || "").toUpperCase() });
  if (/FROM empleados WHERE UPPER\(curp\)/.test(t)) return { rows: estado.empleados.filter((e) => p[0].includes((e.curp || "").toUpperCase())).map(colE) };
  if (/FROM empleados WHERE LOWER\(BTRIM\(numero_nomina\)\)/.test(t)) {
    const sc = (n) => String(n).trim().toLowerCase().replace(/^0+/, "");
    return { rows: estado.empleados.filter((e) => p[0].includes(String(e.numero_nomina).trim().toLowerCase()) || p[1].includes(sc(e.numero_nomina))).map(colE) };
  }
  if (/^INSERT INTO usuarios/.test(t)) {
    if (estado.usuarios.some((u) => u.correo === p[0])) throw Object.assign(new Error("dup"), { code: "23505" });
    const u = { id: estado.sig++, correo: p[0], nombre: p[1], apellido: p[2], auth_tipo: "ms365", activo: false, auth_uid: null };
    estado.usuarios.push(u);
    return { rows: [{ id: u.id }] };
  }
  if (/^UPDATE usuarios SET auth_uid = \$2, activo = true/.test(t)) {
    const u = estado.usuarios.find((x) => x.id === p[0] && x.auth_uid === null);
    if (u) { u.auth_uid = p[1]; u.activo = true; }
    return { rowCount: u ? 1 : 0, rows: [] };
  }
  if (/^UPDATE usuarios SET auth_uid = \$2 WHERE id/.test(t)) {
    const u = estado.usuarios.find((x) => x.id === p[0] && x.auth_uid === null);
    if (u) u.auth_uid = p[1];
    return { rowCount: u ? 1 : 0, rows: [] };
  }
  if (/^INSERT INTO usuario_rol/.test(t)) { estado.usuario_rol.push({ usuario_id: p[0], rol_id: p[1] }); return { rows: [] }; }
  if (/^DELETE FROM usuarios WHERE id = \$1 AND auth_uid IS NULL/.test(t)) {
    if (estado.falla.borrarFila) throw new Error("bd caída");
    estado.usuarios = estado.usuarios.filter((u) => !(u.id === p[0] && u.auth_uid === null));
    return { rows: [] };
  }
  throw new Error(`consulta no prevista en el fake: ${t}`);
}

jest.mock("../config/database", () => {
  const consulta = (sql, p) => Promise.resolve().then(() => mockResponder(sql, p));
  return {
    grupo: {
      query: consulta,
      connect: async () => {
        let copia = null;
        return {
          query: async (sql, p) => {
            if (/^BEGIN/.test(sql)) { copia = mockClonar(); return { rows: [] }; }
            if (/^COMMIT/.test(sql)) { copia = null; return { rows: [] }; }
            if (/^ROLLBACK/.test(sql)) {
              if (copia) Object.assign(mockEstado, JSON.parse(JSON.stringify(copia)));
              copia = null;
              return { rows: [] };
            }
            return consulta(sql, p);
          },
          release: () => {},
        };
      },
    },
  };
});

jest.mock("../../../rh/backend/models/empleadoCuenta.model", () => {
  class ErrorVinculacion extends Error { constructor(estadoHttp, mensaje) { super(mensaje); this.estado = estadoHttp; } }
  return {
    ErrorVinculacion,
    tomarCandadoVinculacion: jest.fn(async () => { mockEstado.bitacora.push("LOCK 4601"); }),
    vincularEnTransaccion: jest.fn(async (_c, pares) => {
      mockEstado.bitacora.push("VINCULAR");
      if (mockEstado.falla.vinculo) throw new ErrorVinculacion(409, "Los datos cambiaron desde la vista previa");
      const e = mockEstado.empleados.find((x) => x.id === pares[0].empleado_id);
      e.usuario_id = pares[0].usuario_id;
      return { vinculadas: 1, omitidas: 0, detalle: [{ usuario_id: pares[0].usuario_id, empleado_id: e.id, resultado: "vinculada" }] };
    }),
  };
});
jest.mock("../../../rh/backend/utils/logSeguro", () => ({ describirErrorSql: () => "error-sql" }));

const Modelo = require("../models/usuarioImportacion.model");
const { prepararFilasUsuarios } = require("../utils/importarUsuarios");

const gotrue = { crearUsuario: jest.fn(), eliminarUsuario: jest.fn() };
let n;
const filas = (...f) => prepararFilasUsuarios(f.map((x, i) => ({ _fila: i + 2, nombre: "Ana", apellido: "Prueba Ejemplo", ...x }))).filas;
const e = (id, extra = {}) => ({ id, nombre: "Ana", apellido_paterno: "Prueba", apellido_materno: "Ejemplo", numero_nomina: String(90000 + id), curp: "", estatus: "activo", usuario_id: null, ...extra });

beforeEach(() => {
  Object.assign(estado, {
    roles: [{ id: 4, nombre: "rh_empleado" }, { id: 1, nombre: "super_admin" }], usuarios: [], usuario_rol: [], sig: 1, bitacora: [], falla: {},
    empleados: [e(1), e(2, { nombre: "Luis", apellido_paterno: "Ficticio" }), e(3, { numero_nomina: "ABC" }), e(4, { numero_nomina: "ABC" })],
  });
  n = 0;
  gotrue.crearUsuario.mockReset().mockImplementation(async () => ({ id: `uid-${++n}` }));
  gotrue.eliminarUsuario.mockReset().mockResolvedValue();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const correo = (x) => `${x}@rayhsa.com.mx`;

describe("vistaPrevia (solo lectura)", () => {
  it("clasifica crear / omitir / errores sin escribir ni llamar a GoTrue", async () => {
    estado.usuarios.push({ id: 50, correo: correo("existe"), nombre: "X", apellido: "Y", auth_tipo: "ms365", activo: true, auth_uid: "u" });
    estado.usuarios.push({ id: 51, correo: correo("incompleta"), nombre: "X", apellido: "Y", auth_tipo: "ms365", activo: false, auth_uid: null });
    estado.empleados.push(e(5, { estatus: "baja" }), e(6, { usuario_id: 77 }));
    const antes = JSON.stringify([estado.usuarios, estado.usuario_rol, estado.empleados]);
    const r = await Modelo.vistaPrevia(filas(
      { correo: correo("ana"), numero_nomina: "90001" },
      { correo: correo("existe"), numero_nomina: "99991" },
      { correo: correo("incompleta"), numero_nomina: "99992" },
      { correo: correo("ambigua"), numero_nomina: "ABC" },
      { correo: correo("baja"), numero_nomina: "90005" },
      { correo: correo("concuenta"), numero_nomina: "90006" },
      { correo: "x@gmail.com", numero_nomina: "99993" },
    ));
    expect(r.filas.map((f) => f.estado)).toEqual(["crear", "omitir", "error", "error", "error", "error", "error"]);
    expect(r.filas[0].empleado).toEqual({ id: 1, nombre: "Ana Prueba Ejemplo" });
    expect(r.filas[2].motivo).toMatch(/incompleta/);
    expect(r.filas[3].motivo).toMatch(/ambiguo/);
    expect(r.filas[4].motivo).toMatch(/no está activo/);
    expect(r.filas[5].motivo).toMatch(/ya tiene una cuenta/);
    expect(r.filas[6].motivo).toMatch(/dominio/);
    expect(r.resumen).toEqual({ total: 7, crear: 1, omitir: 1, error: 5 });
    expect(r.rol).toBe("rh_empleado");
    expect(JSON.stringify([estado.usuarios, estado.usuario_rol, estado.empleados])).toBe(antes);
    expect(gotrue.crearUsuario).not.toHaveBeenCalled();
    expect(estado.bitacora.join("|")).not.toMatch(/INSERT|UPDATE|DELETE/);
  });
  it("una fila rechazada al leerla (dominio) se muestra con lo que el usuario escribió", async () => {
    const r = await Modelo.vistaPrevia(filas({ correo: "X@Gmail.com", nombre: "Xavier", apellido: "Prueba", numero_nomina: "90001" }));
    expect(r.filas[0]).toMatchObject({ estado: "error", correo: "X@Gmail.com", nombre: "Xavier Prueba", fila: 2 });
  });
  it("no devuelve CURP ni nómina del archivo", async () => {
    const r = await Modelo.vistaPrevia(filas({ correo: correo("ana"), numero_nomina: "90001" }));
    expect(JSON.stringify(r)).not.toMatch(/90001|curp/i);
  });
  it("el mismo empleado en dos filas (una por CURP y otra por nómina): la segunda es error", async () => {
    estado.empleados[0].curp = "XXXX000101HDFXXX00";
    const r = await Modelo.vistaPrevia(filas(
      { correo: correo("a"), numero_nomina: "", curp: "XXXX000101HDFXXX00" },
      { correo: correo("b"), numero_nomina: "90001" },
    ));
    expect(r.filas[1].estado).toBe("error");
    expect(r.filas[1].motivo).toMatch(/ya aparece en la fila 2/);
  });
  it("la nómina sin ceros a la izquierda encuentra al empleado (Excel pierde los ceros)", async () => {
    estado.empleados[1].numero_nomina = "00777";
    const r = await Modelo.vistaPrevia(filas({ correo: correo("luis"), nombre: "Luis", apellido: "Ficticio", numero_nomina: "777" }));
    expect(r.filas[0].estado).toBe("crear");
    expect(r.filas[0].empleado.id).toBe(2);
  });
  it("sin el rol rh_empleado: 409 y nada que mostrar", async () => {
    estado.roles = [];
    await expect(Modelo.vistaPrevia(filas({ correo: correo("a"), numero_nomina: "90001" }))).rejects.toMatchObject({ estado: 409, message: expect.stringMatching(/rh_empleado/) });
  });
});

describe("aplicar", () => {
  it("crea la cuenta ms365 sin contraseña, activa, con rol rh_empleado y vinculada al empleado", async () => {
    const r = await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
    expect(r).toMatchObject({ creadas: 1, omitidas: 0, errores: 0, verificar: 0 });
    expect(r.filas[0]).toMatchObject({ estado: "creada", usuario_id: 1, empleado_id: 1 });
    expect(estado.usuarios[0]).toMatchObject({ correo: correo("ana"), auth_tipo: "ms365", activo: true, auth_uid: "uid-1" });
    expect(estado.usuario_rol).toEqual([{ usuario_id: 1, rol_id: 4 }]);
    expect(estado.empleados[0].usuario_id).toBe(1);
    const args = gotrue.crearUsuario.mock.calls[0][0];
    expect(args).not.toHaveProperty("password");
    expect(args).not.toHaveProperty("passwordHash");
    expect(args.correo).toBe(correo("ana"));
  });
  it("el rol es siempre el de rh_empleado (por nombre), nunca uno que venga en el archivo", async () => {
    await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001", rol: "super_admin", rol_id: 1 }), { servicio: gotrue });
    expect(estado.usuario_rol).toEqual([{ usuario_id: 1, rol_id: 4 }]);
  });
  it("toma el candado 4701 antes que el 4601 y vincula dentro de la misma transacción", async () => {
    await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
    const b = estado.bitacora.filter((x) => /^LOCK|^VINCULAR/.test(x));
    expect(b).toEqual(["LOCK 4701", "LOCK 4701", "LOCK 4601", "VINCULAR"]);
  });
  it("correo que ya existe: omitida, sin tocar GoTrue ni la fila", async () => {
    estado.usuarios.push({ id: 50, correo: correo("ana"), nombre: "Otro", apellido: "Nombre", auth_tipo: "ms365", activo: true, auth_uid: "u" });
    const r = await Modelo.aplicar(filas({ correo: correo("ANA"), numero_nomina: "90001" }), { servicio: gotrue });
    expect(r.omitidas).toBe(1);
    expect(r.filas[0].estado).toBe("omitida");
    expect(gotrue.crearUsuario).not.toHaveBeenCalled();
    expect(estado.usuarios[0].nombre).toBe("Otro");
    expect(estado.empleados[0].usuario_id).toBeNull();
  });
  it("repetir el archivo no duplica: todo queda omitido", async () => {
    const f = () => filas({ correo: correo("ana"), numero_nomina: "90001" }, { correo: correo("luis"), nombre: "Luis", apellido: "Ficticio", numero_nomina: "90002" });
    expect((await Modelo.aplicar(f(), { servicio: gotrue })).creadas).toBe(2);
    const r2 = await Modelo.aplicar(f(), { servicio: gotrue });
    expect(r2).toMatchObject({ creadas: 0, omitidas: 2 });
    expect(gotrue.crearUsuario).toHaveBeenCalledTimes(2);
  });
  it("nómina ambigua, empleado de baja y empleado con cuenta: error por fila, sin GoTrue ni filas", async () => {
    estado.empleados.push(e(5, { estatus: "baja" }), e(6, { usuario_id: 77 }));
    const r = await Modelo.aplicar(filas(
      { correo: correo("a"), numero_nomina: "ABC" }, { correo: correo("b"), numero_nomina: "90005" }, { correo: correo("c"), numero_nomina: "90006" },
    ), { servicio: gotrue });
    expect(r.errores).toBe(3);
    expect(gotrue.crearUsuario).not.toHaveBeenCalled();
    expect(estado.usuarios).toHaveLength(0);
  });
  it("una fila mala no frena a las demás y cada una queda reportada", async () => {
    const r = await Modelo.aplicar(filas(
      { correo: "x@gmail.com", numero_nomina: "90001" }, { correo: correo("ana"), numero_nomina: "90001" },
    ), { servicio: gotrue });
    expect(r.filas.map((x) => x.estado)).toEqual(["error", "creada"]);
    expect(r.filas.map((x) => x.fila)).toEqual([2, 3]);
  });
  it("el mismo empleado en dos filas con distinto identificador: la segunda es error", async () => {
    estado.empleados[0].curp = "XXXX000101HDFXXX00";
    const r = await Modelo.aplicar(filas(
      { correo: correo("a"), numero_nomina: "", curp: "XXXX000101HDFXXX00" }, { correo: correo("b"), numero_nomina: "90001" },
    ), { servicio: gotrue });
    expect(r.filas.map((x) => x.estado)).toEqual(["creada", "error"]);
    expect(r.filas[1].motivo).toMatch(/ya tiene una cuenta|ya aparece/);
  });

  describe("fallos de GoTrue", () => {
    it("error HTTP definitivo (422): se borra la reserva local, no queda nada y el empleado sigue sin cuenta", async () => {
      gotrue.crearUsuario.mockRejectedValue(Object.assign(new Error("Supabase Auth: dato interno ana@rayhsa.com.mx"), { status: 422, definitivo: true }));
      const r = await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
      expect(r.filas[0].estado).toBe("error");
      expect(r.filas[0].motivo).toMatch(/ya tiene ese correo/);
      expect(r.filas[0].motivo).not.toMatch(/ana@|dato interno/);
      expect(estado.usuarios).toHaveLength(0);
      expect(estado.empleados[0].usuario_id).toBeNull();
      expect(gotrue.eliminarUsuario).not.toHaveBeenCalled();
    });
    it("error 500 definitivo: mensaje propio sin texto de GoTrue", async () => {
      gotrue.crearUsuario.mockRejectedValue(Object.assign(new Error("SUPABASE_SERVICE_ROLE_KEY no configurada"), { status: 500, definitivo: true }));
      const r = await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
      expect(r.filas[0].motivo).toMatch(/no está configurado/);
      expect(r.filas[0].motivo).not.toMatch(/KEY/);
    });
    it("sin respuesta (timeout): resultado INCIERTO, no se compensa; la fila queda inactiva, sin auth_uid y sin vínculo, y un reintento la reporta", async () => {
      gotrue.crearUsuario.mockRejectedValue(Object.assign(new Error("Tiempo agotado"), { status: 503, incierto: true }));
      const r = await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
      expect(r).toMatchObject({ creadas: 0, verificar: 1 });
      expect(r.filas[0]).toMatchObject({ estado: "verificar", usuario_id: 1 });
      expect(r.filas[0].motivo).toMatch(/No se pudo confirmar/);
      expect(estado.usuarios[0]).toMatchObject({ activo: false, auth_uid: null });
      expect(estado.usuario_rol).toHaveLength(0);
      expect(estado.empleados[0].usuario_id).toBeNull();
      expect(gotrue.eliminarUsuario).not.toHaveBeenCalled();
      gotrue.crearUsuario.mockReset().mockResolvedValue({ id: "uid-x" });
      const r2 = await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
      expect(r2.filas[0].estado).toBe("error");
      expect(r2.filas[0].motivo).toMatch(/incompleta/);
      expect(gotrue.crearUsuario).not.toHaveBeenCalled();
    });
    it("tras 3 respuestas inciertas seguidas se detiene: las demás filas no escriben nada", async () => {
      gotrue.crearUsuario.mockRejectedValue(Object.assign(new Error("t"), { status: 503, incierto: true }));
      estado.empleados.push(e(5), e(6), e(7));
      const r = await Modelo.aplicar(filas(
        { correo: correo("a"), numero_nomina: "90001" }, { correo: correo("b"), numero_nomina: "90002" }, { correo: correo("c"), numero_nomina: "90005" },
        { correo: correo("d"), numero_nomina: "90006" }, { correo: correo("e"), numero_nomina: "90007" },
      ), { servicio: gotrue });
      expect(gotrue.crearUsuario).toHaveBeenCalledTimes(3);
      expect(r.verificar).toBe(3);
      expect(r.filas.slice(3).every((x) => x.estado === "error" && /No procesada/.test(x.motivo))).toBe(true);
      expect(estado.usuarios).toHaveLength(3);
    });
    it("respuesta sin id se trata como incierta", async () => {
      gotrue.crearUsuario.mockResolvedValue({});
      const r = await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
      expect(r.filas[0].estado).toBe("verificar");
    });
    it("error definitivo y la limpieza local también falla: verificar con el id para que el administrador la elimine", async () => {
      gotrue.crearUsuario.mockRejectedValue(Object.assign(new Error("x"), { status: 400, definitivo: true }));
      estado.falla.borrarFila = true;
      const r = await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
      expect(r.filas[0]).toMatchObject({ estado: "verificar", usuario_id: 1 });
      expect(r.filas[0].motivo).toMatch(/elimínala/);
    });
  });

  describe("fallo en la activación o el vínculo (paso C)", () => {
    it("se deshace TODO: ROLLBACK, se borra la cuenta en GoTrue con su id y la fila local; el empleado queda libre", async () => {
      estado.falla.vinculo = true;
      const r = await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
      expect(r.filas[0].estado).toBe("error");
      expect(r.filas[0].motivo).toMatch(/cambiaron.*Se deshizo/);
      expect(gotrue.eliminarUsuario).toHaveBeenCalledWith("uid-1");
      expect(estado.usuarios).toHaveLength(0);
      expect(estado.usuario_rol).toHaveLength(0);
      expect(estado.empleados[0].usuario_id).toBeNull();
    });
    it("si además GoTrue no deja borrar: verificar y la fila conserva el auth_uid (inactiva) para que Eliminar limpie GoTrue", async () => {
      estado.falla.vinculo = true;
      gotrue.eliminarUsuario.mockRejectedValue(new Error("caído"));
      const r = await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
      expect(r.filas[0]).toMatchObject({ estado: "verificar", usuario_id: 1 });
      expect(estado.usuarios[0]).toMatchObject({ auth_uid: "uid-1", activo: false });
      expect(estado.usuario_rol).toHaveLength(0);
    });
    it("el candado ocupado (55P03) en el paso C se informa como bloqueo y se deshace", async () => {
      const original = estado.bitacora;
      let llamadas = 0;
      const Cuenta = require("../../../rh/backend/models/empleadoCuenta.model");
      Cuenta.tomarCandadoVinculacion.mockImplementationOnce(async () => { llamadas++; throw Object.assign(new Error("lock"), { code: "55P03" }); });
      const r = await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
      expect(llamadas).toBe(1);
      expect(original).toBe(estado.bitacora);
      expect(r.filas[0].estado).toBe("error");
      expect(r.filas[0].motivo).toMatch(/bloqueados/);
      expect(estado.usuarios).toHaveLength(0);
    });
  });

  it("candado de la importación ocupado en el paso A: error de fila, nada se escribe ni se llama a GoTrue", async () => {
    estado.falla.candado = true;
    const r = await Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
    expect(r.filas[0].estado).toBe("error");
    expect(r.filas[0].motivo).toMatch(/bloqueados/);
    expect(gotrue.crearUsuario).not.toHaveBeenCalled();
  });

  it("dos aplicaciones simultáneas: la segunda recibe 409 sin escribir", async () => {
    let liberar;
    gotrue.crearUsuario.mockImplementationOnce(() => new Promise((resolver) => { liberar = () => resolver({ id: "uid-1" }); }));
    const primera = Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue });
    await new Promise((r) => setTimeout(r, 20));
    await expect(Modelo.aplicar(filas({ correo: correo("luis"), nombre: "Luis", apellido: "Ficticio", numero_nomina: "90002" }), { servicio: gotrue }))
      .rejects.toMatchObject({ estado: 409, message: expect.stringMatching(/en curso/) });
    liberar();
    expect((await primera).creadas).toBe(1);
    expect(estado.usuarios).toHaveLength(1);
    // ya liberado: se puede volver a aplicar
    expect((await Modelo.aplicar(filas({ correo: correo("luis"), nombre: "Luis", apellido: "Ficticio", numero_nomina: "90002" }), { servicio: gotrue })).creadas).toBe(1);
  });

  it("sin el rol rh_empleado: 409 antes de escribir nada", async () => {
    estado.roles = [];
    await expect(Modelo.aplicar(filas({ correo: correo("ana"), numero_nomina: "90001" }), { servicio: gotrue })).rejects.toMatchObject({ estado: 409 });
    expect(estado.usuarios).toHaveLength(0);
  });
});
