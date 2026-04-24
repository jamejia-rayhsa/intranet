const jwt = require("jsonwebtoken");
const { authenticateJWT, autorizar } = require("../middleware/auth.middleware");

describe("Middleware de Autenticación JWT", () => {
  let req, res, siguiente;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    siguiente = jest.fn();
  });

  describe("authenticateJWT", () => {
    it("debería rechazar si no se proporciona encabezado de autorización", async () => {
      await authenticateJWT(req, res, siguiente);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          exito: false,
          mensaje: "Token de autenticación no proporcionado",
        }),
      );
    });

    it("debería rechazar si el formato del token es inválido", async () => {
      req.headers["authorization"] = "Token invalido";

      await authenticateJWT(req, res, siguiente);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          exito: false,
          mensaje: "Formato de token inválido",
        }),
      );
    });

    it("debería rechazar si el token está expirado", async () => {
      const tokenExpirado = jwt.sign(
        { usuario_id: 1, correo: "test@ejemplo.com" },
        "secreto_prueba",
        { expiresIn: "-1h" },
      );
      req.headers["authorization"] = `Bearer ${tokenExpirado}`;
      process.env.JWT_SECRET = "secreto_prueba";

      await authenticateJWT(req, res, siguiente);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe("autorizar", () => {
    it("debería rechazar si el usuario no está autenticado", async () => {
      const middleware = autorizar(["portal.admin"]);
      await middleware(req, res, siguiente);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
