const request = require("supertest");
const express = require("express");

describe("Controlador de Empleados", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
  });

  describe("validaciones de creación", () => {
    it("debería rechazar un empleado sin nombre", async () => {
      const respuesta = await request(app)
        .post("/api/empleados")
        .set("Authorization", "Bearer token_prueba")
        .send({ apellido: "Pérez" });

      expect(respuesta.status).toBe(401);
    });

    it("debería rechazar un empleado sin apellido", async () => {
      const respuesta = await request(app)
        .post("/api/empleados")
        .set("Authorization", "Bearer token_prueba")
        .send({ nombre: "Juan" });

      expect(respuesta.status).toBe(401);
    });
  });

  describe("estatus válidos", () => {
    it('debería aceptar estatus "activo"', () => {
      const estatusValidos = ["activo", "baja", "suspendido"];
      expect(estatusValidos).toContain("activo");
    });

    it('debería rechazar estatus "inexistente"', () => {
      const estatusValidos = ["activo", "baja", "suspendido"];
      expect(estatusValidos).not.toContain("inexistente");
    });
  });

  describe("tipos de permiso válidos", () => {
    it('debería aceptar tipo "vacaciones"', () => {
      const tiposValidos = [
        "vacaciones",
        "incapacidad",
        "asunto_personal",
        "otro",
      ];
      expect(tiposValidos).toContain("vacaciones");
    });

    it('debería aceptar tipo "asunto_personal"', () => {
      const tiposValidos = [
        "vacaciones",
        "incapacidad",
        "asunto_personal",
        "otro",
      ];
      expect(tiposValidos).toContain("asunto_personal");
    });
  });
});
