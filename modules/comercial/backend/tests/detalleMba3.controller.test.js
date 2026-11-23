jest.mock('../models/convenio.model');
jest.mock('../services/convenioDetalleMba3.service');
jest.mock('../services/mba3Lectura.service', () => {
  class ErrorMba3NoConfigurado extends Error {}
  return { ErrorMba3NoConfigurado };
});

const Convenio = require('../models/convenio.model');
const Detalle = require('../services/convenioDetalleMba3.service');
const Mba3 = require('../services/mba3Lectura.service');
const Controlador = require('../controllers/detalleMba3.controller');

function crearRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
const req = (extra = {}) => ({ params: { id: '1', productoId: '10' }, query: {}, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  Convenio.obtener.mockResolvedValue({ id: 1, productos: [{ id: 10 }] });
});

describe('ControladorDetalleMba3.obtener', () => {
  it('400 con ids inválidos', async () => {
    const res = crearRes();
    await Controlador.obtener(req({ params: { id: 'x', productoId: '10' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('404 si el convenio no existe o la línea no pertenece al convenio', async () => {
    Convenio.obtener.mockResolvedValueOnce(null);
    let res = crearRes();
    await Controlador.obtener(req(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    res = crearRes();
    await Controlador.obtener(req({ params: { id: '1', productoId: '99' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('422 si faltan códigos MBA3', async () => {
    Detalle.obtenerDetalleLinea.mockResolvedValue({ error: 'El convenio no tiene código de cliente MBA3' });
    const res = crearRes();
    await Controlador.obtener(req(), res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('devuelve el detalle y fuerza existencias con ?refrescar=1', async () => {
    Detalle.obtenerDetalleLinea.mockResolvedValue({ resumen: {} });
    const res = crearRes();
    await Controlador.obtener(req({ query: { refrescar: '1' } }), res);
    expect(Detalle.obtenerDetalleLinea).toHaveBeenCalledWith(expect.anything(), { id: 10 }, { forzarExistencias: true });
    expect(res.json).toHaveBeenCalledWith({ exito: true, datos: { resumen: {} } });
  });

  it('503 si MBA3 no está configurado y 502 si falla la consulta', async () => {
    Detalle.obtenerDetalleLinea.mockRejectedValueOnce(new Mba3.ErrorMba3NoConfigurado());
    let res = crearRes();
    await Controlador.obtener(req(), res);
    expect(res.status).toHaveBeenCalledWith(503);
    Detalle.obtenerDetalleLinea.mockRejectedValueOnce(new Error('x'));
    res = crearRes();
    await Controlador.obtener(req(), res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
