jest.mock('../services/mba3Lectura.service');

const Mba3 = require('../services/mba3Lectura.service');
const Servicio = require('../services/convenioDetalleMba3.service');

const CONVENIO = { cliente_codigo: 'C04649-R0001', fecha_inicio: '2026-01-07' };
const LINEA = { producto_codigo: 'R-033-05-00079', cantidad_periodica: 80, periodo: 'mensual' };

function simular({ recepciones = [], ventas = [], almacenes = [], inventarios = {} } = {}) {
  Mba3.paginarTodo.mockImplementation(async (endpoint, body) => {
    if (endpoint === 'recepciones-almacen-producto') return { data: recepciones, advertencias: [] };
    if (endpoint === 'ventas-cliente-producto') return { data: ventas, advertencias: [] };
    if (endpoint === 'almacenes') return { data: almacenes, advertencias: [] };
    if (endpoint === 'inventarios') {
      const r = inventarios[body.almacen];
      if (r instanceof Error) throw r;
      return { data: r || [], advertencias: [] };
    }
    throw new Error(`endpoint inesperado ${endpoint}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  Servicio._resetCacheParaTests();
});

describe('obtenerDetalleLinea', () => {
  it('calcula comprado, vendido, saldo teórico y diferencia contra la existencia', async () => {
    simular({
      recepciones: [
        { TRANS_DATE: '2026-02-05T00:00:00', CANTIDAD: 120, IDENT_LINEA_OC: 11, Anulada: false },
        { TRANS_DATE: '2026-03-05T00:00:00', CANTIDAD: 120, IDENT_LINEA_OC: 12, Anulada: false },
        { TRANS_DATE: '2026-03-06T00:00:00', CANTIDAD: 999, IDENT_LINEA_OC: 13, Anulada: true },
      ],
      ventas: [
        { FECHA_FACTURA: '2026-02-16', CANTIDAD: 100, DOCUMENTO_REL: 'FE-1' },
        { FECHA_FACTURA: '2026-02-20', CANTIDAD: 15, DOCUMENTO_REL: 'FE-2' },
        { FECHA_FACTURA: '2026-02-25', CANTIDAD: -5, DOCUMENTO_REL: 'NC-3' },
      ],
      almacenes: [{ ALMACEN: 'APU', NOM_ALMACEN: 'Puebla' }, { ALMACEN: 'TRN' }, { ALMACEN: 'RCP' }],
      inventarios: { APU: [{ PRODUCTO_CORP: 'R-033-05-00079-R0001', EXISTENCIA: 109 }, { PRODUCTO_CORP: 'OTRO-R0001', EXISTENCIA: 3 }] },
    });
    const d = await Servicio.obtenerDetalleLinea(CONVENIO, LINEA);
    expect(d.resumen).toMatchObject({ comprado: 240, vendido: 110, saldo_teorico: 130, existencia: 109, diferencia: -21 });
    expect(d.ordenes_compra).toHaveLength(2);
    expect(d.ordenes_compra[0].fecha).toBe('2026-03-05'); // más reciente primero
    expect(d.facturas).toHaveLength(3);
  });

  it('consulta con cliente sin sufijo de empresa y desde la fecha del convenio', async () => {
    simular();
    await Servicio.obtenerDetalleLinea(CONVENIO, LINEA);
    expect(Mba3.paginarTodo).toHaveBeenCalledWith(
      'ventas-cliente-producto',
      expect.objectContaining({ CLIENTE: 'C04649', PRODUCTO: 'R-033-05-00079', FECHA_INICIAL: '2026-01-07' }),
      expect.anything(),
    );
    expect(Mba3.paginarTodo).toHaveBeenCalledWith(
      'recepciones-almacen-producto',
      expect.objectContaining({ FECHA_DESDE: '2026-01-07', PRODUCTO: 'R-033-05-00079' }),
      expect.anything(),
    );
  });

  it('no suma los almacenes de tránsito ni proveedor', async () => {
    simular({
      almacenes: [{ ALMACEN: 'APU' }, { ALMACEN: 'TRN' }, { ALMACEN: 'RCP' }],
      inventarios: {
        APU: [{ PRODUCTO_CORP: 'R-033-05-00079-R0001', EXISTENCIA: 10 }],
        TRN: [{ PRODUCTO_CORP: 'R-033-05-00079-R0001', EXISTENCIA: 500 }],
        RCP: [{ PRODUCTO_CORP: 'R-033-05-00079-R0001', EXISTENCIA: 700 }],
      },
    });
    const d = await Servicio.obtenerDetalleLinea(CONVENIO, LINEA);
    expect(d.existencias.total).toBe(10);
    expect(Mba3.paginarTodo).not.toHaveBeenCalledWith('inventarios', expect.objectContaining({ almacen: 'TRN' }), expect.anything());
  });

  it('un almacén que falla no tumba el detalle y queda como advertencia', async () => {
    simular({
      almacenes: [{ ALMACEN: 'APU' }, { ALMACEN: 'AQU' }],
      inventarios: { APU: [{ PRODUCTO_CORP: 'R-033-05-00079-R0001', EXISTENCIA: 4 }], AQU: new Error('boom') },
    });
    const d = await Servicio.obtenerDetalleLinea(CONVENIO, LINEA);
    expect(d.resumen.existencia).toBe(4);
    expect(d.advertencias.join(' ')).toMatch(/AQU/);
  });

  it('reutiliza la caché de existencias entre líneas', async () => {
    simular({ almacenes: [{ ALMACEN: 'APU' }], inventarios: { APU: [] } });
    await Servicio.obtenerDetalleLinea(CONVENIO, LINEA);
    await Servicio.obtenerDetalleLinea(CONVENIO, { ...LINEA, producto_codigo: 'X-1' });
    const llamadas = Mba3.paginarTodo.mock.calls.filter(([e]) => e === 'almacenes');
    expect(llamadas).toHaveLength(1);
  });

  it('devuelve error si falta código de producto, de cliente o fecha', async () => {
    simular();
    expect((await Servicio.obtenerDetalleLinea(CONVENIO, { ...LINEA, producto_codigo: null })).error).toMatch(/producto/);
    expect((await Servicio.obtenerDetalleLinea({ ...CONVENIO, cliente_codigo: '' }, LINEA)).error).toMatch(/cliente/);
    expect((await Servicio.obtenerDetalleLinea({ ...CONVENIO, fecha_inicio: null }, LINEA)).error).toMatch(/fecha/);
  });
});
