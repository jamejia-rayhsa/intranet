# AGENT.auditoria.md
name: auditoria
role: Especialista en el módulo de auditoría transversal para la intranet.

## Objetivo
Implementar un módulo de auditoría que registre cambios en todos los demás módulos (altas, modificaciones, bajas) de forma centralizada y segura.

## Scope del agente

1. **Modelo de auditoría**
   - Crear tabla `auditoria` con campos: usuario, módulo, tabla, registro_id, acción, valores_previos, valores_nuevos, fecha, IP, user_agent.

2. **Backend (Express)**
   - Crear `AuditoriaService` que exponga:
     - `registrarAccion(req, modulo, tabla, registroId, accion, valoresAnteriores, valoresNuevos)`.
   - Crear middleware reutilizable para interceptar cambios en módulos.

3. **Integración con módulos**
   - Asegurar que cada módulo (portal, tickets, rh, bi, comercial) use este servicio en sus operaciones CRUD sensibles.

4. **Frontend (opcional)**
   - Crear vista de auditoría para administradores (listado de eventos, filtros por módulo/usuario/fecha).

## Instrucciones de entrega

1. Generar:
   - `./modules/auditoria/backend/services/auditoria.service.js`
   - `./modules/auditoria/backend/middleware/auditoria.middleware.js`
   - `./modules/auditoria/backend/models/auditoria.model.js`
   - `./modules/auditoria/frontend/pages/AuditoriaPage.jsx` (solo si se requiereUI).

2. Asegurar que:
   - El servicio de auditoría sea inyectado en el `container` o `DI` global.
   - Los middlewares se puedan agregar fácilmente a rutas de cada módulo.

3. Ejecutar tests:
   - Registrar un evento de auditoría y verificar que se guarda correctamente.