# AGENTS.md

OpenCode agents para el desarrollo de una intranet corporativa modular PERN + Docker + WSL.

## Agentes principales

- `portal`: frontend y backend central (autenticación, módulos, permisos, portal de noticias).
- `tickets`: módulo de tickets de soporte TI.
- `rh`: módulo de Recursos Humanos (empleados, expedientes, permisos, nómina, noticias).
- `bi`: módulo de BI con Streamlit y MSSQL.
- `comercial`: módulo de cotizaciones y listas de precios.
- `auditoria`: módulo de auditoría transversal para cambios en todos los módulos.

## Instrucciones generales a todos los agentes

1. **Tecnología base**:
   - Stack: PERN (PostgreSQL, Express, React, Node).
   - Contenedor: Docker + WSL (entornos: dev, test, prod).
   - Versión de código: GitHub con CI/CD (GitHub Actions).

2. **Estructura de módulos**:
   - Cada módulo vive en `./modules/<nombre-modulo>`.
   - Cada módulo debe tener:
     - `backend/`, `frontend/`, `config/`, `tests/`, `README.md`.
   - Usar la plantilla estándar de módulo descrita en el README general.

3. **Autenticación y seguridad**:
   - Implementar autenticación híbrida:
     - MS365 (Azure AD / OAuth2).  
     - Usuarios locales (JWT + refresh tokens).
   - Centralizar roles y permisos en tablas: `roles`, `permisos`, `rol_permiso`, `usuario_rol`.

4. **Auditoría**:
   - Todos los módulos deben integrar el servicio de auditoría:
     - Registrar cada `INSERT`, `UPDATE`, `DELETE` relevante.
   - Usar el servicio `AuditoriaService` en el backend.

5. **Pruebas**:
   - Implementar tests unitarios (Jest/Mocha) y de integración.
   - Usar base de datos de prueba para cada módulo.

6. **Entornos**:
   - Crear `docker-compose.dev.yml`, `docker-compose.test.yml`, `docker-compose.prod.yml`.
   - Configurar variables de entorno separadas (`env.dev`, `env.test`, `env.prod`).

7. **Integración con OpenCode**:
   - Cada módulo debe tener un archivo `AGENT.<modulo>.md` y un `SKILL.<modulo>.md`.
   - Usar el módulo `auditoria` (SKILL.auditoria) como dependencia donde aplique.