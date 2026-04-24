const request = require("supertest");
const express = require("express");

describe("Integración de Autenticación", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/auth", require("../routes/auth.routes"));
  });

  describe("Flujo completo de registro e inicio de sesión", () => {
    it("debería registrar un usuario local y devolver un token", async () => {
      const correoUnico = `prueba_${Date.now()}@ejemplo.com`;

      const respuestaRegistro = await request(app)
        .post("/api/auth/registro")
        .send({
          correo: correoUnico,
          nombre: "Usuario",
          apellido: "Prueba",
          contraseña: "contraseña_segura_123",
        });

      expect(respuestaRegistro.status).toBe(201);
      expect(respuestaRegistro.body.exito).toBe(true);
      expect(respuestaRegistro.body.datos).toHaveProperty("token");
      expect(respuestaRegistro.body.datos.usuario).toHaveProperty(
        "correo",
        correoUnico,
      );
    });

    it("debería iniciar sesión con credenciales correctas", async () => {
      const correoUnico = `login_${Date.now()}@ejemplo.com`;
      const contraseña = "mi_contraseña_123";

      await request(app).post("/api/auth/registro").send({
        correo: correoUnico,
        nombre: "Usuario",
        apellido: "Login",
        contraseña,
      });

      const respuestaLogin = await request(app)
        .post("/api/auth/inicio-sesion")
        .send({ correo: correoUnico, contraseña });

      expect(respuestaLogin.status).toBe(200);
      expect(respuestaLogin.body.exito).toBe(true);
      expect(respuestaLogin.body.datos).toHaveProperty("token");
    });

    it("debería rechazar inicio de sesión con contraseña incorrecta", async () => {
      const correoUnico = `fallo_${Date.now()}@ejemplo.com`;

      await request(app).post("/api/auth/registro").send({
        correo: correoUnico,
        nombre: "Usuario",
        apellido: "Fallo",
        contraseña: "correcta_123",
      });

      const respuestaLogin = await request(app)
        .post("/api/auth/inicio-sesion")
        .send({ correo: correoUnico, contraseña: "incorrecta" });

      expect(respuestaLogin.status).toBe(401);
      expect(respuestaLogin.body.exito).toBe(false);
    });
  });

  describe("Ruta de salud", () => {
    it("debería devolver estado saludable", async () => {
      const respuesta = await request(app).get("/api/salud");

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.exito).toBe(true);
    });
  });
});
