const Storage = require('../services/storage.service');

function resp(status, cuerpo) {
  return { ok: status >= 200 && status < 300, status, text: async () => (cuerpo === undefined ? '' : JSON.stringify(cuerpo)) };
}

describe('storage.service', () => {
  beforeEach(() => {
    process.env.SUPABASE_STORAGE_URL = 'http://storage:5000';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-secreta-servicio';
    global.fetch = jest.fn();
  });
  afterEach(() => {
    delete global.fetch;
  });

  it('subir envia headers y URL con segmentos codificados', async () => {
    fetch.mockResolvedValueOnce(resp(200, { Key: 'x' }));
    const buf = Buffer.from('abc');
    const r = await Storage.subir('noticias', 'carpeta/mi foto#1.jpg', buf, 'image/jpeg');
    expect(r).toEqual({ clave: 'carpeta/mi foto#1.jpg' });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('http://storage:5000/object/noticias/carpeta/mi%20foto%231.jpg');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer clave-secreta-servicio');
    expect(opts.headers['Content-Type']).toBe('image/jpeg');
    expect(opts.headers['x-upsert']).toBe('false');
    expect(opts.body).toBe(buf);
  });

  it('urlFirmada antepone /storage/v1 y agrega download', async () => {
    fetch.mockResolvedValueOnce(resp(200, { signedURL: '/object/sign/rh-recibos/a.pdf?token=T' }));
    const url = await Storage.urlFirmada('rh-recibos', 'a.pdf', { descargar: 'Recibo ñ.pdf' });
    expect(url).toBe('/storage/v1/object/sign/rh-recibos/a.pdf?token=T&download=Recibo%20%C3%B1.pdf');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ expiresIn: 300 });
  });

  it('urlPublica es sincrona y relativa', () => {
    expect(Storage.urlPublica('noticias', 'a b.jpg')).toBe('/storage/v1/object/public/noticias/a%20b.jpg');
  });

  it('eliminar trata 404 como exito', async () => {
    fetch.mockResolvedValueOnce(resp(404, { message: 'not found' }));
    await expect(Storage.eliminar('noticias', 'x.jpg')).resolves.toBeUndefined();
  });

  it('eliminar propaga otros errores con status', async () => {
    fetch.mockResolvedValueOnce(resp(500, { message: 'boom' }));
    await expect(Storage.eliminar('noticias', 'x.jpg')).rejects.toMatchObject({ status: 500 });
  });

  it('existe devuelve true/false', async () => {
    fetch.mockResolvedValueOnce(resp(200));
    expect(await Storage.existe('noticias', 'x.jpg')).toBe(true);
    fetch.mockResolvedValueOnce(resp(404));
    expect(await Storage.existe('noticias', 'y.jpg')).toBe(false);
  });

  it('asegurarBuckets es idempotente ante 409', async () => {
    fetch.mockImplementation(async (url, opts) =>
      opts.method === 'POST' ? resp(409, { message: 'The resource already exists' }) : resp(200, { public: false }),
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await Storage.asegurarBuckets();
    expect(r.existentes).toHaveLength(4);
    expect(r.creados).toHaveLength(0);
    warn.mockRestore();
  });

  it('asegurarBuckets crea con la config esperada', async () => {
    fetch.mockResolvedValue(resp(200, {}));
    await Storage.asegurarBuckets();
    const cuerpos = fetch.mock.calls.map((c) => JSON.parse(c[1].body));
    const noticias = cuerpos.find((c) => c.name === 'noticias');
    expect(noticias).toMatchObject({ public: true, file_size_limit: 5 * 1024 * 1024 });
    expect(cuerpos.find((c) => c.name === 'rh-recibos')).toMatchObject({ public: false, allowed_mime_types: ['application/pdf'] });
  });

  it('claveSegura produce ASCII unico sin acentos ni espacios', () => {
    const a = Storage.claveSegura('Fotografía Año Nuevo (1).JPG');
    expect(a).toMatch(/^\d+_[0-9a-f]{8}_Fotografia_Ano_Nuevo__1_\.jpg$/);
    expect(Storage.claveSegura('Fotografía Año Nuevo (1).JPG')).not.toBe(a);
    expect(Storage.claveSegura('sin_ext')).toMatch(/_sin_ext$/);
    expect(Storage.claveSegura('a.t$x')).toMatch(/_a\.tx$/);
  });

  it('errores de red no filtran la service key', async () => {
    fetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED Bearer clave-secreta-servicio'));
    const e = await Storage.eliminar('noticias', 'x').catch((x) => x);
    expect(e.status).toBe(503);
    expect(e.message).not.toContain('clave-secreta-servicio');
  });

  it('sin service key falla con 500', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(Storage.eliminar('noticias', 'x')).rejects.toMatchObject({ status: 500 });
  });
});
