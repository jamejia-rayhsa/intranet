// Pruebas del script de migración única (scripts/comercial/importar-convenios-historicos.js).
// Mismo patrón que modules/portal/backend/tests/migrar-usuarios-supabase.test.js: funciones puras
// probadas directo, orquestación (`ejecutar`) con un `convenioRepo`/`usuarioRepo` inyectados (sin
// Postgres real: eso se verificó a mano, ver code-notes.md "Convenios de compra Fase 3").
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  parseCSV,
  construirIndiceColumnas,
  parseFechaDDMMAAAA,
  fechaDeSerialExcelConRango,
  parseMonto,
  parseConsumo,
  esLineaCancelada,
  esFilaVacia,
  procesarFila,
  agruparFilas,
  calcularEstatusYVigencia,
  construirConvenio,
  construirCandidatos,
  parsearArgs,
  resolverCreadoPorId,
  ejecutar,
} = require('../../../../scripts/comercial/importar-convenios-historicos');

describe('parseCSV', () => {
  it('separa filas y columnas simples', () => {
    const r = parseCSV('a,b,c\n1,2,3\n');
    expect(r).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('respeta comas dentro de comillas (miles) sin desalinear columnas', () => {
    const r = parseCSV('a,b,c\n1," 1,071 ",3\n');
    expect(r[1]).toEqual(['1', ' 1,071 ', '3']);
  });

  it('soporta saltos de línea dentro de un campo entrecomillado (ej. COMENTARIOS multilínea)', () => {
    const r = parseCSV('a,b\n1,"linea uno\nlinea dos"\n2,x\n');
    expect(r).toEqual([['a', 'b'], ['1', 'linea uno\nlinea dos'], ['2', 'x']]);
  });

  it('soporta comillas dobles escapadas', () => {
    const r = parseCSV('a\n"dijo ""hola"""\n');
    expect(r[1]).toEqual(['dijo "hola"']);
  });
});

describe('construirIndiceColumnas', () => {
  it('mapea nombre de columna (trim) -> índice', () => {
    const header = [
      'FOLIOS ', 'MARCA', 'MODELO', 'Fecha', 'CLIENTE', 'EMPAQUE', 'U.M', 'VENDEDOR', 'AUTORIZACION',
      'CONSUMO', 'COMENTARIOS', '$ DE COMPRA', '$ DE VENTA', 'FACTOR', 'VIGENCIA', 'OBSERVACIONES', '',
      'Clave Cliente', 'Clave Vendedor', 'Codigo Producto', 'Clave MBA3',
    ];
    const idx = construirIndiceColumnas(header);
    expect(idx.FOLIOS).toBe(0);
    expect(idx.CLIENTE).toBe(4);
    expect(idx.VENDEDOR).toBe(7);
  });

  it('falla con un mensaje claro si falta una columna obligatoria', () => {
    expect(() => construirIndiceColumnas(['FOLIOS'])).toThrow(/CLIENTE/);
  });
});

describe('parseFechaDDMMAAAA', () => {
  it('parsea DD/MM/AAAA normal', () => {
    expect(parseFechaDDMMAAAA('09/12/2025')).toEqual({ valor: '2025-12-09' });
  });

  it('repara un año de 3 dígitos cuando hay una única reparación válida (folio 139/140)', () => {
    expect(parseFechaDDMMAAAA('20/08/226')).toEqual({ valor: '2026-08-20' });
  });

  it('no repara un año de 3 dígitos si no puede hacerlo con confianza', () => {
    const r = parseFechaDDMMAAAA('20/08/999');
    expect(r.valor).toBeUndefined();
    expect(r.error).toMatch(/no se pudo reparar/);
  });

  it('rechaza mes o día fuera de rango', () => {
    expect(parseFechaDDMMAAAA('31/02/2026').error).toMatch(/día inválido/);
    expect(parseFechaDDMMAAAA('09/13/2025').error).toMatch(/mes inválido/);
  });

  it('rechaza vacío y formato no reconocido', () => {
    expect(parseFechaDDMMAAAA('').error).toMatch(/vacía/);
    expect(parseFechaDDMMAAAA('No vigente').error).toMatch(/no reconocido/);
  });
});

describe('fechaDeSerialExcelConRango', () => {
  it('convierte 46112 (folio 61) a 2026-03-31', () => {
    expect(fechaDeSerialExcelConRango(46112)).toBe('2026-03-31');
  });

  it('rechaza un serial que da un año fuera de rango (no se usa con confianza)', () => {
    expect(fechaDeSerialExcelConRango(1)).toBeNull(); // 1900
    expect(fechaDeSerialExcelConRango(60)).toBeNull(); // 29-feb-1900 no existió
  });
});

describe('parseMonto', () => {
  it('quita $ y espacios', () => {
    expect(parseMonto(' $7.06 ')).toEqual({ valor: 7.06 });
  });
  it('quita comas de miles', () => {
    expect(parseMonto(' $1,231.50 ')).toEqual({ valor: 1231.5 });
  });
  it('un guion o vacío da NULL', () => {
    expect(parseMonto(' -   ')).toEqual({ valor: null });
    expect(parseMonto('')).toEqual({ valor: null });
  });
  it('texto no numérico da NULL con advertencia', () => {
    const r = parseMonto('N/A');
    expect(r.valor).toBeNull();
    expect(r.advertencia).toMatch(/no se pudo interpretar/);
  });
});

describe('parseConsumo', () => {
  it('ignora el dígito pegado a una talla ("T8 144" -> 144, no 8)', () => {
    expect(parseConsumo('T8 144')).toEqual({ cantidad: 144, periodo: 'mensual' });
  });
  it('en un rango usa el número menor (primero)', () => {
    expect(parseConsumo('100-120 PR')).toEqual({ cantidad: 100, periodo: 'mensual' });
    expect(parseConsumo('20 A 30 PR')).toEqual({ cantidad: 20, periodo: 'mensual' });
  });
  it('detecta BIMESTRAL y TRIMESTRAL', () => {
    expect(parseConsumo('10 BIMESTRAL')).toEqual({ cantidad: 10, periodo: 'bimestral' });
    expect(parseConsumo('5 TRIMESTRAL')).toEqual({ cantidad: 5, periodo: 'trimestral' });
  });
  it('sin ningún número da cantidad 0 y advertencia', () => {
    const r = parseConsumo('');
    expect(r.cantidad).toBe(0);
    expect(r.periodo).toBe('mensual');
    expect(r.advertencia).toMatch(/vacío/);
  });
  it('texto sin dígitos da 0 y advertencia (no revienta)', () => {
    const r = parseConsumo('Falta TC');
    expect(r.cantidad).toBe(0);
    expect(r.advertencia).toMatch(/sin ningún número/);
  });

  it('R-P3-5 (folio 91, "20-30 meses"): no asume periodo mensual en silencio cuando describe una duración', () => {
    const r = parseConsumo('20-30 meses');
    expect(r.cantidad).toBe(20);
    expect(r.periodo).toBe('mensual');
    expect(r.advertencia).toMatch(/describe una duración en meses/);
  });

  it('"MES"/"MESES" dentro de BIMESTRAL/TRIMESTRAL no dispara la advertencia de duración', () => {
    expect(parseConsumo('10 BIMESTRAL').advertencia).toBeUndefined();
    expect(parseConsumo('5 TRIMESTRAL').advertencia).toBeUndefined();
  });

  it('R-P3-10: coma seguida de 1-2 dígitos se lee como decimal, no como miles', () => {
    expect(parseConsumo('1,5 PZ')).toEqual({ cantidad: 1.5, periodo: 'mensual' });
  });

  it('R-P3-10: coma seguida de exactamente 3 dígitos sigue leyéndose como miles', () => {
    expect(parseConsumo('1,200 PZ')).toEqual({ cantidad: 1200, periodo: 'mensual' });
  });
});

describe('esLineaCancelada', () => {
  it('detecta CANCELADO en Codigo Producto o Clave MBA3, sin distinguir mayúsculas', () => {
    expect(esLineaCancelada('cancelado', 'x')).toBe(true);
    expect(esLineaCancelada('x', 'CANCELADO')).toBe(true);
    expect(esLineaCancelada('R-010-05-00001', 'ANSELL 74-500 T-9')).toBe(false);
  });
});

describe('calcularEstatusYVigencia', () => {
  const base = { folioOrigen: '1', clienteNombre: 'Cliente X' };
  it("VIGENCIA='No vigente' -> cancelado, sin importar AUTORIZACION", () => {
    const r = calcularEstatusYVigencia({ vigenciaRaw: 'No vigente', observacionesRaw: 'Por incremento en precios', autorizacionRaw: 'AMJ', ...base });
    expect(r.estatus).toBe('cancelado');
    expect(r.vigenteHasta).toBeNull();
  });

  it("OBSERVACIONES='Ya no comprar' -> cancelado aunque AUTORIZACION venga llena (folio 37 real)", () => {
    const r = calcularEstatusYVigencia({ vigenciaRaw: '', observacionesRaw: 'Ya no comprar', autorizacionRaw: 'AMJ', ...base });
    expect(r.estatus).toBe('cancelado');
  });

  it('AUTORIZACION vacía -> cancelado con advertencia', () => {
    const r = calcularEstatusYVigencia({ vigenciaRaw: '', observacionesRaw: '', autorizacionRaw: '', ...base });
    expect(r.estatus).toBe('cancelado');
    expect(r.advertencias[0]).toMatch(/AUTORIZACION vacía/);
  });

  it('VIGENCIA vacía y sin señal de cancelación -> autorizado, abierta', () => {
    const r = calcularEstatusYVigencia({ vigenciaRaw: '', observacionesRaw: 'Si comprar', autorizacionRaw: 'SIA', ...base });
    expect(r.estatus).toBe('autorizado');
    expect(r.vigenteHasta).toBeNull();
  });

  it('VIGENCIA con fecha real -> autorizado con esa vigente_hasta', () => {
    const r = calcularEstatusYVigencia({ vigenciaRaw: '31/03/2026', observacionesRaw: '', autorizacionRaw: 'AMJ', ...base });
    expect(r.estatus).toBe('autorizado');
    expect(r.vigenteHasta).toBe('2026-03-31');
  });

  it('VIGENCIA serial de Excel (folio 61) -> autorizado con advertencia', () => {
    const r = calcularEstatusYVigencia({ vigenciaRaw: '46112', observacionesRaw: '', autorizacionRaw: 'SIA', ...base });
    expect(r.estatus).toBe('autorizado');
    expect(r.vigenteHasta).toBe('2026-03-31');
    expect(r.advertencias[0]).toMatch(/serie de fecha de Excel/);
  });

  it('VIGENCIA texto no reconocido (folio 90, "No sale en precio") -> cancelado, sin inventar vigente_hasta (decisión del humano 2026-10-23)', () => {
    const r = calcularEstatusYVigencia({ vigenciaRaw: 'No sale en precio', observacionesRaw: '19/08/2026', autorizacionRaw: 'SIA', ...base });
    expect(r.estatus).toBe('cancelado');
    expect(r.vigenteHasta).toBeNull();
    expect(r.advertencias[0]).toMatch(/no es una fecha válida ni un serial de Excel reconocible/);
    expect(r.notaObservacion).toMatch(/No sale en precio/);
  });

  it('VIGENCIA texto no reconocido genérico (generalización del folio 90) -> cancelado también', () => {
    const r = calcularEstatusYVigencia({ vigenciaRaw: 'algo raro', observacionesRaw: '', autorizacionRaw: 'SIA', ...base });
    expect(r.estatus).toBe('cancelado');
    expect(r.vigenteHasta).toBeNull();
    expect(r.advertencias[0]).toMatch(/no es una fecha válida ni un serial de Excel reconocible/);
  });

  it('VIGENCIA numérica pero no interpretable como serial de Excel -> cae a la regla general (cancelado)', () => {
    const r = calcularEstatusYVigencia({ vigenciaRaw: '999999', observacionesRaw: '', autorizacionRaw: 'SIA', ...base });
    expect(r.estatus).toBe('cancelado');
    expect(r.vigenteHasta).toBeNull();
  });
});

describe('procesarFila + esFilaVacia (fila de ejemplo real)', () => {
  const header = [
    'FOLIOS', 'MARCA', 'MODELO', 'Fecha', 'CLIENTE', 'EMPAQUE', 'U.M', 'VENDEDOR', 'AUTORIZACION',
    'CONSUMO', 'COMENTARIOS', '$ DE COMPRA', '$ DE VENTA', 'FACTOR', 'VIGENCIA', 'OBSERVACIONES', '',
    'Clave Cliente', 'Clave Vendedor', 'Codigo Producto', 'Clave MBA3',
  ];
  const idx = construirIndiceColumnas(header);

  it('una fila completamente vacía se detecta como tal', () => {
    expect(esFilaVacia(new Array(21).fill(''), idx)).toBe(true);
  });

  it('procesa una fila real y arma todos los campos', () => {
    const fila = [
      '0', 'ANSELL', '74-500 T9', '09/12/2025', 'Granjas carrol de mexico ', '24', 'PZ ',
      'Rosario Toxqui ', 'AMJ', '48', '', ' $7.06 ', ' $8.27 ', ' 0.853 ', 'No vigente ',
      'Por incremento en precios ', '', 'C04141', 'PUE03', 'R-010-05-00541', 'ANSELL 74-500 T-9',
    ];
    const r = procesarFila(fila, idx, 2);
    expect(r.ok).toBe(true);
    expect(r.datos.fechaInicioISO).toBe('2025-12-09');
    expect(r.datos.cantidadPeriodica).toBe(48);
    expect(r.datos.precioCompra).toBe(7.06);
    expect(r.datos.precioVenta).toBe(8.27);
    expect(r.datos.factor).toBe(0.853);
    expect(r.datos.cancelada).toBe(false);
  });

  it('una Fecha irreparable da fila de error, no revienta', () => {
    const fila = [
      '1', 'X', 'Y', '31/02/2026', 'Cliente', '1', 'PZ', 'Vend', 'AMJ', '1', '', '', '', '', '', '',
      '', '', '', 'COD', 'DESC',
    ];
    const r = procesarFila(fila, idx, 3);
    expect(r.error).toMatch(/Fecha inválida/);
  });
});

describe('procesarFila: inventario histórico (columna "16.10.26", decisión del humano 2026-10-23)', () => {
  const header = [
    'FOLIOS', 'MARCA', 'MODELO', 'Fecha', 'CLIENTE', 'EMPAQUE', 'U.M', 'VENDEDOR', 'AUTORIZACION',
    'CONSUMO', 'COMENTARIOS', '$ DE COMPRA', '$ DE VENTA', 'FACTOR', 'VIGENCIA', 'OBSERVACIONES', '',
    'Clave Cliente', 'Clave Vendedor', 'Codigo Producto', 'Clave MBA3', '16.10.26',
  ];
  const idx = construirIndiceColumnas(header);

  function fila(invHistorico) {
    return [
      '12', 'ANSELL', '93-260 T7', '09/12/2025', 'Cliente X', '24', 'PZ', 'Vend', 'AMJ', '48', '',
      '', '', '', 'No vigente', '', '', 'C1', 'V1', 'COD', 'DESC', invHistorico,
    ];
  }

  it('toma el valor numérico de la columna (ej. folio 12 = 155)', () => {
    const r = procesarFila(fila(' 155 '), idx, 2);
    expect(r.datos.inventarioHistorico).toBe(155);
  });

  it('respeta comas de miles (ej. "1,071")', () => {
    const r = procesarFila(fila(' 1,071 '), idx, 2);
    expect(r.datos.inventarioHistorico).toBe(1071);
  });

  it('un guion (sin dato real) da null, igual que los campos de monto', () => {
    const r = procesarFila(fila(' -   '), idx, 2);
    expect(r.datos.inventarioHistorico).toBeNull();
  });

  it('columna ausente en el CSV (no viene en el header) no revienta: null sin advertencia', () => {
    const headerSinInv = header.slice(0, -1);
    const idxSinInv = construirIndiceColumnas(headerSinInv);
    const filaSinInv = fila('').slice(0, -1);
    const r = procesarFila(filaSinInv, idxSinInv, 2);
    expect(r.datos.inventarioHistorico).toBeNull();
  });
});

describe('agruparFilas + construirConvenio (integración de funciones puras)', () => {
  function filaBase(extra) {
    return {
      folioOrigen: '27',
      clienteNombreRaw: 'Polaquimia SA DE CV ',
      clienteCodigoRaw: 'C00776',
      vendedorNombreRaw: 'Lizethe Maher ',
      vendedorCodigoRaw: 'MEX10',
      fechaInicioISO: '2026-01-14',
      autorizacionRaw: 'ABI',
      vigenciaRaw: 'No vigente',
      observacionesRaw: 'Por incremento en precios',
      comentariosRaw: '',
      cancelada: false,
      productoCodigo: 'R-010-05-00364',
      productoDescripcion: 'ANSELL 39-122-08',
      empaque: 72,
      unidadMedida: 'PR',
      cantidadPeriodica: 144,
      periodo: 'mensual',
      precioCompra: 4.15,
      precioVenta: 4.98,
      factor: 0.833,
      advertencias: [],
      ...extra,
    };
  }

  it('agrupa 2 líneas del mismo folio+cliente (tallas T8/T9) en 1 convenio con 2 líneas', () => {
    const filas = [
      filaBase({}),
      filaBase({ productoCodigo: 'R-010-05-00237', productoDescripcion: 'ANSELL 39-122-09', cantidadPeriodica: 123 }),
    ];
    const grupos = agruparFilas(filas);
    expect(grupos).toHaveLength(1);
    const candidato = construirConvenio(grupos[0].filas, grupos[0].advertenciaSplit);
    expect(candidato.omitido).toBe(false);
    expect(candidato.lineas).toHaveLength(2);
    expect(candidato.cabecera.estatus).toBe('cancelado'); // "No vigente"
    expect(candidato.cabecera.cliente_nombre).toBe('Polaquimia SA DE CV');
  });

  it('separa un mismo folio con clientes distintos en convenios independientes (folio 60/124)', () => {
    const filas = [
      filaBase({ folioOrigen: '60', clienteNombreRaw: 'NUTEK', clienteCodigoRaw: 'C05619', vigenciaRaw: 'No vigente' }),
      filaBase({ folioOrigen: '60', clienteNombreRaw: 'AVES LIBRES', clienteCodigoRaw: 'C05618', vigenciaRaw: 'No vigente' }),
    ];
    const grupos = agruparFilas(filas);
    expect(grupos).toHaveLength(2);
    const candidatos = construirCandidatos(filas);
    expect(candidatos.map((c) => c.cabecera.folio_origen)).toEqual(['60', '60']);
    expect(new Set(candidatos.map((c) => c.cabecera.cliente_nombre)).size).toBe(2);
  });

  it('excluye líneas CANCELADO y omite el convenio si no queda ninguna línea válida (folio 130)', () => {
    const filas = [filaBase({ cancelada: true, productoCodigo: 'CANCELADO', productoDescripcion: 'CANCELADO' })];
    const candidato = construirConvenio(filas, null);
    expect(candidato.omitido).toBe(true);
    expect(candidato.motivo).toMatch(/Sin líneas válidas/);
  });

  it('usa el código como nombre cuando falta el nombre de cliente/vendedor, con advertencia', () => {
    const filas = [filaBase({ clienteNombreRaw: '', vendedorNombreRaw: '' })];
    const candidato = construirConvenio(filas, null);
    expect(candidato.omitido).toBe(false);
    expect(candidato.cabecera.cliente_nombre).toBe('C00776');
    expect(candidato.cabecera.vendedor_nombre).toBe('MEX10');
    expect(candidato.advertencias.some((a) => a.includes('sin nombre de cliente'))).toBe(true);
    expect(candidato.advertencias.some((a) => a.includes('sin nombre de vendedor'))).toBe(true);
  });

  it('omite el convenio si no hay nombre NI código de cliente', () => {
    const filas = [filaBase({ clienteNombreRaw: '', clienteCodigoRaw: '' })];
    const candidato = construirConvenio(filas, null);
    expect(candidato.omitido).toBe(true);
    expect(candidato.motivo).toMatch(/Sin nombre ni código de cliente/);
  });

  it('concatena COMENTARIOS y OBSERVACIONES en el único campo observaciones', () => {
    const filas = [filaBase({ comentariosRaw: 'TC FIJO 17.45', vigenciaRaw: '', observacionesRaw: 'Si comprar' })];
    const candidato = construirConvenio(filas, null);
    expect(candidato.cabecera.observaciones).toMatch(/Comentarios: TC FIJO 17.45/);
    expect(candidato.cabecera.observaciones).toMatch(/Observaciones: Si comprar/);
  });

  it('decisión del humano 2026-10-23: inventario histórico de 1 sola línea se agrega simple a observaciones', () => {
    const filas = [filaBase({ vigenciaRaw: '', observacionesRaw: '', inventarioHistorico: 155 })];
    const candidato = construirConvenio(filas, null);
    expect(candidato.cabecera.observaciones).toMatch(/Inv\. al día \(histórico\): 155/);
  });

  it('inventario histórico de 2+ líneas se identifica por producto (es un dato por línea, no por convenio)', () => {
    const filas = [
      filaBase({ vigenciaRaw: '', observacionesRaw: '', inventarioHistorico: 265 }),
      filaBase({
        productoCodigo: 'R-010-05-00237', productoDescripcion: 'ANSELL 39-122-09',
        vigenciaRaw: '', observacionesRaw: '', inventarioHistorico: 123,
      }),
    ];
    const candidato = construirConvenio(filas, null);
    expect(candidato.cabecera.observaciones).toMatch(/Inv\. al día \(histórico\) por producto: R-010-05-00364=265; R-010-05-00237=123/);
  });

  it('sin dato de inventario histórico en ninguna línea, no se agrega nada a observaciones', () => {
    const filas = [filaBase({ vigenciaRaw: '', observacionesRaw: '' })];
    const candidato = construirConvenio(filas, null);
    expect(candidato.cabecera.observaciones).toBeNull();
  });

  it('divide por VENDEDOR dentro de un mismo folio+cliente si llega a cambiar, con advertencia', () => {
    const filas = [
      filaBase({ vendedorNombreRaw: 'Juan Perez' }),
      filaBase({ vendedorNombreRaw: 'Maria Lopez', productoCodigo: 'OTRO' }),
    ];
    const grupos = agruparFilas(filas);
    expect(grupos).toHaveLength(2);
    expect(grupos.every((g) => g.advertenciaSplit)).toBe(true);
  });
});

describe('parsearArgs', () => {
  it('exige exactamente uno de los dos parámetros de creado-por', () => {
    expect(() => parsearArgs([])).toThrow(/Falta un parámetro obligatorio/);
    expect(() => parsearArgs(['--creado-por-usuario-id=1', '--creado-por-correo=a@a.com'])).toThrow(/no ambos/);
  });

  it('acepta --dry-run, --archivo y --reporte', () => {
    const opts = parsearArgs(['--dry-run', '--archivo=/tmp/x.csv', '--reporte=/tmp/r.txt', '--creado-por-usuario-id=5']);
    expect(opts).toMatchObject({ dryRun: true, archivo: '/tmp/x.csv', reporte: '/tmp/r.txt', creadoPorUsuarioId: 5 });
  });

  it('rechaza un argumento desconocido', () => {
    expect(() => parsearArgs(['--algo-raro', '--creado-por-usuario-id=1'])).toThrow(/Argumento desconocido/);
  });

  it('--creado-por-usuario-id debe ser entero positivo', () => {
    expect(() => parsearArgs(['--creado-por-usuario-id=abc'])).toThrow(/entero positivo/);
  });
});

describe('resolverCreadoPorId', () => {
  it('falla con mensaje claro si el usuario-id no existe (nunca inventa un valor)', async () => {
    const usuarioRepo = { buscarPorId: jest.fn().mockResolvedValue(null), buscarPorCorreo: jest.fn() };
    await expect(resolverCreadoPorId({ creadoPorUsuarioId: 99 }, { usuarioRepo })).rejects.toThrow(/No existe un usuario con id=99/);
  });

  it('resuelve por correo (minúsculas) si existe', async () => {
    const usuarioRepo = { buscarPorId: jest.fn(), buscarPorCorreo: jest.fn().mockResolvedValue({ id: 7 }) };
    const id = await resolverCreadoPorId({ creadoPorCorreo: 'Admin@X.com' }, { usuarioRepo });
    expect(id).toBe(7);
    expect(usuarioRepo.buscarPorCorreo).toHaveBeenCalledWith('admin@x.com');
  });
});

describe('ejecutar (orquestación con convenioRepo/usuarioRepo inyectados, sin Postgres real)', () => {
  const archivo = path.resolve(__dirname, '../seeds/convenios-historicos-2026-10-22.csv');

  function repos({ existentes = [] } = {}) {
    return {
      convenioRepo: {
        existeHistorico: jest.fn().mockResolvedValue(existentes),
        crearHistorico: jest.fn().mockImplementation(async (datos) => ({ id: 1, ...datos })),
      },
      usuarioRepo: {
        buscarPorId: jest.fn().mockResolvedValue({ id: 1 }),
        buscarPorCorreo: jest.fn().mockResolvedValue({ id: 1 }),
      },
      log: () => {},
    };
  }

  it('procesa el CSV real completo en dry-run sin escribir y con conteos consistentes', async () => {
    const opts = parsearArgs(['--dry-run', `--archivo=${archivo}`, '--creado-por-usuario-id=1']);
    const r = repos();
    const reporte = await ejecutar(opts, r);
    expect(r.convenioRepo.crearHistorico).not.toHaveBeenCalled();
    expect(reporte.resumen.conveniosCreados).toBeGreaterThan(100);
    expect(reporte.resumen.lineasCreadas).toBeGreaterThanOrEqual(reporte.resumen.conveniosCreados);
    expect(reporte.resumen.filasError).toBe(0); // folios 139/140 se reparan, no quedan errores
    expect(reporte.omitidos.some((o) => o.folioOrigen === '130')).toBe(true); // folio CANCELADO sin líneas
  });

  it('es idempotente: si ya existe (folio+cliente) con el MISMO número de líneas, se omite con motivo "ya importado" sin tocar ese convenio, pero sigue creando los demás', async () => {
    const opts = parsearArgs([`--archivo=${archivo}`, '--creado-por-usuario-id=1']);
    // folio 0 ya existiría (consulta real por folio_origen; otros folios, aunque comparten cliente
    // "Granjas carrol de mexico" en 23 folios más, no deben verse afectados).
    const r = repos();
    r.convenioRepo.existeHistorico = jest.fn(async (folioOrigen) =>
      folioOrigen === '0' ? [{ id: 5, cliente_nombre: 'Granjas carrol de mexico', total_lineas: 1 }] : [],
    );
    const reporte = await ejecutar(opts, r);
    const llamadasConFolio0 = r.convenioRepo.crearHistorico.mock.calls.filter(([datos]) => datos.folio_origen === '0');
    expect(llamadasConFolio0).toHaveLength(0);
    expect(reporte.omitidos.filter((o) => o.motivo === 'ya importado')).toHaveLength(1);
    expect(reporte.omitidos.some((o) => o.folioOrigen === '0' && o.motivo === 'ya importado')).toBe(true);
    expect(reporte.advertenciasReejecucion).toHaveLength(0);
    expect(r.convenioRepo.crearHistorico.mock.calls.length).toBeGreaterThan(100); // los demás folios sí se crean
  });

  it('R-P3-4: si ya existe pero con un número de líneas distinto, avisa en vez de omitir en silencio', async () => {
    const opts = parsearArgs([`--archivo=${archivo}`, '--creado-por-usuario-id=1']);
    // folio 0 ya existía con 2 líneas en la BD; el archivo actual trae 1 (dato real) -> debe avisar.
    // Mock con SQL simulado real: solo folio_origen='0' trae una fila (los demás folios, aunque
    // compartan cliente "Granjas carrol de mexico" en 23 folios más, no son el mismo folio_origen).
    const r = repos();
    r.convenioRepo.existeHistorico = jest.fn(async (folioOrigen) =>
      folioOrigen === '0' ? [{ id: 5, cliente_nombre: 'Granjas carrol de mexico', total_lineas: 2 }] : [],
    );
    const reporte = await ejecutar(opts, r);
    expect(reporte.advertenciasReejecucion).toHaveLength(1);
    expect(reporte.advertenciasReejecucion[0]).toMatch(/ya importado \(id=5\) con 2 línea\(s\); el archivo actual trae 1/);
    expect(reporte.omitidos.some((o) => o.folioOrigen === '0' && o.motivo.includes('líneas distintas'))).toBe(true);
    const llamadasConFolio0 = r.convenioRepo.crearHistorico.mock.calls.filter(([datos]) => datos.folio_origen === '0');
    expect(llamadasConFolio0).toHaveLength(0); // nunca se modifica automáticamente
  });

  it('R-P3-3: un folio+cliente dividido por VENDEDOR distinto da el mismo conteo en dry-run y en real', async () => {
    const csvTmp = path.join(os.tmpdir(), `convenios-vendor-split-${Date.now()}.csv`);
    const header = [
      'FOLIOS', 'MARCA', 'MODELO', 'Fecha', 'CLIENTE', 'EMPAQUE', 'U.M', 'VENDEDOR', 'AUTORIZACION',
      'CONSUMO', 'COMENTARIOS', '$ DE COMPRA', '$ DE VENTA', 'FACTOR', 'VIGENCIA', 'OBSERVACIONES',
      'Clave Cliente', 'Clave Vendedor', 'Codigo Producto', 'Clave MBA3',
    ].join(',');
    const filaA = ['900', 'M', 'MOD', '01/01/2026', 'Cliente Split', '1', 'PZ', 'Juan Perez', 'ABI', '10', '', '', '', '', '', '', 'C900', 'V1', 'COD1', 'DESC1'].join(',');
    const filaB = ['900', 'M', 'MOD', '01/01/2026', 'Cliente Split', '1', 'PZ', 'Maria Lopez', 'ABI', '10', '', '', '', '', '', '', 'C900', 'V2', 'COD2', 'DESC2'].join(',');
    fs.writeFileSync(csvTmp, `${header}\n${filaA}\n${filaB}\n`, 'utf8');
    try {
      const optsDry = parsearArgs(['--dry-run', `--archivo=${csvTmp}`, '--creado-por-usuario-id=1']);
      const optsReal = parsearArgs([`--archivo=${csvTmp}`, '--creado-por-usuario-id=1']);
      const rDry = repos();
      const rReal = repos();
      const reporteDry = await ejecutar(optsDry, rDry);
      const reporteReal = await ejecutar(optsReal, rReal);
      expect(reporteDry.resumen.conveniosCreados).toBe(2);
      expect(reporteReal.resumen.conveniosCreados).toBe(2);
      expect(reporteDry.resumen.conveniosCreados).toBe(reporteReal.resumen.conveniosCreados);
      expect(reporteDry.resumen.omitidos).toBe(reporteReal.resumen.omitidos);
      expect(rReal.convenioRepo.crearHistorico).toHaveBeenCalledTimes(2);
    } finally {
      fs.unlinkSync(csvTmp);
    }
  });

  it('R-P3-12: filas completamente vacías (FOLIOS/CLIENTE/MARCA) se cuentan en el reporte', async () => {
    const csvTmp = path.join(os.tmpdir(), `convenios-fila-vacia-${Date.now()}.csv`);
    const header = [
      'FOLIOS', 'MARCA', 'MODELO', 'Fecha', 'CLIENTE', 'EMPAQUE', 'U.M', 'VENDEDOR', 'AUTORIZACION',
      'CONSUMO', 'COMENTARIOS', '$ DE COMPRA', '$ DE VENTA', 'FACTOR', 'VIGENCIA', 'OBSERVACIONES',
      'Clave Cliente', 'Clave Vendedor', 'Codigo Producto', 'Clave MBA3',
    ].join(',');
    const filaOk = ['901', 'M', 'MOD', '01/01/2026', 'Cliente Y', '1', 'PZ', 'Vend', 'ABI', '10', '', '', '', '', '', '', 'C901', 'V1', 'COD1', 'DESC1'].join(',');
    const filaVacia = new Array(20).fill('').join(',');
    const csvTmpTexto = `${header}\n${filaOk}\n${filaVacia}\n`;
    fs.writeFileSync(csvTmp, csvTmpTexto, 'utf8');
    try {
      const opts = parsearArgs(['--dry-run', `--archivo=${csvTmp}`, '--creado-por-usuario-id=1']);
      const r = repos();
      const reporte = await ejecutar(opts, r);
      expect(reporte.resumen.filasVacias).toBe(1);
      expect(reporte.resumen.conveniosCreados).toBe(1);
    } finally {
      fs.unlinkSync(csvTmp);
    }
  });

  it('un folio no crea nada si --dry-run, y si falla la escritura real de un convenio los demás igual se procesan', async () => {
    const opts = parsearArgs([`--archivo=${archivo}`, '--creado-por-usuario-id=1']);
    const r = repos();
    r.convenioRepo.crearHistorico = jest
      .fn()
      .mockRejectedValueOnce(new Error('fallo simulado'))
      .mockImplementation(async (datos) => ({ id: 2, ...datos }));
    const reporte = await ejecutar(opts, r);
    expect(reporte.errores.length).toBe(1);
    expect(reporte.resumen.conveniosCreados).toBeGreaterThan(50); // el resto se siguió insertando
  });
});
