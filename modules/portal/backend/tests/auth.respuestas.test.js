jest.mock('../config/database', () => ({ grupo: { query: jest.fn() } }));
jest.mock('../models/usuario.model', () => ({ buscarPorId: jest.fn() }));
jest.mock('../models/rol.model', () => ({ obtenerPermisos: jest.fn().mockResolvedValue([]) }));
jest.mock('../services/auth.service', () => ({
  registroLocal: jest.fn(),
  inicioSesionLocal: jest.fn(),
}));
jest.mock('../services/ms365.service', () => ({}));
jest.mock('../services/supabaseAdmin.service', () => ({}));

const Usuario = require('../models/usuario.model');
const { grupo } = require('../config/database');
const ServicioAuth = require('../services/auth.service');
const controlador = require('../controllers/auth.controller');

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const sucio = { id: 1, correo: 'a@x.com', hash_password: 'HASH', auth_uid: 'UID' };

describe('respuestas de auth no filtran campos internos', () => {
  it('obtenerPerfil', async () => {
    Usuario.buscarPorId.mockResolvedValue(sucio);
    grupo.query.mockResolvedValue({ rows: [] });
    const r = res();
    await controlador.obtenerPerfil({ user: { usuario_id: 1 } }, r);
    const datos = r.json.mock.calls[0][0].datos;
    expect(datos).not.toHaveProperty('hash_password');
    expect(datos).not.toHaveProperty('auth_uid');
    expect(datos.correo).toBe('a@x.com');
  });

  it('inicioSesionLocal y registroLocal', async () => {
    ServicioAuth.inicioSesionLocal.mockResolvedValue({ usuario: sucio, token: 't' });
    ServicioAuth.registroLocal.mockResolvedValue({ usuario: sucio, token: 't' });
    const r1 = res();
    await controlador.inicioSesionLocal({ body: { correo: 'a', contraseña: 'b' } }, r1);
    const r2 = res();
    await controlador.registroLocal({ body: { correo: 'a', nombre: 'n', contraseña: 'b' } }, r2);
    for (const r of [r1, r2]) {
      const d = r.json.mock.calls[0][0].datos;
      expect(d.token).toBe('t');
      expect(d.usuario).not.toHaveProperty('hash_password');
      expect(d.usuario).not.toHaveProperty('auth_uid');
    }
  });
});
