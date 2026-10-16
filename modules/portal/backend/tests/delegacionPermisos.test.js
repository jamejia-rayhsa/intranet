const request = require('supertest');
const express = require('express');
const { crearPoolFalso, IDS } = require('./fakeDelegacion');

let mockUser;
const mockPool = crearPoolFalso();
jest.mock('../config/database', () => ({ grupo: mockPool }));
jest.mock('../middleware/auth.middleware', () => ({
  authenticateJWT: (req, _res, next) => {
    req.user = mockUser;
    next();
  },
}));
// El permiso Roles/Usuarios:edicion lo da el middleware real en producción; aquí se asume concedido
// (el caso de portal_admin) para probar solo la regla de delegación.
jest.mock('../middleware/permisos.middleware', () => ({
  verificarPermiso: () => (_req, _res, next) => next(),
  tienePermiso: jest.fn(),
}));
jest.mock('../models/rol.model', () => ({
  crear: jest.fn(async (nombre) => ({ id: 99, nombre })),
  actualizar: jest.fn(async (id, nombre) => ({ id: Number(id), nombre })),
  eliminar: jest.fn(async (id) => ({ id: Number(id) })),
  obtenerPorId: jest.fn(),
  asignarPermisos: jest.fn(async () => []),
  obtenerTodos: jest.fn(),
  obtenerPermisos: jest.fn(),
}));
jest.mock('../models/usuario.model', () => ({
  buscarPorId: jest.fn(),
  buscarPorCorreo: jest.fn(),
  actualizar: jest.fn(async (id) => ({ id: Number(id) })),
  crear: jest.fn(),
}));
jest.mock('../models/permiso.model', () => ({}));
jest.mock('../services/supabaseAdmin.service', () => ({
  actualizarPassword: jest.fn(),
  crearUsuario: jest.fn(),
  eliminarUsuario: jest.fn(),
}));

const Rol = require('../models/rol.model');
const Usuario = require('../models/usuario.model');
const supabaseAdmin = require('../services/supabaseAdmin.service');

const app = express();
app.use(express.json());
app.use('/api/permisos', require('../routes/permiso.routes'));
app.use('/api/roles', require('../routes/rol.routes'));
app.use('/api/usuarios', require('../routes/usuario.routes'));

const comoSuperAdmin = () => {
  mockUser = { usuario_id: 11, rol_id: IDS.super, rol_nombre: 'super_admin' };
};
const comoPortalAdmin = () => {
  mockUser = { usuario_id: 10, rol_id: IDS.portal, rol_nombre: 'portal_admin' };
};
// opcion_id: 1 portal/Roles, 2 portal/Usuarios, 3 rh/Empleados, 4 rh/Vacaciones, 5 rh/Calendario, 6 tickets/Tickets
const put = (rol, modulo, permisos) =>
  request(app).put(`/api/permisos/rol/${rol}/modulo/${modulo}`).send({ permisos });

beforeEach(() => {
  mockPool.reiniciar();
  jest.clearAllMocks();
  Rol.obtenerPorId.mockImplementation(async (id) => mockPool.estado.roles.find((r) => r.id === Number(id)));
  Usuario.buscarPorId.mockImplementation(async (id) => ({ id: Number(id), auth_uid: `uid-${id}`, auth_tipo: 'local' }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('PUT /permisos/rol/:rol_id/modulo/:modulo: delegación', () => {
  describe('portal_admin (no es super_admin)', () => {
    beforeEach(comoPortalAdmin);

    it('no puede otorgar rh/Vacaciones (edicion) a un rol: 403 y nada cambia', async () => {
      const antes = JSON.stringify(mockPool.estado);
      const r = await put(IDS.auditor, 'rh', [{ opcion_id: 4, tipos: ['consulta', 'edicion'] }]);
      expect(r.status).toBe(403);
      expect(r.body.exito).toBe(false);
      expect(r.body.mensaje).toMatch(/no posees.*rh\/Vacaciones/);
      expect(JSON.stringify(mockPool.estado)).toBe(antes);
    });

    it('puede otorgar rh/Calendario (consulta y edicion) porque sí lo posee', async () => {
      const r = await put(IDS.auditor, 'rh', [{ opcion_id: 5, tipos: ['consulta', 'edicion'] }]);
      expect(r.status).toBe(200);
      expect(mockPool.tiene(IDS.auditor, 5, 'consulta')).toBe(true);
      expect(mockPool.tiene(IDS.auditor, 5, 'edicion')).toBe(true);
    });

    it('sin cambios parciales: una lista con un permiso permitido y uno ajeno se rechaza completa', async () => {
      const antes = JSON.stringify(mockPool.estado);
      const r = await put(IDS.auditor, 'rh', [
        { opcion_id: 5, tipos: ['consulta', 'edicion'] }, // permitido
        { opcion_id: 3, tipos: ['consulta'] }, // rh/Empleados: no lo posee
      ]);
      expect(r.status).toBe(403);
      expect(r.body.mensaje).toMatch(/rh\/Empleados \(consulta\)/);
      expect(JSON.stringify(mockPool.estado)).toBe(antes);
      expect(mockPool.consultas).toContain('ROLLBACK');
    });

    it('no puede quitar permisos que no posee (p. ej. rh/Vacaciones de rh_empleado)', async () => {
      const antes = JSON.stringify(mockPool.estado);
      const r = await put(IDS.rhEmpleado, 'rh', [{ opcion_id: 5, tipos: ['consulta'] }]); // omite Vacaciones: lo quitaría
      expect(r.status).toBe(403);
      expect(r.body.mensaje).toMatch(/quitar.*rh\/Vacaciones/);
      expect(JSON.stringify(mockPool.estado)).toBe(antes);
    });

    it('guardar sin cambios sobre un rol con permisos ajenos es un no-op permitido', async () => {
      const antes = JSON.stringify(mockPool.estado);
      const r = await put(IDS.rhEmpleado, 'rh', [
        { opcion_id: 4, tipos: ['consulta', 'edicion'] },
        { opcion_id: 5, tipos: ['consulta'] },
      ]);
      expect(r.status).toBe(200);
      expect(JSON.stringify(mockPool.estado)).toBe(antes);
    });

    it('puede quitar permisos que sí posee (rh/Calendario edicion de rh_admin)', async () => {
      const r = await put(IDS.rhAdmin, 'rh', [
        { opcion_id: 3, tipos: ['consulta', 'edicion'] },
        { opcion_id: 4, tipos: ['consulta', 'edicion'] },
        { opcion_id: 5, tipos: ['consulta'] },
      ]);
      expect(r.status).toBe(200);
      expect(mockPool.tiene(IDS.rhAdmin, 5, 'edicion')).toBe(false);
      expect(mockPool.tiene(IDS.rhAdmin, 5, 'consulta')).toBe(true);
      expect(mockPool.tiene(IDS.rhAdmin, 3, 'edicion')).toBe(true);
    });

    it('conserva su gestión legítima del portal: otorga portal/Usuarios a otro rol', async () => {
      const r = await put(IDS.auditor, 'portal', [{ opcion_id: 2, tipos: ['consulta'] }]);
      expect(r.status).toBe(200);
      expect(mockPool.tiene(IDS.auditor, 2, 'consulta')).toBe(true);
    });

    it('no puede tocar el rol super_admin, ni siquiera con permisos que posee', async () => {
      const antes = JSON.stringify(mockPool.estado);
      const r = await put(IDS.super, 'portal', [{ opcion_id: 1, tipos: ['consulta'] }]);
      expect(r.status).toBe(403);
      expect(r.body.mensaje).toMatch(/super_admin/);
      expect(JSON.stringify(mockPool.estado)).toBe(antes);
    });

    it('no puede elevar su propio rol (portal_admin) con rh/Vacaciones', async () => {
      const antes = JSON.stringify(mockPool.estado);
      const r = await put(IDS.portal, 'rh', [
        { opcion_id: 4, tipos: ['edicion'] },
        { opcion_id: 5, tipos: ['consulta', 'edicion'] },
      ]);
      expect(r.status).toBe(403);
      expect(JSON.stringify(mockPool.estado)).toBe(antes);
    });

    it('una opción de otro módulo en la ruta se rechaza con 400 (no se cuela rh/Vacaciones bajo portal)', async () => {
      const antes = JSON.stringify(mockPool.estado);
      const r = await put(IDS.auditor, 'portal', [{ opcion_id: 4, tipos: ['edicion'] }]);
      expect(r.status).toBe(400);
      expect(JSON.stringify(mockPool.estado)).toBe(antes);
    });

    it('quien tiene edicion puede otorgar consulta de esa opción (la edicion la cubre)', async () => {
      const r = await put(IDS.auditor, 'portal', [{ opcion_id: 1, tipos: ['consulta'] }]);
      expect(r.status).toBe(200);
    });

    it('sin rol propio no posee nada', async () => {
      mockUser = { usuario_id: 10, rol_id: null, rol_nombre: null };
      const r = await put(IDS.auditor, 'rh', [{ opcion_id: 5, tipos: ['consulta'] }]);
      expect(r.status).toBe(403);
    });
  });

  describe('super_admin', () => {
    beforeEach(comoSuperAdmin);

    it('puede otorgar cualquier permiso, incluso rh/Vacaciones a portal_admin', async () => {
      const r = await put(IDS.portal, 'rh', [
        { opcion_id: 4, tipos: ['consulta', 'edicion'] },
        { opcion_id: 5, tipos: ['consulta', 'edicion'] },
      ]);
      expect(r.status).toBe(200);
      expect(mockPool.tiene(IDS.portal, 4, 'edicion')).toBe(true);
    });

    it('puede modificar el rol super_admin', async () => {
      const r = await put(IDS.super, 'tickets', [{ opcion_id: 6, tipos: ['consulta'] }]);
      expect(r.status).toBe(200);
      expect(mockPool.tiene(IDS.super, 6, 'edicion')).toBe(false);
    });
  });

  describe('validación de entrada (cualquier rol)', () => {
    beforeEach(comoSuperAdmin);

    it.each([
      ['permisos no es arreglo', { permisos: 'x' }],
      ['tipo inválido', { permisos: [{ opcion_id: 4, tipos: ['borrar'] }] }],
      ['opcion_id no numérico', { permisos: [{ opcion_id: 'a', tipos: ['consulta'] }] }],
      ['opcion_id fuera de int4', { permisos: [{ opcion_id: 99999999999, tipos: ['consulta'] }] }],
      ['elemento nulo', { permisos: [null] }],
      ['tipos no es arreglo', { permisos: [{ opcion_id: 4, tipos: 'consulta' }] }],
    ])('%s -> 400 sin cambios', async (_n, cuerpo) => {
      const antes = JSON.stringify(mockPool.estado);
      const r = await request(app).put(`/api/permisos/rol/${IDS.auditor}/modulo/rh`).send(cuerpo);
      expect(r.status).toBe(400);
      expect(JSON.stringify(mockPool.estado)).toBe(antes);
    });

    it('rol inexistente -> 404; rol_id no numérico -> 400; módulo inexistente -> 404', async () => {
      expect((await put(999, 'rh', [])).status).toBe(404);
      expect((await put('abc', 'rh', [])).status).toBe(400);
      expect((await put(IDS.auditor, 'nada', [])).status).toBe(404);
    });

    it('libera la conexión en éxito y en rechazo, y no pide otra al pool dentro de la transacción', async () => {
      comoPortalAdmin();
      await put(IDS.rhEmpleado, 'rh', [{ opcion_id: 3, tipos: ['edicion'] }]);
      await put(IDS.auditor, 'rh', [{ opcion_id: 5, tipos: ['consulta'] }]);
      expect(mockPool.conexiones).toBe(2);
      expect(mockPool.liberadas).toBe(2);
    });
  });
});

describe('POST /usuarios/:id/rol y PUT /usuarios/:id: asignación de roles', () => {
  const asignar = (id, rol_id) => request(app).post(`/api/usuarios/${id}/rol`).send({ rol_id });

  describe('portal_admin', () => {
    beforeEach(comoPortalAdmin);

    it.each([
      ['super_admin', IDS.super],
      ['rh_admin', IDS.rhAdmin],
      ['tickets_admin', IDS.ticketsAdmin],
    ])('no puede asignarse el rol %s: 403 y su rol no cambia', async (_n, rol) => {
      const r = await asignar(10, rol);
      expect(r.status).toBe(403);
      expect(r.body.mensaje).toMatch(/No puedes asignar el rol/);
      expect(mockPool.rolDe(10)).toEqual([IDS.portal]);
    });

    it('tampoco se lo asigna a otro usuario', async () => {
      const r = await asignar(12, IDS.super);
      expect(r.status).toBe(403);
      expect(mockPool.rolDe(12)).toEqual([IDS.rhEmpleado]);
    });

    it('no puede asignar rh_empleado (incluye permisos de rh que no posee)', async () => {
      const r = await asignar(12, IDS.rhEmpleado);
      expect(r.status).toBe(200); // ya lo tiene: no cambia nada
      const r2 = await asignar(10, IDS.rhEmpleado);
      expect(r2.status).toBe(403);
      expect(r2.body.mensaje).toMatch(/rh\/Vacaciones/);
      expect(mockPool.rolDe(10)).toEqual([IDS.portal]);
    });

    it('puede asignar un rol cuyos permisos posee por completo (portal_admin, rol sin permisos)', async () => {
      expect((await asignar(12, IDS.portal)).status).toBe(200);
      expect(mockPool.rolDe(12)).toEqual([IDS.portal]);
      expect((await asignar(10, 7)).status).toBe(200);
      expect(mockPool.rolDe(10)).toEqual([7]);
    });

    it('no puede cambiar ni quitar el rol de un super_admin ni de un rh_admin', async () => {
      expect((await asignar(11, IDS.portal)).status).toBe(403);
      expect(mockPool.rolDe(11)).toEqual([IDS.super]);
      const r = await request(app).put('/api/usuarios/13').send({ rol_id: null, nombre: 'X' });
      expect(r.status).toBe(403);
      expect(mockPool.rolDe(13)).toEqual([IDS.rhAdmin]);
      expect(Usuario.actualizar).not.toHaveBeenCalled();
    });

    it('PUT /usuarios/:id con otro rol privilegiado: 403 antes de escribir nada', async () => {
      const r = await request(app).put('/api/usuarios/12').send({ rol_id: IDS.super, nombre: 'Nuevo' });
      expect(r.status).toBe(403);
      expect(Usuario.actualizar).not.toHaveBeenCalled();
      expect(mockPool.rolDe(12)).toEqual([IDS.rhEmpleado]);
    });

    it('PUT /usuarios/:id editando solo el nombre de un rh_admin conservando su rol funciona (sin cambio de rol)', async () => {
      const r = await request(app).put('/api/usuarios/13').send({ rol_id: IDS.rhAdmin, nombre: 'Nuevo' });
      expect(r.status).toBe(200);
      expect(mockPool.rolDe(13)).toEqual([IDS.rhAdmin]);
    });

    it('PUT /usuarios/:id sin rol_id ya no borra el rol del usuario', async () => {
      const r = await request(app).put('/api/usuarios/12').send({ nombre: 'Solo nombre' });
      expect(r.status).toBe(200);
      expect(mockPool.rolDe(12)).toEqual([IDS.rhEmpleado]);
    });

    it('PUT /usuarios/:id con rol_id null quita el rol de un usuario común', async () => {
      const r = await request(app).put('/api/usuarios/12').send({ rol_id: null });
      expect(r.status).toBe(200);
      expect(mockPool.rolDe(12)).toEqual([]);
    });

    it('no puede resetear la contraseña de un super_admin ni de un rh_admin (tomaría la cuenta)', async () => {
      expect((await request(app).post('/api/usuarios/11/reset-password')).status).toBe(403);
      expect((await request(app).post('/api/usuarios/13/reset-password')).status).toBe(403);
      expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
      expect((await request(app).post('/api/usuarios/12/reset-password')).status).toBe(200);
    });

    it('PUT con contraseña sobre un super_admin: 403 sin tocar GoTrue', async () => {
      const r = await request(app).put('/api/usuarios/11').send({ contraseña: 'Nueva12345' });
      expect(r.status).toBe(403);
      expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
    });

    it('usuario o rol inexistentes -> 404; rol_id inválido -> 400', async () => {
      expect((await asignar(999, IDS.portal)).status).toBe(404);
      expect((await asignar(12, 999)).status).toBe(404);
      expect((await asignar(12, 'abc')).status).toBe(400);
    });

    it('crear usuario con rol_id super_admin: 403 antes de crear nada en GoTrue', async () => {
      const r = await request(app)
        .post('/api/usuarios')
        .send({ correo: 'a@x.com', nombre: 'A', contraseña: 'Secreta123', rol_id: IDS.super });
      expect(r.status).toBe(403);
      expect(supabaseAdmin.crearUsuario).not.toHaveBeenCalled();
    });
  });

  describe('super_admin', () => {
    beforeEach(comoSuperAdmin);

    it('puede asignar cualquier rol, incluido super_admin, y cambiar el rol de otro super_admin', async () => {
      expect((await asignar(12, IDS.super)).status).toBe(200);
      expect(mockPool.rolDe(12)).toEqual([IDS.super]);
      expect((await asignar(13, IDS.rhEmpleado)).status).toBe(200);
      expect(mockPool.rolDe(13)).toEqual([IDS.rhEmpleado]);
    });

    it('puede resetear la contraseña de un rh_admin', async () => {
      expect((await request(app).post('/api/usuarios/13/reset-password')).status).toBe(200);
    });
  });
});

describe('/roles: roles privilegiados', () => {
  describe('portal_admin', () => {
    beforeEach(comoPortalAdmin);

    it('no puede renombrar ni eliminar super_admin, rh_admin o tickets_admin', async () => {
      for (const id of [IDS.super, IDS.rhAdmin, IDS.ticketsAdmin]) {
        expect((await request(app).put(`/api/roles/${id}`).send({ nombre: 'otro' })).status).toBe(403);
        expect((await request(app).delete(`/api/roles/${id}`)).status).toBe(403);
      }
      expect(Rol.actualizar).not.toHaveBeenCalled();
      expect(Rol.eliminar).not.toHaveBeenCalled();
    });

    it('no puede crear ni renombrar un rol hacia un nombre privilegiado', async () => {
      expect((await request(app).post('/api/roles').send({ nombre: 'super_admin' })).status).toBe(403);
      expect((await request(app).post('/api/roles').send({ nombre: ' Tickets_Admin ' })).status).toBe(403);
      expect((await request(app).put(`/api/roles/${IDS.auditor}`).send({ nombre: 'rh_admin' })).status).toBe(403);
      expect(Rol.crear).not.toHaveBeenCalled();
      expect(Rol.actualizar).not.toHaveBeenCalled();
    });

    it('conserva crear, renombrar y eliminar roles comunes', async () => {
      expect((await request(app).post('/api/roles').send({ nombre: 'nuevo' })).status).toBe(201);
      expect((await request(app).put('/api/roles/7').send({ nombre: 'otro_nombre' })).status).toBe(200);
      expect((await request(app).delete('/api/roles/7')).status).toBe(200);
    });

    it('PUT /roles/:id/permisos (tabla heredada) solo para super_admin', async () => {
      const r = await request(app).put(`/api/roles/${IDS.auditor}/permisos`).send({ permisos_ids: [1] });
      expect(r.status).toBe(403);
      expect(Rol.asignarPermisos).not.toHaveBeenCalled();
    });
  });

  describe('super_admin', () => {
    beforeEach(comoSuperAdmin);

    it('puede todo, incluida la tabla heredada', async () => {
      expect((await request(app).put(`/api/roles/${IDS.rhAdmin}`).send({ nombre: 'rh_admin2' })).status).toBe(200);
      expect((await request(app).post('/api/roles').send({ nombre: 'rh_admin3' })).status).toBe(201);
      expect((await request(app).put(`/api/roles/${IDS.auditor}/permisos`).send({ permisos_ids: [1] })).status).toBe(200);
    });
  });
});
