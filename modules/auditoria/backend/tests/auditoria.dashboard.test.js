const request = require('supertest');
const express = require('express');

jest.mock('../config/database', () => ({
  grupo: {
    query: jest.fn(),
  },
}));

jest.mock('../../../portal/backend/middleware/auth.middleware', () => ({
  authenticateJWT: (req, _res, next) => {
    req.user = { usuario_id: 1, rol_nombre: 'super_admin' };
    next();
  },
  autorizar: () => (_req, _res, next) => next(),
}));

const { grupo } = require('../config/database');

describe('GET /api/auditoria/dashboard', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auditoria', require('../routes/auditoria.dashboard.routes'));
  });

  afterEach(() => jest.clearAllMocks());

  it('debería devolver los KPIs del dashboard', async () => {
    // Mock de las 4 queries de KPI
    grupo.query
      .mockResolvedValueOnce({ rows: [{ total: '5' }] })   // eventos hoy
      .mockResolvedValueOnce({ rows: [{ total: '120' }] })  // eventos mes
      .mockResolvedValueOnce({ rows: [{ total: '8' }] })    // usuarios activos
      .mockResolvedValueOnce({ rows: [{ total: '4' }] })    // modulos monitoreados
      .mockResolvedValueOnce({ rows: [] })                   // eventos por día
      .mockResolvedValueOnce({ rows: [] });                  // distribución acciones

    const resp = await request(app).get('/api/auditoria/dashboard');

    expect(resp.status).toBe(200);
    expect(resp.body.exito).toBe(true);
    expect(resp.body.datos.kpis.eventos_hoy).toBe(5);
    expect(resp.body.datos.kpis.eventos_mes).toBe(120);
    expect(resp.body.datos.kpis.usuarios_activos).toBe(8);
    expect(resp.body.datos.kpis.modulos_monitoreados).toBe(4);
    expect(Array.isArray(resp.body.datos.eventos_por_dia)).toBe(true);
    expect(Array.isArray(resp.body.datos.distribucion_acciones)).toBe(true);
  });

  it('debería devolver 500 si la base de datos falla', async () => {
    grupo.query.mockRejectedValueOnce(new Error('DB error'));

    const resp = await request(app).get('/api/auditoria/dashboard');
    expect(resp.status).toBe(500);
    expect(resp.body.exito).toBe(false);
  });
});
