# SKILL.auditoria.md
name: auditoria
description: Módulo de auditoría transversal para registrar cambios en cualquier tabla de la intranet.

## Instrucciones

1. **Modelo PostgreSQL**

```sql
CREATE TABLE auditoria (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id),
  modulo VARCHAR(100) NOT NULL,
  tabla VARCHAR(100) NOT NULL,
  registro_id VARCHAR(100) NOT NULL,
  accion VARCHAR(20) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  valores_previos JSONB,
  valores_nuevos JSONB,
  ip_origen VARCHAR(45),
  user_agent TEXT,
  fecha TIMESTAMP DEFAULT NOW()
);
```

2. **AuditoriaService (backend)**

```js
// auditoria.service.js
const Auditoria = require("../models/auditoria.model");

exports.registrarAccion = async (req, modulo, tabla, registroId, accion, valoresPrevios, valoresNuevos) => {
  const { usuario_id } = req.user; // asumiendo req.user poblado por middleware de autenticación
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];

  await Auditoria.create({
    usuario_id,
    modulo,
    tabla,
    registro_id,
    accion,
    valores_previos,
    valores_nuevos,
    ip_origen: ip,
    user_agent: userAgent,
  });
};
```

3. **Middleware de auditoría**

```js
// auditoria.middleware.js
const AuditoriaService = require("../services/auditoria.service");

module.exports = (modulo, tabla, accion) => {
  return async (req, res, next) => {
    const valoresNuevos = req.body; // o los datos que se van a guardar
    const registroId = req.params.id || req.body.id || null;

    // En los casos de UPDATE/DELETE, se puede capturar los valores previos antes de guardar
    // Se deja abstraído aquí para que el controlador lo maneje según el caso.

    await AuditoriaService.registrarAccion(
      req,
      modulo,
      tabla,
      registroId,
      accion,
      null, // valoresPrevios se pasan desde el controlador si se requiere
      valoresNuevos
    );

    next();
  };
};
```

4. **Uso en módulos**

- En cada módulo, importar el middleware y usarlo en rutas CRUD sensibles:

```js
const auditoria = require("../auditoria/middleware/auditoria.middleware");

router.post("/tickets", auditoria("tickets", "tickets", "INSERT"), TicketController.create);
router.put("/tickets/:id", auditoria("tickets", "tickets", "UPDATE"), TicketController.update);
router.delete("/tickets/:id", auditoria("tickets", "tickets", "DELETE"), TicketController.delete);
```

5. **Tests**

- Test unitarios:
  - Verificar que `registrarAccion` guarda un registro en la tabla `auditoria`.
- Test de integración:
  - Crear un ticket y verificar que se genera un evento de auditoría.