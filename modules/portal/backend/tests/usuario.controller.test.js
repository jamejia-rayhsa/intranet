jest.mock('../config/database', () => ({ grupo: { query: jest.fn() } }));
jest.mock('../models/usuario.model', () => ({
  buscarPorCorreo: jest.fn(),
  buscarPorId: jest.fn(),
  crear: jest.fn(),
  actualizar: jest.fn(),
  eliminar: jest.fn(),
}));
jest.mock('../services/supabaseAdmin.service', () => ({
  crearUsuario: jest.fn(),
  actualizarPassword: jest.fn(),
  eliminarUsuario: jest.fn(),
}));

const Usuario = require('../models/usuario.model');
const supabaseAdmin = require('../services/supabaseAdmin.service');
const controlador = require('../controllers/usuario.controller');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('usuario.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('crear', () => {
    const body = { correo: 'A@x.com', nombre: 'Ana', contraseña: 'Secreta123' };

    it('crea en GoTrue, guarda auth_uid y no devuelve hash', async () => {
      Usuario.buscarPorCorreo.mockResolvedValue(undefined);
      supabaseAdmin.crearUsuario.mockResolvedValue({ id: 'uid-1' });
      Usuario.crear.mockResolvedValue({ id: 5, correo: 'A@x.com', hash_password: 'h', auth_uid: 'uid-1' });
      const res = mockRes();
      await controlador.crear({ body }, res);
      const args = supabaseAdmin.crearUsuario.mock.calls[0][0];
      expect(args.correo).toBe('a@x.com');
      expect(args.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(Usuario.crear.mock.calls[0][0].auth_uid).toBe('uid-1');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0].datos).not.toHaveProperty('hash_password');
    });

    it('compensa (elimina en GoTrue) y propaga el error si falla el INSERT', async () => {
      Usuario.buscarPorCorreo.mockResolvedValue(undefined);
      supabaseAdmin.crearUsuario.mockResolvedValue({ id: 'uid-1' });
      Usuario.crear.mockRejectedValue(new Error('fallo insert'));
      const res = mockRes();
      await controlador.crear({ body }, res);
      expect(supabaseAdmin.eliminarUsuario).toHaveBeenCalledWith('uid-1');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toBe('fallo insert');
    });

    it('si GoTrue falla no inserta localmente', async () => {
      Usuario.buscarPorCorreo.mockResolvedValue(undefined);
      supabaseAdmin.crearUsuario.mockRejectedValue(new Error('gotrue caido'));
      const res = mockRes();
      await controlador.crear({ body }, res);
      expect(Usuario.crear).not.toHaveBeenCalled();
      expect(supabaseAdmin.eliminarUsuario).not.toHaveBeenCalled();
    });
  });

  describe('resetearPassword', () => {
    it('escritura doble con auth_uid y contraseña de 12+ caracteres alfanuméricos', async () => {
      Usuario.buscarPorId.mockResolvedValue({ id: 3, auth_tipo: 'local', auth_uid: 'uid-3' });
      Usuario.actualizar.mockResolvedValue({});
      const res = mockRes();
      await controlador.resetearPassword({ params: { id: 3 } }, res);
      const temporal = res.json.mock.calls[0][0].datos.contraseña_temporal;
      expect(temporal).toMatch(/^[A-Za-z0-9]{12,}$/);
      expect(supabaseAdmin.actualizarPassword).toHaveBeenCalledWith('uid-3', temporal);
      const datos = Usuario.actualizar.mock.calls[0][1];
      expect(datos.hash_password).toMatch(/^\$2[aby]\$/);
      expect(datos.requiere_cambio_password).toBe(true);
    });

    it('sin auth_uid actualiza solo local y no falla', async () => {
      Usuario.buscarPorId.mockResolvedValue({ id: 4, auth_tipo: 'local', auth_uid: null });
      Usuario.actualizar.mockResolvedValue({});
      const res = mockRes();
      await controlador.resetearPassword({ params: { id: 4 } }, res);
      expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
      expect(Usuario.actualizar).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      const aviso = console.warn.mock.calls[0].join(' ');
      expect(aviso).not.toContain(res.json.mock.calls[0][0].datos.contraseña_temporal);
    });

    it('contraseñas temporales distintas entre llamadas', () => {
      expect(controlador.generarContraseñaTemporal()).not.toBe(controlador.generarContraseñaTemporal());
    });
  });

  describe('obtener', () => {
    it('no expone hash_password ni auth_uid', async () => {
      Usuario.buscarPorId.mockResolvedValue({ id: 1, correo: 'a', hash_password: 'h', auth_uid: 'u' });
      const res = mockRes();
      await controlador.obtener({ params: { id: 1 } }, res);
      expect(res.json.mock.calls[0][0].datos).toEqual({ id: 1, correo: 'a' });
    });
  });
  describe('eliminar', () => {
    it('elimina local y luego GoTrue cuando hay auth_uid', async () => {
      Usuario.buscarPorId.mockResolvedValue({ id: 7, auth_uid: 'uid-7' });
      Usuario.eliminar.mockResolvedValue({ id: 7 });
      const res = mockRes();
      await controlador.eliminar({ params: { id: 7 } }, res);
      expect(Usuario.eliminar.mock.invocationCallOrder[0]).toBeLessThan(
        supabaseAdmin.eliminarUsuario.mock.invocationCallOrder[0],
      );
      expect(supabaseAdmin.eliminarUsuario).toHaveBeenCalledWith('uid-7');
      expect(res.json.mock.calls[0][0].exito).toBe(true);
    });

    it('sin auth_uid no llama a GoTrue', async () => {
      Usuario.buscarPorId.mockResolvedValue({ id: 8, auth_uid: null });
      Usuario.eliminar.mockResolvedValue({ id: 8 });
      const res = mockRes();
      await controlador.eliminar({ params: { id: 8 } }, res);
      expect(supabaseAdmin.eliminarUsuario).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].exito).toBe(true);
    });

    it('fallo de GoTrue responde exito y avisa sin datos sensibles', async () => {
      Usuario.buscarPorId.mockResolvedValue({ id: 9, auth_uid: 'uid-secreto-9', hash_password: 'HASH' });
      Usuario.eliminar.mockResolvedValue({ id: 9 });
      supabaseAdmin.eliminarUsuario.mockRejectedValue(new Error('gotrue caido'));
      const res = mockRes();
      await controlador.eliminar({ params: { id: 9 } }, res);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].exito).toBe(true);
      const aviso = console.warn.mock.calls.flat().join(' ');
      expect(aviso).not.toContain('uid-secreto-9');
      expect(aviso).not.toContain('HASH');
    });

    it('404 si no existe y no toca GoTrue', async () => {
      Usuario.buscarPorId.mockResolvedValue(undefined);
      Usuario.eliminar.mockResolvedValue(undefined);
      const res = mockRes();
      await controlador.eliminar({ params: { id: 1 } }, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(supabaseAdmin.eliminarUsuario).not.toHaveBeenCalled();
    });
  });

  describe('actualizar', () => {
    it('con contraseña y auth_uid: escritura doble', async () => {
      Usuario.buscarPorId.mockResolvedValue({ id: 2, auth_uid: 'uid-2' });
      Usuario.actualizar.mockResolvedValue({ id: 2, hash_password: 'h', auth_uid: 'uid-2' });
      const res = mockRes();
      await controlador.actualizar({ params: { id: 2 }, body: { contraseña: 'Nueva12345' } }, res);
      expect(supabaseAdmin.actualizarPassword).toHaveBeenCalledWith('uid-2', 'Nueva12345');
      expect(Usuario.actualizar.mock.calls[0][1].hash_password).toMatch(/^\$2[aby]\$/);
      const datos = res.json.mock.calls[0][0].datos;
      expect(datos).not.toHaveProperty('hash_password');
      expect(datos).not.toHaveProperty('auth_uid');
    });

    it('con contraseña y sin auth_uid: solo local + warn', async () => {
      Usuario.buscarPorId.mockResolvedValue({ id: 2, auth_uid: null });
      Usuario.actualizar.mockResolvedValue({ id: 2 });
      const res = mockRes();
      await controlador.actualizar({ params: { id: 2 }, body: { contraseña: 'Nueva12345' } }, res);
      expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
      expect(Usuario.actualizar).toHaveBeenCalled();
      expect(console.warn.mock.calls.flat().join(' ')).not.toContain('Nueva12345');
    });

    it('sin contraseña no consulta ni toca GoTrue', async () => {
      Usuario.actualizar.mockResolvedValue({ id: 2 });
      const res = mockRes();
      await controlador.actualizar({ params: { id: 2 }, body: { nombre: 'X' } }, res);
      expect(Usuario.buscarPorId).not.toHaveBeenCalled();
      expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
    });
  });
});
