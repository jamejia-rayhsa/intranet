jest.mock('../config/database', () => ({ grupo: { query: jest.fn() } }));
jest.mock('../models/usuario.model', () => ({ buscarPorId: jest.fn(), actualizar: jest.fn() }));
jest.mock('../models/rol.model', () => ({ obtenerPermisos: jest.fn().mockResolvedValue([]) }));
jest.mock('../services/supabaseAdmin.service', () => ({
  iniciarSesion: jest.fn(),
  actualizarPassword: jest.fn(),
}));

const Usuario = require('../models/usuario.model');
const supabaseAdmin = require('../services/supabaseAdmin.service');
const { grupo } = require('../config/database');
const controlador = require('../controllers/auth.controller');

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const sucio = { id: 1, correo: 'a@x.com', hash_password: 'HASH', auth_uid: 'UID' };

describe('obtenerPerfil', () => {
  it('no filtra campos internos', async () => {
    Usuario.buscarPorId.mockResolvedValue(sucio);
    grupo.query.mockResolvedValue({ rows: [] });
    const r = res();
    await controlador.obtenerPerfil({ user: { usuario_id: 1 } }, r);
    const datos = r.json.mock.calls[0][0].datos;
    expect(datos).not.toHaveProperty('hash_password');
    expect(datos).not.toHaveProperty('auth_uid');
    expect(datos.correo).toBe('a@x.com');
  });
});

describe('cambiarPassword (validación contra GoTrue)', () => {
  const req = (body) => ({ user: { usuario_id: 1 }, body });
  const cuerpo = { contraseña_actual: 'Vieja123', contraseña_nueva: 'Nueva12345' };

  beforeEach(() => jest.clearAllMocks());

  it('con la actual correcta actualiza en GoTrue y limpia requiere_cambio_password', async () => {
    Usuario.buscarPorId.mockResolvedValue(sucio);
    supabaseAdmin.iniciarSesion.mockResolvedValue({ access_token: 't' });
    const r = res();
    await controlador.cambiarPassword(req(cuerpo), r);
    expect(supabaseAdmin.iniciarSesion).toHaveBeenCalledWith('a@x.com', 'Vieja123');
    expect(supabaseAdmin.actualizarPassword).toHaveBeenCalledWith('UID', 'Nueva12345');
    expect(Usuario.actualizar).toHaveBeenCalledWith(1, { requiere_cambio_password: false });
    expect(r.json.mock.calls[0][0].exito).toBe(true);
  });

  it('con la actual incorrecta responde 400 y no escribe nada', async () => {
    Usuario.buscarPorId.mockResolvedValue(sucio);
    supabaseAdmin.iniciarSesion.mockRejectedValue(Object.assign(new Error('Supabase Auth: Invalid login credentials'), { status: 400 }));
    const r = res();
    await controlador.cambiarPassword(req(cuerpo), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].mensaje).toBe('La contraseña actual es incorrecta');
    expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
    expect(Usuario.actualizar).not.toHaveBeenCalled();
  });

  it('si GoTrue no responde no se confunde con credenciales malas y no escribe', async () => {
    Usuario.buscarPorId.mockResolvedValue(sucio);
    supabaseAdmin.iniciarSesion.mockRejectedValue(Object.assign(new Error('No se pudo contactar Supabase Auth'), { status: 503 }));
    const r = res();
    await controlador.cambiarPassword(req(cuerpo), r);
    expect(r.json.mock.calls[0][0].mensaje).toMatch(/contactar/);
    expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
  });

  it('usuario sin auth_uid: 409 sin llamar a GoTrue', async () => {
    Usuario.buscarPorId.mockResolvedValue({ ...sucio, auth_uid: null });
    const r = res();
    await controlador.cambiarPassword(req(cuerpo), r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(supabaseAdmin.iniciarSesion).not.toHaveBeenCalled();
  });

  it('exige ambas contraseñas', async () => {
    const r = res();
    await controlador.cambiarPassword(req({ contraseña_actual: 'x' }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(Usuario.buscarPorId).not.toHaveBeenCalled();
  });
});

describe('rutas legadas', () => {
  const request = require('supertest');
  const express = require('express');
  jest.mock('../middleware/auth.middleware', () => ({ authenticateJWT: (_q, _r, n) => n() }));
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth.routes'));

  it.each([
    ['post', '/api/auth/registro'],
    ['post', '/api/auth/inicio-sesion'],
    ['get', '/api/auth/ms365'],
    ['get', '/api/auth/ms365/callback'],
    ['post', '/api/auth/renovar'],
    ['post', '/api/auth/recuperar-password'],
  ])('%s %s responde 404', async (metodo, ruta) => {
    const r = await request(app)[metodo](ruta).send({});
    expect(r.status).toBe(404);
  });

  it('las rutas vigentes siguen montadas', () => {
    const rutas = require('../routes/auth.routes').stack.map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`);
    expect(rutas.sort()).toEqual(['get /perfil', 'post /cambiar-password']);
  });
});
