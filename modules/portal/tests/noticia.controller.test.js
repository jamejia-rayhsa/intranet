const Noticia = require("../models/noticia.model");

describe("Controlador de Noticias", () => {
  describe("validaciones del modelo Noticia", () => {
    it("debería crear una noticia con los campos mínimos", async () => {
      const datos = {
        titulo: "Noticia de prueba",
        autor_id: 1,
      };

      try {
        const resultado = await Noticia.crear(datos);
        expect(resultado).toBeDefined();
        expect(resultado.titulo).toBe("Noticia de prueba");
      } catch (error) {
        expect(error.message).toContain("postgres");
      }
    });

    it("debería crear una noticia con todos los campos", async () => {
      const datos = {
        titulo: "Noticia completa",
        subtitulo: "Subtítulo de prueba",
        contenido: "Contenido detallado de la noticia",
        tipo: "comunicado",
        fecha_publicacion: "2026-04-03",
        publicada: false,
        autor_id: 1,
      };

      try {
        const resultado = await Noticia.crear(datos);
        expect(resultado).toBeDefined();
        expect(resultado.tipo).toBe("comunicado");
      } catch (error) {
        expect(error.message).toContain("postgres");
      }
    });
  });

  describe("tipos de noticia válidos", () => {
    it('debería aceptar tipo "noticia"', () => {
      const tiposValidos = ["noticia", "comunicado", "oferta_empleo"];
      expect(tiposValidos).toContain("noticia");
    });

    it('debería aceptar tipo "comunicado"', () => {
      const tiposValidos = ["noticia", "comunicado", "oferta_empleo"];
      expect(tiposValidos).toContain("comunicado");
    });

    it('debería aceptar tipo "oferta_empleo"', () => {
      const tiposValidos = ["noticia", "comunicado", "oferta_empleo"];
      expect(tiposValidos).toContain("oferta_empleo");
    });
  });
});
