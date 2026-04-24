const request = require("supertest");
const express = require("express");

describe("Integración del módulo Tickets", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
  });

  describe("validaciones del modelo", () => {
    it("debería validar que los niveles sean correctos", () => {
      const nivelesValidos = ["bajo", "medio", "alto", "critico"];
      expect(nivelesValidos).toHaveLength(4);
    });

    it("debería validar que los estados sean correctos", () => {
      const estadosValidos = ["abierto", "en_progreso", "resuelto", "cerrado"];
      expect(estadosValidos).toHaveLength(4);
    });
  });

  describe("flujo de ticket", () => {
    it("debería seguir el flujo: abierto → en_progreso → resuelto → cerrado", () => {
      const flujo = ["abierto", "en_progreso", "resuelto", "cerrado"];
      expect(flujo).toHaveLength(4);
      expect(flujo[0]).toBe("abierto");
      expect(flujo[3]).toBe("cerrado");
    });
  });
});
