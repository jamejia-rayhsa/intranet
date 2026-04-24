const request = require('supertest');
const express = require('express');

jest.mock('../config/database', () => ({ grupo: { query: jest.fn() } }));
const { grupo } = require('../config/database');

jest.mock('../../../portal/backend/middleware/auth.middleware', () => ({
  authenticateJWT: (req, res, next) => next()
}));
jest.mock('../../../portal/backend/middleware/permisos.middleware', () => ({
  verificarPermiso: () => (req, res, next) => next()
}));

describe('GET /api/empleados/dashboard', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { usuario_id: 1, rol_nombre: 'super_admin', rol_id: 1 };
      next();
    });
    app.use('/api/empleados', require('../routes/rh.dashboard.routes'));
  });

  afterEach(() => jest.clearAllMocks());

  it('debería devolver KPIs del dashboard de RH', async () => {
    grupo.query
      .mockResolvedValueOnce({ rows: [{ total: '142' }] })  // total empleados
      .mockResolvedValueOnce({ rows: [{ total: '138' }] })  // activos
      .mockResolvedValueOnce({ rows: [{ total: '2' }] })    // bajas mes
      .mockResolvedValueOnce({ rows: [{ total: '5' }] })    // permisos pendientes
      .mockResolvedValueOnce({ rows: [] })                   // movimientos por mes
      .mockResolvedValueOnce({ rows: [] })                   // por departamento
      .mockResolvedValueOnce({ rows: [] });                  // permisos pendientes lista

    const resp = await request(app).get('/api/empleados/dashboard');

    expect(resp.status).toBe(200);
    expect(resp.body.exito).toBe(true);
    expect(resp.body.datos.kpis.total_empleados).toBe(142);
    expect(resp.body.datos.kpis.activos).toBe(138);
    expect(resp.body.datos.kpis.bajas_mes).toBe(2);
    expect(resp.body.datos.kpis.permisos_pendientes).toBe(5);
    expect(Array.isArray(resp.body.datos.movimientos_por_mes)).toBe(true);
    expect(Array.isArray(resp.body.datos.por_departamento)).toBe(true);
    expect(Array.isArray(resp.body.datos.permisos_pendientes_lista)).toBe(true);
  });

  it('debería retornar 500 si la base de datos falla', async () => {
    grupo.query.mockRejectedValueOnce(new Error('DB error'));
    const resp = await request(app).get('/api/empleados/dashboard');
    expect(resp.status).toBe(500);
  });
});
