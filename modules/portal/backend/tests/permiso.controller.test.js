// Los controladores de permisos no devuelven error.message (texto de PostgreSQL) al cliente.
jest.mock('../config/database', () => ({ grupo: { connect: jest.fn(), query: jest.fn() } }));
jest.mock('../models/permiso.model', () => ({
  obtenerTodos: jest.fn(),
  crear: jest.fn(),
  actualizar: jest.fn(),
  eliminar: jest.fn(),
}));

const Permiso = require('../models/permiso.model');
const controlador = require('../controllers/permiso.controller');

const res = () => {
  const r = { status: jest.fn(() => r), json: jest.fn(() => r) };
  return r;
};
const INTERNO = 'duplicate key value violates unique constraint "permisos_nombre_key"';

describe('permiso.controller: errores sin detalle interno', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    Object.values(Permiso).forEach((f) => f.mockRejectedValue(new Error(INTERNO)));
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['listar', {}, 500],
    ['crear', { body: { nombre: 'x' } }, 400],
    ['actualizar', { params: { id: 1 }, body: { nombre: 'x' } }, 400],
    ['eliminar', { params: { id: 1 } }, 500],
  ])('%s responde %i con un mensaje genérico y registra el detalle en el servidor', async (metodo, req, estado) => {
    const r = res();
    await controlador[metodo](req, r);
    expect(r.status).toHaveBeenCalledWith(estado);
    const cuerpo = r.json.mock.calls[0][0];
    expect(cuerpo.exito).toBe(false);
    expect(cuerpo.error).toBeUndefined();
    expect(JSON.stringify(cuerpo)).not.toContain('constraint');
    expect(console.error).toHaveBeenCalled();
  });
});
