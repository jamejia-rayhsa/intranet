jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('../models/noticia.model');
jest.mock('../../../auditoria/backend/services/auditoria.service', () => ({ registrarAccion: jest.fn().mockResolvedValue(null) }));
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
      Noticia.agregarImagenConLimite.mockResolvedValue({ imagen: { id: 1 } });
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
      Noticia.agregarImagenConLimite.mockResolvedValue({ imagen: { id: 5 } });
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
      Noticia.agregarImagenConLimite.mockRejectedValue(new Error('fallo bd'));
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
      Noticia.agregarImagenConLimite.mockResolvedValue({ imagen: { id: 10 } });
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

    it('reordena cuando la transacción acepta la lista', async () => {
      Noticia.reordenarImagenesAtomico.mockResolvedValue({ ok: true });
      const res = crearRes();
      await Controlador.reordenarImagenes(req([3, 1, 2]), res);
      expect(Noticia.reordenarImagenesAtomico).toHaveBeenCalledWith(3, [3, 1, 2]);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ exito: true }));
    });

    it('conjunto de ids distinto (ajenos o incompleto) responde 400', async () => {
      Noticia.reordenarImagenesAtomico.mockResolvedValue({ conjuntoDistinto: true });
      const res = crearRes();
      await Controlador.reordenarImagenes(req([1, 99]), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it.each([[undefined], ['1,2'], [[1, 1]], [[1, 'a']]])('rechaza un cuerpo inválido %p con 400 sin tocar la BD', async (orden) => {
      const res = crearRes();
      await Controlador.reordenarImagenes(req(orden), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(Noticia.reordenarImagenesAtomico).not.toHaveBeenCalled();
    });

    it('noticia inexistente responde 404', async () => {
      Noticia.reordenarImagenesAtomico.mockResolvedValue({ noExiste: true });
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

  // Simula la BD: responde según el SQL, registra el orden de llamadas
  function simularCliente({ tipo = 'noticia', existe = true, conteo = 0, imagenes = [] } = {}) {
    cliente.query.mockImplementation(async (sql) => {
      if (/FROM noticias WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: existe ? [{ id: 3, tipo }] : [] };
      if (/SELECT COUNT/.test(sql)) return { rows: [{ count: String(conteo) }] };
      if (/FROM noticia_imagenes WHERE noticia_id = \$1 FOR UPDATE/.test(sql)) return { rows: imagenes.map((id) => ({ id })) };
      if (/INSERT INTO noticia_imagenes/.test(sql)) return { rows: [{ id: 99, orden: conteo }] };
      return { rows: [] };
    });
    return () => cliente.query.mock.calls.map((c) => c[0].replace(/\s+/g, ' ').trim().slice(0, 40));
  }

  it('filtra por tipo en SQL antes de paginar (placeholder $3) y cuenta con el mismo filtro', async () => {
    await ModeloReal.obtenerPublicadas(2, 12, 'evento');
    expect(consultas[0][0]).toMatch(/AND n\.tipo = \$3/);
    expect(consultas[0][1]).toEqual([12, 12, 'evento']);
    await ModeloReal.contarPublicadas('evento');
    expect(consultas[1][0]).toMatch(/AND tipo = \$1/);
    expect(consultas[1][1]).toEqual(['evento']);
  });

  it('obtener y eliminar imagen filtran por noticia_id en el SQL parametrizado', async () => {
    await ModeloReal.obtenerImagen(5, 7);
    expect(consultas[0][0]).toMatch(/WHERE id = \$1 AND noticia_id = \$2/);
    expect(consultas[0][1]).toEqual([5, 7]);
    await ModeloReal.eliminarImagen(5, 7);
    expect(consultas[1][0]).toMatch(/DELETE FROM noticia_imagenes WHERE id = \$1 AND noticia_id = \$2/);
    expect(consultas[1][1]).toEqual([5, 7]);
  });

  it('el modelo ya no expone el código muerto de subida y reorden anteriores', () => {
    expect(ModeloReal.agregarImagen).toBeUndefined();
    expect(ModeloReal.idsImagenes).toBeUndefined();
    expect(ModeloReal.reordenarImagenes).toBeUndefined();
  });

  it('sin tipo conserva la consulta anterior', async () => {
    await ModeloReal.obtenerPublicadas(1, 10);
    expect(consultas[0][0]).not.toMatch(/n\.tipo =/);
    expect(consultas[0][1]).toEqual([10, 0]);
  });

  it('subida: BEGIN, bloqueo de la noticia, conteo, INSERT con MAX+1 y COMMIT, en ese orden', async () => {
    const llamadas = simularCliente({ tipo: 'evento', conteo: 3 });
    const r = await ModeloReal.agregarImagenConLimite(3, 'ruta', 'a.png');
    expect(r.imagen.id).toBe(99);
    const q = llamadas();
    expect(q[0]).toBe('BEGIN');
    expect(q[1]).toMatch(/FOR UPDATE|SELECT id, tipo/);
    expect(q[2]).toMatch(/SELECT COUNT/);
    expect(q[3]).toMatch(/INSERT INTO noticia_imagenes/);
    expect(q[4]).toBe('COMMIT');
    expect(cliente.query.mock.calls[3][0]).toMatch(/COALESCE\(MAX\(orden\), -1\) \+ 1/);
    expect(cliente.release).toHaveBeenCalled();
  });

  it('subida: límite del tipo alcanzado bajo bloqueo -> ROLLBACK sin INSERT', async () => {
    const llamadas = simularCliente({ tipo: 'boletin', conteo: 1 });
    const r = await ModeloReal.agregarImagenConLimite(3, 'ruta', 'a.png');
    expect(r).toEqual({ limiteAlcanzado: 1 });
    expect(llamadas().some((x) => /INSERT/.test(x))).toBe(false);
    expect(llamadas().pop()).toBe('ROLLBACK');
  });

  it('subida: noticia inexistente -> noExiste y ROLLBACK', async () => {
    simularCliente({ existe: false });
    expect(await ModeloReal.agregarImagenConLimite(3, 'r', 'a')).toEqual({ noExiste: true });
  });

  it('subida: si el INSERT falla hace ROLLBACK, relanza y libera', async () => {
    cliente.query.mockImplementation(async (sql) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [{ id: 3, tipo: 'noticia' }] };
      if (/SELECT COUNT/.test(sql)) return { rows: [{ count: '0' }] };
      if (/INSERT/.test(sql)) throw new Error('fallo insert');
      return { rows: [] };
    });
    await expect(ModeloReal.agregarImagenConLimite(3, 'r', 'a')).rejects.toThrow('fallo insert');
    expect(cliente.query).toHaveBeenCalledWith('ROLLBACK');
    expect(cliente.release).toHaveBeenCalled();
  });

  it('reordenar: valida el conjunto DENTRO de la transacción, tras bloquear noticia e imágenes', async () => {
    const llamadas = simularCliente({ imagenes: [4, 5] });
    const r = await ModeloReal.reordenarImagenesAtomico(3, [5, 4]);
    expect(r).toEqual({ ok: true });
    const q = llamadas();
    expect(q[0]).toBe('BEGIN');
    expect(q[1]).toMatch(/SELECT id FROM noticias/);
    expect(q[2]).toMatch(/SELECT id FROM noticia_imagenes/);
    expect(cliente.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE noticia_imagenes SET orden'), [0, 5, 3]);
    expect(cliente.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE noticia_imagenes SET orden'), [1, 4, 3]);
    expect(q[q.length - 1]).toBe('COMMIT');
  });

  it('reordenar: si una imagen cambió (conjunto distinto) hace ROLLBACK sin UPDATE', async () => {
    const llamadas = simularCliente({ imagenes: [4, 5, 6] });
    expect(await ModeloReal.reordenarImagenesAtomico(3, [5, 4])).toEqual({ conjuntoDistinto: true });
    expect(llamadas().some((x) => /UPDATE/.test(x))).toBe(false);
    expect(llamadas().pop()).toBe('ROLLBACK');
  });

  it('reordenar: noticia inexistente', async () => {
    simularCliente({ existe: false });
    expect(await ModeloReal.reordenarImagenesAtomico(3, [1])).toEqual({ noExiste: true });
  });

  it('reordenar: si un UPDATE falla hace ROLLBACK y libera el cliente', async () => {
    cliente.query.mockImplementation(async (sql) => {
      if (/FROM noticias WHERE id/.test(sql)) return { rows: [{ id: 3 }] };
      if (/FROM noticia_imagenes WHERE/.test(sql)) return { rows: [{ id: 5 }] };
      if (sql.startsWith('UPDATE')) throw new Error('fallo');
      return { rows: [] };
    });
    await expect(ModeloReal.reordenarImagenesAtomico(3, [5])).rejects.toThrow('fallo');
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

describe('eliminar imagen: propiedad', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    Storage.eliminar.mockResolvedValue({});
  });

  it('una imagen de la noticia de la URL se elimina (consulta con ambos ids)', async () => {
    Noticia.obtenerImagen.mockResolvedValue({ id: 5, noticia_id: 7, ruta_archivo: 'x.png' });
    Noticia.eliminarImagen.mockResolvedValue({ id: 5 });
    const res = crearRes();
    await Controlador.eliminarImagen({ params: { id: 7, imagenId: 5 } }, res);
    expect(Noticia.obtenerImagen).toHaveBeenCalledWith(5, 7);
    expect(Noticia.eliminarImagen).toHaveBeenCalledWith(5, 7);
    expect(Storage.eliminar).toHaveBeenCalledWith('noticias', 'x.png');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ exito: true }));
  });

  it('una imagen de otra noticia responde 404 sin borrar nada', async () => {
    Noticia.obtenerImagen.mockResolvedValue(undefined); // el SQL filtra por noticia_id
    const res = crearRes();
    await Controlador.eliminarImagen({ params: { id: 8, imagenId: 5 } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].mensaje).toBe('Imagen no encontrada');
    expect(Storage.eliminar).not.toHaveBeenCalled();
    expect(Noticia.eliminarImagen).not.toHaveBeenCalled();
  });
});

describe('endurecimiento de la API de noticias', () => {
  const { registrarAccion } = require('../../../auditoria/backend/services/auditoria.service');
  const { paraPublico, validarFechaEvento } = require('../utils/tiposNoticia');
  const { esIdValido, validarIdNumerico } = require('../middleware/validar-id.middleware');

  beforeEach(() => {
    jest.resetAllMocks();
    registrarAccion.mockResolvedValue(null);
    Storage.subir.mockResolvedValue({});
    Storage.eliminar.mockResolvedValue({});
    Storage.claveSegura.mockImplementation((n) => `clave-${n}`);
    Storage.urlPublica.mockReturnValue('http://storage/x');
  });

  describe('listado público con filtro por tipo', () => {
    it('pasa el tipo válido al modelo (filtro en SQL) y cuenta con el mismo filtro', async () => {
      Noticia.obtenerPublicadas.mockResolvedValue([]);
      Noticia.contarPublicadas.mockResolvedValue(25);
      const res = crearRes();
      await Controlador.listarPublicadas({ query: { tipo: 'evento', pagina: '2', limite: '12' } }, res);
      expect(Noticia.obtenerPublicadas).toHaveBeenCalledWith(2, 12, 'evento');
      expect(Noticia.contarPublicadas).toHaveBeenCalledWith('evento');
      const datos = res.json.mock.calls[0][0].datos;
      expect(datos).toEqual(expect.objectContaining({ total: 25, pagina: 2, limite: 12, paginas_totales: 3 }));
    });

    it('sin tipo conserva el comportamiento anterior (null)', async () => {
      Noticia.obtenerPublicadas.mockResolvedValue([]);
      Noticia.contarPublicadas.mockResolvedValue(0);
      await Controlador.listarPublicadas({ query: {} }, crearRes());
      expect(Noticia.obtenerPublicadas).toHaveBeenCalledWith(1, 10, null);
    });

    it('tipo inválido responde 400 con los válidos', async () => {
      const res = crearRes();
      await Controlador.listarPublicadas({ query: { tipo: 'xyz' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].mensaje).toContain('evento');
      expect(Noticia.obtenerPublicadas).not.toHaveBeenCalled();
    });

    it.each([['0'], ['-1'], ['abc'], ['1.5']])('pagina %p inválida responde 400', async (pagina) => {
      const res = crearRes();
      await Controlador.listarPublicadas({ query: { pagina } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('errores públicos sin detalle interno', () => {
    it('listarPublicadas no devuelve error.message de Postgres', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      Noticia.obtenerPublicadas.mockRejectedValue(new Error('invalid input syntax for type integer: "admin"'));
      const res = crearRes();
      await Controlador.listarPublicadas({ query: {} }, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('invalid input syntax');
      console.error.mockRestore();
    });

    it('obtenerPublica tampoco', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      Noticia.obtenerPorId.mockRejectedValue(new Error('detalle interno'));
      const res = crearRes();
      await Controlador.obtenerPublica({ params: { id: 1 } }, res);
      expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('detalle interno');
      console.error.mockRestore();
    });
  });

  describe('validación de ids de ruta', () => {
    it.each([['1', true], ['2147483647', true], ['admin', false], ['0', false], ['-3', false], ['1e3', false], ['2147483648', false], ['', false]])(
      'esIdValido(%p) = %p',
      (valor, esperado) => expect(esIdValido(valor)).toBe(esperado),
    );

    it('un id inválido responde 400 y no continúa', () => {
      const res = crearRes();
      const next = jest.fn();
      validarIdNumerico({}, res, next, 'admin');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('un id válido continúa', () => {
      const next = jest.fn();
      validarIdNumerico({}, crearRes(), next, '7');
      expect(next).toHaveBeenCalled();
    });

    it('el router registra la validación para :id e :imagenId', () => {
      jest.resetModules();
      jest.doMock('../middleware/permisos.middleware', () => ({ verificarPermiso: () => () => {} }));
      jest.doMock('../middleware/auth.middleware', () => ({ authenticateJWT: () => {} }));
      jest.doMock('../../../auditoria/backend/middleware/auditoria.middleware', () => ({ auditoriaMiddleware: () => () => {} }));
      jest.doMock('../middleware/upload.noticia.middleware', () => ({ subirImagenNoticia: { single: () => () => {} } }));
      const router = require('../routes/noticia.routes');
      expect(router.params.id).toHaveLength(1);
      expect(router.params.imagenId).toHaveLength(1);
    });
  });

  describe('lista blanca de imágenes públicas del boletín', () => {
    it('solo expone id, url y orden', () => {
      const publico = paraPublico({
        id: 1, tipo: 'boletin', publicada: true, fecha_publicacion: 'f', titulo: 'interno',
        imagenes: [{ id: 7, noticia_id: 1, ruta_archivo: 'x.png', nombre_archivo: 'secreto.png', orden: 0, url: 'http://u/x.png', fecha_subida: 'z' }],
      });
      expect(publico.imagenes[0]).toEqual({ id: 7, url: 'http://u/x.png', orden: 0 });
      expect(publico).not.toHaveProperty('titulo');
    });

    it('un boletín sin imágenes devuelve lista vacía', () => {
      expect(paraPublico({ id: 1, tipo: 'boletin', imagenes: undefined }).imagenes).toEqual([]);
    });

    it('otros tipos conservan sus imágenes completas', () => {
      const n = { id: 1, tipo: 'noticia', imagenes: [{ id: 1, ruta_archivo: 'a', nombre_archivo: 'b' }] };
      expect(paraPublico(n)).toBe(n);
    });
  });

  describe('fecha_evento exige zona horaria', () => {
    it.each([['2026-10-20T18:00:00'], ['2026-10-20'], ['2026-10-20 18:00'], ['2026-10-20T18:00']])('rechaza %p (sin zona)', (valor) => {
      expect(validarFechaEvento(valor).error).toMatch(/zona/);
    });
    it.each([['2026-10-20T18:00:00Z'], ['2026-10-20T18:00:00-06:00'], ['2026-10-20T18:00:00.000+0100'], ['2026-10-20 18:00:00+00']])('acepta %p', (valor) => {
      expect(validarFechaEvento(valor).valor).toBeDefined();
    });
    it('números y Date siguen siendo válidos', () => {
      expect(validarFechaEvento(Date.UTC(2026, 9, 20)).valor).toBeDefined();
      expect(validarFechaEvento(new Date('2026-10-20T18:00:00Z')).valor).toBeDefined();
    });
  });

  describe('auditoría', () => {
    it('actualizar registra UPDATE con los campos cambiados, no su contenido', async () => {
      Noticia.actualizar.mockResolvedValue({ id: 4 });
      await Controlador.actualizar({ params: { id: 4 }, body: { titulo: 'Texto largo privado', publicada: true } }, crearRes());
      const [, modulo, tabla, id, accion, previos, nuevos] = registrarAccion.mock.calls[0];
      expect([modulo, tabla, id, accion, previos]).toEqual(['portal', 'noticias', 4, 'UPDATE', null]);
      expect(nuevos).toEqual({ campos: ['titulo', 'publicada'], publicada: true });
      expect(JSON.stringify(nuevos)).not.toContain('Texto largo privado');
    });

    it('un actualizar que falla (400) no audita', async () => {
      await Controlador.actualizar({ params: { id: 4 }, body: { tipo: 'zzz' } }, crearRes());
      expect(registrarAccion).not.toHaveBeenCalled();
    });

    it('eliminar registra DELETE con título, tipo y número de imágenes', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 4, imagenes: [{ ruta_archivo: 'a' }, { ruta_archivo: 'b' }] });
      Noticia.eliminar.mockResolvedValue({ id: 4, titulo: 'T', tipo: 'noticia' });
      await Controlador.eliminar({ params: { id: 4 } }, crearRes());
      expect(registrarAccion.mock.calls[0].slice(2, 6)).toEqual(['noticias', 4, 'DELETE', { titulo: 'T', tipo: 'noticia', imagenes: 2 }]);
    });

    it('subir imagen registra INSERT con noticia_id y orden (sin nombre de archivo)', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 7, tipo: 'noticia' });
      Noticia.contarImagenes.mockResolvedValue(0);
      Noticia.agregarImagenConLimite.mockResolvedValue({ imagen: { id: 11, orden: 0, nombre_archivo: 'secreto.png' } });
      await Controlador.subirImagen({ params: { id: 7 }, file: { originalname: 'secreto.png', buffer: Buffer.from('x'), mimetype: 'image/png' } }, crearRes());
      const llamada = registrarAccion.mock.calls[0];
      expect(llamada.slice(2, 5)).toEqual(['noticia_imagenes', 11, 'INSERT']);
      expect(llamada[6]).toEqual({ noticia_id: 7, orden: 0 });
    });

    it('eliminar imagen y reordenar registran DELETE y UPDATE', async () => {
      Noticia.obtenerImagen.mockResolvedValue({ id: 5, noticia_id: 7, ruta_archivo: 'x' });
      Noticia.eliminarImagen.mockResolvedValue({});
      await Controlador.eliminarImagen({ params: { id: 7, imagenId: 5 } }, crearRes());
      expect(registrarAccion.mock.calls[0].slice(3, 6)).toEqual([5, 'DELETE', { noticia_id: 7 }]);
      Noticia.reordenarImagenesAtomico.mockResolvedValue({ ok: true });
      await Controlador.reordenarImagenes({ params: { id: 7 }, body: { orden: [2, 1] } }, crearRes());
      expect(registrarAccion.mock.calls[1].slice(3, 7)).toEqual([7, 'UPDATE', null, { reordenar: [2, 1] }]);
    });

    it('si la auditoría falla, la operación igual responde éxito', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      registrarAccion.mockRejectedValue(new Error('bd auditoría'));
      Noticia.actualizar.mockResolvedValue({ id: 4 });
      const res = crearRes();
      await Controlador.actualizar({ params: { id: 4 }, body: { titulo: 'x' } }, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ exito: true }));
      console.error.mockRestore();
    });
  });

  describe('subida atómica: compensación de Storage', () => {
    const req = () => ({ params: { id: 7 }, file: { originalname: 'a.png', buffer: Buffer.from('x'), mimetype: 'image/png' } });

    it('si bajo bloqueo el límite ya se alcanzó, elimina el objeto subido y responde 400', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 7, tipo: 'boletin' });
      Noticia.contarImagenes.mockResolvedValue(0); // chequeo rápido pasa; otra subida ganó la carrera
      Noticia.agregarImagenConLimite.mockResolvedValue({ limiteAlcanzado: 1 });
      const res = crearRes();
      await Controlador.subirImagen(req(), res);
      expect(Storage.subir).toHaveBeenCalled();
      expect(Storage.eliminar).toHaveBeenCalledWith('noticias', 'clave-a.png');
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('si la noticia desapareció, elimina el objeto y responde 404', async () => {
      Noticia.obtenerPorId.mockResolvedValue({ id: 7, tipo: 'noticia' });
      Noticia.contarImagenes.mockResolvedValue(0);
      Noticia.agregarImagenConLimite.mockResolvedValue({ noExiste: true });
      const res = crearRes();
      await Controlador.subirImagen(req(), res);
      expect(Storage.eliminar).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});

describe('correcciones de la revisión final de la Fase 4', () => {
  const { registrarAccion } = require('../../../auditoria/backend/services/auditoria.service');
  const { validarFechaEvento } = require('../utils/tiposNoticia');
  const reqCrear = (body) => ({ body: { titulo: 'T', ...body }, user: { usuario_id: 1 } });

  beforeEach(() => {
    jest.resetAllMocks();
    registrarAccion.mockResolvedValue(null);
  });

  describe('auditoría de crear', () => {
    it('registra una entrada tras el éxito, sin contenido ni título', async () => {
      Noticia.crear.mockResolvedValue({ id: 12, tipo: 'noticia', publicada: false, contenido: 'privado', titulo: 'T' });
      await Controlador.crear(reqCrear({ contenido: 'privado' }), crearRes());
      expect(registrarAccion).toHaveBeenCalledTimes(1);
      const [, modulo, tabla, id, accion, previos, nuevos] = registrarAccion.mock.calls[0];
      expect([modulo, tabla, id, accion, previos]).toEqual(['portal', 'noticias', 12, 'INSERT', null]);
      expect(nuevos).toEqual({ tipo: 'noticia', publicada: false });
      expect(JSON.stringify(registrarAccion.mock.calls[0].slice(1))).not.toContain('privado');
    });

    it('no registra nada si la validación falla (400)', async () => {
      await Controlador.crear(reqCrear({ tipo: 'zzz' }), crearRes());
      await Controlador.crear({ body: {}, user: { usuario_id: 1 } }, crearRes());
      expect(registrarAccion).not.toHaveBeenCalled();
    });

    it('no registra nada si el modelo falla', async () => {
      Noticia.crear.mockRejectedValue(new Error('bd'));
      await Controlador.crear(reqCrear({}), crearRes());
      expect(registrarAccion).not.toHaveBeenCalled();
    });

    it('la ruta POST / ya no usa auditoriaMiddleware (solo permiso + controlador)', () => {
      jest.resetModules();
      const auditoria = jest.fn(() => () => {});
      jest.doMock('../../../auditoria/backend/middleware/auditoria.middleware', () => ({ auditoriaMiddleware: auditoria }));
      jest.doMock('../middleware/permisos.middleware', () => ({ verificarPermiso: () => () => {} }));
      jest.doMock('../middleware/auth.middleware', () => ({ authenticateJWT: () => {} }));
      jest.doMock('../middleware/upload.noticia.middleware', () => ({ subirImagenNoticia: { single: () => () => {} } }));
      const router = require('../routes/noticia.routes');
      const post = router.stack.find((c) => c.route && c.route.path === '/' && c.route.methods.post);
      expect(post.route.stack).toHaveLength(2);
      expect(auditoria).not.toHaveBeenCalled();
    });
  });

  describe('desempate determinista en los listados', () => {
    let ModeloReal;
    let consultas;
    beforeEach(() => {
      jest.resetModules();
      jest.unmock('../models/noticia.model');
      consultas = [];
      jest.doMock('../config/database', () => ({
        grupo: { query: jest.fn(async (sql, params) => { consultas.push([sql, params]); return { rows: [] }; }) },
      }));
      ModeloReal = require('../models/noticia.model');
    });

    it('el listado público ordena por fecha_publicacion DESC, id DESC', async () => {
      await ModeloReal.obtenerPublicadas(1, 10);
      expect(consultas[0][0]).toMatch(/ORDER BY n\.fecha_publicacion DESC, n\.id DESC/);
    });

    it('el listado del panel ordena por fecha_creacion DESC, id DESC', async () => {
      await ModeloReal.obtenerTodas(1, 10);
      expect(consultas[0][0]).toMatch(/ORDER BY n\.fecha_creacion DESC, n\.id DESC/);
    });
  });

  describe('tope de limite y OFFSET en el listado público', () => {
    it('limite 100 es válido', async () => {
      Noticia.obtenerPublicadas.mockResolvedValue([]);
      Noticia.contarPublicadas.mockResolvedValue(0);
      const res = crearRes();
      await Controlador.listarPublicadas({ query: { limite: '100' } }, res);
      expect(res.status).not.toHaveBeenCalledWith(400);
    });

    it.each([['101'], ['10000']])('limite %p responde 400 con mensaje claro y sin consultar', async (limite) => {
      const res = crearRes();
      await Controlador.listarPublicadas({ query: { limite } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].mensaje).toBe('limite no puede superar 100');
      expect(Noticia.obtenerPublicadas).not.toHaveBeenCalled();
    });

    it('una pagina cuyo OFFSET no cabe en INT4 responde 400', async () => {
      const res = crearRes();
      await Controlador.listarPublicadas({ query: { pagina: '99999999999', limite: '10' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].mensaje).toBe('pagina fuera de rango');
    });

    it('el último OFFSET que cabe en INT4 se acepta', async () => {
      Noticia.obtenerPublicadas.mockResolvedValue([]);
      Noticia.contarPublicadas.mockResolvedValue(0);
      const res = crearRes();
      await Controlador.listarPublicadas({ query: { pagina: '214748365', limite: '10' } }, res); // (214748364)*10 = 2147483640
      expect(res.status).not.toHaveBeenCalledWith(400);
    });
  });

  describe('fecha_evento con espacios', () => {
    it('con espacio interno y zona es válida', () => {
      expect(validarFechaEvento('2026-10-15 18:00:00+00').valor).toBe('2026-10-15T18:00:00.000Z');
    });
    it('con espacios alrededor se recorta antes de parsear', () => {
      expect(validarFechaEvento('  2026-10-15T18:00:00Z  ').valor).toBe('2026-10-15T18:00:00.000Z');
    });
    it('con espacio interno y SIN zona se rechaza', () => {
      expect(validarFechaEvento('2026-10-15 18:00').error).toMatch(/zona/);
      expect(validarFechaEvento('  2026-10-15 18:00  ').error).toMatch(/zona/);
    });
  });
});
