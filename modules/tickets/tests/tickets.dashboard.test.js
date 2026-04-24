const request = require('supertest');
const express = require('express');

jest.mock('../backend/config/database', () => ({ grupo: { query: jest.fn() } }));
jest.mock('../../portal/backend/middleware/auth.middleware', () => ({
  authenticateJWT: (req, _res, next) => { req.user = { usuario_id: 1, rol_nombre: 'super_admin', rol_id: 1 }; next(); },
}));
jest.mock('../../portal/backend/middleware/permisos.middleware', () => ({
  verificarPermiso: () => (_req, _res, next) => next(),
}));
const { grupo } = require('../backend/config/database');

describe('GET /api/tickets/dashboard', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/tickets', require('../backend/routes/tickets.dashboard.routes'));
  });

  afterEach(() => jest.clearAllMocks());

  it('debería devolver KPIs del dashboard de tickets', async () => {
    grupo.query
      .mockResolvedValueOnce({ rows: [{ total: '50' }] })   // total tickets
      .mockResolvedValueOnce({ rows: [{ total: '15' }] })   // pendientes
      .mockResolvedValueOnce({ rows: [{ total: '8' }] })    // en proceso
      .mockResolvedValueOnce({ rows: [{ total: '3' }] })    // cerrados hoy
      .mockResolvedValueOnce({ rows: [] })                   // por mes
      .mockResolvedValueOnce({ rows: [] })                   // por estado
      .mockResolvedValueOnce({ rows: [] });                  // top tecnicos

    const resp = await request(app).get('/api/tickets/dashboard');

    expect(resp.status).toBe(200);
    expect(resp.body.exito).toBe(true);
    expect(resp.body.datos.kpis.total_tickets).toBe(50);
    expect(resp.body.datos.kpis.pendientes).toBe(15);
    expect(resp.body.datos.kpis.en_proceso).toBe(8);
    expect(resp.body.datos.kpis.cerrados_hoy).toBe(3);
    expect(Array.isArray(resp.body.datos.tickets_por_mes)).toBe(true);
    expect(Array.isArray(resp.body.datos.por_estado)).toBe(true);
    expect(Array.isArray(resp.body.datos.top_tecnicos)).toBe(true);
  });

  it('debería retornar 500 si la base de datos falla', async () => {
    grupo.query.mockRejectedValueOnce(new Error('DB error'));
    const resp = await request(app).get('/api/tickets/dashboard');
    expect(resp.status).toBe(500);
  });
});
