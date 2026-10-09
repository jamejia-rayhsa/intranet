const jwt = require('jsonwebtoken');

jest.mock('../config/database', () => ({
  grupo: { query: jest.fn() },
}));
const { grupo } = require('../config/database');
const { authenticateJWT, soloLegacy } = require('../middleware/auth.middleware');

const SECRETO_SB = 'secreto-supabase-de-prueba-0123456789';
const SECRETO_LEGADO = 'secreto-legado-de-prueba';
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
    process.env.JWT_SECRET = SECRETO_LEGADO;
    delete process.env.AUTH_LEGACY_ENABLED;
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

  it('vincula por correo cuando el usuario aun no tiene auth_uid', async () => {
    grupo.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [usuarioFila] })
      .mockResolvedValueOnce({ rows: [] });
    const { req, res, next } = crearMocks(tokenSupabase());
    await authenticateJWT(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(grupo.query.mock.calls[1][0]).toMatch(/UPDATE usuarios SET auth_uid/);
    expect(grupo.query.mock.calls[1][0]).toMatch(/auth_uid IS NULL/);
    expect(grupo.query.mock.calls[1][1]).toEqual([UID, 'ana@rayhsa.com']);
    expect(req.user.rol_id).toBeNull();
    expect(req.user.roles).toEqual([]);
  });

  it('responde 403 si el usuario no esta registrado en la intranet', async () => {
    grupo.query.mockResolvedValue({ rows: [] });
    const { req, res, next } = crearMocks(tokenSupabase());
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ exito: false, mensaje: 'Usuario no registrado en la intranet' });
    expect(next).not.toHaveBeenCalled();
  });

  it('no vincula por correo si el email no esta verificado', async () => {
    grupo.query.mockResolvedValue({ rows: [] });
    const { req, res, next } = crearMocks(tokenSupabase({ user_metadata: { email_verified: false } }));
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

  it('acepta un token legado con la flag activa', async () => {
    grupo.query.mockResolvedValueOnce({ rows: [{ rol_id: 1, rol_nombre: 'super_admin' }] });
    const legado = jwt.sign({ usuario_id: 3, correo: 'a@b.c', nombre: 'A' }, SECRETO_LEGADO);
    const { req, res, next } = crearMocks(legado);
    await authenticateJWT(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ usuario_id: 3, rol_nombre: 'super_admin', roles: ['super_admin'] });
  });

  it('rechaza un token legado con AUTH_LEGACY_ENABLED=false', async () => {
    process.env.AUTH_LEGACY_ENABLED = 'false';
    const legado = jwt.sign({ usuario_id: 3 }, SECRETO_LEGADO);
    const { req, res, next } = crearMocks(legado);
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(grupo.query).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 401 con token de Supabase expirado', async () => {
    const { req, res, next } = crearMocks(tokenSupabase({}, { expiresIn: -10 }));
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ exito: false, mensaje: 'Token inválido o expirado' });
  });

  it('responde 401 con token firmado con otro secreto', async () => {
    const { req, res, next } = crearMocks(jwt.sign({ sub: UID, aud: 'authenticated' }, 'otro'));
    await authenticateJWT(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('soloLegacy', () => {
  afterEach(() => delete process.env.AUTH_LEGACY_ENABLED);

  it('deja pasar con la flag por defecto', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    soloLegacy({}, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('responde 404 con la flag en false', () => {
    process.env.AUTH_LEGACY_ENABLED = 'false';
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    soloLegacy({}, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});
