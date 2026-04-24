const request = require("supertest");
const express = require("express");

describe("Integración de Noticias", () => {
  let app;
  let token;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use("/api/auth", require("../routes/auth.routes"));
    app.use("/api/noticias", require("../routes/noticia.routes"));

    const correoUnico = `admin_noticias_${Date.now()}@ejemplo.com`;

    await request(app).post("/api/auth/registro").send({
      correo: correoUnico,
      nombre: "Admin",
      apellido: "Noticias",
      contraseña: "admin_123",
    });

    const respuestaLogin = await request(app)
      .post("/api/auth/inicio-sesion")
      .send({ correo: correoUnico, contraseña: "admin_123" });

    token = respuestaLogin.body.datos.token;
  });

  describe("POST /api/noticias", () => {
    it("debería crear una noticia publicada", async () => {
      const respuesta = await request(app)
        .post("/api/noticias")
        .set("Authorization", `Bearer ${token}`)
        .send({
          titulo: "Noticia de integración",
          subtitulo: "Subtítulo de prueba",
          contenido: "Contenido de prueba para la noticia de integración",
          tipo: "noticia",
          publicada: true,
        });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.exito).toBe(true);
      expect(respuesta.body.datos.titulo).toBe("Noticia de integración");
    });

    it("debería rechazar una noticia sin título", async () => {
      const respuesta = await request(app)
        .post("/api/noticias")
        .set("Authorization", `Bearer ${token}`)
        .send({ contenido: "Sin título" });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.exito).toBe(false);
    });
  });

  describe("GET /api/noticias/publicadas", () => {
    it("debería listar noticias publicadas", async () => {
      const respuesta = await request(app)
        .get("/api/noticias/publicadas")
        .query({ pagina: 1, limite: 10 });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.exito).toBe(true);
      expect(respuesta.body.datos).toHaveProperty("noticias");
      expect(respuesta.body.datos).toHaveProperty("total");
    });
  });

  describe("GET /api/noticias/:id", () => {
    it("debería devolver 404 para noticia inexistente", async () => {
      const respuesta = await request(app).get("/api/noticias/999999");

      expect(respuesta.status).toBe(404);
      expect(respuesta.body.exito).toBe(false);
    });
  });
});
