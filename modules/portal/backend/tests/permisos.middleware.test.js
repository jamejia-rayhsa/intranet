const { verificarPermiso } = require('../middleware/permisos.middleware');

jest.mock('../config/database', () => ({
  grupo: { query: jest.fn() },
}));
const { grupo } = require('../config/database');

function crearMocks(rol_nombre = 'empleado', rol_id = 2) {
  const req = { user: { usuario_id: 1, rol_id, rol_nombre } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('verificarPermiso', () => {
  afterEach(() => jest.clearAllMocks());

  it('super_admin pasa sin consultar la BD', async () => {
    const { req, res, next } = crearMocks('super_admin', 1);
    await verificarPermiso('tickets', 'Tickets', 'consulta')(req, res, next);
    expect(grupo.query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('retorna 403 si no tiene el permiso', async () => {
    grupo.query.mockResolvedValueOnce({ rows: [] });
    const { req, res, next } = crearMocks();
    await verificarPermiso('tickets', 'Tickets', 'edicion')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('pasa si tiene permiso de consulta y se pide consulta', async () => {
    grupo.query.mockResolvedValueOnce({ rows: [{ existe: true }] });
    const { req, res, next } = crearMocks();
    await verificarPermiso('tickets', 'Tickets', 'consulta')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('pasa si tiene edicion y se pide consulta (edicion implica consulta)', async () => {
    grupo.query.mockResolvedValueOnce({ rows: [{ existe: true }] });
    const { req, res, next } = crearMocks();
    await verificarPermiso('tickets', 'Tickets', 'consulta')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('retorna 401 si no hay usuario en req', async () => {
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await verificarPermiso('tickets', 'Tickets', 'consulta')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
