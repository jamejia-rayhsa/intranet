/* eslint-env jest */
// Ciclos de jefes: A jefe de B y B de A (directa o indirectamente) harían que cada uno viera la asistencia del otro.
jest.mock("../../../portal/backend/config/database", () => ({ grupo: { query: jest.fn() } }));
const { grupo } = require("../../../portal/backend/config/database");
const Empleado = require("../models/empleado.model");

// cadena: 1 -> jefe 2 -> jefe 3 -> jefe 4 -> sin jefe; 7 y 8 sin relación
const JEFES = { 1: 2, 2: 3, 3: 4, 4: null, 7: null, 8: null };
beforeEach(() => {
  grupo.query.mockReset();
  grupo.query.mockImplementation(async (_sql, [id]) => ({ rows: id in JEFES ? [{ jefe_inmediato_id: JEFES[id] }] : [] }));
});

describe("creaCicloDeJefes", () => {
  it("un empleado no puede ser su propio jefe", async () => {
    expect(await Empleado.creaCicloDeJefes(5, 5)).toBe(true);
  });
  it("detecta el ciclo directo e indirecto", async () => {
    expect(await Empleado.creaCicloDeJefes(2, 1)).toBe(true); // 1 ya es subordinado de 2
    expect(await Empleado.creaCicloDeJefes(4, 1)).toBe(true); // 1 -> 2 -> 3 -> 4
  });
  it("sin ciclo: jefe de otra rama, jefe sin jefe o subir de nivel", async () => {
    expect(await Empleado.creaCicloDeJefes(7, 8)).toBe(false);
    expect(await Empleado.creaCicloDeJefes(1, 4)).toBe(false);
    expect(await Empleado.creaCicloDeJefes(1, 99)).toBe(false); // jefe inexistente: lo rechaza otra validación
  });
  it("una cadena ya cíclica en la BD no cuelga la consulta (tope de pasos)", async () => {
    JEFES[10] = 11; JEFES[11] = 10;
    expect(await Empleado.creaCicloDeJefes(7, 10)).toBe(false);
    expect(grupo.query.mock.calls.length).toBeLessThanOrEqual(100);
    delete JEFES[10]; delete JEFES[11];
  });
});
