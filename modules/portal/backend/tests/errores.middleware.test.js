const express = require('express');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { manejadorErrores } = require('../middleware/errores.middleware');

function crearApp() {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.post('/eco', (req, res) => res.json({ exito: true, datos: req.body }));
  app.get('/falla', () => {
    throw new Error('detalle interno secreto');
  });
  app.use(manejadorErrores);
  return app;
}

describe('manejador global de errores', () => {
  let espia;
  beforeEach(() => {
    espia = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => espia.mockRestore());

  it('JSON malformado responde 400 con mensaje genérico y sin detalles internos', async () => {
    const r = await request(crearApp())
      .post('/eco')
      .set('Content-Type', 'application/json')
      .send('{"a": ');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ exito: false, mensaje: 'JSON inválido' });
    expect(JSON.stringify(r.body)).not.toMatch(/Unexpected|position|SyntaxError|stack/i);
    expect(espia).not.toHaveBeenCalled();
  });

  it('JSON válido sigue funcionando', async () => {
    const r = await request(crearApp()).post('/eco').send({ a: 1 });
    expect(r.status).toBe(200);
    expect(r.body.datos).toEqual({ a: 1 });
  });

  it('cuerpo demasiado grande responde 413', async () => {
    const r = await request(crearApp())
      .post('/eco')
      .send({ texto: 'x'.repeat(5000) });
    expect(r.status).toBe(413);
    expect(r.body.exito).toBe(false);
    expect(r.body.mensaje).toMatch(/demasiado grande/);
  });

  it('un error no controlado sigue siendo 500 genérico y no filtra el mensaje', async () => {
    const r = await request(crearApp()).get('/falla');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ exito: false, mensaje: 'Error interno del servidor' });
    expect(espia).toHaveBeenCalled();
  });

  it('app.js registra el manejador como último middleware antes de listen', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    expect(fuente).toMatch(/app\.use\(manejadorErrores\)/);
    expect(fuente.indexOf('app.use(manejadorErrores)')).toBeLessThan(fuente.indexOf('app.listen'));
  });
});
