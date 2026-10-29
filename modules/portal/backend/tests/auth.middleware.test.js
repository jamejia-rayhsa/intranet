const jwt = require('jsonwebtoken');

jest.mock('../config/database', () => ({
  grupo: { query: jest.fn() },
}));
const { grupo } = require('../config/database');
const { authenticateJWT } = require('../middleware/auth.middleware');

const SECRETO_SB = 'secreto-supabase-de-prueba-0123456789';
const SECRETO_AJENO = 'secreto-ajeno-de-prueba';
const UID = '11111111-1111-1111-1111-111111111111';

function tokenSupabase(extra = {}, opciones = {}) {
  return jwt.sign(
    { sub: UID, aud: 'authenticated', role: 'authenticated', email: 'ana@rayhsa.com', ...extra },
    SECRETO_SB,
    { expiresIn: '1h', ...opciones },
  );
}

function crearMocks(token) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

const usuarioFila = { id: 7, correo: 'ana@rayhsa.com', nombre: 'Ana', apellido: 'P', activo: true, auth_uid: UID };

describe('authenticateJWT', () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = SECRETO_SB;
    // Aunque existiera un JWT_SECRET legado en el entorno, no debe aceptarse.
    process.env.JWT_SECRET = SECRETO_AJENO;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('responde 401 si falta el token', async () => {
    const { req, res, next } = crearMocks();
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('acepta un token de Supabase y arma req.user con la misma forma', async () => {
    grupo.query
      .mockResolvedValueOnce({ rows: [usuarioFila] })
      .mockResolvedValueOnce({ rows: [{ rol_id: 2, rol_nombre: 'empleado' }] });
    const { req, res, next } = crearMocks(tokenSupabase());
    await authenticateJWT(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({
      usuario_id: 7,
      correo: 'ana@rayhsa.com',
      nombre: 'Ana',
      rol_id: 2,
      rol_nombre: 'empleado',
      roles: ['empleado'],
    });
    expect(grupo.query.mock.calls[0][1]).toEqual([UID]);
  });

  it('NO vincula por correo: una fila local sin auth_uid con el mismo correo recibe 403 y ningun UPDATE', async () => {
    grupo.query.mockResolvedValue({ rows: [] });
    const { req, res, next } = crearMocks(tokenSupabase());
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(grupo.query).toHaveBeenCalledTimes(1);
    expect(grupo.query.mock.calls[0][0]).toMatch(/WHERE auth_uid = \$1/);
    grupo.query.mock.calls.forEach(([sql]) => expect(sql).not.toMatch(/UPDATE/i));
  });

  describe('nombre desde el proveedor (Microsoft)', () => {
    const meta = { user_metadata: { full_name: 'Juan Carlos Perez Lopez' } };
    // Fábrica: el middleware actualiza el objeto de la fila, no debe compartirse entre tests
    const crearSinApellido = () => ({ ...usuarioFila, nombre: 'usuario.nuevo', apellido: null });

    it('completa el nombre cuando el apellido local esta vacio', async () => {
      grupo.query
        .mockResolvedValueOnce({ rows: [crearSinApellido()] })
        .mockResolvedValueOnce({ rows: [{ nombre: 'Juan Carlos', apellido: 'Perez Lopez' }] })
        .mockResolvedValueOnce({ rows: [{ rol_id: 1, rol_nombre: 'super_admin' }] });
      const { req, res, next } = crearMocks(tokenSupabase(meta));
      await authenticateJWT(req, res, next);
      expect(next).toHaveBeenCalled();
      const [sql, params] = grupo.query.mock.calls[1];
      expect(sql).toMatch(/UPDATE usuarios SET nombre = \$1, apellido = \$2/);
      expect(sql).toMatch(/apellido IS NULL OR btrim\(apellido\) = ''/);
      expect(params).toEqual(['Juan Carlos', 'Perez Lopez', 7]);
      expect(req.user.nombre).toBe('Juan Carlos');
    });

    it('NO pisa un nombre que un administrador ya escribio completo', async () => {
      grupo.query
        .mockResolvedValueOnce({ rows: [{ ...usuarioFila, nombre: 'Ana', apellido: 'Perez' }] })
        .mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = crearMocks(tokenSupabase(meta));
      await authenticateJWT(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(grupo.query).toHaveBeenCalledTimes(2); // SELECT usuario + rol, ningun UPDATE
      grupo.query.mock.calls.forEach(([sql]) => expect(sql).not.toMatch(/UPDATE/i));
      expect(req.user.nombre).toBe('Ana');
    });

    it('no intenta nada si el token no trae nombre del proveedor', async () => {
      grupo.query.mockResolvedValueOnce({ rows: [crearSinApellido()] }).mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = crearMocks(tokenSupabase());
      await authenticateJWT(req, res, next);
      expect(next).toHaveBeenCalled();
      grupo.query.mock.calls.forEach(([sql]) => expect(sql).not.toMatch(/UPDATE/i));
      expect(req.user.nombre).toBe('usuario.nuevo');
    });

    it('un fallo al guardar el nombre no impide el acceso', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      grupo.query
        .mockResolvedValueOnce({ rows: [crearSinApellido()] })
        .mockRejectedValueOnce(new Error('db caida'))
        .mockResolvedValueOnce({ rows: [] });
      const { req, res, next } = crearMocks(tokenSupabase(meta));
      await authenticateJWT(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.user.nombre).toBe('usuario.nuevo');
    });
  });

  describe('cuentas ms365: solo entran con Microsoft (amr oauth)', () => {
    const AMR_OAUTH = [{ method: 'oauth', timestamp: 1 }];
    const AMR_PASSWORD = [{ method: 'password', timestamp: 1 }];
    const ms365 = { ...usuarioFila, auth_tipo: 'ms365' };
    const MENSAJE_401 = { exito: false, mensaje: 'Token inválido o expirado' };

    // Los rechazos no consumen la respuesta del rol: sin reset quedaria en la cola y contaminaria otros tests.
    afterEach(() => grupo.query.mockReset());

    async function ejecutar(fila, extra) {
      grupo.query
        .mockResolvedValueOnce({ rows: [fila] })
        .mockResolvedValueOnce({ rows: [{ rol_id: 2, rol_nombre: 'empleado' }] });
      const m = crearMocks(tokenSupabase(extra));
      await authenticateJWT(m.req, m.res, m.next);
      return m;
    }

    it('ms365 + azure (amr oauth) entra, con provider email como lo emite GoTrue', async () => {
      const { next, req } = await ejecutar(ms365, {
        amr: AMR_OAUTH,
        app_metadata: { provider: 'email', providers: ['email', 'azure'] },
      });
      expect(next).toHaveBeenCalled();
      expect(req.user.usuario_id).toBe(7);
    });

    it('ms365 + password se rechaza con 401 uniforme, sin next ni consultar el rol', async () => {
      const { next, res } = await ejecutar(ms365, {
        amr: AMR_PASSWORD,
        app_metadata: { provider: 'email', providers: ['email', 'azure'] },
      });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(MENSAJE_401);
      expect(next).not.toHaveBeenCalled();
      expect(grupo.query).toHaveBeenCalledTimes(1);
    });

    it('la respuesta es identica a la de un token invalido (no revela el motivo)', async () => {
      const a = await ejecutar(ms365, { amr: AMR_PASSWORD });
      const b = crearMocks(jwt.sign({ sub: UID, aud: 'authenticated' }, SECRETO_AJENO));
      await authenticateJWT(b.req, b.res, b.next);
      expect(a.res.status.mock.calls[0]).toEqual(b.res.status.mock.calls[0]);
      expect(a.res.json.mock.calls[0]).toEqual(b.res.json.mock.calls[0]);
    });

    it.each([
      ['sin claim amr', undefined],
      ['amr vacio', []],
      ['amr no es arreglo', 'oauth'],
      ['amr con elementos basura', [null, 'oauth', 5]],
      ['amr otp (magic link)', [{ method: 'otp' }]],
    ])('ms365 con token %s se rechaza (fail-closed)', async (_n, amr) => {
      const { res, next } = await ejecutar(ms365, amr === undefined ? {} : { amr });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('ms365 no se salva por traer provider azure en app_metadata/user_metadata (editables o ambiguos)', async () => {
      const { res, next } = await ejecutar(ms365, {
        amr: AMR_PASSWORD,
        app_metadata: { provider: 'azure', providers: ['azure'] },
        user_metadata: { provider: 'azure' },
      });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('refresh de una sesion Microsoft (mismo amr oauth, iat nuevo) sigue entrando; el de una sesion por contrasena no', async () => {
      const ok = await ejecutar(ms365, { amr: AMR_OAUTH, iat: Math.floor(Date.now() / 1000) + 5 });
      expect(ok.next).toHaveBeenCalled();
      const mal = await ejecutar(ms365, { amr: AMR_PASSWORD, iat: Math.floor(Date.now() / 1000) + 5 });
      expect(mal.res.status).toHaveBeenCalledWith(401);
    });

    it('amr con oauth entre varios metodos (p. ej. MFA adicional) entra', async () => {
      const { next } = await ejecutar(ms365, { amr: [{ method: 'totp' }, { method: 'oauth' }] });
      expect(next).toHaveBeenCalled();
    });

    it('ms365 desactivado con token por contrasena sigue siendo 401 (el proveedor se comprueba primero)', async () => {
      const { res } = await ejecutar({ ...ms365, activo: false }, { amr: AMR_PASSWORD });
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('local + password entra', async () => {
      const { next } = await ejecutar({ ...usuarioFila, auth_tipo: 'local' }, { amr: AMR_PASSWORD });
      expect(next).toHaveBeenCalled();
    });

    it('local sin claim amr (o con oauth) entra: la regla no aplica', async () => {
      expect((await ejecutar({ ...usuarioFila, auth_tipo: 'local' }, {})).next).toHaveBeenCalled();
      expect((await ejecutar({ ...usuarioFila, auth_tipo: 'local' }, { amr: AMR_OAUTH })).next).toHaveBeenCalled();
    });

    it('no agrega consultas: una sola query de usuario (con auth_tipo) + la del rol', async () => {
      await ejecutar(ms365, { amr: AMR_OAUTH });
      expect(grupo.query).toHaveBeenCalledTimes(2);
      expect(grupo.query.mock.calls[0][0]).toMatch(/auth_tipo/);
    });
  });

  it('responde 403 si el usuario no esta registrado en la intranet', async () => {
    grupo.query.mockResolvedValue({ rows: [] });
    const { req, res, next } = crearMocks(tokenSupabase());
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ exito: false, mensaje: 'Usuario no registrado en la intranet' });
    expect(next).not.toHaveBeenCalled();
  });

  it('tampoco vincula con email_verified true en user_metadata (campo editable por el usuario)', async () => {
    grupo.query.mockResolvedValue({ rows: [] });
    const { req, res, next } = crearMocks(tokenSupabase({ user_metadata: { email_verified: true } }));
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(grupo.query).toHaveBeenCalledTimes(1);
  });

  it('responde 403 si el usuario esta inactivo', async () => {
    grupo.query.mockResolvedValueOnce({ rows: [{ ...usuarioFila, activo: false }] });
    const { req, res, next } = crearMocks(tokenSupabase());
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rechaza un token firmado con JWT_SECRET (legado) sin consultar la BD', async () => {
    const legado = jwt.sign({ usuario_id: 3, correo: 'a@b.c' }, SECRETO_AJENO);
    const { req, res, next } = crearMocks(legado);
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(grupo.query).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rechaza un token con el secreto correcto pero audiencia distinta', async () => {
    const { req, res, next } = crearMocks(tokenSupabase({ aud: 'otra' }));
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rechaza un token con algoritmo none', async () => {
    const sinFirma = jwt.sign({ sub: UID, aud: 'authenticated' }, '', { algorithm: 'none' });
    const { req, res, next } = crearMocks(sinFirma);
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('responde 401 con token de Supabase expirado', async () => {
    const { req, res, next } = crearMocks(tokenSupabase({}, { expiresIn: -10 }));
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ exito: false, mensaje: 'Token inválido o expirado' });
  });

  it('responde 401 con token firmado con otro secreto', async () => {
    const { req, res, next } = crearMocks(jwt.sign({ sub: UID, aud: 'authenticated' }, SECRETO_AJENO));
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
