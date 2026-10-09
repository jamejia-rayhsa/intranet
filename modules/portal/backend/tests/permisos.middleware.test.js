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

describe('tienePermiso', () => {
  const { tienePermiso } = require('../middleware/permisos.middleware');
  afterEach(() => jest.clearAllMocks());

  it('false sin usuario o sin rol, sin consultar BD', async () => {
    expect(await tienePermiso(null, 'rh', 'Recibos', 'edicion')).toBe(false);
    expect(await tienePermiso({ usuario_id: 1 }, 'rh', 'Recibos', 'edicion')).toBe(false);
    expect(grupo.query).not.toHaveBeenCalled();
  });

  it('true para super_admin sin consultar BD', async () => {
    expect(await tienePermiso({ rol_nombre: 'super_admin' }, 'rh', 'Recibos', 'edicion')).toBe(true);
    expect(grupo.query).not.toHaveBeenCalled();
  });

  it('consulta acepta consulta y edicion; edicion solo edicion', async () => {
    grupo.query.mockResolvedValue({ rows: [{ existe: 1 }] });
    const user = { rol_id: 5, rol_nombre: 'x' };
    expect(await tienePermiso(user, 'rh', 'Recibos', 'consulta')).toBe(true);
    expect(grupo.query.mock.calls[0][1]).toEqual([5, 'rh', 'Recibos', ['consulta', 'edicion']]);
    await tienePermiso(user, 'rh', 'Recibos', 'edicion');
    expect(grupo.query.mock.calls[1][1][3]).toEqual(['edicion']);
  });

  it('false si no hay filas', async () => {
    grupo.query.mockResolvedValue({ rows: [] });
    expect(await tienePermiso({ rol_id: 5 }, 'rh', 'Recibos', 'edicion')).toBe(false);
  });
});
