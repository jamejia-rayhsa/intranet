# AGENT.portal.md
name: portal
role: Arquitecto e implementador del módulo central de la intranet corporativa (portal, autenticación, módulos, permisos, noticias).

## Objetivo
Desarrollar el módulo central de la intranet que gestiona:
- Autenticación (MS365 + usuarios locales).
- Gestión de módulos y permisos.
- Portal de noticias, comunicados y ofertas de empleo administradas por Recursos Humanos.

## Scope del agente

1. **Autenticación híbrida**
   - Implementar login con Azure AD / MS365 (OAuth2/OpenID Connect).
   - Implementar usuarios locales con registro, inicio de sesión, recuperación de contraseña y JWT.
   - Centralizar la lógica de sesión y tokens en `backend/auth`.

2. **Roles y permisos por módulo**
   - Diseñar y crear tablas: `roles`, `permisos`, `rol_permiso`, `usuario_rol`.
   - Crear middleware de permisos: `checkPermissions(["portal.admin", "tickets.view", ...])`.
   - UI: panel de administración de roles y asignación de permisos por módulo.

3. **Gestión de módulos**
   - Crear tabla `modulos` con campos: `nombre`, `path_reactivo`, `activo`.
   - Crear endpoints CRUD para módulos.
   - Frontend: menú dinámico que se actualiza según los módulos activos.

4. **Portal de noticias / RH**
   - Tabla `noticias` con campos: `titulo`, `contenido`, `tipo` (noticia, comunicado, oferta_empleo), `fecha_publicacion`, `publicada`, `autor_id`.
   - Permisos: `portal.admin`, `rh.admin`, `portal.view`.
   - Frontend:
     - Página principal (home) con secciones: noticias recientes, comunicados, ofertas de empleo.
     - Módulo RH para crear, editar, programar y publicar noticias.

5. **Auditoría**
   - Integrar el módulo de auditoría (SKILL.auditoria) en:
     - Cambios en roles/permisos.
     - Creación/edición/borrado de noticias.
   - Registrar usuario, acción, tabla, registro_id y valores antes/después.

## Instrucciones de entrega

1. Generar:
   - `./modules/portal/backend/...` (controllers, routes, services, models, auth).
   - `./modules/portal/frontend/pages/PortalHome.jsx`, `Pages-PortalNews.jsx`, etc.
   - `./modules/portal/config/portal.permissions.js`.
   - `./modules/portal/README.md` con endpoints y ejemplo de seed.

2. Asegurar que:
   - El backend exponga ruta `/api/portal` para administración de módulos y permisos.
   - El frontend monte el portal en `/` y `/portal/*`.
   - Se usen variables de entorno para secrets de Azure AD y JWT.

3. Ejecutar tests:
   - Autenticación correcta (local y MS365).
   - Validación de permisos por rol.
   - Pruebas de creación de noticias.