const { planificar, migrarUno, ejecutar, parsearArgs } = require('../../../../scripts/migrar-usuarios-supabase');

const HASH = '$2b$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234';
const local = { id: 1, correo: 'Ana@X.com', nombre: 'Ana', apellido: 'P', auth_tipo: 'local', hash_password: HASH };
const ms = { id: 2, correo: 'bob@x.com', nombre: 'Bob', apellido: 'Q', auth_tipo: 'ms365', hash_password: null };

function crearServicio(extra = {}) {
  return {
    buscarPorCorreo: jest.fn().mockResolvedValue(null),
    crearUsuario: jest.fn().mockResolvedValue({ id: 'uid-new' }),
    eliminarUsuario: jest.fn().mockResolvedValue(),
    ...extra,
  };
}
const crearPool = (rowCount = 1) => ({ query: jest.fn().mockResolvedValue({ rowCount, rows: [] }) });

describe('migrar-usuarios-supabase', () => {
  it('crea con passwordHash y vincula auth_uid', async () => {
    const servicio = crearServicio();
    const pool = crearPool();
    const r = await migrarUno(local, { pool, servicio });
    expect(r.estado).toBe('creado');
    expect(servicio.crearUsuario).toHaveBeenCalledWith({
      correo: 'ana@x.com',
      passwordHash: HASH,
      metadata: { usuario_id: 1, nombre: 'Ana', apellido: 'P' },
    });
    expect(pool.query.mock.calls[0][0]).toMatch(/auth_uid IS NULL/);
    expect(pool.query.mock.calls[0][1]).toEqual(['uid-new', 1]);
  });

  it('ms365 se crea sin password ni hash', async () => {
    const servicio = crearServicio();
    await migrarUno(ms, { pool: crearPool(), servicio });
    const arg = servicio.crearUsuario.mock.calls[0][0];
    expect(arg).not.toHaveProperty('passwordHash');
    expect(arg).not.toHaveProperty('password');
  });

  it('si ya existe en GoTrue solo vincula', async () => {
    const servicio = crearServicio({ buscarPorCorreo: jest.fn().mockResolvedValue({ id: 'uid-old', email: 'ana@x.com' }) });
    const pool = crearPool();
    const r = await migrarUno(local, { pool, servicio });
    expect(r.estado).toBe('vinculado');
    expect(servicio.crearUsuario).not.toHaveBeenCalled();
    expect(pool.query.mock.calls[0][1]).toEqual(['uid-old', 1]);
  });

  it('idempotente: carrera 422 en crear vincula al existente', async () => {
    const err = Object.assign(new Error('exists'), { status: 422 });
    const buscar = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'uid-x' });
    const servicio = crearServicio({ buscarPorCorreo: buscar, crearUsuario: jest.fn().mockRejectedValue(err) });
    const r = await migrarUno(local, { pool: crearPool(), servicio });
    expect(r.estado).toBe('vinculado');
  });

  it('si el UPDATE no afecta filas elimina el recien creado y omite', async () => {
    const servicio = crearServicio();
    const r = await migrarUno(local, { pool: crearPool(0), servicio });
    expect(r.estado).toBe('omitido');
    expect(servicio.eliminarUsuario).toHaveBeenCalledWith('uid-new');
  });

  it('local sin hash se omite', async () => {
    const servicio = crearServicio();
    const r = await migrarUno({ ...local, hash_password: null }, { pool: crearPool(), servicio });
    expect(r.estado).toBe('omitido');
    expect(servicio.crearUsuario).not.toHaveBeenCalled();
  });

  it('dry-run no escribe en BD ni en GoTrue', async () => {
    const servicio = crearServicio();
    const pool = crearPool();
    const r = await migrarUno(local, { pool, servicio, dryRun: true });
    expect(r.estado).toBe('creado');
    expect(servicio.crearUsuario).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('planificar clasifica y no escribe; ejecutar dry-run no imprime hashes', async () => {
    const servicio = crearServicio({
      buscarPorCorreo: jest.fn().mockImplementation(async (c) => (c === 'bob@x.com' ? { id: 'u', email: c } : null)),
    });
    const plan = await planificar([local, ms], servicio);
    expect(plan.map((p) => p.accion)).toEqual(['crear', 'vincular']);

    const pool = { query: jest.fn().mockResolvedValue({ rows: [local, ms] }) };
    const log = jest.fn();
    const r = await ejecutar({ dryRun: true }, { pool, servicio, log });
    expect(r).toEqual({ creados: 1, vinculados: 1, omitidos: 0, errores: 0 });
    expect(servicio.crearUsuario).not.toHaveBeenCalled();
    expect(log.mock.calls.join('\n')).not.toContain(HASH);
  });

  it('ejecutar continua ante error y lo cuenta', async () => {
    const servicio = crearServicio({ crearUsuario: jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ id: 'u2' }) });
    const pool = { query: jest.fn().mockImplementation(async (sql) => (/^SELECT/.test(sql) ? { rows: [local, ms] } : { rowCount: 1 })) };
    const r = await ejecutar({}, { pool, servicio, log: jest.fn() });
    expect(r).toEqual({ creados: 1, vinculados: 0, omitidos: 0, errores: 1 });
  });

  it('parsearArgs', () => {
    expect(parsearArgs(['--dry-run', '--only=a@b.c', '--limit=3'])).toEqual({ dryRun: true, only: 'a@b.c', limit: 3 });
    expect(() => parsearArgs(['--limit=0'])).toThrow();
  });
});
