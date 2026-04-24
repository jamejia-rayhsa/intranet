const request = require("supertest");
const express = require("express");

describe("Controlador de Autenticación", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/auth", require("../routes/auth.routes"));
  });

  describe("POST /api/auth/registro", () => {
    it("debería rechazar el registro sin campos obligatorios", async () => {
      const respuesta = await request(app)
        .post("/api/auth/registro")
        .send({ correo: "test@ejemplo.com" });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.exito).toBe(false);
    });

    it("debería rechazar el registro sin contraseña", async () => {
      const respuesta = await request(app)
        .post("/api/auth/registro")
        .send({ correo: "test@ejemplo.com", nombre: "Prueba" });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.exito).toBe(false);
    });
  });

  describe("POST /api/auth/inicio-sesion", () => {
    it("debería rechazar el inicio de sesión sin correo", async () => {
      const respuesta = await request(app)
        .post("/api/auth/inicio-sesion")
        .send({ contraseña: "123456" });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.exito).toBe(false);
    });

    it("debería rechazar el inicio de sesión sin contraseña", async () => {
      const respuesta = await request(app)
        .post("/api/auth/inicio-sesion")
        .send({ correo: "test@ejemplo.com" });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.exito).toBe(false);
    });
  });

  describe("POST /api/auth/renovar", () => {
    it("debería rechazar la renovación sin refresh_token", async () => {
      const respuesta = await request(app).post("/api/auth/renovar").send({});

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.exito).toBe(false);
    });
  });

  describe("POST /api/auth/recuperar-password", () => {
    it("debería rechazar la recuperación sin correo", async () => {
      const respuesta = await request(app)
        .post("/api/auth/recuperar-password")
        .send({});

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.exito).toBe(false);
    });
  });
});
