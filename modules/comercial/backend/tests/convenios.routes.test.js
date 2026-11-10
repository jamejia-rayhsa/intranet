// Verifica el cableado de permisos de convenios.routes.js inspeccionando router.stack (mismo patrón
// que modules/tickets/backend/tests/adjunto.controller.test.js): cada ruta de /convenios exige
// verificarPermiso('comercial','Convenios', consulta|edicion); las de /autorizadores exigen
// soloSuperAdmin (nunca el permiso granular de la opción "Convenios": es una lista sensible).
describe("convenios.routes: autorización por ruta", () => {
  function montarRouter() {
    jest.resetModules();
    const verificarPermiso = jest.fn((...args) => {
      const mw = (req, res, next) => next();
      mw.args = args;
      return mw;
    });
    jest.doMock("../../../portal/backend/middleware/permisos.middleware", () => ({ verificarPermiso }));
    jest.doMock("../../../portal/backend/middleware/auth.middleware", () => ({
      authenticateJWT: function authenticateJWT() {},
    }));
    jest.doMock("../controllers/convenio.controller", () => ({
      listar: jest.fn(), obtener: jest.fn(), crear: jest.fn(), actualizar: jest.fn(),
      autorizar: jest.fn(), rechazar: jest.fn(), cancelar: jest.fn(),
    }));
    jest.doMock("../controllers/autorizador.controller", () => ({
      listar: jest.fn(), agregar: jest.fn(), quitar: jest.fn(),
    }));
    const router = require("../routes/convenios.routes");
    return { router, verificarPermiso };
  }

  function capaDe(router, path, metodo) {
    return router.stack.find((l) => l.route && l.route.path === path && l.route.methods[metodo]);
  }

  it("authenticateJWT se aplica primero a todo el router", () => {
    const { router } = montarRouter();
    expect(router.stack[0].handle.name).toBe("authenticateJWT");
  });

  it.each([
    ["/convenios", "get", "consulta"],
    ["/convenios/:id", "get", "consulta"],
    ["/convenios", "post", "edicion"],
    ["/convenios/:id", "put", "edicion"],
    ["/convenios/:id/autorizar", "put", "edicion"],
    ["/convenios/:id/rechazar", "put", "edicion"],
    ["/convenios/:id/cancelar", "put", "edicion"],
  ])("%s %s exige comercial/Convenios/%s", (path, metodo, tipo) => {
    const { router } = montarRouter();
    const capa = capaDe(router, path, metodo);
    expect(capa).toBeDefined();
    expect(capa.route.stack[0].handle.args).toEqual(["comercial", "Convenios", tipo]);
  });

  it.each([
    ["/autorizadores", "get"],
    ["/autorizadores", "post"],
    ["/autorizadores/:usuario_id", "delete"],
  ])("%s %s usa soloSuperAdmin, no el permiso granular de Convenios", (path, metodo) => {
    const { router } = montarRouter();
    const capa = capaDe(router, path, metodo);
    expect(capa).toBeDefined();
    // soloSuperAdmin es una función nombrada declarada en el propio archivo de rutas: NO es el mock
    // de verificarPermiso (que sí se usa, pero solo en las rutas /convenios/*, probado arriba).
    expect(capa.route.stack[0].handle.name).toBe("soloSuperAdmin");
    expect(capa.route.stack[0].handle.args).toBeUndefined();
  });

  it("soloSuperAdmin deja pasar a super_admin y rechaza a cualquier otro rol (403)", () => {
    const { router } = montarRouter();
    const capa = capaDe(router, "/autorizadores", "get");
    const mw = capa.route.stack[0].handle;
    const next = jest.fn();
    mw({ user: { rol_nombre: "super_admin" } }, {}, next);
    expect(next).toHaveBeenCalled();

    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mw({ user: { rol_nombre: "comercial_admin" } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);

    const res2 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mw({ user: undefined }, res2, jest.fn());
    expect(res2.status).toHaveBeenCalledWith(403);
  });
});
