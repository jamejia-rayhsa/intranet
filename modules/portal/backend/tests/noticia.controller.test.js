jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('../models/noticia.model');
jest.mock('../services/storage.service', () => ({
  BUCKETS: { NOTICIAS: 'noticias' },
  claveSegura: jest.fn((n) => `clave-${n}`),
  subir: jest.fn().mockResolvedValue({}),
  eliminar: jest.fn().mockResolvedValue({}),
  urlPublica: jest.fn(() => 'http://storage/x'),
}));

const Noticia = require('../models/noticia.model');
const Storage = require('../services/storage.service');
const Controlador = require('../controllers/noticia.controller');
const { TIPOS_NOTICIA } = require('../utils/tiposNoticia');

function crearRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('controlador de noticias: tipos', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    Storage.subir.mockResolvedValue({});
    Storage.eliminar.mockResolvedValue({});
    Storage.claveSegura.mockImplementation((n) => `clave-${n}`);
    Storage.urlPublica.mockReturnValue('http://storage/x');
  });

  it('lista los tipos válidos incluyendo boletín y evento', () => {
    expect(TIPOS_NOTICIA).toEqual(['noticia', 'comunicado', 'oferta_empleo', 'boletin', 'evento']);
  });

  describe('crear', () => {
    const req = (body) => ({ body, user: { usuario_id: 1 } });

    it.each(TIPOS_NOTICIA)('acepta el tipo válido %s', async (tipo) => {
      Noticia.crear.mockResolvedValue({ id: 1, tipo });
      const res = crearRes();
      await Controlador.crear(req({ titulo: 'T', tipo, fecha_evento: '2026-10-20T18:00:00-06:00', lugar: 'Sala' }), res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(Noticia.crear).toHaveBeenCalledWith(expect.objectContaining({ tipo }));
    });

    it('rechaza un tipo inválido con 400 y lista los válidos', async () => {
      const res = crearRes();
      await Controlador.crear(req({ titulo: 'T', tipo: 'otro' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      const cuerpo = res.json.mock.calls[0][0];
      expect(cuerpo.exito).toBe(false);
      TIPOS_NOTICIA.forEach((t) => expect(cuerpo.mensaje).toContain(t));
      expect(Noticia.crear).not.toHaveBeenCalled();
    });

    it('sin tipo conserva el comportamiento actual (lo resuelve el modelo)', async () => {
      Noticia.crear.mockResolvedValue({ id: 1, tipo: 'noticia' });
      const res = crearRes();
      await Controlador.crear(req({ titulo: 'T' }), res);
      expect(res.status).toHaveBeenCalledWith(201);
      // el controlador no inventa tipo: se lo deja al modelo, que aplica el default 'noticia'
      expect(Noticia.crear.mock.calls[0][0].tipo).toBeUndefined();
    });

    it('un boletín no exige contenido ni subtítulo', async () => {
      Noticia.crear.mockResolvedValue({ id: 2, tipo: 'boletin' });
      const res = crearRes();
      await Controlador.crear(req({ titulo: 'Boletín interno', tipo: 'boletin' }), res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('el título sigue siendo obligatorio en un boletín', async () => {
      const res = crearRes();
      await Controlador.crear(req({ tipo: 'boletin' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('actualizar', () => {
    it('acepta un tipo válido', async () => {
      Noticia.actualizar.mockResolvedValue({ id: 1, tipo: 'boletin' });
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { tipo: 'boletin' } }, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ exito: true }));
    });

    it('rechaza un tipo inválido con 400', async () => {
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { tipo: 'otro' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(Noticia.actualizar).not.toHaveBeenCalled();
    });

    it.each([[null], ['']])('tipo %p se trata como "no cambiar" y no llega al modelo', async (vacio) => {
      Noticia.actualizar.mockResolvedValue({ id: 1 });
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { titulo: 'Nuevo', tipo: vacio } }, res);
      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(Noticia.actualizar).toHaveBeenCalledWith(1, { titulo: 'Nuevo' });
    });

    it('crear con tipo null o "" no devuelve 400', async () => {
      Noticia.crear.mockResolvedValue({ id: 1 });
      for (const vacio of [null, '']) {
        const res = crearRes();
        await Controlador.crear({ body: { titulo: 'T', tipo: vacio }, user: { usuario_id: 1 } }, res);
        expect(res.status).toHaveBeenCalledWith(201);
      }
    });

    it('sin tipo en el cuerpo no valida tipo', async () => {
      Noticia.actualizar.mockResolvedValue({ id: 1 });
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { titulo: 'Nuevo' } }, res);
      expect(res.status).not.toHaveBeenCalledWith(400);
    });
  });

  describe('subirImagen: límites por tipo', () => {
    const req = () => ({ params: { id: 7 }, file: { originalname: 'a.png', buffer: Buffer.from('x'), mimetype: 'image/png' } });

    it('un boletín sin imágenes admite la primera', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 7, tipo: 'boletin' });
      Noticia.contarImagenes.mockResolvedValue(0);
      Noticia.agregarImagen.mockResolvedValue({ id: 1 });
      const res = crearRes();
      await Controlador.subirImagen(req(), res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('un boletín con una imagen responde 400', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 7, tipo: 'boletin' });
      Noticia.contarImagenes.mockResolvedValue(1);
      const res = crearRes();
      await Controlador.subirImagen(req(), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].mensaje).toBe('Límite de imágenes alcanzado. Máximo permitido: 1');
      expect(Storage.subir).not.toHaveBeenCalled();
    });

    it('otros tipos admiten hasta 5 imágenes', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 7, tipo: 'noticia' });
      Noticia.contarImagenes.mockResolvedValue(4);
      Noticia.agregarImagen.mockResolvedValue({ id: 5 });
      const res = crearRes();
      await Controlador.subirImagen(req(), res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('otros tipos con 5 imágenes responden 400', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 7, tipo: 'comunicado' });
      Noticia.contarImagenes.mockResolvedValue(5);
      const res = crearRes();
      await Controlador.subirImagen(req(), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('si el INSERT falla elimina el objeto de Storage (compensación)', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 7, tipo: 'boletin' });
      Noticia.contarImagenes.mockResolvedValue(0);
      Noticia.agregarImagen.mockRejectedValue(new Error('fallo bd'));
      const res = crearRes();
      await Controlador.subirImagen(req(), res);
      expect(Storage.eliminar).toHaveBeenCalledWith('noticias', 'clave-a.png');
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('noticia inexistente responde 404', async () => {
      Noticia.obtenerPorId.mockResolvedValue(undefined);
      const res = crearRes();
      await Controlador.subirImagen(req(), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});

describe('API pública de noticias: borradores y boletín', () => {
  const { paraPublico } = require('../utils/tiposNoticia');
  const boletin = {
    id: 9, tipo: 'boletin', titulo: 'Interno', subtitulo: 's', contenido: 'c', publicada: true,
    fecha_publicacion: '2026-10-01', autor_id: 1, autor_nombre: 'Ana', autor_apellido: 'López',
    imagenes: [{ id: 1, url: 'http://x/a.png' }],
  };
  const normal = { ...boletin, id: 10, tipo: 'noticia' };

  beforeEach(() => jest.resetAllMocks());

  describe('obtenerPublica', () => {
    it('devuelve una noticia publicada con todos sus campos', async () => {
      Noticia.obtenerPorId.mockResolvedValue(normal);
      const res = crearRes();
      await Controlador.obtenerPublica({ params: { id: 10 } }, res);
      expect(res.json).toHaveBeenCalledWith({ exito: true, datos: normal });
    });

    it('un borrador responde 404', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ ...normal, publicada: false });
      const res = crearRes();
      await Controlador.obtenerPublica({ params: { id: 10 } }, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('una noticia inexistente responde igual que un borrador (404, mismo mensaje)', async () => {
      Noticia.obtenerPorId.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ ...normal, publicada: false });
      const r1 = crearRes();
      const r2 = crearRes();
      await Controlador.obtenerPublica({ params: { id: 1 } }, r1);
      await Controlador.obtenerPublica({ params: { id: 2 } }, r2);
      expect(r1.status).toHaveBeenCalledWith(404);
      expect(r1.json.mock.calls[0][0]).toEqual(r2.json.mock.calls[0][0]);
    });

    it('un boletín público solo expone id, tipo, fecha, publicada e imágenes', async () => {
      Noticia.obtenerPorId.mockResolvedValue(boletin);
      const res = crearRes();
      await Controlador.obtenerPublica({ params: { id: 9 } }, res);
      const datos = res.json.mock.calls[0][0].datos;
      expect(Object.keys(datos).sort()).toEqual(['fecha_publicacion', 'id', 'imagenes', 'publicada', 'tipo']);
      expect(datos.imagenes[0].url).toBe('http://x/a.png');
    });
  });

  describe('listarPublicadas', () => {
    it('oculta los campos de texto solo en los boletines', async () => {
      Noticia.obtenerPublicadas.mockResolvedValue([boletin, normal]);
      Noticia.contarPublicadas.mockResolvedValue(2);
      const res = crearRes();
      await Controlador.listarPublicadas({ query: {} }, res);
      const [b, n] = res.json.mock.calls[0][0].datos.noticias;
      expect(b).not.toHaveProperty('titulo');
      expect(b).not.toHaveProperty('contenido');
      expect(b).not.toHaveProperty('autor_nombre');
      expect(n).toEqual(normal);
    });
  });

  describe('vía del panel (autenticada)', () => {
    it('obtener devuelve un borrador de boletín completo', async () => {
      const borrador = { ...boletin, publicada: false };
      Noticia.obtenerPorId.mockResolvedValue(borrador);
      const res = crearRes();
      await Controlador.obtener({ params: { id: 9 } }, res);
      expect(res.json).toHaveBeenCalledWith({ exito: true, datos: borrador });
    });

    it('listarTodas devuelve el boletín completo (con título interno)', async () => {
      Noticia.obtenerTodas.mockResolvedValue([boletin]);
      Noticia.contarTodas.mockResolvedValue(1);
      const res = crearRes();
      await Controlador.listarTodas({ query: {} }, res);
      expect(res.json.mock.calls[0][0].datos.noticias[0].titulo).toBe('Interno');
    });
  });

  describe('rutas', () => {
    it('GET /:id es público y /admin/:id exige autenticación y Noticias:consulta', () => {
      jest.resetModules();
      jest.doMock('../middleware/permisos.middleware', () => ({ verificarPermiso: jest.fn((m, o, t) => { const f = () => {}; f.permiso = [m, o, t]; return f; }) }));
      jest.doMock('../middleware/auth.middleware', () => ({ authenticateJWT: function authenticateJWT() {} }));
      jest.doMock('../../../auditoria/backend/middleware/auditoria.middleware', () => ({ auditoriaMiddleware: () => () => {} }));
      jest.doMock('../middleware/upload.noticia.middleware', () => ({ subirImagenNoticia: { single: () => () => {} } }));
      const router = require('../routes/noticia.routes');
      const capas = router.stack;
      const idxAuth = capas.findIndex((c) => c.handle && c.handle.name === 'authenticateJWT');
      const idxPublica = capas.findIndex((c) => c.route && c.route.path === '/:id' && c.route.methods.get);
      const idxAdmin = capas.findIndex((c) => c.route && c.route.path === '/admin/:id' && c.route.methods.get);
      expect(idxPublica).toBeGreaterThanOrEqual(0);
      expect(idxPublica).toBeLessThan(idxAuth);
      expect(idxAdmin).toBeGreaterThan(idxAuth);
      const permisos = capas[idxAdmin].route.stack.map((l) => l.handle.permiso).filter(Boolean);
      expect(permisos).toEqual([['portal', 'Noticias', 'consulta']]);
      jest.dontMock('../middleware/permisos.middleware');
    });

    it('paraPublico no altera tipos distintos de boletín', () => {
      expect(paraPublico(normal)).toBe(normal);
    });
  });
});

describe('eventos: fecha, lugar, límite de imágenes y reordenar', () => {
  const { limiteImagenes } = require('../utils/tiposNoticia');
  const reqCrear = (body) => ({ body: { titulo: 'Fiesta', ...body }, user: { usuario_id: 1 } });

  beforeEach(() => {
    jest.resetAllMocks();
    Storage.subir.mockResolvedValue({});
    Storage.claveSegura.mockImplementation((n) => `clave-${n}`);
    Storage.urlPublica.mockReturnValue('http://storage/x');
  });

  describe('crear', () => {
    it('un evento válido guarda la fecha normalizada (ISO UTC) y el lugar sin espacios', async () => {
      Noticia.crear.mockResolvedValue({ id: 1 });
      const res = crearRes();
      await Controlador.crear(reqCrear({ tipo: 'evento', fecha_evento: '2026-10-20T18:00:00-06:00', lugar: '  Sala de juntas ' }), res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(Noticia.crear).toHaveBeenCalledWith(expect.objectContaining({
        fecha_evento: '2026-10-21T00:00:00.000Z',
        lugar: 'Sala de juntas',
      }));
    });

    it.each([[undefined], [''], ['no es fecha']])('un evento con fecha %p responde 400', async (fecha) => {
      const res = crearRes();
      await Controlador.crear(reqCrear({ tipo: 'evento', fecha_evento: fecha, lugar: 'Sala' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(Noticia.crear).not.toHaveBeenCalled();
    });

    it.each([[undefined], ['   ']])('un evento con lugar %p responde 400', async (lugar) => {
      const res = crearRes();
      await Controlador.crear(reqCrear({ tipo: 'evento', fecha_evento: '2026-10-20T18:00:00Z', lugar }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('en otros tipos fecha_evento y lugar se ignoran (NULL)', async () => {
      Noticia.crear.mockResolvedValue({ id: 1 });
      const res = crearRes();
      await Controlador.crear(reqCrear({ tipo: 'noticia', fecha_evento: '2026-10-20T18:00:00Z', lugar: 'Sala' }), res);
      expect(Noticia.crear).toHaveBeenCalledWith(expect.objectContaining({ fecha_evento: null, lugar: null }));
    });
  });

  describe('actualizar', () => {
    it('tipo evento exige fecha y lugar', async () => {
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { tipo: 'evento', lugar: 'Sala' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(Noticia.actualizar).not.toHaveBeenCalled();
    });

    it('tipo evento válido guarda ambos campos', async () => {
      Noticia.actualizar.mockResolvedValue({ id: 1 });
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { tipo: 'evento', fecha_evento: '2026-10-20T18:00:00Z', lugar: 'Patio' } }, res);
      expect(Noticia.actualizar).toHaveBeenCalledWith(1, expect.objectContaining({ lugar: 'Patio', fecha_evento: '2026-10-20T18:00:00.000Z' }));
    });

    it('cambiar de evento a otro tipo pone fecha y lugar en NULL', async () => {
      Noticia.actualizar.mockResolvedValue({ id: 1 });
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { tipo: 'noticia', fecha_evento: '2026-10-20T18:00:00Z', lugar: 'x' } }, res);
      expect(Noticia.actualizar).toHaveBeenCalledWith(1, expect.objectContaining({ fecha_evento: null, lugar: null }));
    });

    it('sin tipo en un evento existente valida los campos que lleguen', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 1, tipo: 'evento' });
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { lugar: '' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('sin tipo en una publicación que no es evento ignora fecha y lugar', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 1, tipo: 'noticia' });
      Noticia.actualizar.mockResolvedValue({ id: 1 });
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { titulo: 'N', lugar: 'Sala' } }, res);
      expect(Noticia.actualizar).toHaveBeenCalledWith(1, { titulo: 'N' });
    });
  });

  describe('subirImagen: límites por tipo', () => {
    const req = () => ({ params: { id: 7 }, file: { originalname: 'a.png', buffer: Buffer.from('x'), mimetype: 'image/png' } });

    it('límites: boletín 1, evento 10, resto 5', () => {
      expect(limiteImagenes('boletin')).toBe(1);
      expect(limiteImagenes('evento')).toBe(10);
      expect(limiteImagenes('noticia')).toBe(5);
    });

    it('un evento con 9 imágenes admite la décima', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 7, tipo: 'evento' });
      Noticia.contarImagenes.mockResolvedValue(9);
      Noticia.agregarImagen.mockResolvedValue({ id: 10 });
      const res = crearRes();
      await Controlador.subirImagen(req(), res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('un evento con 10 imágenes responde 400', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 7, tipo: 'evento' });
      Noticia.contarImagenes.mockResolvedValue(10);
      const res = crearRes();
      await Controlador.subirImagen(req(), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].mensaje).toBe('Límite de imágenes alcanzado. Máximo permitido: 10');
    });
  });

  describe('reordenarImagenes', () => {
    const req = (orden) => ({ params: { id: 3 }, body: { orden } });

    it('reordena cuando la lista contiene exactamente las imágenes', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 3 });
      Noticia.idsImagenes.mockResolvedValue([1, 2, 3]);
      Noticia.reordenarImagenes.mockResolvedValue();
      const res = crearRes();
      await Controlador.reordenarImagenes(req([3, 1, 2]), res);
      expect(Noticia.reordenarImagenes).toHaveBeenCalledWith(3, [3, 1, 2]);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ exito: true }));
    });

    it('rechaza ids ajenos con 400', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 3 });
      Noticia.idsImagenes.mockResolvedValue([1, 2]);
      const res = crearRes();
      await Controlador.reordenarImagenes(req([1, 99]), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(Noticia.reordenarImagenes).not.toHaveBeenCalled();
    });

    it('rechaza una lista incompleta con 400', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 3 });
      Noticia.idsImagenes.mockResolvedValue([1, 2, 3]);
      const res = crearRes();
      await Controlador.reordenarImagenes(req([1, 2]), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it.each([[undefined], ['1,2'], [[1, 1]], [[1, 'a']]])('rechaza un cuerpo inválido %p con 400', async (orden) => {
      const res = crearRes();
      await Controlador.reordenarImagenes(req(orden), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('noticia inexistente responde 404', async () => {
      Noticia.obtenerPorId.mockResolvedValue(undefined);
      const res = crearRes();
      await Controlador.reordenarImagenes(req([1]), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('API pública', () => {
    it('un evento publicado devuelve todo, incluidos fecha_evento y lugar', async () => {
      const evento = { id: 5, tipo: 'evento', titulo: 'Fiesta', contenido: 'c', publicada: true, autor_nombre: 'Ana',
        fecha_evento: '2026-10-21T00:00:00.000Z', lugar: 'Sala', imagenes: [{ id: 1 }, { id: 2 }] };
      Noticia.obtenerPorId.mockResolvedValue(evento);
      const res = crearRes();
      await Controlador.obtenerPublica({ params: { id: 5 } }, res);
      expect(res.json).toHaveBeenCalledWith({ exito: true, datos: evento });
    });
  });
});

describe('modelo de noticias: orden de imágenes y reordenar (config/database mockeado)', () => {
  let ModeloReal;
  let consultas;
  let cliente;

  beforeEach(() => {
    jest.resetModules();
    jest.unmock('../models/noticia.model');
    consultas = [];
    cliente = { query: jest.fn(async (sql, params) => { consultas.push([sql, params]); return { rows: [] }; }), release: jest.fn() };
    jest.doMock('../config/database', () => ({
      grupo: { query: jest.fn(async (sql, params) => { consultas.push([sql, params]); return { rows: [{ id: 1, count: '2' }] }; }), connect: jest.fn(async () => cliente) },
    }));
    ModeloReal = require('../models/noticia.model');
  });

  it('las consultas devuelven las imágenes ordenadas por orden y luego id', async () => {
    await ModeloReal.obtenerPublicadas(1, 10);
    expect(consultas[0][0]).toMatch(/ORDER BY ni\.orden ASC, ni\.id ASC/);
  });

  it('una imagen nueva queda al final (máximo + 1, no el conteo)', async () => {
    await ModeloReal.agregarImagen(3, 'ruta', 'a.png');
    expect(consultas[0][0]).toMatch(/COALESCE\(MAX\(orden\), -1\) \+ 1/);
  });

  it('reordenar actualiza cada posición dentro de una transacción', async () => {
    await ModeloReal.reordenarImagenes(3, [5, 4]);
    const sqls = cliente.query.mock.calls.map((c) => c[0]);
    expect(sqls[0]).toBe('BEGIN');
    expect(cliente.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE noticia_imagenes SET orden'), [0, 5, 3]);
    expect(cliente.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE noticia_imagenes SET orden'), [1, 4, 3]);
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(cliente.release).toHaveBeenCalled();
  });

  it('si un UPDATE falla hace ROLLBACK y libera el cliente', async () => {
    cliente.query.mockImplementation(async (sql) => { if (sql.startsWith('UPDATE')) throw new Error('fallo'); return { rows: [] }; });
    await expect(ModeloReal.reordenarImagenes(3, [5])).rejects.toThrow('fallo');
    expect(cliente.query).toHaveBeenCalledWith('ROLLBACK');
    expect(cliente.release).toHaveBeenCalled();
  });
});

describe('rutas de reordenar imágenes', () => {
  it('PUT /:id/imagenes/orden está tras la autenticación y exige Noticias:edicion', () => {
    jest.resetModules();
    jest.doMock('../middleware/permisos.middleware', () => ({ verificarPermiso: jest.fn((m, o, t) => { const f = () => {}; f.permiso = [m, o, t]; return f; }) }));
    jest.doMock('../middleware/auth.middleware', () => ({ authenticateJWT: function authenticateJWT() {} }));
    jest.doMock('../../../auditoria/backend/middleware/auditoria.middleware', () => ({ auditoriaMiddleware: () => () => {} }));
    jest.doMock('../middleware/upload.noticia.middleware', () => ({ subirImagenNoticia: { single: () => () => {} } }));
    const router = require('../routes/noticia.routes');
    const capas = router.stack;
    const idxAuth = capas.findIndex((c) => c.handle && c.handle.name === 'authenticateJWT');
    const idx = capas.findIndex((c) => c.route && c.route.path === '/:id/imagenes/orden' && c.route.methods.put);
    expect(idx).toBeGreaterThan(idxAuth);
    expect(capas[idx].route.stack.map((l) => l.handle.permiso).filter(Boolean)).toEqual([['portal', 'Noticias', 'edicion']]);
  });
});

describe('validación de fecha_evento y cambio de tipo con exceso de imágenes', () => {
  const { validarFechaEvento } = require('../utils/tiposNoticia');

  it.each([[true], [[2026]], [{}], [null], [undefined], [''], ['   '], [1], ['1999-12-31T00:00:00Z'], ['2101-01-01T00:00:00Z'], [NaN]])(
    'rechaza fecha_evento %p',
    (valor) => {
      expect(validarFechaEvento(valor).error).toBeDefined();
    },
  );

  it.each([['2026-10-20T18:00:00-06:00'], [new Date('2026-10-20T18:00:00Z')], [Date.UTC(2026, 9, 20)]])(
    'acepta fecha_evento %p',
    (valor) => {
      expect(validarFechaEvento(valor).valor).toMatch(/^2026-10-2\d/);
    },
  );

  describe('actualizar', () => {
    beforeEach(() => jest.resetAllMocks());

    it('cambiar de evento (8 imágenes) a noticia responde 400 con el mensaje', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 1, tipo: 'evento' });
      Noticia.contarImagenes.mockResolvedValue(8);
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { tipo: 'noticia' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].mensaje).toBe(
        'Esta publicación tiene 8 imágenes; el tipo noticia admite 5. Quita imágenes antes de cambiar el tipo.',
      );
      expect(Noticia.actualizar).not.toHaveBeenCalled();
    });

    it('mantener el mismo tipo no se bloquea aunque exceda el límite', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 1, tipo: 'noticia' });
      Noticia.contarImagenes.mockResolvedValue(7);
      Noticia.actualizar.mockResolvedValue({ id: 1 });
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { tipo: 'noticia', titulo: 'x' } }, res);
      expect(Noticia.actualizar).toHaveBeenCalled();
    });

    it('cambiar a un tipo cuyo límite alcanza sí se permite', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 1, tipo: 'noticia' });
      Noticia.contarImagenes.mockResolvedValue(5);
      Noticia.actualizar.mockResolvedValue({ id: 1 });
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { tipo: 'comunicado' } }, res);
      expect(Noticia.actualizar).toHaveBeenCalled();
    });

    it('cambiar a boletín con 2 imágenes responde 400', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 1, tipo: 'noticia' });
      Noticia.contarImagenes.mockResolvedValue(2);
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 1 }, body: { tipo: 'boletin' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
