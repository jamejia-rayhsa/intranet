// Prueba el pool REAL (no se conecta: pg abre sockets solo al primer query).
const VARIABLES = [
  'PG_POOL_MAX',
  'PG_POOL_IDLE_TIMEOUT_MS',
  'PG_POOL_CONNECTION_TIMEOUT_MS',
  'PG_IDLE_IN_TRANSACTION_TIMEOUT_MS',
];

function cargar(env = {}) {
  VARIABLES.forEach((v) => delete process.env[v]);
  Object.assign(process.env, env);
  jest.resetModules();
  return require('../config/database');
}

describe('config/database (opciones del pool)', () => {
  afterEach(() => VARIABLES.forEach((v) => delete process.env[v]));

  it('defaults seguros: max 10, ocioso 30 s, espera de conexión 5 s, transacción ociosa 30 s', () => {
    const { grupo } = cargar();
    expect(grupo.options.max).toBe(10);
    expect(grupo.options.idleTimeoutMillis).toBe(30000);
    expect(grupo.options.connectionTimeoutMillis).toBe(5000);
    expect(grupo.options.idle_in_transaction_session_timeout).toBe(30000);
    return grupo.end();
  });

  it('no define statement_timeout global', () => {
    const { grupo } = cargar();
    expect(grupo.options.statement_timeout).toBeUndefined();
    expect(grupo.options.query_timeout).toBeUndefined();
    return grupo.end();
  });

  it('se configura por variables de entorno', () => {
    const { grupo } = cargar({
      PG_POOL_MAX: '25',
      PG_POOL_IDLE_TIMEOUT_MS: '1000',
      PG_POOL_CONNECTION_TIMEOUT_MS: '2000',
      PG_IDLE_IN_TRANSACTION_TIMEOUT_MS: '60000',
    });
    expect(grupo.options.max).toBe(25);
    expect(grupo.options.idleTimeoutMillis).toBe(1000);
    expect(grupo.options.connectionTimeoutMillis).toBe(2000);
    expect(grupo.options.idle_in_transaction_session_timeout).toBe(60000);
    return grupo.end();
  });

  it('valores inválidos (texto, cero, negativos) caen al default', () => {
    const { grupo } = cargar({
      PG_POOL_MAX: 'abc',
      PG_POOL_IDLE_TIMEOUT_MS: '0',
      PG_POOL_CONNECTION_TIMEOUT_MS: '-5',
      PG_IDLE_IN_TRANSACTION_TIMEOUT_MS: '',
    });
    expect(grupo.options.max).toBe(10);
    expect(grupo.options.idleTimeoutMillis).toBe(30000);
    expect(grupo.options.connectionTimeoutMillis).toBe(5000);
    expect(grupo.options.idle_in_transaction_session_timeout).toBe(30000);
    return grupo.end();
  });

  it('cada cliente nuevo lleva un listener de error (una sesión cerrada por Postgres no tumba el proceso)', () => {
    const { EventEmitter } = require('events');
    const { grupo } = cargar();
    const espia = jest.spyOn(console, 'error').mockImplementation(() => {});
    const cliente = new EventEmitter();
    grupo.emit('connect', cliente);
    expect(cliente.listenerCount('error')).toBe(1);
    expect(() => cliente.emit('error', new Error('terminating connection due to idle-in-transaction timeout'))).not.toThrow();
    expect(espia).toHaveBeenCalled();
    expect(grupo.listenerCount('error')).toBeGreaterThan(0);
    espia.mockRestore();
    return grupo.end();
  });

  it('los demás módulos reutilizan el mismo pool (sin Pool propio)', () => {
    const fs = require('fs');
    const path = require('path');
    for (const m of ['rh', 'tickets', 'auditoria']) {
      const f = fs.readFileSync(path.join(__dirname, `../../../${m}/backend/config/database.js`), 'utf8');
      expect(f).toContain('portal/backend/config/database');
      expect(f).not.toMatch(/new Pool/);
    }
  });
});
