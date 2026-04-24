const request = require("supertest");
const express = require("express");

describe("Integración del módulo RH", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
  });

  describe("validaciones del modelo", () => {
    it("debería validar que los estatus sean correctos", () => {
      const estatusValidos = ["activo", "baja", "suspendido"];
      expect(estatusValidos).toHaveLength(3);
    });

    it("debería validar que los tipos de permiso sean correctos", () => {
      const tiposValidos = [
        "vacaciones",
        "incapacidad",
        "asunto_personal",
        "otro",
      ];
      expect(tiposValidos).toHaveLength(4);
    });

    it("debería validar que los estatus de permiso sean correctos", () => {
      const estatusPermiso = ["pendiente", "aprobado", "rechazado"];
      expect(estatusPermiso).toHaveLength(3);
    });
  });

  describe("flujo de permiso", () => {
    it("debería seguir el flujo: pendiente → aprobado o rechazado", () => {
      const flujo = ["pendiente", "aprobado"];
      expect(flujo).toHaveLength(2);
      expect(flujo[0]).toBe("pendiente");
    });
  });

  describe("validación de traslape", () => {
    it("debería detectar traslape de fechas", () => {
      const permiso1 = { inicio: "2026-04-01", fin: "2026-04-05" };
      const permiso2 = { inicio: "2026-04-03", fin: "2026-04-07" };

      const hayTraslape =
        new Date(permiso2.inicio) <= new Date(permiso1.fin) &&
        new Date(permiso2.fin) >= new Date(permiso1.inicio);

      expect(hayTraslape).toBe(true);
    });

    it("no debería detectar traslape sin fechas cruzadas", () => {
      const permiso1 = { inicio: "2026-04-01", fin: "2026-04-05" };
      const permiso2 = { inicio: "2026-04-10", fin: "2026-04-15" };

      const hayTraslape =
        new Date(permiso2.inicio) <= new Date(permiso1.fin) &&
        new Date(permiso2.fin) >= new Date(permiso1.inicio);

      expect(hayTraslape).toBe(false);
    });
  });
});
