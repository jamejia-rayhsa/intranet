const request = require('supertest');
const express = require('express');
const { crearPoolFalso, IDS, USUARIOS } = require('./fakeDelegacion');

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
  eliminar: jest.fn(async (id) => ({ id: Number(id) })),
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
const comoRhAdmin = () => {
  mockUser = { usuario_id: 13, rol_id: IDS.rhAdmin, rol_nombre: 'rh_admin' };
};
// opcion_id: 1 portal/Roles, 2 portal/Usuarios, 3 rh/Empleados, 4 rh/Vacaciones, 5 rh/Calendario, 6 tickets/Tickets
const put = (rol, modulo, permisos) =>
  request(app).put(`/api/permisos/rol/${rol}/modulo/${modulo}`).send({ permisos });

beforeEach(() => {
  mockPool.reiniciar();
  jest.clearAllMocks();
  supabaseAdmin.actualizarPassword.mockReset();
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

    it('puede quitar permisos que sí posee de un rol NO privilegiado (rh/Calendario edicion)', async () => {
      const completo = [{ opcion_id: 5, tipos: ['consulta', 'edicion'] }];
      expect((await put(IDS.libre, 'rh', completo)).status).toBe(200);
      expect(mockPool.tiene(IDS.libre, 5, 'edicion')).toBe(true);
      const r = await put(IDS.libre, 'rh', [{ opcion_id: 5, tipos: ['consulta'] }]);
      expect(r.status).toBe(200);
      expect(mockPool.tiene(IDS.libre, 5, 'edicion')).toBe(false);
      expect(mockPool.tiene(IDS.libre, 5, 'consulta')).toBe(true);
    });

    it.each([
      ['rh_admin', IDS.rhAdmin],
      ['tickets_admin', IDS.ticketsAdmin],
    ])('E10a: no puede quitar NI otorgar permisos del rol privilegiado %s: 403 y nada cambia', async (nombre, rol) => {
      const antes = JSON.stringify(mockPool.estado);
      // quitar rh/Calendario (lo posee) a rh_admin; otorgar portal/Roles (lo posee) a ambos
      const quitar = await put(rol, 'rh', [
        { opcion_id: 3, tipos: ['consulta', 'edicion'] },
        { opcion_id: 4, tipos: ['consulta', 'edicion'] },
        { opcion_id: 5, tipos: ['consulta'] },
      ]);
      expect(quitar.status).toBe(403);
      expect(quitar.body.mensaje).toContain(nombre);
      const otorgar = await put(rol, 'portal', [{ opcion_id: 1, tipos: ['consulta'] }]);
      expect(otorgar.status).toBe(403);
      expect(JSON.stringify(mockPool.estado)).toBe(antes);
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
    ])('no puede asignar el rol privilegiado %s a otro usuario común: 403 y su rol no cambia', async (_n, rol) => {
      const r = await asignar(USUARIOS.libre, rol);
      expect(r.status).toBe(403);
      expect(r.body.mensaje).toMatch(/No puedes asignar el rol/);
      expect(mockPool.rolDe(USUARIOS.libre)).toEqual([IDS.libre]);
    });

    it.each([
      ['super_admin', IDS.super],
      ['rh_admin', IDS.rhAdmin],
      ['tickets_admin', IDS.ticketsAdmin],
    ])('tampoco puede asignarse a sí mismo el rol %s', async (_n, rol) => {
      const r = await asignar(USUARIOS.portal, rol);
      expect(r.status).toBe(403);
      expect(mockPool.rolDe(USUARIOS.portal)).toEqual([IDS.portal]);
    });

    it('DECISIÓN DEL HUMANO: puede asignar un rol NO privilegiado aunque tenga más permisos que él (rh_empleado)', async () => {
      const r = await asignar(USUARIOS.libre, IDS.rhEmpleado);
      expect(r.status).toBe(200);
      expect(mockPool.rolDe(USUARIOS.libre)).toEqual([IDS.rhEmpleado]);
      expect((await asignar(USUARIOS.sinRol, IDS.auditor)).status).toBe(200);
      expect(mockPool.rolDe(USUARIOS.sinRol)).toEqual([IDS.auditor]);
    });

    it('no puede cambiarse ni quitarse a sí mismo el rol (auto-elevación), ni siquiera a uno no privilegiado', async () => {
      for (const rol of [IDS.rhEmpleado, IDS.libre, IDS.portal + 100]) {
        const r = await asignar(USUARIOS.portal, rol);
        expect([403, 404]).toContain(r.status);
        expect(mockPool.rolDe(USUARIOS.portal)).toEqual([IDS.portal]);
      }
      const r1 = await asignar(USUARIOS.portal, IDS.rhEmpleado);
      expect(r1.status).toBe(403);
      expect(r1.body.mensaje).toMatch(/tu propio rol/);
      const r2 = await request(app).put(`/api/usuarios/${USUARIOS.portal}`).send({ rol_id: IDS.rhEmpleado, nombre: 'Yo' });
      expect(r2.status).toBe(403);
      const r3 = await request(app).put(`/api/usuarios/${USUARIOS.portal}`).send({ rol_id: null });
      expect(r3.status).toBe(403);
      expect(mockPool.rolDe(USUARIOS.portal)).toEqual([IDS.portal]);
      expect(Usuario.actualizar).not.toHaveBeenCalled();
    });

    it('guardar su propio usuario con el mismo rol (sin cambio) sigue siendo posible', async () => {
      const r = await request(app).put(`/api/usuarios/${USUARIOS.portal}`).send({ rol_id: IDS.portal, nombre: 'Yo' });
      expect(r.status).toBe(200);
      expect(mockPool.rolDe(USUARIOS.portal)).toEqual([IDS.portal]);
    });

    it('no puede cambiar ni quitar el rol de un super_admin ni de un rh_admin', async () => {
      expect((await asignar(USUARIOS.super, IDS.portal)).status).toBe(403);
      expect(mockPool.rolDe(USUARIOS.super)).toEqual([IDS.super]);
      const r = await request(app).put(`/api/usuarios/${USUARIOS.rhAdmin}`).send({ rol_id: null, nombre: 'X' });
      expect(r.status).toBe(403);
      expect(mockPool.rolDe(USUARIOS.rhAdmin)).toEqual([IDS.rhAdmin]);
      expect(Usuario.actualizar).not.toHaveBeenCalled();
    });

    it('PUT /usuarios/:id con un rol privilegiado: 403 antes de escribir nada', async () => {
      const r = await request(app).put(`/api/usuarios/${USUARIOS.rhEmpleado}`).send({ rol_id: IDS.super, nombre: 'Nuevo' });
      expect(r.status).toBe(403);
      expect(Usuario.actualizar).not.toHaveBeenCalled();
      expect(mockPool.rolDe(USUARIOS.rhEmpleado)).toEqual([IDS.rhEmpleado]);
    });

    it('PUT /usuarios/:id sin rol_id no borra el rol del usuario', async () => {
      const r = await request(app).put(`/api/usuarios/${USUARIOS.libre}`).send({ nombre: 'Solo nombre' });
      expect(r.status).toBe(200);
      expect(mockPool.rolDe(USUARIOS.libre)).toEqual([IDS.libre]);
    });

    it('PUT /usuarios/:id solo con rol_id null: quita el rol y responde 200 limpio (sin UPDATE vacío)', async () => {
      const r = await request(app).put(`/api/usuarios/${USUARIOS.libre}`).send({ rol_id: null });
      expect(r.status).toBe(200);
      expect(r.body.exito).toBe(true);
      expect(r.body.error).toBeUndefined();
      expect(mockPool.rolDe(USUARIOS.libre)).toEqual([]);
      expect(Usuario.actualizar).not.toHaveBeenCalled();
    });

    it('usuario o rol inexistentes -> 404; rol_id inválido -> 400', async () => {
      expect((await asignar(999, IDS.portal)).status).toBe(404);
      expect((await asignar(USUARIOS.libre, 999)).status).toBe(404);
      expect((await asignar(USUARIOS.libre, 'abc')).status).toBe(400);
    });

    it('crear usuario con rol_id super_admin: 403 antes de crear nada en GoTrue', async () => {
      const r = await request(app)
        .post('/api/usuarios')
        .send({ correo: 'a@x.com', nombre: 'A', contraseña: 'Secreta123', rol_id: IDS.super });
      expect(r.status).toBe(403);
      expect(supabaseAdmin.crearUsuario).not.toHaveBeenCalled();
    });

    it('crear usuario con un rol no privilegiado con más permisos (rh_empleado): 201 con ese rol', async () => {
      Usuario.buscarPorCorreo.mockResolvedValue(undefined);
      supabaseAdmin.crearUsuario.mockResolvedValue({ id: 'uid-50' });
      Usuario.crear.mockResolvedValue({ id: 50, correo: 'a@x.com' });
      const r = await request(app)
        .post('/api/usuarios')
        .send({ correo: 'a@x.com', nombre: 'A', contraseña: 'Secreta123', rol_id: IDS.rhEmpleado });
      expect(r.status).toBe(201);
      expect(mockPool.rolDe(50)).toEqual([IDS.rhEmpleado]);
    });
  });

  describe('portal_admin sobre usuarios con rol privilegiado (desactivar, borrar, editar)', () => {
    beforeEach(comoPortalAdmin);

    const PRIVILEGIADOS = [
      ['super_admin', USUARIOS.super],
      ['rh_admin', USUARIOS.rhAdmin],
      ['tickets_admin', USUARIOS.ticketsAdmin],
    ];

    it.each(PRIVILEGIADOS)('desactivar a un %s: 403 y no se escribe nada', async (_n, id) => {
      const r = await request(app).put(`/api/usuarios/${id}`).send({ activo: false });
      expect(r.status).toBe(403);
      expect(Usuario.actualizar).not.toHaveBeenCalled();
    });

    it.each(PRIVILEGIADOS)('editar nombre/apellido/requiere_cambio_password de un %s: 403', async (_n, id) => {
      for (const cuerpo of [{ nombre: 'X' }, { apellido: 'Y' }, { requiere_cambio_password: false }]) {
        expect((await request(app).put(`/api/usuarios/${id}`).send(cuerpo)).status).toBe(403);
      }
      expect(Usuario.actualizar).not.toHaveBeenCalled();
    });

    it.each(PRIVILEGIADOS)('borrar a un %s: 403, ni fila local ni GoTrue', async (_n, id) => {
      const r = await request(app).delete(`/api/usuarios/${id}`);
      expect(r.status).toBe(403);
      expect(Usuario.eliminar).not.toHaveBeenCalled();
      expect(supabaseAdmin.eliminarUsuario).not.toHaveBeenCalled();
    });

    it.each(PRIVILEGIADOS)('resetear o cambiar la contraseña de un %s: 403 sin tocar GoTrue', async (_n, id) => {
      expect((await request(app).post(`/api/usuarios/${id}/reset-password`)).status).toBe(403);
      expect((await request(app).put(`/api/usuarios/${id}`).send({ contraseña: 'Nueva12345' })).status).toBe(403);
      expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
    });

    it('un usuario común sí se puede desactivar, editar y borrar', async () => {
      expect((await request(app).put(`/api/usuarios/${USUARIOS.libre}`).send({ activo: false, nombre: 'Z' })).status).toBe(200);
      expect(Usuario.actualizar).toHaveBeenCalledTimes(1);
      expect((await request(app).delete(`/api/usuarios/${USUARIOS.libre}`)).status).toBe(200);
      expect(Usuario.eliminar).toHaveBeenCalledTimes(1);
    });
  });

  describe('rh_admin (privilegiado, no super_admin) sobre usuarios privilegiados, incluido él mismo', () => {
    beforeEach(comoRhAdmin);

    it('no puede desactivarse, editarse ni borrarse a sí mismo ni a un super_admin', async () => {
      for (const id of [USUARIOS.rhAdmin, USUARIOS.super]) {
        expect((await request(app).put(`/api/usuarios/${id}`).send({ activo: false })).status).toBe(403);
        expect((await request(app).delete(`/api/usuarios/${id}`)).status).toBe(403);
      }
      expect(Usuario.actualizar).not.toHaveBeenCalled();
      expect(Usuario.eliminar).not.toHaveBeenCalled();
    });
  });

  describe('toma de cuenta: reset/cambio de contraseña de cuentas con más permisos que el actor', () => {
    beforeEach(comoPortalAdmin);

    it('portal_admin NO puede resetear la contraseña de un rh_empleado (permisos de RH que no posee): 403', async () => {
      const r = await request(app).post(`/api/usuarios/${USUARIOS.rhEmpleado}/reset-password`);
      expect(r.status).toBe(403);
      expect(r.body.mensaje).toMatch(/permisos que tú no posees/);
      expect(r.body.mensaje).toMatch(/rh\/Vacaciones/);
      expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
    });

    it('ni cambiarla por PUT con contraseña (y sin escribir nada más)', async () => {
      const r = await request(app)
        .put(`/api/usuarios/${USUARIOS.rhEmpleado}`)
        .send({ contraseña: 'Nueva12345', nombre: 'Tomada' });
      expect(r.status).toBe(403);
      expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
      expect(Usuario.actualizar).not.toHaveBeenCalled();
    });

    it('sí puede con cuentas cuyo rol no pasa de sus permisos: rol sin permisos, su mismo rol y sin rol', async () => {
      for (const id of [USUARIOS.libre, USUARIOS.portal2, USUARIOS.sinRol, USUARIOS.portal]) {
        const r = await request(app).post(`/api/usuarios/${id}/reset-password`);
        expect(r.status).toBe(200);
      }
      expect(supabaseAdmin.actualizarPassword).toHaveBeenCalledTimes(4);
    });

    it('editar el nombre (sin contraseña) de un usuario con más permisos sigue permitido', async () => {
      expect((await request(app).put(`/api/usuarios/${USUARIOS.rhEmpleado}`).send({ nombre: 'Nuevo' })).status).toBe(200);
    });

    describe('E1: contraseña + rol_id en una sola petición se valida contra el estado FINAL', () => {
      const cambiosEscritos = () =>
        Usuario.actualizar.mock.calls.length + supabaseAdmin.actualizarPassword.mock.calls.length;

      it('PUT {contraseña, rol_id: rh_empleado} sobre un usuario sin permisos: 403 y NINGÚN cambio (rol, contraseña ni GoTrue)', async () => {
        const antes = JSON.stringify(mockPool.estado);
        const r = await request(app)
          .put(`/api/usuarios/${USUARIOS.libre}`)
          .send({ contraseña: 'Nueva12345', rol_id: IDS.rhEmpleado });
        expect(r.status).toBe(403);
        expect(r.body.mensaje).toMatch(/permisos que tú no posees/);
        expect(JSON.stringify(mockPool.estado)).toBe(antes);
        expect(mockPool.rolDe(USUARIOS.libre)).toEqual([IDS.libre]);
        expect(cambiosEscritos()).toBe(0);
        expect(mockPool.consultas).not.toContain('COMMIT');
      });

      it('también cuando el estado ACTUAL es el tomable: de rh_empleado a un rol sin permisos con contraseña, 403 sin cambios', async () => {
        const r = await request(app)
          .put(`/api/usuarios/${USUARIOS.rhEmpleado}`)
          .send({ contraseña: 'Nueva12345', rol_id: IDS.libre });
        expect(r.status).toBe(403);
        expect(mockPool.rolDe(USUARIOS.rhEmpleado)).toEqual([IDS.rhEmpleado]);
        expect(cambiosEscritos()).toBe(0);
      });

      it('rol_id privilegiado con contraseña: 403 sin cambios', async () => {
        const r = await request(app)
          .put(`/api/usuarios/${USUARIOS.libre}`)
          .send({ contraseña: 'Nueva12345', rol_id: IDS.super });
        expect(r.status).toBe(403);
        expect(mockPool.rolDe(USUARIOS.libre)).toEqual([IDS.libre]);
        expect(cambiosEscritos()).toBe(0);
      });

      it('si el estado final es tomable (rol sin permisos, o quitarlo) sí se aplica rol y contraseña', async () => {
        const a = await request(app)
          .put(`/api/usuarios/${USUARIOS.libre}`)
          .send({ contraseña: 'Nueva12345', rol_id: IDS.auditor });
        expect(a.status).toBe(200);
        expect(mockPool.rolDe(USUARIOS.libre)).toEqual([IDS.auditor]);
        expect(supabaseAdmin.actualizarPassword).toHaveBeenCalledWith('uid-14', 'Nueva12345');
        const b = await request(app)
          .put(`/api/usuarios/${USUARIOS.libre}`)
          .send({ contraseña: 'Otra123456', rol_id: null });
        expect(b.status).toBe(200);
        expect(mockPool.rolDe(USUARIOS.libre)).toEqual([]);
      });

      it('super_admin sí puede cambiar rol y contraseña a la vez, también con un rol privilegiado', async () => {
        comoSuperAdmin();
        const r = await request(app)
          .put(`/api/usuarios/${USUARIOS.libre}`)
          .send({ contraseña: 'Nueva12345', rol_id: IDS.rhAdmin });
        expect(r.status).toBe(200);
        expect(mockPool.rolDe(USUARIOS.libre)).toEqual([IDS.rhAdmin]);
        expect(supabaseAdmin.actualizarPassword).toHaveBeenCalledTimes(1);
      });

      it('si GoTrue falla se revierte TODO (rol incluido): GoTrue va después de las escrituras y antes del COMMIT', async () => {
        supabaseAdmin.actualizarPassword.mockRejectedValue(new Error('gotrue caido'));
        const r = await request(app)
          .put(`/api/usuarios/${USUARIOS.libre}`)
          .send({ contraseña: 'Nueva12345', rol_id: IDS.auditor, nombre: 'N' });
        expect(r.status).toBe(400);
        expect(mockPool.rolDe(USUARIOS.libre)).toEqual([IDS.libre]);
        expect(mockPool.consultas).toContain('ROLLBACK');
        expect(mockPool.consultas).not.toContain('COMMIT');
        expect(Usuario.actualizar.mock.invocationCallOrder[0]).toBeLessThan(
          supabaseAdmin.actualizarPassword.mock.invocationCallOrder[0],
        );
      });

      it('usuario sin auth_uid con contraseña + rol_id: 409 y el rol NO cambia', async () => {
        Usuario.buscarPorId.mockImplementation(async (id) => ({ id: Number(id), auth_uid: null, auth_tipo: 'local' }));
        const r = await request(app)
          .put(`/api/usuarios/${USUARIOS.libre}`)
          .send({ contraseña: 'Nueva12345', rol_id: IDS.auditor });
        expect(r.status).toBe(409);
        expect(mockPool.rolDe(USUARIOS.libre)).toEqual([IDS.libre]);
        expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
      });
    });

    describe('TOCTOU: ascenso concurrente de rol frente a reset, cambio de contraseña y borrado', () => {
      const Delegacion = require('../services/delegacionPermisos');
      // Tiempo real: la petición HTTP de supertest necesita E/S para llegar al bloqueo
      const esperar = (ms = 80) => new Promise((r) => setTimeout(r, ms));

      // Un super_admin asciende al usuario 14 a rh_admin y retiene el bloqueo hasta abrir la compuerta
      function ascenderRetenido() {
        let abrir;
        const compuerta = new Promise((r) => {
          abrir = r;
        });
        const hecho = Delegacion.operarSobreUsuario(
          mockPool,
          { usuario_id: 11, rol_id: IDS.super, rol_nombre: 'super_admin' },
          USUARIOS.libre,
          { rolId: IDS.rhAdmin, escribir: () => compuerta },
        );
        return { abrir, hecho };
      }

      it.each([
        ['reset de contraseña', (id) => request(app).post(`/api/usuarios/${id}/reset-password`)],
        ['PUT con contraseña', (id) => request(app).put(`/api/usuarios/${id}`).send({ contraseña: 'Nueva12345' })],
        ['PUT con nombre', (id) => request(app).put(`/api/usuarios/${id}`).send({ nombre: 'X' })],
        ['DELETE', (id) => request(app).delete(`/api/usuarios/${id}`)],
      ])('%s espera al ascenso en curso y se rechaza con 403 sin escribir', async (_n, peticion) => {
        const { abrir, hecho } = ascenderRetenido();
        await esperar();
        let terminada = false;
        const resp = peticion(USUARIOS.libre).then((r) => {
          terminada = true;
          return r;
        });
        await esperar();
        expect(terminada).toBe(false); // bloqueada por FOR UPDATE, no validó con el rol viejo
        abrir();
        await hecho;
        const r = await resp;
        expect(r.status).toBe(403);
        expect(mockPool.rolDe(USUARIOS.libre)).toEqual([IDS.rhAdmin]);
        expect(supabaseAdmin.actualizarPassword).not.toHaveBeenCalled();
        expect(Usuario.actualizar).not.toHaveBeenCalled();
        expect(Usuario.eliminar).not.toHaveBeenCalled();
      });

      it('en el otro orden (reset en curso) el ascenso espera: no hay escritura intercalada', async () => {
        let abrir;
        supabaseAdmin.actualizarPassword.mockImplementation(
          () =>
            new Promise((r) => {
              abrir = r;
            }),
        );
        const reset = request(app).post(`/api/usuarios/${USUARIOS.libre}/reset-password`).then((r) => r);
        for (let k = 0; k < 40 && !abrir; k++) await esperar(25);
        expect(abrir).toBeDefined(); // el reset ya tiene el bloqueo y está esperando a GoTrue
        let ascendio = false;
        const asc = Delegacion.operarSobreUsuario(
          mockPool,
          { usuario_id: 11, rol_id: IDS.super, rol_nombre: 'super_admin' },
          USUARIOS.libre,
          { rolId: IDS.rhAdmin },
        ).then(() => {
          ascendio = true;
        });
        await esperar();
        expect(ascendio).toBe(false);
        abrir();
        expect((await reset).status).toBe(200);
        await asc;
        expect(mockPool.rolDe(USUARIOS.libre)).toEqual([IDS.rhAdmin]);
      });
    });
  });

  describe('super_admin', () => {
    beforeEach(comoSuperAdmin);

    it('puede asignar cualquier rol, incluido super_admin, y cambiar el rol de otro super_admin', async () => {
      expect((await asignar(USUARIOS.rhEmpleado, IDS.super)).status).toBe(200);
      expect(mockPool.rolDe(USUARIOS.rhEmpleado)).toEqual([IDS.super]);
      expect((await asignar(USUARIOS.rhAdmin, IDS.rhEmpleado)).status).toBe(200);
      expect(mockPool.rolDe(USUARIOS.rhAdmin)).toEqual([IDS.rhEmpleado]);
    });

    it('puede resetear la contraseña de cualquiera, también de un rh_admin y de un rh_empleado', async () => {
      expect((await request(app).post(`/api/usuarios/${USUARIOS.rhAdmin}/reset-password`)).status).toBe(200);
      expect((await request(app).post(`/api/usuarios/${USUARIOS.rhEmpleado}/reset-password`)).status).toBe(200);
    });

    it('puede desactivar, editar y borrar a usuarios privilegiados', async () => {
      expect((await request(app).put(`/api/usuarios/${USUARIOS.rhAdmin}`).send({ activo: false })).status).toBe(200);
      expect((await request(app).delete(`/api/usuarios/${USUARIOS.ticketsAdmin}`)).status).toBe(200);
    });
  });

  describe('errores sin detalle interno', () => {
    beforeEach(comoSuperAdmin);

    it('un fallo inesperado responde un mensaje genérico, sin error.message', async () => {
      Usuario.actualizar.mockRejectedValue(new Error('duplicate key value violates unique constraint "x"'));
      const r = await request(app).put(`/api/usuarios/${USUARIOS.libre}`).send({ nombre: 'Z' });
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).not.toMatch(/duplicate key|constraint/);
      expect(r.body.error).toBeUndefined();
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

    it('conserva crear y renombrar roles comunes', async () => {
      expect((await request(app).post('/api/roles').send({ nombre: 'nuevo' })).status).toBe(201);
      expect((await request(app).put('/api/roles/7').send({ nombre: 'otro_nombre' })).status).toBe(200);
    });

    it('DECISIÓN DEL HUMANO: NO puede borrar ningún rol, tampoco uno común (solo super_admin)', async () => {
      for (const id of [IDS.libre, IDS.rhEmpleado, IDS.auditor, IDS.portal]) {
        const r = await request(app).delete(`/api/roles/${id}`);
        expect(r.status).toBe(403);
        expect(r.body.mensaje).toMatch(/super_admin/);
      }
      expect(Rol.eliminar).not.toHaveBeenCalled();
    });

    it('PUT /roles/:id/permisos (tabla heredada) solo para super_admin', async () => {
      const r = await request(app).put(`/api/roles/${IDS.auditor}/permisos`).send({ permisos_ids: [1] });
      expect(r.status).toBe(403);
      expect(Rol.asignarPermisos).not.toHaveBeenCalled();
    });
  });

  describe('super_admin', () => {
    beforeEach(comoSuperAdmin);

    it('puede todo, incluida la tabla heredada y borrar roles', async () => {
      expect((await request(app).put(`/api/roles/${IDS.rhAdmin}`).send({ nombre: 'rh_admin2' })).status).toBe(200);
      expect((await request(app).post('/api/roles').send({ nombre: 'rh_admin3' })).status).toBe(201);
      expect((await request(app).put(`/api/roles/${IDS.auditor}/permisos`).send({ permisos_ids: [1] })).status).toBe(200);
      expect((await request(app).delete(`/api/roles/${IDS.libre}`)).status).toBe(200);
      expect(Rol.eliminar).toHaveBeenCalledTimes(1);
    });

    it('un fallo inesperado de la BD no filtra el mensaje interno', async () => {
      Rol.eliminar.mockRejectedValue(new Error('violates foreign key constraint "usuario_rol_rol_id_fkey"'));
      const r = await request(app).delete(`/api/roles/${IDS.libre}`);
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toMatch(/foreign key|constraint/);
    });
  });
});
