jest.mock('../services/convenioDetalleMba3.service');
jest.mock('../models/resumenMba3.model');

const Detalle = require('../services/convenioDetalleMba3.service');
const Modelo = require('../models/resumenMba3.model');
const Servicio = require('../services/resumenConveniosMba3.service');

const LINEA = (id) => ({ linea_id: id, producto_codigo: `P${id}`, cliente_codigo: 'C1', fecha_inicio: '2026-01-01', cantidad_periodica: 10, periodo: 'mensual' });

beforeEach(() => {
  jest.clearAllMocks();
  Modelo.marcarInicio.mockResolvedValue();
  Modelo.marcarFin.mockResolvedValue();
  Modelo.guardar.mockResolvedValue();
  Modelo.obtenerEstado.mockResolvedValue({ ultima_ejecucion: null, ultima_ejecucion_ok: null, ultimo_resultado: null });
});

describe('recalcular', () => {
  it('guarda la foto de cada línea con la última fecha de OC y de factura', async () => {
    Modelo.lineasAutorizadas.mockResolvedValue([LINEA(1)]);
    Detalle.obtenerDetalleLinea.mockResolvedValue({
      resumen: { comprado: 100, vendido: 40, existencia: 60, ordenes_compra: 2, facturas: 2 },
      ordenes_compra: [{ fecha: '2026-02-01' }, { fecha: '2026-03-01' }],
      facturas: [{ fecha: '2026-04-01' }, { fecha: '2026-03-15' }],
    });
    await Servicio.recalcular();
    expect(Modelo.guardar).toHaveBeenCalledWith(1, expect.objectContaining({
      comprado: 100, vendido: 40, existencia: 60, ultima_oc: '2026-03-01', ultima_factura: '2026-04-01',
    }));
    expect(Modelo.marcarFin).toHaveBeenCalledWith({ ok: true, resultado: expect.objectContaining({ lineas: 1, con_error: 0 }) });
    // Existencias frescas solo en la primera línea.
    expect(Detalle.obtenerDetalleLinea).toHaveBeenCalledWith(expect.anything(), expect.anything(), { forzarExistencias: true });
  });

  it('una línea sin códigos queda con error y las demás se calculan; la corrida no es ok', async () => {
    Modelo.lineasAutorizadas.mockResolvedValue([LINEA(1), LINEA(2)]);
    Detalle.obtenerDetalleLinea
      .mockResolvedValueOnce({ error: 'sin cliente' })
      .mockResolvedValueOnce({ resumen: { comprado: 1, vendido: 0, existencia: 1, ordenes_compra: 1, facturas: 0 }, ordenes_compra: [], facturas: [] });
    await Servicio.recalcular();
    expect(Modelo.guardar).toHaveBeenCalledWith(1, { error: 'sin cliente' });
    expect(Modelo.guardar).toHaveBeenCalledWith(2, expect.objectContaining({ comprado: 1 }));
    expect(Modelo.marcarFin).toHaveBeenCalledWith({ ok: false, resultado: expect.objectContaining({ con_error: 1 }) });
  });

  it('si MBA3 falla en una línea conserva la foto anterior (no guarda ceros) y sigue', async () => {
    Modelo.lineasAutorizadas.mockResolvedValue([LINEA(1), LINEA(2)]);
    Detalle.obtenerDetalleLinea
      .mockRejectedValueOnce(new Error('MBA3 caído'))
      .mockResolvedValueOnce({ resumen: { comprado: 0, vendido: 0, existencia: 0, ordenes_compra: 0, facturas: 0 }, ordenes_compra: [], facturas: [] });
    await Servicio.recalcular();
    expect(Modelo.guardar).toHaveBeenCalledTimes(1);
    expect(Modelo.guardar).toHaveBeenCalledWith(2, expect.anything());
  });

  it('no arranca una segunda corrida mientras hay una en curso', async () => {
    let liberar;
    Modelo.lineasAutorizadas.mockResolvedValue([LINEA(1)]);
    Detalle.obtenerDetalleLinea.mockImplementation(() => new Promise((r) => { liberar = () => r({ error: 'x' }); }));
    const primera = Servicio.recalcular();
    await new Promise((r) => setImmediate(r));
    expect((await Servicio.estado()).en_curso).toBe(true);
    await expect(Servicio.recalcular()).resolves.toEqual({ yaEnCurso: true });
    liberar();
    await primera;
    expect((await Servicio.estado()).en_curso).toBe(false);
  });
});
