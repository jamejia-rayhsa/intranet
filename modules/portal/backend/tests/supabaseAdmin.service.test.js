const SupabaseAdmin = require('../services/supabaseAdmin.service');

function respuesta(status, cuerpo) {
  return { ok: status >= 200 && status < 300, status, text: async () => (cuerpo === undefined ? '' : JSON.stringify(cuerpo)) };
}

describe('supabaseAdmin.service', () => {
  beforeEach(() => {
    process.env.SUPABASE_AUTH_URL = 'http://auth:9999';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-secreta-servicio';
    global.fetch = jest.fn();
  });
  afterEach(() => {
    delete global.fetch;
  });

  it('crearUsuario envia password_hash y email_confirm', async () => {
    fetch.mockResolvedValueOnce(respuesta(200, { id: 'uid-1' }));
    const r = await SupabaseAdmin.crearUsuario({ correo: 'a@b.c', passwordHash: '$2b$x', password: 'ignorada', metadata: { nombre: 'A' } });
    expect(r).toEqual({ id: 'uid-1' });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('http://auth:9999/admin/users');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer clave-secreta-servicio');
    const cuerpo = JSON.parse(opts.body);
    expect(cuerpo).toMatchObject({ email: 'a@b.c', email_confirm: true, password_hash: '$2b$x', user_metadata: { nombre: 'A' } });
    expect(cuerpo.password).toBeUndefined();
  });

  it('crearUsuario usa password si no hay hash', async () => {
    fetch.mockResolvedValueOnce(respuesta(200, { id: 'uid-2' }));
    await SupabaseAdmin.crearUsuario({ correo: 'a@b.c', password: 'Abc12345' });
    expect(JSON.parse(fetch.mock.calls[0][1].body).password).toBe('Abc12345');
  });

  it('lanza error con status y sin filtrar la clave', async () => {
    fetch.mockResolvedValueOnce(respuesta(422, { msg: 'Email ya registrado' }));
    let error;
    try {
      await SupabaseAdmin.crearUsuario({ correo: 'a@b.c', password: 'x' });
    } catch (e) {
      error = e;
    }
    expect(error.status).toBe(422);
    expect(error.message).toContain('Email ya registrado');
    expect(error.message).not.toContain('clave-secreta-servicio');
  });

  it('actualizarPassword hace PUT al usuario', async () => {
    fetch.mockResolvedValueOnce(respuesta(200, {}));
    await SupabaseAdmin.actualizarPassword('uid-1', 'nueva');
    expect(fetch.mock.calls[0][0]).toBe('http://auth:9999/admin/users/uid-1');
    expect(fetch.mock.calls[0][1].method).toBe('PUT');
  });

  it('eliminarUsuario hace DELETE', async () => {
    fetch.mockResolvedValueOnce(respuesta(200, {}));
    await SupabaseAdmin.eliminarUsuario('uid-1');
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('buscarPorCorreo ignora mayusculas y devuelve null si no existe', async () => {
    fetch.mockResolvedValue(respuesta(200, { users: [{ id: 'u1', email: 'Ana@Rayhsa.com' }] }));
    expect(await SupabaseAdmin.buscarPorCorreo('ana@rayhsa.com')).toEqual({ id: 'u1', email: 'Ana@Rayhsa.com' });
    expect(await SupabaseAdmin.buscarPorCorreo('otro@rayhsa.com')).toBeNull();
  });

  it('iniciarSesion usa grant_type=password y devuelve la respuesta', async () => {
    fetch.mockResolvedValueOnce(respuesta(200, { access_token: 't' }));
    const r = await SupabaseAdmin.iniciarSesion('a@b.c', 'pw');
    expect(r.access_token).toBe('t');
    expect(fetch.mock.calls[0][0]).toBe('http://auth:9999/token?grant_type=password');
  });

  it('traduce fallos de red a 503', async () => {
    fetch.mockRejectedValueOnce(new Error('ECONNREFUSED http://auth:9999'));
    await expect(SupabaseAdmin.eliminarUsuario('x')).rejects.toMatchObject({ status: 503 });
  });

  it('falla claro si falta la service role key', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(SupabaseAdmin.eliminarUsuario('x')).rejects.toThrow(/SERVICE_ROLE_KEY/);
  });
});
